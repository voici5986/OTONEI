import type { Track } from '../types';
import audioEngine, {
  isPlaybackRequestReplacedError,
  PlaybackRequestReplacedError,
  type AudioEngineEvent,
} from './AudioEngine';
import logger from '../utils/logger.js';

export const AUDIO_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
} as const;

export type AudioState = (typeof AUDIO_STATES)[keyof typeof AUDIO_STATES];

export interface AudioStateSnapshot {
  state: AudioState;
  track: Track | null;
  url: string;
  isLoading: boolean;
  error: unknown;
}

type StateListener = (snapshot: AudioStateSnapshot) => void;

class AudioStateManager {
  private currentState: AudioState = AUDIO_STATES.IDLE;
  private currentTrack: Track | null = null;
  private isLoading = false;
  private error: unknown = null;
  private loadRequestId = 0;
  private readonly listeners: StateListener[] = [];

  constructor() {
    this.initEngineListeners();
  }

  private initEngineListeners(): void {
    const listen = (event: AudioEngineEvent, callback: (event: Event) => void): void => {
      audioEngine.on(event, callback);
    };

    listen('play', () => this.updateState(AUDIO_STATES.PLAYING));
    listen('playing', () => {
      this.isLoading = false;
      this.updateState(AUDIO_STATES.PLAYING);
    });
    listen('pause', () => this.updateState(AUDIO_STATES.PAUSED));
    listen('waiting', () => {
      this.isLoading = true;
      this.notifyListeners();
    });
    listen('canplay', () => {
      this.isLoading = false;
      this.notifyListeners();
    });
    listen('ended', () => this.updateState(AUDIO_STATES.STOPPED));
    listen('error', (event) => {
      this.isLoading = false;
      this.error = event;
      this.updateState(AUDIO_STATES.ERROR);
    });
  }

  private updateState(state: AudioState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.notifyListeners();
  }

  getState(): AudioState {
    return this.currentState;
  }

  getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  addListener(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private notifyListeners(): void {
    const snapshot: AudioStateSnapshot = {
      state: this.currentState,
      track: this.currentTrack,
      url: audioEngine.audio.src,
      isLoading: this.isLoading,
      error: this.error,
    };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  async loadTrack(track: Track, url?: string): Promise<boolean> {
    const requestId = ++this.loadRequestId;
    logger.log('[AudioStateManager] 开始加载曲目:', track.name);
    this.currentTrack = track;
    this.isLoading = true;
    this.error = null;
    this.updateState(AUDIO_STATES.LOADING);
    if (!url) {
      this.isLoading = false;
      this.updateState(AUDIO_STATES.PAUSED);
      return false;
    }

    try {
      const started = await audioEngine.setSource(url, track);
      if (requestId !== this.loadRequestId) {
        throw new PlaybackRequestReplacedError();
      }

      this.isLoading = false;
      if (!started) {
        // 浏览器拒绝自动播放时，保持可重试的暂停态，不把它误报成播放错误。
        this.updateState(AUDIO_STATES.PAUSED);
      } else {
        // play() 已经 settle，避免快照残留 loading=true。
        this.notifyListeners();
      }
      return started;
    } catch (error) {
      if (requestId === this.loadRequestId) {
        this.isLoading = false;
        if (!isPlaybackRequestReplacedError(error)) {
          this.notifyListeners();
        }
      }
      throw error;
    }
  }

  play(): void {
    void audioEngine.play();
  }

  pause(): void {
    this.loadRequestId += 1;
    this.isLoading = false;
    audioEngine.pause();
    if (this.currentState === AUDIO_STATES.PAUSED) {
      this.notifyListeners();
    } else {
      this.updateState(AUDIO_STATES.PAUSED);
    }
  }

  stop(): void {
    this.loadRequestId += 1;
    this.isLoading = false;
    audioEngine.pause();
    if (this.currentState === AUDIO_STATES.STOPPED) {
      this.notifyListeners();
    } else {
      this.updateState(AUDIO_STATES.STOPPED);
    }
  }

  setError(error: unknown): void {
    this.error = error;
    this.updateState(AUDIO_STATES.ERROR);
  }

  clearError(): void {
    if (this.error === null) return;
    this.error = null;
    this.notifyListeners();
  }
}

const audioStateManager = new AudioStateManager();
export default audioStateManager;

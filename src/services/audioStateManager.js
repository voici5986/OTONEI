import audioEngine from './AudioEngine';
import logger from '../utils/logger.js';

// 播放状态枚举 (保持兼容)
const AUDIO_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error'
};

class AudioStateManager {
  constructor() {
    this.currentState = AUDIO_STATES.IDLE;
    this.currentTrack = null;
    this.currentUrl = null;
    this.isLoading = false;
    this.error = null;
    this.listeners = [];

    this._initEngineListeners();
  }

  _initEngineListeners() {
    audioEngine.on('play', () => this._updateState(AUDIO_STATES.PLAYING));
    audioEngine.on('playing', () => {
      this.isLoading = false;
      this._updateState(AUDIO_STATES.PLAYING);
    });
    audioEngine.on('pause', () => this._updateState(AUDIO_STATES.PAUSED));
    audioEngine.on('waiting', () => {
      this.isLoading = true;
      this.notifyListeners();
    });
    audioEngine.on('canplay', () => {
      this.isLoading = false;
      this.notifyListeners();
    });
    audioEngine.on('ended', () => this._updateState(AUDIO_STATES.STOPPED));
    audioEngine.on('error', (e) => {
      this.isLoading = false;
      this.error = e;
      this._updateState(AUDIO_STATES.ERROR);
    });
  }

  _updateState(state) {
    if (this.currentState !== state) {
      this.currentState = state;
      this.notifyListeners();
    }
  }

  getState() {
    return this.currentState;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners() {
    const stateSnapshot = {
      state: this.currentState,
      track: this.currentTrack,
      url: audioEngine.audio.src,
      isLoading: this.isLoading,
      error: this.error
    };
    this.listeners.forEach(l => l(stateSnapshot));
  }

  // 核心控制代理到引擎
  loadTrack(track, url) {
    logger.log('[AudioStateManager] 开始加载曲目:', track.name);
    this.currentTrack = track;
    this.isLoading = true;
    this.error = null;
    this._updateState(AUDIO_STATES.LOADING);

    if (url) {
      audioEngine.setSource(url, track);
    }
  }

  play() {
    audioEngine.play();
  }

  pause() {
    audioEngine.pause();
  }

  stop() {
    audioEngine.pause();
    this._updateState(AUDIO_STATES.STOPPED);
  }

  setError(error) {
    this.error = error;
    this._updateState(AUDIO_STATES.ERROR);
  }

  isValidRequest() {
    // 简化逻辑，由 AudioEngine 保证唯一性
    return true;
  }

  cancelCurrentRequest() {
    // 抽象层不再需要复杂的取消逻辑，引擎重设 src 即可
  }
}

const audioStateManager = new AudioStateManager();
export default audioStateManager;

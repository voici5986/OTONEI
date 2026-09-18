import type { Track } from '../types';
import logger from '../utils/logger.js';

export type AudioEngineEvent =
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'loadedmetadata'
  | 'error'
  | 'waiting'
  | 'playing'
  | 'canplay';

type AudioListener = (event: Event) => void;

export const PLAYBACK_REQUEST_REPLACED = 'PLAYBACK_REQUEST_REPLACED';

export class PlaybackRequestReplacedError extends Error {
  readonly code = PLAYBACK_REQUEST_REPLACED;

  constructor() {
    super('播放请求已被更新的请求取代');
    this.name = 'PlaybackRequestReplacedError';
  }
}

export const isPlaybackRequestReplacedError = (
  error: unknown
): error is PlaybackRequestReplacedError =>
  error instanceof PlaybackRequestReplacedError ||
  (typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PLAYBACK_REQUEST_REPLACED);

const isAbortError = (error: unknown): boolean =>
  (typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError') ||
  (typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError');

class AudioEngine {
  readonly audio: HTMLAudioElement;
  private readonly eventListeners = new Map<AudioEngineEvent, AudioListener[]>();
  private sourceRequestId = 0;
  currentTrack: Track | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    this.initEvents();
  }

  private initEvents(): void {
    const events: AudioEngineEvent[] = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'loadedmetadata',
      'error',
      'waiting',
      'playing',
      'canplay',
    ];

    events.forEach((eventName) => {
      this.audio.addEventListener(eventName, (event) => this.dispatch(eventName, event));
    });

    this.audio.addEventListener('error', () => {
      logger.error('[AudioEngine] 播放错误:', this.audio.error);
    });
  }

  on(event: AudioEngineEvent, callback: AudioListener): () => void {
    const listeners = this.eventListeners.get(event) ?? [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
    return () => this.off(event, callback);
  }

  off(event: AudioEngineEvent, callback: AudioListener): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    this.eventListeners.set(
      event,
      listeners.filter((listener) => listener !== callback)
    );
  }

  private dispatch(event: AudioEngineEvent, data: Event): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(data));
  }

  async setSource(url: string, track: Track): Promise<boolean> {
    const requestId = ++this.sourceRequestId;
    logger.log('[AudioEngine] 设置音源:', url);
    this.currentTrack = track;

    if (!this.audio.paused) this.audio.pause();
    this.audio.src = url;
    this.audio.load();

    try {
      await this.audio.play();
      if (requestId !== this.sourceRequestId) {
        throw new PlaybackRequestReplacedError();
      }
      return true;
    } catch (error) {
      // 更换 src 或暂停会让尚未 settle 的 play() reject AbortError。
      // 这表示当前请求已经被更新请求取代，不应进入错误重试链路。
      if (requestId !== this.sourceRequestId || isAbortError(error)) {
        logger.log('[AudioEngine] 播放请求已被更新请求取代，忽略旧请求结果');
        throw new PlaybackRequestReplacedError();
      }
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        logger.warn('[AudioEngine] 自动播放被浏览器阻止:', error);
        return false;
      }
      logger.error('[AudioEngine] 设置音源后播放失败:', error);
      throw error;
    }
  }

  play(): Promise<void> {
    if (!this.audio.src) return Promise.resolve();
    return this.audio.play().catch((error: unknown) => {
      if (
        (error instanceof DOMException &&
          (error.name === 'NotAllowedError' || error.name === 'AbortError')) ||
        isAbortError(error)
      ) {
        return;
      }
      logger.error('[AudioEngine] 播放失败:', error);
    });
  }

  pause(): void {
    // 使尚未 settle 的 setSource/play 请求失效，避免它们在暂停后改变状态。
    this.sourceRequestId += 1;
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (this.audio.duration) this.audio.currentTime = seconds;
  }

  setVolume(value: number): void {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  get duration(): number {
    return this.audio.duration || 0;
  }

  get currentTime(): number {
    return this.audio.currentTime || 0;
  }

  get paused(): boolean {
    return this.audio.paused;
  }
}

const audioEngine = new AudioEngine();
export { AudioEngine };
export default audioEngine;

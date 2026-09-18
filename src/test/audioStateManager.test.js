import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio extends EventTarget {
  src = '';
  preload = '';
  crossOrigin = '';
  paused = true;
  duration = 180;
  currentTime = 0;
  volume = 1;
  error = null;

  load() {}

  async play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

vi.stubGlobal('Audio', FakeAudio);

const { AUDIO_STATES, default: audioStateManager } = await import('../services/audioStateManager');
const { AudioEngine, PLAYBACK_REQUEST_REPLACED } = await import('../services/AudioEngine');

describe('audio state manager', () => {
  beforeEach(() => {
    audioStateManager.stop();
    audioStateManager.clearError();
  });

  it('loads a track and publishes playback state transitions', async () => {
    const listener = vi.fn();
    const removeListener = audioStateManager.addListener(listener);
    const track = { id: 'track-1', name: 'Song', source: 'netease' };

    await audioStateManager.loadTrack(track, '/song.mp3');

    expect(audioStateManager.getCurrentTrack()).toEqual(track);
    expect(audioStateManager.getState()).toBe(AUDIO_STATES.PLAYING);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ state: AUDIO_STATES.PLAYING, track })
    );

    removeListener();
    audioStateManager.pause();
    expect(audioStateManager.getState()).toBe(AUDIO_STATES.PAUSED);
  });

  it('supports stop and recoverable error state', () => {
    const listener = vi.fn();
    audioStateManager.addListener(listener);
    const error = new Error('decode failed');

    audioStateManager.setError(error);
    expect(audioStateManager.getState()).toBe(AUDIO_STATES.ERROR);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ error }));

    audioStateManager.clearError();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ error: null }));

    audioStateManager.stop();
    expect(audioStateManager.getState()).toBe(AUDIO_STATES.STOPPED);
  });

  it('covers engine controls and playback failure branches', async () => {
    const engine = new AudioEngine();
    const listener = vi.fn();
    const removeListener = engine.on('play', listener);

    await expect(engine.play()).resolves.toBeUndefined();
    expect(engine.paused).toBe(true);

    const track = { id: 'track-2', name: 'Song 2', source: 'netease' };
    await expect(engine.setSource('/song.mp3', track)).resolves.toBe(true);
    expect(engine.currentTrack).toEqual(track);
    expect(engine.currentTime).toBe(0);
    engine.seek(12);
    expect(engine.currentTime).toBe(12);
    engine.setVolume(2);
    expect(engine.audio.volume).toBe(1);
    engine.setVolume(-1);
    expect(engine.audio.volume).toBe(0);

    listener.mockClear();
    engine.audio.dispatchEvent(new Event('play'));
    expect(listener).toHaveBeenCalled();
    removeListener();
    engine.audio.dispatchEvent(new Event('play'));
    expect(listener).toHaveBeenCalledTimes(1);
    engine.off('pause', listener);

    const blockedEngine = new AudioEngine();
    blockedEngine.audio.src = '/blocked.mp3';
    blockedEngine.audio.play = vi
      .fn()
      .mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    await expect(blockedEngine.play()).resolves.toBeUndefined();

    const failedEngine = new AudioEngine();
    failedEngine.audio.play = vi.fn().mockRejectedValue(new Error('playback failed'));
    await expect(failedEngine.setSource('/broken.mp3', track)).rejects.toThrow('playback failed');
  });

  it('drops an AbortError from a superseded source request', async () => {
    const engine = new AudioEngine();
    const firstTrack = { id: 'track-a', name: 'Song A', source: 'netease' };
    const secondTrack = { id: 'track-b', name: 'Song B', source: 'netease' };
    let rejectFirstPlay;
    let playCall = 0;

    engine.audio.play = vi.fn().mockImplementation(() => {
      playCall += 1;
      if (playCall === 1) {
        engine.audio.paused = false;
        return new Promise((_, reject) => {
          rejectFirstPlay = reject;
        });
      }
      engine.audio.paused = false;
      return Promise.resolve();
    });

    const firstRequest = engine.setSource('/song-a.mp3', firstTrack);
    await Promise.resolve();
    const secondRequest = engine.setSource('/song-b.mp3', secondTrack);
    rejectFirstPlay(new DOMException('play() request was interrupted', 'AbortError'));

    await expect(secondRequest).resolves.toBe(true);
    await expect(firstRequest).rejects.toMatchObject({ code: PLAYBACK_REQUEST_REPLACED });
    expect(engine.currentTrack).toEqual(secondTrack);
  });

  it('clears loading when pause supersedes a pending load', async () => {
    const audioEngine = (await import('../services/AudioEngine')).default;
    const originalPlay = audioEngine.audio.play;
    let rejectPlay;
    audioEngine.audio.play = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectPlay = reject;
        })
    );
    const listener = vi.fn();
    const removeListener = audioStateManager.addListener(listener);
    const pendingLoad = audioStateManager.loadTrack(
      { id: 'pending', name: 'Pending', source: 'netease' },
      '/pending.mp3'
    );

    await Promise.resolve();
    audioStateManager.pause();

    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: AUDIO_STATES.PAUSED, isLoading: false })
    );
    rejectPlay(new DOMException('play() request was interrupted', 'AbortError'));
    await expect(pendingLoad).rejects.toMatchObject({ code: PLAYBACK_REQUEST_REPLACED });

    removeListener();
    audioEngine.audio.play = originalPlay;
  });
});

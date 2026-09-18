import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, cache, loadTrack, setError } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  cache: new Map(),
  loadTrack: vi.fn(),
  setError: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  apiClient: { get: apiGet },
}));

vi.mock('../services/rateLimiter', () => ({
  withRateLimit: (request) => request(),
}));

vi.mock('../services/memoryCache', () => ({
  CACHE_TYPES: {
    SEARCH_RESULTS: 'search',
    AUDIO_URLS: 'audio',
    LYRICS: 'lyrics',
    COVER_IMAGES: 'covers',
  },
  getMemoryCache: (type, key) => cache.get(`${type}:${key}`),
  setMemoryCache: (type, key, value) => cache.set(`${type}:${key}`, value),
}));

vi.mock('../services/audioStateManager', () => ({
  default: { loadTrack, setError },
}));

vi.mock('../utils/dataValidator', () => ({
  validateSearchResults: (results) => results,
}));

import {
  forceGetCoverImage,
  getAudioUrl,
  getLyrics,
  playMusic,
  searchMusic,
} from '../services/musicApiService';

describe('music API service', () => {
  beforeEach(() => {
    apiGet.mockReset();
    cache.clear();
    loadTrack.mockReset();
    loadTrack.mockResolvedValue(true);
    setError.mockReset();
    const localStorageData = new Map();
    const localStorageMock = {
      clear: () => localStorageData.clear(),
      getItem: (key) => localStorageData.get(key) ?? null,
      removeItem: (key) => localStorageData.delete(key),
      setItem: (key, value) => localStorageData.set(String(key), String(value)),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  });

  it('searches through the API and caches validated results', async () => {
    const results = [{ id: '1', name: 'Song', source: 'netease' }];
    apiGet.mockResolvedValueOnce({ data: results });

    await expect(searchMusic('song', 'netease', 20, 1)).resolves.toEqual(results);
    await expect(searchMusic('song', 'netease', 20, 1)).resolves.toEqual(results);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy or unknown sources before contacting the upstream API', async () => {
    const track = { id: '1', name: 'Legacy song', source: 'unknown' };

    await expect(getAudioUrl(track, 320)).rejects.toMatchObject({ code: 'UNSUPPORTED_SOURCE' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('coalesces audio URL requests and delegates playback to the state manager', async () => {
    const track = { id: '1', name: 'Song', source: 'netease', pic_id: 'cover' };
    apiGet.mockResolvedValueOnce({ data: { url: '/song.mp3', size: 123 } });

    const first = getAudioUrl(track, 999);
    const second = getAudioUrl(track, 999);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { url: '/song.mp3', size: 123 },
      { url: '/song.mp3', size: 123 },
    ]);
    expect(apiGet).toHaveBeenCalledTimes(1);

    apiGet.mockResolvedValueOnce({ data: { url: '/song.mp3', size: 123 } });
    await expect(playMusic(track)).resolves.toEqual({ url: '/song.mp3', fileSize: 123 });
    expect(loadTrack).toHaveBeenCalledWith(track, '/song.mp3');
    expect(setError).not.toHaveBeenCalled();
  });

  it('does not report playback history success when autoplay is blocked', async () => {
    const track = { id: 'blocked', name: 'Blocked', source: 'netease' };
    loadTrack.mockResolvedValue(false);
    apiGet.mockResolvedValueOnce({ data: { url: '/blocked.mp3' } });

    await expect(playMusic(track)).rejects.toMatchObject({ code: 'PLAYBACK_NOT_STARTED' });
    expect(setError).not.toHaveBeenCalled();
  });

  it('does not report a superseded playback request as an error', async () => {
    const track = { id: 'replaced', name: 'Replaced', source: 'netease' };
    const error = Object.assign(new Error('play request replaced'), {
      code: 'PLAYBACK_REQUEST_REPLACED',
    });
    loadTrack.mockRejectedValueOnce(error);
    apiGet.mockResolvedValueOnce({ data: { url: '/replaced.mp3' } });

    await expect(playMusic(track)).rejects.toMatchObject({ code: 'PLAYBACK_REQUEST_REPLACED' });
    expect(setError).not.toHaveBeenCalled();
  });

  it('drops a stale URL response before loading audio', async () => {
    const track = { id: 'late-success', name: 'Late success', source: 'netease' };
    let resolveAudio;
    let current = true;
    apiGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAudio = resolve;
        })
    );

    const request = playMusic(track, 999, true, () => current);
    current = false;
    resolveAudio({ data: { url: '/late.mp3' } });

    await expect(request).rejects.toMatchObject({ code: 'PLAYBACK_REQUEST_REPLACED' });
    expect(loadTrack).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('does not report a stale URL failure as a playback error', async () => {
    const track = { id: 'late-failure', name: 'Late failure', source: 'netease' };
    let rejectAudio;
    let current = true;
    apiGet.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectAudio = reject;
        })
    );

    const request = playMusic(track, 999, true, () => current);
    current = false;
    rejectAudio(new Error('late URL failure'));

    await expect(request).rejects.toMatchObject({ code: 'PLAYBACK_REQUEST_REPLACED' });
    expect(loadTrack).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('uses local lyric cache before making another request', async () => {
    const track = { id: '1', name: 'Song', source: 'netease', lyric_id: 'lyric-1' };
    apiGet.mockResolvedValueOnce({ data: { lyric: '[00:01.00] Song', tlyric: '' } });

    await expect(getLyrics(track)).resolves.toEqual({ raw: '[00:01.00] Song', translated: '' });
    await expect(getLyrics(track)).resolves.toEqual({ raw: '[00:01.00] Song', translated: '' });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('normalizes cover URLs and falls back when the API fails', async () => {
    apiGet.mockResolvedValueOnce({ data: { url: 'https:\\/\\/example.test\\/cover.jpg' } });
    await expect(forceGetCoverImage('netease', 'cover', 500)).resolves.toBe(
      'https://example.test/cover.jpg'
    );

    apiGet.mockRejectedValueOnce(new Error('offline'));
    await expect(forceGetCoverImage('netease', 'missing', 500)).resolves.toBe('default_cover.svg');
  });

  it('rejects when an external abort signal fires', async () => {
    const controller = new AbortController();
    apiGet.mockImplementationOnce(
      (_url, config) =>
        new Promise((_resolve, reject) => {
          config?.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );

    const request = searchMusic('song', 'netease', 20, 1, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow('搜索请求超时，请稍后重试');
  });

  it('does not hang when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    apiGet.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(searchMusic('song', 'netease', 20, 1, controller.signal)).rejects.toThrow(
      '搜索请求超时，请稍后重试'
    );
  });
});

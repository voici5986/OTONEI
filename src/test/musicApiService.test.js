import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, cache, loadTrack, setError, cacheEpoch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  cacheEpoch: { value: 0 },
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
  getMemoryCacheGeneration: () => cacheEpoch.value,
  getMemoryCache: (type, key) => cache.get(`${type}:${key}`),
  setMemoryCache: (type, key, value) => cache.set(`${type}:${key}`, value),
}));

vi.mock('../services/audioStateManager', () => ({
  default: { loadTrack, setError },
}));

// 生产模块的 logger 会真实写 console：getLyrics 的 100ms 延迟清理与
// playMusic 后台封面链在文件 teardown 之后仍可能输出一行，触发 vitest
// 已知的竞态（vitest-dev/vitest#11153：onUserConsoleLog pending →
// EnvironmentTeardownError，测试全过但退出码非 0，间歇性）。
// 与 useSearch.test.jsx 相同约定：整块 mock 掉，切断迟到日志源。
vi.mock('../utils/logger', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
  it('does not repopulate cleared caches from an earlier lyrics or cover request', async () => {
    let resolveLyrics;
    apiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLyrics = resolve;
      })
    );
    const request = getLyrics({ id: 'clear-race', source: 'netease', lyric_id: 'clear-race' });
    cacheEpoch.value += 1;
    cache.clear();
    localStorage.clear();
    resolveLyrics({ data: { lyric: 'stale lyrics' } });
    await request;
    expect(cache.size).toBe(0);
    expect(localStorage.getItem('sonicflow_lyric_netease_clear-race')).toBeNull();
    let resolveCover;
    apiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCover = resolve;
      })
    );
    const cover = forceGetCoverImage('netease', 'clear-race', 500);
    cacheEpoch.value += 1;
    resolveCover({ data: { url: 'https://test/cover.png' } });
    await cover;
    expect(cache.size).toBe(0);
  });

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

  it('stamps requested source onto validated search results', async () => {
    apiGet.mockResolvedValueOnce({ data: [{ id: 'source', name: 'Song', source: 'unknown' }] });
    await expect(searchMusic('source', 'kuwo')).resolves.toEqual([
      { id: 'source', name: 'Song', source: 'kuwo' },
    ]);
  });

  it('refreshes after a cold request and cache hit and coalesces concurrent refreshes', async () => {
    const track = { id: 'refresh', source: 'netease' };
    apiGet.mockResolvedValueOnce({ data: { url: '/old.mp3' } });
    await getAudioUrl(track);
    await getAudioUrl(track);
    apiGet.mockResolvedValueOnce({ data: { url: '/fresh.mp3' } });
    await expect(
      Promise.all([getAudioUrl(track, 999, true), getAudioUrl(track, 999, true)])
    ).resolves.toEqual([{ url: '/fresh.mp3' }, { url: '/fresh.mp3' }]);
    expect(apiGet).toHaveBeenCalledTimes(2);
    apiGet.mockResolvedValueOnce({ data: { url: '/next.mp3' } });
    await expect(getAudioUrl(track, 999, true)).resolves.toEqual({ url: '/next.mp3' });
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])(
    'retries a rejected coalesced audio request with forceRefresh=%s',
    async (forceRefresh) => {
      const track = { id: `network-retry-${forceRefresh}`, source: 'netease' };
      const quality = 320;
      if (forceRefresh) {
        apiGet.mockResolvedValueOnce({ data: { url: '/old.mp3' } });
        await getAudioUrl(track, quality);
        apiGet.mockClear();
      }

      let rejectAudio;
      apiGet.mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectAudio = reject;
        })
      );
      const error = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
      const consumers = Promise.allSettled([
        getAudioUrl(track, quality, forceRefresh),
        getAudioUrl(track, quality, forceRefresh),
      ]);
      expect(apiGet).toHaveBeenCalledTimes(1);

      rejectAudio(error);
      await expect(consumers).resolves.toEqual([
        { status: 'rejected', reason: error },
        { status: 'rejected', reason: error },
      ]);

      apiGet.mockResolvedValueOnce({ data: { url: '/retry.mp3' } });
      await expect(getAudioUrl(track, quality, forceRefresh)).resolves.toEqual({
        url: '/retry.mp3',
      });
      expect(apiGet).toHaveBeenCalledTimes(2);
      await expect(getAudioUrl(track, quality)).resolves.toEqual({ url: '/retry.mp3' });
      expect(apiGet).toHaveBeenCalledTimes(2);
    }
  );

  it.each([null, { code: -1 }, { url: 42 }, { url: ' ' }, { url: 'javascript:alert(1)' }])(
    'rejects invalid audio payload without poisoning cache: %j',
    async (data) => {
      const track = { id: `invalid-${JSON.stringify(data)}`, source: 'netease' };
      apiGet.mockResolvedValueOnce({ data });
      await expect(getAudioUrl(track)).rejects.toThrow('无效的音频链接');
      apiGet.mockResolvedValueOnce({ data: { url: '/valid.mp3' } });
      await expect(getAudioUrl(track)).resolves.toEqual({ url: '/valid.mp3' });
      expect(apiGet).toHaveBeenCalledTimes(2);
    }
  );

  it('normalizes null lyric data to empty lyrics', async () => {
    apiGet.mockResolvedValueOnce({ data: null });
    await expect(getLyrics({ source: 'netease', lyric_id: 'null-lyric' })).resolves.toEqual({
      raw: '',
      translated: '',
    });
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

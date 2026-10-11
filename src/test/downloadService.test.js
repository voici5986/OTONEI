import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getAudioUrl, info, error } = vi.hoisted(() => ({
  getAudioUrl: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../services/musicApiService', () => ({ getAudioUrl }));
vi.mock('react-toastify', () => ({ toast: { info, error } }));
import { downloadTrack } from '../services/downloadService';

describe('download service', () => {
  let click;
  beforeEach(() => {
    vi.useFakeTimers();
    getAudioUrl.mockReset();
    getAudioUrl.mockResolvedValue({ url: 'https://audio.test/song.flac' });
    info.mockClear();
    error.mockClear();
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());
    window.URL.createObjectURL = vi.fn(() => 'blob:audio');
    window.URL.revokeObjectURL = vi.fn();
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const response = (type, blob = new Blob(['audio'])) => ({
    ok: true,
    headers: { get: () => type },
    blob: vi.fn().mockResolvedValue(blob),
  });

  it('downloads binary audio and sanitizes the filename', async () => {
    fetch.mockResolvedValue(response('application/octet-stream; charset=binary'));
    let filename;
    click.mockImplementation(function () {
      filename = this.download;
    });
    await expect(downloadTrack({ name: '../bad:name', artist: ['a/b'] })).resolves.toBe(true);
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    expect(Array.from(filename).every((character) => character.charCodeAt(0) >= 32)).toBe(true);
    expect(filename).toMatch(/\.flac$/);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each(['text/html', 'application/json'])(
    'rejects %s without reporting a fallback success',
    async (type) => {
      fetch.mockResolvedValue(response(type));
      await expect(downloadTrack({ name: 'Song' })).resolves.toBe(false);
      expect(click).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    }
  );

  it('rejects empty audio files', async () => {
    fetch.mockResolvedValue(response('audio/mpeg', new Blob([])));
    await expect(downloadTrack({ name: 'Song' })).resolves.toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it.each(['headers', 'body'])(
    'times out stalled %s and advances the serial queue',
    async (stage) => {
      const finish = vi.fn();
      let firstSignal;
      fetch.mockImplementationOnce((_url, { signal }) => {
        firstSignal = signal;
        return stage === 'headers'
          ? new Promise(() => {})
          : Promise.resolve({ ...response('audio/flac'), blob: () => new Promise(() => {}) });
      });
      fetch.mockResolvedValueOnce(response('audio/mpeg'));
      const first = downloadTrack({ name: 'Stalled' }, 999, undefined, finish);
      const next = downloadTrack({ name: 'Next' });
      await vi.advanceTimersByTimeAsync(30000);
      await expect(first).resolves.toBe(false);
      expect(firstSignal.aborted).toBe(true);
      expect(finish).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(next).resolves.toBe(true);
    }
  );
});

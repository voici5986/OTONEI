import { act, renderHook, cleanup } from '@testing-library/react';
import useGuidanceDismissal from '../hooks/useGuidanceDismissal';
import { MOBILE_PLAYER_HINT_STORAGE_KEY } from '../services/guidanceStorage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserCaches, clearApplicationCaches } from '../utils/cacheStorage';

vi.mock('../services/storage', () => ({ clearCoverCache: vi.fn().mockResolvedValue(true) }));

describe('browser cache cleanup', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('removes persistent image and lyric caches while retaining account data', async () => {
    localStorage.setItem('avatar-cache:user', 'avatar');
    localStorage.setItem('sonicflow_lyric_song', 'lyrics');
    localStorage.setItem('account', 'retained');
    const { result } = renderHook(() => useGuidanceDismissal(MOBILE_PLAYER_HINT_STORAGE_KEY));
    act(() => result.current[1]());
    await act(async () => clearApplicationCaches());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('avatar-cache:user')).toBeNull();
    expect(localStorage.getItem('sonicflow_lyric_song')).toBeNull();
    expect(localStorage.getItem('account')).toBe('retained');
    localStorage.clear();
  });

  it('unregisters active workers and deletes every Cache Storage entry', async () => {
    const deleteCache = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['workbox-precache', 'image-cache']),
      delete: deleteCache,
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });

    await expect(clearBrowserCaches()).resolves.toEqual({
      deletedCaches: 1,
      unregisteredWorkers: 1,
    });
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache');
    expect(deleteCache).toHaveBeenCalledWith('image-cache');
  });
});

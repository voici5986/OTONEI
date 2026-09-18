import { beforeEach, describe, expect, it, vi } from 'vitest';

const { stores, getStore, resetStores } = vi.hoisted(() => {
  const stores = new Map();
  const getStore = (name) => stores.get(name)?.api;
  const resetStores = () => {
    for (const store of stores.values()) store.data.clear();
  };

  return { stores, getStore, resetStores };
});

vi.mock('localforage', () => ({
  default: {
    INDEXEDDB: 'indexeddb',
    LOCALSTORAGE: 'localstorage',
    createInstance: ({ storeName }) => {
      const existing = stores.get(storeName);
      if (existing) return existing.api;

      const data = new Map();
      const api = {
        getItem: async (key) => data.get(key) ?? null,
        setItem: async (key, value) => {
          data.set(key, value);
          return value;
        },
        removeItem: async (key) => data.delete(key),
        keys: async () => [...data.keys()],
        clear: async () => data.clear(),
      };
      stores.set(storeName, { api, data });
      return api;
    },
  },
}));

import {
  addSearchHistory,
  addToHistory,
  clearExpiredCovers,
  clearHistory,
  clearSearchHistory,
  getFavorites,
  getHistory,
  getLocalUser,
  getNetworkStatus,
  getPendingSyncChanges,
  getPendingSyncChangesStrict,
  getSyncStatus,
  getSearchHistory,
  getCoverFromStorage,
  getFavoriteTombstones,
  MAX_FAVORITE_TOMBSTONES,
  incrementPendingChanges,
  resetPendingChanges,
  saveHistory,
  saveLocalUser,
  saveNetworkStatus,
  saveSearchHistory,
  saveCoverToStorage,
  saveFavorites,
  saveFavoriteTombstones,
  saveSyncStatus,
  setStorageScope,
  toggleFavorite,
} from '../services/storage';

describe('storage service', () => {
  beforeEach(() => {
    resetStores();
    setStorageScope(null);
  });

  it('persists and toggles favorites with a modification timestamp', async () => {
    const track = { id: 'track-1', name: 'Song', source: 'netease' };

    await expect(toggleFavorite(track)).resolves.toMatchObject({ added: true, full: false });
    await expect(getFavorites()).resolves.toEqual([
      expect.objectContaining({ ...track, modifiedAt: expect.any(Number) }),
    ]);

    await expect(toggleFavorite(track)).resolves.toMatchObject({ added: false, full: false });
    await expect(getFavorites()).resolves.toEqual([]);
  });

  it('keeps same-id tracks from different sources as separate favorites', async () => {
    await toggleFavorite({ id: '12345', name: 'Netease song', source: 'netease' });
    await toggleFavorite({ id: '12345', name: 'JOOX song', source: 'joox' });

    await expect(getFavorites()).resolves.toEqual([
      expect.objectContaining({ id: '12345', source: 'joox' }),
      expect.objectContaining({ id: '12345', source: 'netease' }),
    ]);
  });

  it('does not report a favorite toggle as successful when persistence fails', async () => {
    const favoritesStore = getStore('favorites');
    const originalSetItem = favoritesStore.setItem;
    favoritesStore.setItem = async () => {
      throw new Error('favorite write failed');
    };

    await expect(
      toggleFavorite({ id: 'write-failure', name: 'Song', source: 'netease' })
    ).rejects.toThrow('保存收藏列表失败');
    favoritesStore.setItem = originalSetItem;
  });

  it('records a scoped tombstone when a favorite is removed', async () => {
    const track = { id: 7, name: 'Song', source: 'netease' };
    await toggleFavorite(track);
    await toggleFavorite(track);

    await expect(getFavoriteTombstones()).resolves.toEqual([
      expect.objectContaining({
        id: '7',
        source: 'netease',
        deletedAt: expect.any(Number),
        modifiedAt: expect.any(Number),
      }),
    ]);
  });

  it('isolates favorites, history, and pending counters by user scope', async () => {
    setStorageScope({ uid: 'user-a' });
    await toggleFavorite({ id: '1', name: 'A', source: 'netease' });
    await addToHistory({ id: '1', name: 'A', source: 'netease' });
    await incrementPendingChanges('favorites');

    setStorageScope({ uid: 'user-b' });
    await expect(getFavorites()).resolves.toEqual([]);
    await expect(getHistory()).resolves.toEqual([]);
    await expect(getPendingSyncChanges()).resolves.toMatchObject({ favorites: 0, history: 0 });

    setStorageScope({ uid: 'user-a' });
    await expect(getFavorites()).resolves.toHaveLength(1);
    await expect(getHistory()).resolves.toHaveLength(1);
    await expect(getPendingSyncChanges()).resolves.toMatchObject({ favorites: 1, history: 0 });
  });

  it('deduplicates search history case-insensitively and keeps newest first', async () => {
    await addSearchHistory('Hello', 'netease');
    await addSearchHistory('World', 'netease');
    await addSearchHistory('hello', 'netease');

    await expect(getSearchHistory()).resolves.toEqual([
      expect.objectContaining({ query: 'hello', source: 'netease' }),
      expect.objectContaining({ query: 'World', source: 'netease' }),
    ]);
  });

  it('moves repeated tracks to the top of playback history', async () => {
    const track = { id: 'track-1', name: 'Song', source: 'netease' };
    await addToHistory(track);
    await addToHistory({ ...track, name: 'Song (updated)' });

    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ song: { id: 'track-1', name: 'Song (updated)' } });
  });

  it('does not cache default covers and returns cached cover URLs', async () => {
    await expect(saveCoverToStorage('default', '/default_cover.svg')).resolves.toBe(false);
    await expect(getCoverFromStorage('default')).resolves.toBeNull();

    await expect(saveCoverToStorage('cover-1', 'https://example.test/cover.jpg')).resolves.toBe(
      true
    );
    await expect(getCoverFromStorage('cover-1')).resolves.toBe('https://example.test/cover.jpg');
  });

  it('returns the favorites limit result without dropping existing data', async () => {
    const favorites = Array.from({ length: 500 }, (_, index) => ({ id: `track-${index}` }));
    await saveFavorites(favorites);

    await expect(toggleFavorite({ id: 'new-track' })).resolves.toMatchObject({
      added: false,
      full: true,
      error: 'favorites_limit',
    });
    await expect(getFavorites()).resolves.toHaveLength(500);
  });

  it('bounds bulk favorite saves and keeps shared track fields scalar', async () => {
    const favorites = Array.from({ length: 501 }, (_, index) => ({
      id: index,
      source: 'netease',
      artist: { name: `Artist ${index}` },
      album: { name: `Album ${index}` },
    }));

    await expect(saveFavorites(favorites)).resolves.toBe(true);
    const saved = await getFavorites();
    expect(saved).toHaveLength(500);
    expect(saved[0]).toMatchObject({ id: '0', artist: 'Artist 0', album: 'Album 0' });
    expect(
      saved.every((item) => typeof item.artist === 'string' && typeof item.album === 'string')
    ).toBe(true);
  });

  it('bounds favorite tombstones to a recent window', async () => {
    const tombstones = Array.from({ length: MAX_FAVORITE_TOMBSTONES + 1 }, (_, index) => ({
      id: index,
      source: 'netease',
      modifiedAt: index,
      deletedAt: index,
    }));
    await expect(saveFavoriteTombstones(tombstones)).resolves.toBe(true);
    const saved = await getFavoriteTombstones();
    expect(saved).toHaveLength(MAX_FAVORITE_TOMBSTONES);
    expect(saved[0].id).toBe(String(MAX_FAVORITE_TOMBSTONES));
  });

  it('keeps search history isolated across guest and user scopes', async () => {
    setStorageScope(null);
    await addSearchHistory('guest-query', 'netease');
    setStorageScope({ uid: 'user-a' });
    await addSearchHistory('user-query', 'netease');
    await expect(getSearchHistory()).resolves.toEqual([
      expect.objectContaining({ query: 'user-query' }),
    ]);
    setStorageScope(null);
    await expect(getSearchHistory()).resolves.toEqual([
      expect.objectContaining({ query: 'guest-query' }),
    ]);
  });

  it('cleans expired cover entries in batches', async () => {
    const coverStore = getStore('coverCache');
    const now = Date.now();
    await coverStore.setItem('expired', {
      url: 'https://example.test/expired.jpg',
      timestamp: now - 31 * 24 * 60 * 60 * 1000,
    });
    await coverStore.setItem('fresh', {
      url: 'https://example.test/fresh.jpg',
      timestamp: now,
    });

    await expect(clearExpiredCovers({ batchSize: 1 })).resolves.toBe(1);
    await expect(getCoverFromStorage('expired')).resolves.toBeNull();
    await expect(getCoverFromStorage('fresh')).resolves.toBe('https://example.test/fresh.jpg');
  });

  it('round-trips local user, network, and sync status records', async () => {
    const user = { uid: 'local-user', isLocal: true };
    await expect(saveLocalUser(user)).resolves.toBe(true);
    await expect(getLocalUser()).resolves.toEqual(user);

    await expect(
      saveNetworkStatus({ online: false, lastChecked: 10, connectionType: 'offline' })
    ).resolves.toBe(true);
    await expect(getNetworkStatus()).resolves.toMatchObject({
      online: false,
      lastChecked: 10,
      connectionType: 'offline',
    });

    await expect(saveSyncStatus({ loading: true }, 'user-1')).resolves.toBe(true);
    await expect(getSyncStatus('user-1')).resolves.toEqual({ loading: true });
  });

  it('limits saved playback and search history and supports clearing', async () => {
    await saveHistory(Array.from({ length: 105 }, (_, index) => ({ timestamp: index })));
    await saveSearchHistory(
      Array.from({ length: 25 }, (_, index) => ({ query: `query-${index}`, source: 'netease' }))
    );

    await expect(getHistory()).resolves.toHaveLength(100);
    await expect(getSearchHistory()).resolves.toHaveLength(20);
    await expect(clearHistory()).resolves.toBe(true);
    await expect(clearSearchHistory()).resolves.toBe(true);
    await expect(getHistory()).resolves.toEqual([]);
    await expect(getSearchHistory()).resolves.toEqual([]);
  });

  it('tracks pending sync changes and resets them', async () => {
    await expect(getPendingSyncChanges()).resolves.toMatchObject({ favorites: 0, history: 0 });
    await expect(incrementPendingChanges('favorites')).resolves.toMatchObject({ favorites: 1 });
    await expect(incrementPendingChanges('history')).resolves.toMatchObject({
      favorites: 1,
      history: 1,
    });
    await expect(resetPendingChanges()).resolves.toBe(true);
    await expect(getPendingSyncChanges()).resolves.toMatchObject({ favorites: 0, history: 0 });
  });

  it('falls back safely when a storage operation fails', async () => {
    const favoritesStore = getStore('favorites');
    const originalGetItem = favoritesStore.getItem;
    const originalSetItem = favoritesStore.setItem;
    favoritesStore.getItem = async () => {
      throw new Error('read failed');
    };
    await expect(getFavorites()).resolves.toEqual([]);
    favoritesStore.getItem = originalGetItem;

    favoritesStore.setItem = async () => {
      throw new Error('write failed');
    };
    await expect(saveFavorites([])).resolves.toBe(false);
    favoritesStore.setItem = originalSetItem;

    const coverStore = getStore('coverCache');
    const originalCoverGetItem = coverStore.getItem;
    const originalCoverSetItem = coverStore.setItem;
    const originalCoverKeys = coverStore.keys;
    coverStore.getItem = async () => {
      throw new Error('cover read failed');
    };
    await expect(getCoverFromStorage('cover-1')).resolves.toBeNull();
    coverStore.setItem = async () => {
      throw new Error('cover write failed');
    };
    await expect(saveCoverToStorage('cover-2', 'https://example.test/cover.jpg')).resolves.toBe(
      false
    );
    coverStore.keys = async () => {
      throw new Error('cover keys failed');
    };
    await expect(clearExpiredCovers()).resolves.toBe(0);
    coverStore.getItem = originalCoverGetItem;
    coverStore.setItem = originalCoverSetItem;
    coverStore.keys = originalCoverKeys;

    const userStore = getStore('localUser');
    const originalUserGetItem = userStore.getItem;
    const originalUserSetItem = userStore.setItem;
    userStore.getItem = async () => {
      throw new Error('user read failed');
    };
    await expect(getLocalUser()).resolves.toBeNull();
    userStore.setItem = async () => {
      throw new Error('user write failed');
    };
    await expect(saveLocalUser({ uid: 'user-1' })).resolves.toBe(false);
    userStore.getItem = originalUserGetItem;
    userStore.setItem = originalUserSetItem;

    const networkStore = getStore('networkStatus');
    const originalNetworkGetItem = networkStore.getItem;
    const originalNetworkSetItem = networkStore.setItem;
    networkStore.getItem = async () => {
      throw new Error('network read failed');
    };
    await expect(getNetworkStatus()).resolves.toHaveProperty('connectionType');
    networkStore.setItem = async () => {
      throw new Error('network write failed');
    };
    await expect(saveNetworkStatus({ online: true })).resolves.toBe(false);
    networkStore.getItem = originalNetworkGetItem;
    networkStore.setItem = originalNetworkSetItem;

    const syncStore = getStore('syncStatus');
    const originalSyncGetItem = syncStore.getItem;
    const originalSyncSetItem = syncStore.setItem;
    syncStore.getItem = async () => {
      throw new Error('sync read failed');
    };
    await expect(getSyncStatus('user-1')).resolves.toMatchObject({ loading: false });
    await expect(getPendingSyncChanges()).resolves.toEqual({
      favorites: 0,
      history: 0,
      timestamp: 0,
    });
    await expect(getPendingSyncChangesStrict()).rejects.toThrow('sync read failed');
    syncStore.setItem = async () => {
      throw new Error('sync write failed');
    };
    await expect(saveSyncStatus({ loading: false }, 'user-1')).resolves.toBe(false);
    await expect(incrementPendingChanges('favorites')).resolves.toBeNull();
    await expect(resetPendingChanges()).resolves.toBe(false);
    syncStore.getItem = originalSyncGetItem;
    syncStore.setItem = originalSyncSetItem;
  });
});

import localforage from 'localforage';
import logger from '../utils/logger.js';
import { getTrackKey, normalizeTrackIdentity } from '../utils/trackIdentity';
import { getTrackArtist } from '../utils/trackFormatter';

const GUEST_SCOPE = 'guest';
let activeDataScope = GUEST_SCOPE;

const toDataScope = (userId) => (userId ? `user:${String(userId)}` : GUEST_SCOPE);
const scopedKey = (baseKey, userId) =>
  `${baseKey}:${userId === undefined ? activeDataScope : toDataScope(userId)}`;

export const setStorageScope = (user) => {
  activeDataScope = toDataScope(user?.uid);
  return activeDataScope;
};

const captureUserId = (userId) =>
  userId !== undefined ? userId : activeDataScope === GUEST_SCOPE ? null : activeDataScope.slice(5);

// Scoped Web Locks serialize array mutations across tabs; fallback queues within this tab.
const mutationQueues = new Map();
export const withStorageMutation = (userId, operation) => {
  const capturedUserId = captureUserId(userId);
  const scope = toDataScope(capturedUserId);
  const run = () =>
    globalThis.navigator?.locks?.request
      ? navigator.locks.request(`otonei-data:${scope}`, () => operation(capturedUserId))
      : operation(capturedUserId);
  const pending = (mutationQueues.get(scope) || Promise.resolve()).then(run, run);
  mutationQueues.set(
    scope,
    pending.catch(() => {})
  );
  return pending;
};
const storageListeners = new Set();
export const subscribeStorageChanges = (listener) => {
  storageListeners.add(listener);
  return () => storageListeners.delete(listener);
};
const notifyStorageChange = (type, userId) => {
  const event = { type, scope: userId === undefined ? activeDataScope : toDataScope(userId) };
  for (const listener of storageListeners) {
    try {
      listener(event);
    } catch (error) {
      logger.error('Storage listener failed:', error);
    }
  }
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(`${type}_changed`, { detail: event }));
};
const newRevision = () => globalThis.crypto.randomUUID();

const getScopedItem = async (store, baseKey, userId) => {
  userId = captureUserId(userId);
  const key = scopedKey(baseKey, userId);
  const scopedValue = await store.getItem(key);
  if (scopedValue != null) return scopedValue;

  // Legacy unscoped data cannot safely be assigned to an authenticated account.
  // Preserve it under the guest namespace so upgrades do not leak it across users.
  if ((userId === undefined ? activeDataScope : toDataScope(userId)) === GUEST_SCOPE) {
    const legacyValue = await store.getItem(baseKey);
    if (legacyValue != null) {
      await store.setItem(key, legacyValue);
      await store.removeItem(baseKey);
      return legacyValue;
    }
  }

  return null;
};

const getScopedSyncValue = async (baseKey, userId) => {
  userId = captureUserId(userId);
  const key = scopedKey(baseKey, userId);
  const value = await syncStore.getItem(key);
  if (value != null) return value;

  if ((userId === undefined ? activeDataScope : toDataScope(userId)) === GUEST_SCOPE) {
    const legacyValue = await syncStore.getItem(baseKey);
    if (legacyValue != null) {
      await syncStore.setItem(key, legacyValue);
      await syncStore.removeItem(baseKey);
      return legacyValue;
    }
  }
  return null;
};

// 配置并创建不同数据类型的存储实例
const favoritesStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'favorites',
});

const historyStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'history',
});

const favoriteTombstonesStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'favoriteTombstones',
});

// 添加搜索历史存储实例
const searchHistoryStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'searchHistory',
});

// 添加同步状态存储实例
const syncStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'syncStatus',
});

// 添加本地用户存储实例
const userStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'localUser',
});

// 网络状态存储实例
const networkStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'networkStatus',
});

// 添加封面图片缓存存储实例
const coverStore = localforage.createInstance({
  name: 'clMusicApp',
  storeName: 'coverCache',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

// 封面缓存过期时间：30天（毫秒）
const COVER_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * 将图片保存到本地存储
 * @param {string} key 缓存键
 * @param {string} imageUrl 图片URL
 * @returns {Promise<boolean>} 是否成功
 */
async function saveCoverToStorageUnlocked(key, imageUrl) {
  try {
    // 如果是默认封面，不需要缓存
    if (!imageUrl || imageUrl.includes('default_cover')) {
      return false;
    }

    // 存储图片URL和时间戳
    await coverStore.setItem(key, {
      url: imageUrl,
      timestamp: Date.now(),
    });

    logger.log(`[saveCoverToStorage] 封面已缓存至本地: ${key}`);
    return true;
  } catch (error) {
    logger.error(`[saveCoverToStorage] 保存封面失败: ${key}`, error);
    return false;
  }
}

/**
 * 从本地存储获取图片
 * @param {string} key 缓存键
 * @returns {Promise<string|null>} 图片URL或null
 */
export async function getCoverFromStorage(key) {
  try {
    const data = await coverStore.getItem(key);

    // 如果没有数据或数据已过期，返回null
    if (!data || !data.url || !data.timestamp || Date.now() - data.timestamp > COVER_CACHE_TTL) {
      // 如果数据已过期，删除它
      if (data) {
        await coverStore.removeItem(key);
        logger.log(`[getCoverFromStorage] 封面缓存已过期: ${key}`);
      }

      return null;
    }

    logger.log(`[getCoverFromStorage] 使用本地封面缓存: ${key}`);
    return data.url;
  } catch (error) {
    logger.error(`[getCoverFromStorage] 获取封面失败: ${key}`, error);
    return null;
  }
}

/**
 * 清除过期的封面缓存
 * @returns {Promise<number>} 清除的项目数量
 */
async function clearExpiredCoversUnlocked(options = {}) {
  try {
    const { batchSize = 50 } = options;
    const now = Date.now();
    const expireThreshold = now - COVER_CACHE_TTL;
    let removedCount = 0;

    // 获取所有键（不再截断，确保大库也能全量清理）
    const keys = await coverStore.keys();

    // 检查每个缓存项
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const data = await coverStore.getItem(key);
      if (!data || !data.timestamp || data.timestamp < expireThreshold) {
        await coverStore.removeItem(key);
        removedCount++;
      }

      if (batchSize > 0 && (i + 1) % batchSize === 0) {
        // 分批让出主线程，避免启动时卡顿
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    logger.log(
      `[clearExpiredCovers] 已清除 ${removedCount} 个过期的封面缓存 (扫描 ${keys.length})`
    );
    return removedCount;
  } catch (error) {
    logger.error('[clearExpiredCovers] 清除过期封面缓存失败:', error);
    return 0;
  }
}

/**
 * 收藏歌曲操作
 */
// 设置收藏上限为500条
export const MAX_FAVORITES_ITEMS = 500;
// Kept for compatibility; tombstones cannot safely expire while offline devices exist.
export const MAX_FAVORITE_TOMBSTONES = 500;

const toPersistedTrack = (track) => {
  const normalized = normalizeTrackIdentity(track);
  const albumRecord =
    normalized.album && typeof normalized.album === 'object' ? normalized.album : null;
  const album = typeof normalized.album === 'string' ? normalized.album : albumRecord?.name;
  const hasCoverText = (value) => typeof value === 'string' && value.trim() !== '';
  const hasNonAlbumCover = [
    normalized.picUrl,
    normalized.pic_url,
    normalized.cover,
    normalized.coverUrl,
    normalized.image,
    normalized.img,
    normalized.al?.picUrl,
    normalized.al?.pic_url,
  ].some(hasCoverText);
  const persisted = {
    ...normalized,
    // 本地与 Firestore 共用标量 artist/album 字段；仅在其它封面候选为空时，
    // 才把专辑对象里的封面地址提升到顶层，避免标量化后丢失 album.picUrl fallback。
    artist: getTrackArtist(normalized),
    album: String(album ?? '').slice(0, 300),
    pic_id: normalized.pic_id == null ? null : String(normalized.pic_id).slice(0, 500),
    lyric_id: normalized.lyric_id == null ? null : String(normalized.lyric_id).slice(0, 500),
  };
  if (!hasNonAlbumCover && !hasCoverText(persisted.picUrl) && hasCoverText(albumRecord?.picUrl)) {
    persisted.picUrl = albumRecord.picUrl;
  }
  if (!hasNonAlbumCover && !hasCoverText(persisted.pic_url) && hasCoverText(albumRecord?.pic_url)) {
    persisted.pic_url = albumRecord.pic_url;
  }
  return persisted;
};

export async function getFavoritesStrict(userId) {
  const data = await getScopedItem(favoritesStore, 'items', userId);
  return (data || []).map(toPersistedTrack);
}

export async function getFavorites(userId) {
  try {
    return await getFavoritesStrict(userId);
  } catch (error) {
    logger.error('Error getting favorites:', error);
    return [];
  }
}

async function saveFavoritesUnlocked(favoritesArray, userId, fromSync = false) {
  try {
    let normalizedFavorites = favoritesArray.slice(0, MAX_FAVORITES_ITEMS).map(toPersistedTrack);
    if (!fromSync) {
      const previous = await getFavoritesStrict(userId);
      const tombstones = await getFavoriteTombstones(userId);
      const nextKeys = new Set(normalizedFavorites.map(getTrackKey));
      for (const item of previous) {
        if (!nextKeys.has(getTrackKey(item))) {
          const modifiedAt = Date.now();
          const previousTombstone = tombstones.findIndex(
            (entry) => getTrackKey(entry) === getTrackKey(item)
          );
          if (previousTombstone >= 0) tombstones.splice(previousTombstone, 1);
          tombstones.push({
            id: item.id,
            source: item.source,
            modifiedAt,
            deletedAt: modifiedAt,
            localRevision: newRevision(),
            syncDirty: true,
            cloudRevision: item.cloudRevision || 0,
          });
        }
      }
      normalizedFavorites = normalizedFavorites.map((item) => {
        const existing = previous.find((entry) => getTrackKey(entry) === getTrackKey(item));
        if (existing && JSON.stringify(existing) === JSON.stringify(item)) return existing;
        return {
          ...item,
          modifiedAt: Date.now(),
          localRevision: newRevision(),
          syncDirty: true,
          cloudRevision:
            existing?.cloudRevision ||
            tombstones.find((entry) => getTrackKey(entry) === getTrackKey(item))?.cloudRevision ||
            0,
        };
      });
      // Persist deletion intent first: a failure cannot remove a song without an outbox entry.
      await saveFavoriteTombstones(tombstones, userId);
    }
    await favoritesStore.setItem(scopedKey('items', userId), normalizedFavorites);
    if (!fromSync) {
      const keys = new Set(normalizedFavorites.map(getTrackKey));
      await saveFavoriteTombstones(
        (await getFavoriteTombstones(userId)).filter((item) => !keys.has(getTrackKey(item))),
        userId
      );
    }
    notifyStorageChange('favorites', userId);
    return true;
  } catch (error) {
    logger.error('保存收藏列表失败:', error);
    return false;
  }
}
// Sync already owns the scope lock and must not manufacture a local mutation.
export const saveFavorites = (favoritesArray, userId, options = {}) =>
  options.fromSync
    ? saveFavoritesUnlocked(favoritesArray, userId, true)
    : withStorageMutation(userId, (scopeUid) => saveFavoritesUnlocked(favoritesArray, scopeUid));

// 添加或移除收藏
export async function getFavoriteTombstones(userId) {
  try {
    const tombstones = (await getScopedItem(favoriteTombstonesStore, 'items', userId)) || [];
    return tombstones.map(toPersistedTrack);
  } catch (error) {
    logger.error('获取收藏删除标记失败:', error);
    throw error;
  }
}

export async function saveFavoriteTombstones(tombstones, userId) {
  const normalized = tombstones
    .map(toPersistedTrack)
    .sort((a, b) => (b.modifiedAt || b.deletedAt || 0) - (a.modifiedAt || a.deletedAt || 0)); // Retain tombstones so offline devices cannot resurrect deleted favorites.
  await favoriteTombstonesStore.setItem(scopedKey('items', userId), normalized);
  return true;
}

async function toggleFavoriteUnlocked(track, userId) {
  const normalizedTrack = normalizeTrackIdentity(track);
  const trackKey = getTrackKey(normalizedTrack);
  const favorites = await getFavoritesStrict(userId);
  const index = favorites.findIndex((item) => getTrackKey(item) === trackKey);

  if (index > -1) {
    // 已收藏，则移除
    const previous = favorites.splice(index, 1)[0];
    const modifiedAt = Date.now();
    const localRevision = newRevision();
    const tombstones = await getFavoriteTombstones(userId);
    const remainingTombstones = tombstones.filter((item) => getTrackKey(item) !== trackKey);
    remainingTombstones.unshift({
      id: normalizedTrack.id,
      source: normalizedTrack.source,
      modifiedAt,
      deletedAt: modifiedAt,
      localRevision,
      syncDirty: true,
      cloudRevision: previous.cloudRevision || 0,
    });
    await saveFavoriteTombstones(remainingTombstones, userId);
    const favoritesSaved = await saveFavorites(favorites, userId, { fromSync: true });
    if (!favoritesSaved) throw new Error('保存收藏列表失败');
    return { added: false, full: false, track: toPersistedTrack(normalizedTrack) };
  } else {
    // 检查是否已达到上限
    if (favorites.length >= MAX_FAVORITES_ITEMS) {
      return { added: false, full: true, error: 'favorites_limit' };
    }
    // 未收藏，则添加到列表开头，并添加修改时间戳
    const trackWithTimestamp = {
      ...toPersistedTrack(normalizedTrack),
      modifiedAt: Date.now(),
      localRevision: newRevision(),
      syncDirty: true,
      cloudRevision:
        (await getFavoriteTombstones(userId)).find((item) => getTrackKey(item) === trackKey)
          ?.cloudRevision || 0,
    };
    favorites.unshift(trackWithTimestamp);
    const favoritesSaved = await saveFavorites(favorites, userId, { fromSync: true });
    if (!favoritesSaved) throw new Error('保存收藏列表失败');
    const tombstones = await getFavoriteTombstones(userId);
    await saveFavoriteTombstones(
      tombstones.filter((item) => getTrackKey(item) !== trackKey),
      userId
    );
    return { added: true, full: false, track: trackWithTimestamp };
  }
}

export const toggleFavorite = (track, userId) =>
  withStorageMutation(userId, (scopeUid) => toggleFavoriteUnlocked(track, scopeUid));

/**
 * 本地用户操作
 */
// 保存本地用户信息
export async function saveLocalUser(user) {
  try {
    await userStore.setItem('localUser', user);
    return true;
  } catch (error) {
    logger.error('保存本地用户信息失败:', error);
    return false;
  }
}

// 获取本地用户信息
export async function getLocalUser() {
  try {
    return await userStore.getItem('localUser');
  } catch (error) {
    logger.error('获取本地用户信息失败:', error);
    return null;
  }
}

/**
 * 网络状态操作
 */
// 保存网络状态
export async function saveNetworkStatus(status) {
  try {
    // 确保包含所有必要的字段
    const completeStatus = {
      online: status.online ?? navigator.onLine,
      lastChecked: status.lastChecked ?? Date.now(),
      connectionType: status.connectionType ?? 'unknown',
    };

    await networkStore.setItem('status', completeStatus);
    return true;
  } catch (error) {
    logger.error('保存网络状态失败:', error);
    return false;
  }
}

// 获取网络状态
export async function getNetworkStatus() {
  try {
    const status = await networkStore.getItem('status');
    if (!status) {
      // 默认状态
      return {
        online: navigator.onLine,
        lastChecked: Date.now(),
        connectionType: navigator.onLine ? 'unknown' : 'offline',
      };
    }

    // 确保返回的对象包含connectionType字段
    if (!status.connectionType) {
      status.connectionType = status.online ? 'unknown' : 'offline';
    }

    return status;
  } catch (error) {
    logger.error('获取网络状态失败:', error);
    return {
      online: navigator.onLine,
      lastChecked: Date.now(),
      connectionType: navigator.onLine ? 'unknown' : 'offline',
    };
  }
}

/**
 * 通用历史记录操作
 * 用于处理播放历史、搜索历史等
 */
// 定义最大记录数
export const MAX_HISTORY_ITEMS = 100; // 播放历史记录数量
const MAX_SEARCH_HISTORY_ITEMS = 20; // 搜索历史记录数量

/**
 * 获取历史记录
 * @param {Object} store - 存储实例
 * @returns {Promise<Array>} - 历史记录数组
 */
async function getHistoryGeneric(store, userId) {
  try {
    const data = await getScopedItem(store, 'items', userId);
    return data || [];
  } catch (error) {
    logger.error('Error getting history:', error);
    return [];
  }
}

/**
 * 保存历史记录
 * @param {Object} store - 存储实例
 * @param {Array} historyArray - 历史记录数组
 * @param {number} maxItems - 最大记录数
 * @returns {Promise<boolean>} - 是否成功
 */
async function saveHistoryGeneric(store, historyArray, maxItems, userId) {
  try {
    // 确保历史记录不超过最大数量
    const limitedHistory = historyArray.slice(0, maxItems);
    await store.setItem(scopedKey('items', userId), limitedHistory);
    return true;
  } catch (error) {
    logger.error('Error saving history:', error);
    return false;
  }
}

/**
 * 添加记录到历史
 * @param {Object} store - 存储实例
 * @param {Object|string} item - 要添加的项目
 * @param {number} maxItems - 最大记录数
 * @param {Function} findExistingFn - 查找已存在项的函数
 * @param {Function} createItemFn - 创建新项的函数
 * @returns {Promise<boolean>} - 是否成功
 */
async function addToHistoryGeneric(store, item, maxItems, findExistingFn, createItemFn, userId) {
  try {
    const history = await getHistoryGeneric(store, userId);

    // 检查是否已经存在
    const existingIndex = history.findIndex(findExistingFn);

    if (existingIndex !== -1) {
      // 如果存在，从原位置删除
      history.splice(existingIndex, 1);
    }

    // 添加到历史记录的顶部
    history.unshift(createItemFn(item));

    // 如果超过最大记录数，删除最旧的
    if (history.length > maxItems) {
      history.length = maxItems; // 直接截断数组
    }

    return await saveHistoryGeneric(store, history, maxItems, userId);
  } catch (error) {
    logger.error('Error adding to history:', error);
    return false;
  }
}

/**
 * 清空历史记录
 * @param {Object} store - 存储实例
 * @returns {Promise<boolean>} - 是否成功
 */
async function clearHistoryGeneric(store, userId) {
  try {
    await store.setItem(scopedKey('items', userId), []);
    return true;
  } catch (error) {
    logger.error('Error clearing history:', error);
    return false;
  }
}

/**
 * 播放历史操作
 */
// 获取播放历史
export async function getHistory(userId) {
  try {
    return await getHistoryStrict(userId);
  } catch (error) {
    logger.error('Error getting history:', error);
    return [];
  }
}

export async function getHistoryStrict(userId) {
  const data = await getScopedItem(historyStore, 'items', userId);
  return (data || []).map((item) => ({
    ...item,
    song: item.song ? toPersistedTrack(item.song) : item.song,
  }));
}

// 保存播放历史
async function saveHistoryUnlocked(historyArray, userId, fromSync) {
  let normalizedHistory = historyArray.map((item) => ({
    ...item,
    song: item.song ? toPersistedTrack(item.song) : item.song,
  }));
  if (!fromSync) {
    const previous = await getHistoryStrict(userId);
    normalizedHistory = normalizedHistory.map((item) => {
      const existing = previous.find((entry) => getTrackKey(entry.song) === getTrackKey(item.song));
      if (existing && JSON.stringify(existing) === JSON.stringify(item)) return existing;
      return {
        ...item,
        localRevision: newRevision(),
        syncDirty: true,
        cloudRevision: existing?.cloudRevision || 0,
      };
    });
  }
  const saved = await saveHistoryGeneric(
    historyStore,
    normalizedHistory,
    MAX_HISTORY_ITEMS,
    userId
  );
  if (saved) notifyStorageChange('history', userId);
  return saved;
}

export const saveHistory = (historyArray, userId, options = {}) =>
  options.fromSync
    ? saveHistoryUnlocked(historyArray, userId, true)
    : withStorageMutation(userId, (scopeUid) => saveHistoryUnlocked(historyArray, scopeUid, false));

// 添加到播放历史
async function addToHistoryUnlocked(track, userId) {
  try {
    const normalizedTrack = toPersistedTrack(track);
    const history = await getHistoryStrict(userId);
    const existingIndex = history.findIndex((item) => {
      const song = item.song || item;
      return song && getTrackKey(song) === getTrackKey(normalizedTrack);
    });
    const previous = existingIndex !== -1 ? history.splice(existingIndex, 1)[0] : null;
    history.unshift({
      timestamp: Date.now(),
      song: normalizedTrack,
      localRevision: newRevision(),
      syncDirty: true,
      cloudRevision: previous?.cloudRevision || 0,
    });
    return await saveHistory(history, userId, { fromSync: true });
  } catch (error) {
    logger.error('Error adding to history:', error);
    return false;
  }
}

export const addToHistory = (track, userId) =>
  withStorageMutation(userId, (scopeUid) => addToHistoryUnlocked(track, scopeUid));

// 清空播放历史
export async function clearHistory(userId) {
  return withStorageMutation(userId, async (scopeUid) => {
    userId = scopeUid;
    const saved = await clearHistoryGeneric(historyStore, userId);
    if (saved) notifyStorageChange('history', userId);
    return saved;
  });
}

/**
 * 搜索历史操作
 */
// 获取搜索历史
export async function getSearchHistory(userId) {
  return getHistoryGeneric(searchHistoryStore, userId);
}

// 保存搜索历史
export async function saveSearchHistory(historyArray, userId) {
  return saveHistoryGeneric(searchHistoryStore, historyArray, MAX_SEARCH_HISTORY_ITEMS, userId);
}

// 添加搜索历史
async function addSearchHistoryUnlocked(query, source, userId) {
  return addToHistoryGeneric(
    searchHistoryStore,
    { query, source },
    MAX_SEARCH_HISTORY_ITEMS,
    (item) => item.query.toLowerCase() === query.toLowerCase() && item.source === source,
    ({ query, source }) => ({
      timestamp: Date.now(),
      query: query,
      source: source,
    }),
    userId
  );
}

// 清空搜索历史
export async function clearSearchHistory(userId) {
  return clearHistoryGeneric(searchHistoryStore, userId);
}

/**
 * 同步状态操作
 */
// 获取同步状态
export async function getSyncStatus(userId) {
  try {
    const key = `sync_status_${userId || 'default'}`;
    const data = await syncStore.getItem(key);
    return data || { loading: false, success: null, message: '', timestamp: null };
  } catch (error) {
    logger.error('Error getting sync status:', error);
    return { loading: false, success: null, message: '', timestamp: null };
  }
}

// 保存同步状态
export async function saveSyncStatus(status, userId) {
  try {
    const key = `sync_status_${userId || 'default'}`;
    await syncStore.setItem(key, status);
    return true;
  } catch (error) {
    logger.error('Error saving sync status:', error);
    return false;
  }
}

/**
 * 变更计数器操作 - 用于延迟同步
 */
// 变更计数器键名
const CHANGES_COUNTER_KEY = 'pending_sync_changes';
const CHANGES_TIMESTAMP_KEY = 'last_changes_timestamp';

// 获取待同步变更计数
export async function getPendingSyncChanges(userId) {
  try {
    const counter = await getScopedSyncValue(CHANGES_COUNTER_KEY, userId);
    const timestamp = await getScopedSyncValue(CHANGES_TIMESTAMP_KEY, userId);
    return {
      favorites: counter?.favorites || 0,
      history: counter?.history || 0,
      timestamp: timestamp || 0,
    };
  } catch (error) {
    logger.error('获取待同步变更计数失败:', error);
    return { favorites: 0, history: 0, timestamp: 0 };
  }
}

// 同步决策使用严格读取，避免存储故障被当作“没有待同步变更”。
export async function getPendingSyncChangesStrict(userId) {
  const counter = await getScopedSyncValue(CHANGES_COUNTER_KEY, userId);
  const timestamp = await getScopedSyncValue(CHANGES_TIMESTAMP_KEY, userId);
  return {
    favorites: counter?.favorites || 0,
    history: counter?.history || 0,
    timestamp: timestamp || 0,
  };
}

// 保存待同步变更计数
async function savePendingSyncChanges(counter, userId) {
  try {
    await syncStore.setItem(scopedKey(CHANGES_COUNTER_KEY, userId), counter);
    await syncStore.setItem(scopedKey(CHANGES_TIMESTAMP_KEY, userId), Date.now());
    return true;
  } catch (error) {
    logger.error('保存待同步变更计数失败:', error);
    return false;
  }
}

// 增加待同步变更计数
async function incrementPendingChangesUnlocked(type, userId) {
  try {
    const counter = await getPendingSyncChangesStrict(userId);
    const newCounter = {
      ...counter,
      [type]: counter[type] + 1,
    };

    const saved = await savePendingSyncChanges(newCounter, userId);
    if (!saved) throw new Error('保存待同步变更计数失败');
    return newCounter;
  } catch (error) {
    logger.error('增加待同步变更计数失败:', error);
    return null;
  }
}

// 重置待同步变更计数
export async function resetPendingChanges(userId) {
  try {
    await syncStore.setItem(scopedKey(CHANGES_COUNTER_KEY, userId), {
      favorites: 0,
      history: 0,
    });
    await syncStore.setItem(scopedKey(CHANGES_TIMESTAMP_KEY, userId), Date.now());
    return true;
  } catch (error) {
    logger.error('重置待同步变更计数失败:', error);
    return false;
  }
}

export const incrementPendingChanges = (type, userId) =>
  withStorageMutation(userId, (scopeUid) => incrementPendingChangesUnlocked(type, scopeUid));
let coverMutationQueue = Promise.resolve();
const withCoverMutation = (operation) => {
  const pending = coverMutationQueue.then(operation, operation);
  coverMutationQueue = pending.catch(() => {});
  return pending;
};
export const clearCoverCache = () => withCoverMutation(() => coverStore.clear());
export const saveCoverToStorage = (key, imageUrl) =>
  withCoverMutation(() => saveCoverToStorageUnlocked(key, imageUrl));
export const clearExpiredCovers = (options = {}) =>
  withCoverMutation(() => clearExpiredCoversUnlocked(options));

// Acknowledgement never clears a newer local revision.
async function acknowledgeSyncChangesUnlocked(changes, userId, assertActive) {
  assertActive();
  const acknowledge = (items, keyOf, accepted) =>
    items.map((item) => {
      const match = accepted.find(
        (entry) => keyOf(entry) === keyOf(item) && entry.localRevision === item.localRevision
      );
      return match
        ? {
            ...item,
            syncDirty: false,
            cloudRevision: match.cloudRevision,
            ...(match.syncedAt != null ? { syncedAt: match.syncedAt } : {}),
          }
        : item;
    });
  const favoritesSaved = await saveFavorites(
    acknowledge(await getFavoritesStrict(userId), getTrackKey, changes.favorites),
    userId,
    { fromSync: true }
  );
  await saveFavoriteTombstones(
    acknowledge(await getFavoriteTombstones(userId), getTrackKey, changes.favorites),
    userId,
    { fromSync: true }
  );
  if (!favoritesSaved) throw new Error('保存收藏同步确认失败');
  const historySaved = await saveHistory(
    acknowledge(await getHistoryStrict(userId), (item) => getTrackKey(item.song), changes.history),
    userId,
    { fromSync: true }
  );
  if (!historySaved) throw new Error('保存历史同步确认失败');
}

export const addSearchHistory = (query, source, userId) =>
  withStorageMutation(userId, (scopeUid) => addSearchHistoryUnlocked(query, source, scopeUid));

// Surface a CAS conflict once, then retry the preserved intent against the observed revision.
async function rebaseSyncChangeUnlocked(type, change, cloudRevision, userId, assertActive) {
  assertActive();
  const update = (items, keyOf) =>
    items.map((item) =>
      keyOf(item) === keyOf(change) && item.localRevision === change.localRevision
        ? { ...item, cloudRevision }
        : item
    );
  if (type === 'favorites') {
    const saved = await saveFavorites(
      update(await getFavoritesStrict(userId), getTrackKey),
      userId,
      {
        fromSync: true,
      }
    );
    if (!saved) throw new Error('保存收藏冲突状态失败');
    await saveFavoriteTombstones(update(await getFavoriteTombstones(userId), getTrackKey), userId);
  } else {
    const saved = await saveHistory(
      update(await getHistoryStrict(userId), (item) => getTrackKey(item.song)),
      userId,
      { fromSync: true }
    );
    if (!saved) throw new Error('保存历史冲突状态失败');
  }
}

export const acknowledgeSyncChanges = (changes, userId, assertActive = () => {}) =>
  withStorageMutation(userId, (scopeUid) =>
    acknowledgeSyncChangesUnlocked(changes, scopeUid, assertActive)
  );
export const rebaseSyncChange = (type, change, cloudRevision, userId, assertActive = () => {}) =>
  withStorageMutation(userId, (scopeUid) =>
    rebaseSyncChangeUnlocked(type, change, cloudRevision, scopeUid, assertActive)
  );

export const clearLocalFavorites = (userId) =>
  withStorageMutation(userId, async (scopeUid) => {
    userId = scopeUid;
    await saveFavoriteTombstones([], userId);
    const saved = await saveFavoritesUnlocked([], userId, true);
    if (!saved) throw new Error('清除本地收藏失败');
    return true;
  });
export const importFavorites = (favorites, userId) =>
  withStorageMutation(userId, async (scopeUid) => {
    userId = scopeUid;
    const current = await getFavoritesStrict(userId);
    const keys = new Set(current.map(getTrackKey));
    const added = [];
    for (const item of favorites) {
      if (keys.has(getTrackKey(item)) || added.length + current.length >= MAX_FAVORITES_ITEMS)
        continue;
      keys.add(getTrackKey(item));
      added.push(item);
    }
    const success = await saveFavoritesUnlocked([...added, ...current], userId);
    return {
      success,
      addedCount: success ? added.length : 0,
      addedKeys: success ? added.map(getTrackKey) : [],
    };
  });

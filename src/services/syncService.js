import { db, isFirebaseAvailable, checkFirebaseAvailability } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  writeBatch,
  runTransaction,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  getFavoritesStrict,
  getFavoriteTombstones,
  saveFavorites,
  saveFavoriteTombstones,
  getHistoryStrict,
  saveHistory,
  MAX_HISTORY_ITEMS,
  getNetworkStatus,
  resetPendingChanges,
} from './storage';
import logger from '../utils/logger.js';
import { getTrackDocumentId, getTrackKey } from '../utils/trackIdentity';
import { getTrackArtist } from '../utils/trackFormatter';

// 同步时间戳存储键
const SYNC_TIMESTAMP_KEY = 'last_sync_timestamp';

// 延迟同步定时器：收藏与历史各自独立，互不取消
const syncTimers = {
  favorites: null,
  history: null,
};

const SYNC_TYPES = ['favorites', 'history'];

const SYNC_DELAYS = {
  favorites: 5000, // trailing debounce：最后一次收藏操作后 5 秒同步
  history: 15000, // batch window：首个变化起 15 秒成批同步，期间不重置
};

// 离线兜底重试：全局只保留一个，且只重排一次。
// 正常恢复依赖 networkStatusChange 事件，这里只是事件丢失时的保险。
const OFFLINE_RETRY_DELAY = 60000;
let offlineRetryTimer = null;
let offlineRetryUsed = false;

// 慢速看门狗：只告警，不释放锁。Firestore 的 Promise 无法真正 abort，
// 强行解锁只会让两轮同步并发写入。
const SYNC_WATCHDOG_DELAY = 30000;
let syncWatchdogTimer = null;

// 同步调度状态：任何时刻最多一轮在跑 + 一轮补跑
let syncInFlight = null;
let syncInFlightUid = null;
let queuedRerun = false;
let queuedRerunUid = null;
let queuedRerunWaiters = [];

// 批量操作限制
const BATCH_SIZE = 100; // Firestore每批次最多500个操作，我们保守使用100

// 定义子集合名称
const FAVORITES_COLLECTION = 'favorites';
const HISTORY_COLLECTION = 'history';
const CLOUD_TRACK_SOURCES = new Set(['netease', 'kuwo', 'joox', 'bilibili', 'ytmusic', 'unknown']);

const boundedText = (value, maxLength) => String(value ?? '').slice(0, maxLength);

const toCloudTrack = (track) => {
  const source = CLOUD_TRACK_SOURCES.has(track.source) ? track.source : 'unknown';
  const album = typeof track.album === 'string' ? track.album : track.album?.name;
  return {
    id: boundedText(track.id, 200),
    source,
    name: boundedText(track.name || '未知歌曲', 300),
    artist: boundedText(getTrackArtist(track), 300),
    album: boundedText(album, 300),
    pic_id: track.pic_id == null ? null : boundedText(track.pic_id, 500),
    lyric_id: track.lyric_id == null ? null : boundedText(track.lyric_id, 500),
  };
};

const toMillis = (value) =>
  typeof value === 'number' ? value : typeof value?.toMillis === 'function' ? value.toMillis() : 0;

const touchCloudUser = async (userRef, timestamp) =>
  runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const currentTimestamp = snapshot.exists() ? toMillis(snapshot.data()?.lastUpdated) : 0;
    transaction.set(
      userRef,
      { lastUpdated: Math.max(timestamp, currentTimestamp) },
      { merge: true }
    );
  });

// 定义事件类型
export const SyncEvents = {
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_SKIPPED: 'sync_skipped',
  SYNC_FAILED: 'sync_failed',
  SYNC_PROGRESS: 'sync_progress',
};

// 事件监听器存储
const listeners = {};

/**
 * 添加同步事件监听器
 * @param {string} event 事件类型
 * @param {Function} callback 回调函数
 */
export const addSyncListener = (event, callback) => {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(callback);
};

/**
 * 移除同步事件监听器
 * @param {string} event 事件类型
 * @param {Function} callback 回调函数
 */
export const removeSyncListener = (event, callback) => {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter((cb) => cb !== callback);
};

/**
 * 触发同步事件
 * @param {string} event 事件类型
 * @param {Object} data 事件数据
 */
const triggerEvent = (event, data) => {
  if (!listeners[event]) return;
  listeners[event].forEach((callback) => {
    try {
      callback(data);
    } catch (error) {
      logger.error(`执行同步事件监听器错误 (${event}):`, error);
    }
  });
};

/**
 * 获取上次同步时间戳
 * @param {string} uid 用户ID
 * @returns {Promise<number>} 上次同步时间戳
 */
const getLastSyncTime = async (uid) => {
  try {
    const key = `${SYNC_TIMESTAMP_KEY}_${uid}`;
    const timestamp = localStorage.getItem(key);
    return timestamp ? parseInt(timestamp) : 0;
  } catch (error) {
    logger.error('获取同步时间戳失败:', error);
    return 0;
  }
};

/**
 * 保存同步时间戳
 * @param {string} uid 用户ID
 * @param {number} timestamp 时间戳
 */
const saveLastSyncTime = async (uid, timestamp) => {
  try {
    const key = `${SYNC_TIMESTAMP_KEY}_${uid}`;
    localStorage.setItem(key, timestamp.toString());
  } catch (error) {
    logger.error('保存同步时间戳失败:', error);
    throw error;
  }
};

/**
 * 获取收藏子集合引用
 * @param {string} uid 用户ID
 * @returns {CollectionReference} 收藏子集合引用
 */
const getFavoritesCollectionRef = (uid) => {
  return collection(db, 'users', uid, FAVORITES_COLLECTION);
};

/**
 * 获取历史记录子集合引用
 * @param {string} uid 用户ID
 * @returns {CollectionReference} 历史记录子集合引用
 */
const getHistoryCollectionRef = (uid) => {
  return collection(db, 'users', uid, HISTORY_COLLECTION);
};

/**
 * 获取用户文档引用
 * @param {string} uid 用户ID
 * @returns {DocumentReference} 用户文档引用
 */
const getUserDocRef = (uid) => {
  return doc(db, 'users', uid);
};

/**
 * 获取自上次同步后本地变更的数据
 * @param {number} lastSyncTime 上次同步时间戳
 * @returns {Promise<{favorites: Array, favoriteTombstones: Array, history: Array}>} 本地变更数据
 */
const getLocalChangesSince = async (lastSyncTime, uid) => {
  try {
    // 获取所有本地数据
    const allFavorites = await getFavoritesStrict(uid);
    const allFavoriteTombstones = await getFavoriteTombstones(uid);
    const allHistory = await getHistoryStrict(uid);

    // 筛选出变更的数据
    // 注意：由于当前数据结构可能没有修改时间戳，我们添加一个检测逻辑
    const changedFavorites = allFavorites.filter((item) => {
      // 如果项目有modifiedAt字段，使用它判断
      if (item.modifiedAt != null) {
        return item.modifiedAt > lastSyncTime;
      }
      // 没有modifiedAt时，仅在首次同步时作为变更处理
      return lastSyncTime === 0;
    });

    const changedHistory = allHistory.filter((item) => {
      // 历史记录通常有timestamp字段
      return item.timestamp > lastSyncTime;
    });

    const changedFavoriteTombstones = allFavoriteTombstones.filter(
      (item) => item.modifiedAt > lastSyncTime
    );

    return {
      favorites: changedFavorites,
      favoriteTombstones: changedFavoriteTombstones,
      history: changedHistory,
      hasChanges:
        changedFavorites.length > 0 ||
        changedFavoriteTombstones.length > 0 ||
        changedHistory.length > 0,
    };
  } catch (error) {
    logger.error('获取本地变更数据失败:', error);
    throw error;
  }
};

/**
 * 检查是否可以执行同步操作
 * @returns {Promise<{canSync: boolean, error: string|null}>}
 */
const checkSyncAvailability = async () => {
  // 检查Firebase是否可用
  if (!isFirebaseAvailable) {
    logger.warn('同步检测: Firebase初始化不可用');
    return { canSync: false, error: '当前处于离线模式，无法同步数据' };
  }

  // 进一步检查Firebase连接
  const firebaseAvailable = await checkFirebaseAvailability();
  if (!firebaseAvailable) {
    logger.warn('同步检测: Firebase连接测试失败');
    return { canSync: false, error: 'Firebase服务连接失败，无法同步数据' };
  }

  // 检查网络连接状态
  const networkStatus = await getNetworkStatus();
  if (!networkStatus.online) {
    logger.warn('同步检测: 网络连接不可用');
    return { canSync: false, error: '网络连接已断开，无法同步数据' };
  }

  return { canSync: true, error: null };
};

/**
 * 同步成功后的统一收尾：pending 只是界面状态，成功（含 unchanged）后清理。
 * 放在 incrementalSync 的成功出口，覆盖 requestSync / initialSync / merge
 * 等所有同步入口，避免任何入口漏清导致 UI 一直显示有变更待同步。
 * @param {string} uid 用户ID
 */
const clearPendingSyncCounter = async (uid) => {
  if (!uid) return;
  const resetSucceeded = await resetPendingChanges(uid);
  if (!resetSucceeded) logger.warn('重置待同步变更计数失败，仅影响界面展示');
};

/**
 * 增量同步核心实现 - 使用子集合架构
 * @param {string} uid 用户ID
 * @returns {Promise<{success: boolean, data?: any, error?: any, unchanged?: boolean}>}
 */
const executeIncrementalSync = async (uid) => {
  try {
    logger.log('开始子集合增量同步...');

    // 触发同步开始事件
    triggerEvent(SyncEvents.SYNC_STARTED, { uid, timestamp: Date.now() });

    // 检查同步可用性
    const { canSync, error } = await checkSyncAvailability();
    if (!canSync) {
      logger.warn(`子集合增量同步失败: ${error}`);

      // 触发同步失败事件
      triggerEvent(SyncEvents.SYNC_FAILED, { uid, error, timestamp: Date.now() });

      return { success: false, error };
    }

    if (!uid) {
      logger.warn('子集合增量同步失败: 用户未登录');

      // 触发同步失败事件
      triggerEvent(SyncEvents.SYNC_FAILED, {
        uid,
        error: '用户未登录',
        timestamp: Date.now(),
      });

      return { success: false, error: '用户未登录' };
    }

    // 一次性遗留清理：正常同步开始前先清掉旧 docId 重复项，
    // 否则新设备首次全量拉取可能因 limit(100) 挤出最旧的唯一歌曲。
    // 内部自带错误隔离，不影响本轮同步结果。
    await ensureHistoryLegacyCleanup(uid);

    // 获取上次同步时间
    const lastSyncTime = await getLastSyncTime(uid);
    const now = Date.now();
    logger.log(`上次同步时间: ${new Date(lastSyncTime).toLocaleString()}`);

    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, {
      uid,
      phase: 'check_changes',
      message: '检查数据变更...',
      timestamp: Date.now(),
    });

    // 获取本地变更数据
    const localChanges = await getLocalChangesSince(lastSyncTime, uid);
    logger.log(
      `本地变更: 收藏=${localChanges.favorites.length}条, 删除=${localChanges.favoriteTombstones.length}条, 历史=${localChanges.history.length}条`
    );

    // 获取用户文档
    const userRef = getUserDocRef(uid);
    const userDoc = await getDoc(userRef);

    // 如果用户文档不存在，创建一个基本文档
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        lastUpdated: now,
        createdAt: now,
      });
      logger.log('已创建新的用户基本文档');
    }

    const userData = userDoc.exists() ? userDoc.data() : {};

    // 获取云端最后更新时间
    const cloudLastUpdated = userData.lastUpdated || 0;
    logger.log(`云端最后更新时间: ${new Date(cloudLastUpdated).toLocaleString()}`);

    // 如果本地没有变化且云端没有更新，跳过同步
    if (!localChanges.hasChanges && cloudLastUpdated <= lastSyncTime) {
      logger.log('没有变化，跳过同步');

      // 更新同步时间戳为当前时间，即使没有实际同步
      await saveLastSyncTime(uid, now);

      // unchanged 表示本地已无待同步变更，可清理陈旧计数
      await clearPendingSyncCounter(uid);

      // 触发同步完成事件
      triggerEvent(SyncEvents.SYNC_COMPLETED, {
        uid,
        timestamp: now,
        syncType: 'incremental',
        result: { success: true, unchanged: true },
      });

      return { success: true, unchanged: true, timestamp: now };
    }

    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, {
      uid,
      phase: 'cloud_favorites',
      message: '获取云端收藏数据...',
      timestamp: Date.now(),
    });

    // 获取云端收藏数据变更
    const cloudFavorites = await getCloudFavoritesFromSubcollection(uid, lastSyncTime);

    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, {
      uid,
      phase: 'cloud_history',
      message: '获取云端历史记录...',
      timestamp: Date.now(),
    });

    // 获取云端历史记录变更
    const cloudHistory = await getCloudHistoryFromSubcollection(uid, lastSyncTime);

    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, {
      uid,
      phase: 'merge_data',
      message: '合并数据...',
      timestamp: Date.now(),
    });

    // 同步收藏数据 - 本地到云端
    const cloudFavoritesByKey = new Map();
    cloudFavorites.forEach((item) => {
      const itemKey = getTrackKey(item);
      const existing = cloudFavoritesByKey.get(itemKey);
      if (!existing || (item.modifiedAt || 0) > (existing.modifiedAt || 0)) {
        cloudFavoritesByKey.set(itemKey, item);
      }
    });
    const localFavoriteChangesToUpload = [
      ...localChanges.favorites,
      ...localChanges.favoriteTombstones,
    ].filter((item) => {
      const cloudItem = cloudFavoritesByKey.get(getTrackKey(item));
      return !cloudItem || (item.modifiedAt || 0) > (cloudItem.modifiedAt || 0);
    });

    if (localFavoriteChangesToUpload.length > 0) {
      logger.log(`同步${localFavoriteChangesToUpload.length}条本地收藏变更到云端...`);
      await saveCloudFavoritesToSubcollection(uid, localFavoriteChangesToUpload);
    }

    // 同步历史记录 - 本地到云端
    const cloudHistoryByKey = new Map();
    cloudHistory.forEach((item) => {
      if (!item.song) return;
      const itemKey = getTrackKey(item.song);
      const existing = cloudHistoryByKey.get(itemKey);
      if (!existing || item.timestamp > existing.timestamp) cloudHistoryByKey.set(itemKey, item);
    });
    const localHistoryToUpload = localChanges.history.filter((item) => {
      const cloudItem = item.song ? cloudHistoryByKey.get(getTrackKey(item.song)) : null;
      return !cloudItem || item.timestamp > cloudItem.timestamp;
    });

    if (localHistoryToUpload.length > 0) {
      logger.log(`同步${localHistoryToUpload.length}条本地历史记录到云端...`);
      await saveCloudHistoryToSubcollection(uid, localHistoryToUpload);
    }

    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, {
      uid,
      phase: 'update_local',
      message: '更新本地数据...',
      timestamp: Date.now(),
    });

    // 如果有云端数据变更，更新本地数据
    let localFavoritesUpdated = false;

    // 处理云端收藏变更
    if (cloudFavorites.length > 0) {
      // 获取所有本地收藏
      const allLocalFavorites = await getFavoritesStrict(uid);
      const allLocalTombstones = await getFavoriteTombstones(uid);
      const favoritesMap = new Map();
      const tombstonesMap = new Map();

      // 添加所有本地收藏到Map
      allLocalFavorites.forEach((item) => {
        favoritesMap.set(getTrackKey(item), item);
      });
      allLocalTombstones.forEach((item) => tombstonesMap.set(getTrackKey(item), item));

      // 更新/添加云端变更的收藏
      cloudFavorites.forEach((item) => {
        // 确保docId不存储到本地
        const itemData = { ...item };
        delete itemData.docId;

        const itemKey = getTrackKey(item);
        const existingItem = favoritesMap.get(itemKey);
        const existingTombstone = tombstonesMap.get(itemKey);

        if (item.deletedAt) {
          if (!existingTombstone || item.modifiedAt > existingTombstone.modifiedAt) {
            tombstonesMap.set(itemKey, itemData);
          }
          if (!existingItem || item.modifiedAt >= (existingItem.modifiedAt || 0)) {
            favoritesMap.delete(itemKey);
            localFavoritesUpdated = true;
          }
          return;
        }

        if (existingTombstone && existingTombstone.modifiedAt >= (item.modifiedAt || 0)) {
          return;
        }

        // 如果本地没有该项，或者云端项更新，则使用云端项
        if (
          !existingItem ||
          (item.modifiedAt &&
            (!existingItem.modifiedAt || item.modifiedAt > existingItem.modifiedAt))
        ) {
          favoritesMap.set(itemKey, existingItem ? { ...existingItem, ...itemData } : itemData);
          tombstonesMap.delete(itemKey);
          localFavoritesUpdated = true;
        }
      });

      // 转换回数组并保存
      if (localFavoritesUpdated) {
        const mergedFavorites = Array.from(favoritesMap.values());
        const favoritesSaved = await saveFavorites(mergedFavorites, uid);
        if (!favoritesSaved) throw new Error('保存本地收藏失败');
        await saveFavoriteTombstones(Array.from(tombstonesMap.values()), uid);
        logger.log(`已更新本地收藏数据，总数: ${mergedFavorites.length}条`);
      }
    }

    // 处理云端历史记录变更
    if (cloudHistory.length > 0) {
      let localHistoryUpdated = false;
      // 获取所有本地历史记录
      const allLocalHistory = await getHistoryStrict(uid);
      const historyMap = new Map();

      // 添加所有本地历史记录到Map，键为歌曲ID
      allLocalHistory.forEach((item) => {
        if (item.song && item.song.id) {
          historyMap.set(getTrackKey(item.song), item);
        }
      });

      // 更新/添加云端变更的历史记录
      cloudHistory.forEach((item) => {
        // 确保docId不存储到本地
        const itemData = { ...item };
        delete itemData.docId;

        if (item.song && item.song.id) {
          const itemKey = getTrackKey(item.song);
          const existingItem = historyMap.get(itemKey);

          // 如果本地没有该项，或者云端项更新，则使用云端项
          if (!existingItem || item.timestamp > existingItem.timestamp) {
            historyMap.set(
              itemKey,
              existingItem
                ? {
                    ...existingItem,
                    ...itemData,
                    song: { ...existingItem.song, ...itemData.song },
                  }
                : itemData
            );
            localHistoryUpdated = true;
          }
        }
      });

      // 转换回数组，按时间戳排序，并保存
      if (localHistoryUpdated) {
        const mergedHistory = Array.from(historyMap.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_HISTORY_ITEMS); // 限制数量

        const historySaved = await saveHistory(mergedHistory, uid);
        if (!historySaved) throw new Error('保存本地历史失败');
        logger.log(`已更新本地历史记录，总数: ${mergedHistory.length}条`);
      }
    }

    // 更新同步时间戳
    await saveLastSyncTime(uid, now);
    logger.log(`同步完成，新的同步时间: ${new Date(now).toLocaleString()}`);

    // 同步成功（含 unchanged）后由同步服务统一清理 pending 计数
    await clearPendingSyncCounter(uid);

    // 触发同步完成事件
    triggerEvent(SyncEvents.SYNC_COMPLETED, {
      uid,
      timestamp: now,
      syncType: 'incremental',
      result: {
        success: true,
        cloudFavorites: cloudFavorites.length,
        cloudHistory: cloudHistory.length,
        localFavorites: localChanges.favorites.length,
        localFavoriteDeletions: localChanges.favoriteTombstones.length,
        localHistory: localChanges.history.length,
      },
    });

    return {
      success: true,
      cloudFavorites: cloudFavorites.length,
      cloudHistory: cloudHistory.length,
      localFavorites: localChanges.favorites.length,
      localFavoriteDeletions: localChanges.favoriteTombstones.length,
      localHistory: localChanges.history.length,
    };
  } catch (error) {
    logger.error('子集合增量同步失败:', error);

    // 触发同步失败事件
    triggerEvent(SyncEvents.SYNC_FAILED, {
      uid,
      error: error.message || '未知错误',
      timestamp: Date.now(),
      syncType: 'incremental',
    });

    return { success: false, error };
  }
};

// 同步执行串行链：所有入口（requestSync / initialSync / merge）最终都汇聚到
// executeIncrementalSync。登录同步直接调 incrementalSyncWithSubcollections、
// 绕过 requestSync 的 single-flight 锁，因此真正的锁必须放在执行核心上，
// 否则登录同步仍可能与前台/网络恢复/手动同步并发。
let syncExecutionChain = Promise.resolve();

const runSerializedSync = (syncFn) => {
  const run = syncExecutionChain.then(syncFn, syncFn);
  // 链上吞掉失败，避免某一次同步抛错中断后续排队的同步
  syncExecutionChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

/**
 * 增量同步函数 - 串行化执行，任意时刻至多一个同步在跑
 * @param {string} uid 用户ID
 * @returns {Promise<{success: boolean, data?: any, error?: any, unchanged?: boolean}>}
 */
const incrementalSyncWithSubcollections = (uid) =>
  runSerializedSync(() => executeIncrementalSync(uid));

/**
 * 增量同步别名
 * @param {string} uid 用户ID
 * @returns {Promise<{success: boolean, data?: any, error?: any, unchanged?: boolean}>}
 */
const incrementalSync = incrementalSyncWithSubcollections;

/**
 * 通用同步函数，根据不同参数执行不同的同步行为
 * @param {string} uid 用户ID
 * @param {string} dataType 数据类型 'favorites' | 'history'
 * @param {string} direction 同步方向 'merge'
 * @returns {Promise<{success: boolean, data?: any, error?: any}>}
 */
const syncData = async (uid, dataType, direction) => {
  try {
    logger.log(`开始${dataType}同步，方向: ${direction}`);

    // 检查同步可用性
    const { canSync, error } = await checkSyncAvailability();
    if (!canSync) {
      logger.warn(`${dataType}同步失败: ${error}`);
      return { success: false, error };
    }

    if (!uid) {
      logger.warn(`${dataType}同步失败: 用户未登录`);
      return { success: false, error: '用户未登录' };
    }

    // 仅支持合并操作
    if (direction === 'merge') {
      // 使用增量同步进行合并
      return await incrementalSync(uid);
    }

    logger.warn(`无效的同步方向: ${direction}`);
    return { success: false, error: '无效的同步方向' };
  } catch (error) {
    logger.error(`同步${dataType}失败:`, error);
    return { success: false, error };
  }
};

// 合并本地和云端收藏数据
export const mergeFavorites = async (uid) => {
  return syncData(uid, 'favorites', 'merge');
};

// 合并历史记录数据
export const mergeHistory = async (uid) => {
  return syncData(uid, 'history', 'merge');
};

/**
 * 同步器，处理用户登录后的初始化同步
 * @param {string} uid 用户ID
 */
export const initialSync = async (uid) => {
  try {
    logger.log('开始初始同步操作');

    // 触发同步开始事件
    triggerEvent(SyncEvents.SYNC_STARTED, { uid, timestamp: Date.now(), syncType: 'initial' });

    // 直接调用增量同步
    const result = await incrementalSyncWithSubcollections(uid);

    // 增量同步已经发送完成事件，这里不再重复发送。
    if (result.unchanged) {
      logger.log('初始同步：没有变化需要同步');

      return {
        success: true,
        favorites: result.favorites,
        history: result.history,
      };
    }

    logger.log(`初始同步${result.success ? '成功' : '失败'}`);
    return result;
  } catch (error) {
    logger.error('初始同步失败:', error);

    // 触发同步失败事件
    triggerEvent(SyncEvents.SYNC_FAILED, {
      uid,
      error: error.message || '未知错误',
      timestamp: Date.now(),
      syncType: 'initial',
    });

    return { success: false, error };
  }
};

/**
 * 登录时检查是否需要执行同步
 * @param {string} uid 用户ID
 * @returns {Promise<{shouldSync: boolean, reason: string, localChanges?: any, cloudLastUpdated?: number}>}
 */
export const shouldSyncOnLogin = async (uid) => {
  try {
    // 检查同步可用性
    const { canSync, error } = await checkSyncAvailability();
    if (!canSync) {
      logger.log('同步预检查: 同步条件不满足 -', error);
      return { shouldSync: false, reason: error };
    }

    // 获取上次同步时间
    const lastSyncTime = await getLastSyncTime(uid);

    // 获取本地变更数据
    const localChanges = await getLocalChangesSince(lastSyncTime, uid);
    const hasLocalChanges = localChanges.hasChanges;

    // 检查云端是否有更新
    const userRef = getUserDocRef(uid);
    const userDoc = await getDoc(userRef);

    // 如果用户文档不存在，需要创建
    if (!userDoc.exists()) {
      return { shouldSync: true, reason: '用户文档不存在，需要初始化' };
    }

    const userData = userDoc.data();
    const cloudLastUpdated = userData.lastUpdated || 0;
    const hasCloudChanges = cloudLastUpdated > lastSyncTime;

    // 如果本地和云端都没有变化，不需要同步
    if (!hasLocalChanges && !hasCloudChanges) {
      logger.log('同步预检查: 本地和云端数据均无变化，跳过同步');
      return { shouldSync: false, reason: '数据无变化' };
    }

    return {
      shouldSync: true,
      reason: hasLocalChanges ? '本地有数据变更' : '云端有数据变更',
      localChanges: localChanges,
      cloudLastUpdated: cloudLastUpdated,
    };
  } catch (error) {
    logger.error('同步预检查失败:', error);
    // 出错时保守处理，默认需要同步
    return { shouldSync: true, reason: '预检查失败，默认执行同步' };
  }
};

/**
 * 清除所有延迟同步定时器
 * @returns {boolean} 是否清除了定时器
 */
const clearSyncTimers = () => {
  let cleared = false;

  for (const type of SYNC_TYPES) {
    if (!syncTimers[type]) continue;
    clearTimeout(syncTimers[type]);
    syncTimers[type] = null;
    cleared = true;
  }

  return cleared;
};

const clearOfflineRetry = () => {
  if (!offlineRetryTimer) return;
  clearTimeout(offlineRetryTimer);
  offlineRetryTimer = null;
};

/**
 * 取消收藏/历史的延迟同步定时器（手动同步、回前台 flush 时调用）。
 *
 * 不触碰离线 retry timer：用户切后台/回前台不应消耗掉唯一一次离线兜底。
 * 离线兜底的完整清理只发生在 resetSyncScheduler（登出/切账号）或
 * requestSync 真正恢复在线时。
 *
 * @returns {boolean} 是否取消了延迟同步
 */
export const cancelDelayedSync = () => clearSyncTimers();

/**
 * 重置同步调度器（登出、切换账号时调用）
 *
 * 清空全部待触发状态：延迟 timer、离线 retry timer、offlineRetryUsed，
 * 以及补跑请求，避免旧 UID 的同步结束后又为新账号补跑一轮。
 *
 * @returns {boolean} 是否取消了延迟同步
 */
export const resetSyncScheduler = () => {
  const cleared = cancelDelayedSync();
  clearOfflineRetry();
  offlineRetryUsed = false;
  queuedRerun = false;
  queuedRerunUid = null;
  if (queuedRerunWaiters.length > 0) {
    const waiters = queuedRerunWaiters;
    queuedRerunWaiters = [];
    waiters.forEach((resolve) =>
      resolve({ success: false, error: '账号已切换，排队中的同步请求已取消' })
    );
  }
  return cleared;
};

/**
 * 离线时安排一次兜底重试，之后不再继续排队
 * 正常恢复依赖 networkStatusChange 事件，这里只是事件丢失时的保险。
 */
const scheduleOfflineRetry = (uid) => {
  if (offlineRetryTimer || offlineRetryUsed) return;

  offlineRetryUsed = true;
  offlineRetryTimer = setTimeout(() => {
    offlineRetryTimer = null;
    void requestSync(uid, 'offline-retry');
  }, OFFLINE_RETRY_DELAY);
};

const clearSyncWatchdog = () => {
  if (!syncWatchdogTimer) return;
  clearTimeout(syncWatchdogTimer);
  syncWatchdogTimer = null;
};

const startSyncWatchdog = (uid) => {
  clearSyncWatchdog();
  syncWatchdogTimer = setTimeout(() => {
    logger.warn(
      `同步已运行超过 ${SYNC_WATCHDOG_DELAY / 1000} 秒仍未结束 (uid: ${uid})，` +
        '继续等待 Firestore 返回，不会强制中断。'
    );
  }, SYNC_WATCHDOG_DELAY);
};

/**
 * 统一的同步入口
 *
 * 收藏 timer、历史 timer、回前台、网络恢复、手动同步都走这里，保证任何时刻
 * 最多只有一轮同步在执行，外加一轮补跑。
 *
 * 定时器在同步「开始」时清除而不是结束时清除：同步期间产生的新变化会各自
 * 重新创建定时器，因此必然被下一轮带走，不会因为并发时序而被漏掉。
 *
 * @param {string} uid 用户ID
 * @param {string} reason 触发原因，仅用于日志
 * @returns {Promise<{success: boolean, error?: any, unchanged?: boolean}>}
 */
export const requestSync = async (uid, reason = 'unknown') => {
  if (!uid) return { success: false, error: '用户未登录' };

  // 立即同步视为把当前所有 delayed batch 提前 flush
  clearSyncTimers();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const error = '网络离线，暂不同步';

    triggerEvent(SyncEvents.SYNC_SKIPPED, {
      uid,
      timestamp: Date.now(),
      syncType: 'delayed',
      reason: error,
    });

    scheduleOfflineRetry(uid);
    return { success: false, error };
  }

  clearOfflineRetry();
  offlineRetryUsed = false;

  if (syncInFlight) {
    // 同一账号的请求继续复用当前 Promise；账号切换必须等旧账号完成后
    // 重新开始，并且不能把旧账号的结果返回给新账号的调用方。
    if (syncInFlightUid === uid) return syncInFlight;

    if (queuedRerunUid !== uid) {
      if (queuedRerunWaiters.length > 0) {
        const staleWaiters = queuedRerunWaiters;
        queuedRerunWaiters = [];
        staleWaiters.forEach((resolve) =>
          resolve({ success: false, error: '账号已切换，排队中的同步请求已取消' })
        );
      }
      queuedRerunUid = uid;
    }
    queuedRerun = true;
    return new Promise((resolve) => queuedRerunWaiters.push(resolve));
  }

  logger.log(`请求同步 (${reason})`);
  startSyncWatchdog(uid);

  syncInFlight = (async () => {
    try {
      // pending 清理统一在 incrementalSync 的成功出口完成
      return await incrementalSync(uid);
    } finally {
      clearSyncWatchdog();
      syncInFlight = null;
      syncInFlightUid = null;

      if (queuedRerun) {
        const nextUid = queuedRerunUid;
        const waiters = queuedRerunWaiters;
        queuedRerun = false;
        queuedRerunUid = null;
        queuedRerunWaiters = [];
        if (nextUid) {
          void requestSync(nextUid, 'queued').then((result) => {
            waiters.forEach((resolve) => resolve(result));
          });
        } else {
          waiters.forEach((resolve) =>
            resolve({ success: false, error: '排队中的同步请求已取消' })
          );
        }
      }
    }
  })();
  syncInFlightUid = uid;

  return syncInFlight;
};

/**
 * 立即同步：先取消待触发的延迟同步，再走统一入口
 * 用于手动同步、回前台、网络恢复。
 */
export const triggerImmediateSync = (uid, reason = 'manual') => {
  cancelDelayedSync();
  return requestSync(uid, reason);
};

/**
 * 触发延迟同步
 *
 * favorites 使用 trailing debounce：每次变化都重置 5 秒窗口，取最后一次操作。
 * history 使用 batch window：首个变化启动 15 秒窗口，后续变化不重置，
 * 否则连续播放时定时器会被无限推后，反而几小时都不上传。
 *
 * @param {string} uid 用户ID
 * @param {'favorites'|'history'} type 变更类型
 */
export const triggerDelayedSync = async (uid, type = 'favorites') => {
  if (!uid) return;

  if (!SYNC_DELAYS[type]) {
    logger.warn(`未知的延迟同步类型: ${type}，已按 favorites 处理`);
    type = 'favorites';
  }

  if (type === 'favorites' && syncTimers.favorites) {
    clearTimeout(syncTimers.favorites);
    syncTimers.favorites = null;
  }

  if (syncTimers[type]) return;

  syncTimers[type] = setTimeout(() => {
    syncTimers[type] = null;
    void requestSync(uid, `delayed:${type}`);
  }, SYNC_DELAYS[type]);
};

/**
 * 从子集合获取云端收藏数据
 * @param {string} uid 用户ID
 * @param {number} lastSyncTime 上次同步时间
 * @returns {Promise<Array>} 收藏数据数组
 */
const getCloudFavoritesFromSubcollection = async (uid, lastSyncTime = 0) => {
  try {
    const favoritesRef = getFavoritesCollectionRef(uid);
    let favoritesQuery;

    if (lastSyncTime > 0) {
      // 只获取上次同步后更新的数据
      favoritesQuery = query(favoritesRef, where('modifiedAt', '>', lastSyncTime));
    } else {
      // 获取所有数据
      favoritesQuery = favoritesRef;
    }

    const snapshot = await getDocs(favoritesQuery);
    const favorites = [];

    snapshot.forEach((doc) => {
      favorites.push({
        ...doc.data(),
        docId: doc.id, // 保存文档ID用于后续操作
      });
    });

    logger.log(`从云端获取到${favorites.length}条收藏数据`);
    return favorites;
  } catch (error) {
    logger.error('从子集合获取收藏数据失败:', error);
    throw error;
  }
};

/**
 * 从子集合获取云端历史记录数据
 * @param {string} uid 用户ID
 * @param {number} lastSyncTime 上次同步时间
 * @param {number} maxItems 最大记录数
 * @returns {Promise<Array>} 历史记录数据数组
 */
const getCloudHistoryFromSubcollection = async (
  uid,
  lastSyncTime = 0,
  maxItems = MAX_HISTORY_ITEMS
) => {
  try {
    const historyRef = getHistoryCollectionRef(uid);
    let historyQuery;

    if (lastSyncTime > 0) {
      // 只获取上次同步后更新的数据
      historyQuery = query(
        historyRef,
        where('timestamp', '>', lastSyncTime),
        orderBy('timestamp', 'desc'),
        limit(maxItems)
      );
    } else {
      // 获取所有数据，但限制数量
      historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(maxItems));
    }

    const snapshot = await getDocs(historyQuery);
    const history = [];

    snapshot.forEach((doc) => {
      history.push({
        ...doc.data(),
        docId: doc.id, // 保存文档ID用于后续操作
      });
    });

    logger.log(`从云端获取到${history.length}条历史记录数据`);
    return history;
  } catch (error) {
    logger.error('从子集合获取历史记录数据失败:', error);
    throw error;
  }
};

/**
 * 将本地收藏数据保存到云端子集合
 * @param {string} uid 用户ID
 * @param {Array} favorites 收藏数据数组
 * @returns {Promise<{success: boolean, error?: Error}>} 保存结果
 */
const saveCloudFavoritesToSubcollection = async (uid, favorites) => {
  try {
    const favoritesRef = getFavoritesCollectionRef(uid);
    const now = Date.now();
    let modifiedCount = 0;

    for (const item of favorites) {
      const itemDocRef = doc(favoritesRef, getTrackDocumentId(item));
      const itemData = {
        ...toCloudTrack(item),
        modifiedAt: item.modifiedAt || now,
      };
      if (item.deletedAt) itemData.deletedAt = item.deletedAt;

      const written = await runTransaction(db, async (transaction) => {
        const remoteSnapshot = await transaction.get(itemDocRef);
        const remoteData = remoteSnapshot.exists() ? remoteSnapshot.data() : null;
        const remoteModifiedAt = remoteData?.modifiedAt || 0;
        const shouldWrite =
          !remoteData ||
          itemData.modifiedAt > remoteModifiedAt ||
          (itemData.modifiedAt === remoteModifiedAt &&
            Boolean(itemData.deletedAt) &&
            !remoteData.deletedAt);
        if (!shouldWrite) {
          return {
            written: false,
            conflict:
              remoteModifiedAt > itemData.modifiedAt ||
              Boolean(remoteData.deletedAt) !== Boolean(itemData.deletedAt),
          };
        }
        transaction.set(itemDocRef, itemData);
        return { written: true, conflict: false };
      });
      if (written.conflict) throw new Error('云端收藏在同步期间已更新，请重试同步');
      if (written.written) modifiedCount++;
    }

    // 更新用户文档的lastUpdated字段
    const userRef = getUserDocRef(uid);
    await touchCloudUser(userRef, now);

    logger.log(`成功保存${modifiedCount}条收藏数据到云端子集合`);
    return { success: true };
  } catch (error) {
    logger.error('保存收藏数据到子集合失败:', error);
    throw error;
  }
};

// 云端历史裁剪阈值：只有总数溢出到缓冲区之后才裁剪。
// 保留 MAX_HISTORY_ITEMS 条，缓冲区用于吸收并发写入，避免频繁触发裁剪。
const HISTORY_PRUNE_BUFFER = 20;
const HISTORY_PRUNE_THRESHOLD = MAX_HISTORY_ITEMS + HISTORY_PRUNE_BUFFER;

// 一次性遗留清理标记前缀：旧客户端用不稳定 docId（如 `5_1`）写过历史，
// 升级后需要清理一次。键按迁移版本命名，将来若需 v2 清理用新前缀即可。
const HISTORY_LEGACY_CLEANUP_KEY = 'history_legacy_cleanup_v1_';

/**
 * 一次性历史遗留清理
 *
 * 旧客户端写历史时使用过非稳定的 docId，会与现在的稳定 docId
 * （encodeURIComponent(`${source}:${id}`)）并存，产生同一歌曲的重复记录。
 * 重复项若不清除，新设备首次全量拉取（limit 100）时可能只取到大量重复，
 * 把最旧的一批唯一歌曲挤出结果。
 *
 * 迁移每个设备、每个 uid 只运行一次，且必须保证最终留下的文档落在
 * canonical 稳定 docId 上——仅“保留最新 docId”不够：若最新数据在旧 docId
 * 上（旧客户端后来写入），直接保留它会让新客户端再次写出 canonical，
 * 云端又重新出现一对重复。
 *
 * 不设置 count 捷径：数量在上限内就跳过扫描，会把遗留重复永久留在云端，
 * 之后再无法靠日常 prune（只按数量裁剪）去重。
 * 清理失败不标记完成，下次同步自动重试，且绝不影响正常同步结果。
 *
 * @param {string} uid 用户ID
 * @returns {Promise<boolean>} 是否已处于完成状态
 */
export const ensureHistoryLegacyCleanup = async (uid) => {
  if (!uid) return true;

  const flagKey = `${HISTORY_LEGACY_CLEANUP_KEY}${uid}`;

  try {
    if (localStorage.getItem(flagKey)) return true;

    const historyRef = getHistoryCollectionRef(uid);
    const snapshot = await getDocs(query(historyRef, orderBy('timestamp', 'desc')));

    // 第一遍：desc 顺序下每组首个即最新，最多保留 MAX_HISTORY_ITEMS 个
    // 不同 trackKey（超出容量的整组丢弃，等价旧 prune 的容量裁剪）。
    const docs = [];
    const retainedByKey = new Map(); // trackKey -> { id, item }

    snapshot.forEach((historyDoc) => {
      const item = historyDoc.data();
      const trackKey = item.song ? getTrackKey(item.song) : null;
      docs.push({ id: historyDoc.id, item, trackKey });
    });

    for (const doc of docs) {
      if (!doc.trackKey || retainedByKey.has(doc.trackKey)) continue;
      if (retainedByKey.size >= MAX_HISTORY_ITEMS) continue;
      retainedByKey.set(doc.trackKey, { id: doc.id, item: doc.item });
    }

    // 第二遍：canonicalize。组内 canonical doc 保留（必要时被最新数据覆盖），
    // 其余一律删除；若组内最新数据落在非 canonical docId 上，先把它迁写到
    // canonical docId 再删除，保证迁移后同一首歌只存在稳定的那一个文档。
    const documentsToDelete = new Set();
    const canonicalWrites = new Map(); // canonicalId -> 最新 item

    for (const doc of docs) {
      if (!doc.trackKey) {
        documentsToDelete.add(doc.id);
        continue;
      }
      const rep = retainedByKey.get(doc.trackKey);
      if (!rep) {
        documentsToDelete.add(doc.id); // 超出容量保留范围的整组
        continue;
      }
      const canonicalId = getTrackDocumentId(rep.item.song);
      if (doc.id === canonicalId) continue;
      if (doc.id === rep.id) canonicalWrites.set(canonicalId, rep.item);
      documentsToDelete.add(doc.id);
    }

    // 先迁写 canonical（带 CAS，避免覆盖清理期间的新写入），再批量删除
    for (const [canonicalId, item] of canonicalWrites) {
      documentsToDelete.delete(canonicalId);
      await writeCanonicalHistoryDoc(historyRef, canonicalId, item);
    }

    const deleteList = [...documentsToDelete];
    for (let i = 0; i < deleteList.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const documentId of deleteList.slice(i, i + BATCH_SIZE)) {
        batch.delete(doc(historyRef, documentId));
      }
      await batch.commit();
    }

    markLegacyCleanupDone(uid, flagKey);
    logger.log(
      `历史遗留记录清理完成: uid=${uid}，删除 ${deleteList.length} 条，` +
        `迁写 canonical ${canonicalWrites.size} 条`
    );
    return true;
  } catch (error) {
    logger.warn('历史遗留记录清理失败，将在下次同步重试:', error);
    return false;
  }
};

/**
 * 把历史记录写入 canonical docId，带时间戳 CAS，避免覆盖清理期间的并发写入
 * @param {CollectionReference} historyRef 历史子集合引用
 * @param {string} documentId canonical docId
 * @param {{ timestamp: number, song: Object }} item 历史记录数据
 */
const writeCanonicalHistoryDoc = async (historyRef, documentId, item) => {
  const itemDocRef = doc(historyRef, documentId);
  const itemData = {
    timestamp: item.timestamp,
    song: toCloudTrack(item.song),
  };

  const written = await runTransaction(db, async (transaction) => {
    const remoteSnapshot = await transaction.get(itemDocRef);
    const remoteData = remoteSnapshot.exists() ? remoteSnapshot.data() : null;
    if (remoteData && remoteData.timestamp >= itemData.timestamp) {
      return { written: false };
    }
    transaction.set(itemDocRef, itemData);
    return { written: true };
  });

  if (!written.written) {
    logger.log(`canonical 文档已存在更新的数据，跳过迁写: ${documentId}`);
  }
};

const markLegacyCleanupDone = (uid, flagKey) => {
  try {
    localStorage.setItem(flagKey, 'done');
  } catch (error) {
    // 隐私模式下 localStorage 可能不可用：本次会话内每次同步会重新尝试，
    // 全量扫描的成本只在标记真正写入前发生。
    logger.warn(`写入历史遗留清理标记失败 (uid: ${uid}):`, error);
  }
};

/**
 * 日常裁剪云端历史记录
 *
 * 只处理容量溢出，不再承担去重职责（去重由 ensureHistoryLegacyCleanup
 * 一次性完成）。只在总数超过 HISTORY_PRUNE_THRESHOLD 时才读取并删除最旧的
 * 溢出部分，避免每轮历史同步都把整个 history 子集合读一遍。
 * 裁剪失败只记录日志，不能把已经成功的历史同步判成失败。
 *
 * @param {CollectionReference} historyRef 历史子集合引用
 * @returns {Promise<number>} 删除的文档数
 */
const pruneCloudHistory = async (historyRef) => {
  try {
    const totalSnapshot = await getCountFromServer(historyRef);
    const total = totalSnapshot.data().count;

    if (total <= HISTORY_PRUNE_THRESHOLD) return 0;

    const overflow = total - MAX_HISTORY_ITEMS;
    const oldestSnapshot = await getDocs(
      query(historyRef, orderBy('timestamp', 'asc'), limit(overflow))
    );

    const documentIds = [];
    oldestSnapshot.forEach((historyDoc) => documentIds.push(historyDoc.id));

    for (let i = 0; i < documentIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const documentId of documentIds.slice(i, i + BATCH_SIZE)) {
        batch.delete(doc(historyRef, documentId));
      }
      await batch.commit();
    }

    logger.log(`云端历史记录已裁剪 ${documentIds.length} 条，保留 ${MAX_HISTORY_ITEMS} 条`);
    return documentIds.length;
  } catch (error) {
    logger.warn('裁剪云端历史记录失败，不影响本次同步结果:', error);
    return 0;
  }
};

/**
 * 将本地历史记录保存到云端子集合
 * @param {string} uid 用户ID
 * @param {Array} history 历史记录数据数组
 * @returns {Promise<{success: boolean, error?: Error}>} 保存结果
 */
const saveCloudHistoryToSubcollection = async (uid, history) => {
  try {
    const historyRef = getHistoryCollectionRef(uid);
    const now = Date.now();
    let modifiedCount = 0;

    for (const item of history) {
      const itemDocRef = doc(historyRef, getTrackDocumentId(item.song));
      const itemData = {
        timestamp: item.timestamp,
        song: toCloudTrack(item.song),
      };
      const written = await runTransaction(db, async (transaction) => {
        const remoteSnapshot = await transaction.get(itemDocRef);
        const remoteData = remoteSnapshot.exists() ? remoteSnapshot.data() : null;
        if (remoteData && remoteData.timestamp >= itemData.timestamp) {
          return {
            written: false,
            conflict: remoteData.timestamp > itemData.timestamp,
          };
        }
        transaction.set(itemDocRef, itemData);
        return { written: true, conflict: false };
      });
      if (written.conflict) throw new Error('云端历史在同步期间已更新，请重试同步');
      if (written.written) modifiedCount++;
    }

    // 只有本轮确实写入了历史才做容量维护，避免无谓的 Firestore 读取
    if (modifiedCount > 0) {
      await pruneCloudHistory(historyRef);
    }

    // 更新用户文档的lastUpdated字段
    const userRef = getUserDocRef(uid);
    await touchCloudUser(userRef, now);

    logger.log(`成功保存${modifiedCount}条历史记录到云端子集合`);
    return { success: true };
  } catch (error) {
    logger.error('保存历史记录到子集合失败:', error);
    throw error;
  }
};

/**
 * 清除同步时间戳
 * @param {string} uid 用户ID，如果未提供则清除所有用户的同步时间戳
 * @returns {Promise<boolean>} 操作是否成功
 */
export const clearSyncTimestamp = async (uid) => {
  try {
    if (uid) {
      // 清除特定用户的同步时间戳
      const key = `${SYNC_TIMESTAMP_KEY}_${uid}`;
      localStorage.removeItem(key);
    } else {
      // 清除所有同步时间戳
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SYNC_TIMESTAMP_KEY)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    }
    logger.log(`同步时间戳已清除${uid ? '(用户ID: ' + uid + ')' : '(所有用户)'}`);
    return true;
  } catch (error) {
    logger.error('清除同步时间戳失败:', error);
    return false;
  }
};

// 导出其他辅助函数以供外部使用
export {
  getLastSyncTime,
  getLocalChangesSince,
  triggerEvent, // 导出触发事件函数，以便外部代码可以触发事件
  incrementalSyncWithSubcollections as incrementalSync, // 导出子集合同步作为默认同步函数
};

import { db, isFirebaseAvailable, checkFirebaseAvailability } from './firebase';
import { 
  doc, updateDoc, getDoc, setDoc, collection, 
  query, where, getDocs, writeBatch, orderBy, limit
} from 'firebase/firestore';
import { getFavorites, saveFavorites, getHistory, saveHistory, MAX_HISTORY_ITEMS, getNetworkStatus, getPendingSyncChanges, resetPendingChanges } from './storage';
import logger from '../utils/logger.js';

// 同步时间戳存储键
const SYNC_TIMESTAMP_KEY = 'last_sync_timestamp';
// 延迟同步定时器
let delayedSyncTimer = null;
// 延迟同步配置
const DELAYED_SYNC_CONFIG = {
  delayTime: 30000, // 30秒
  historyThreshold: 5 // 历史记录变更阈值
};
// 批量操作限制
const BATCH_SIZE = 100; // Firestore每批次最多500个操作，我们保守使用100

// 定义子集合名称
const FAVORITES_COLLECTION = 'favorites';
const HISTORY_COLLECTION = 'history';

// 定义事件类型
export const SyncEvents = {
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',
  SYNC_PROGRESS: 'sync_progress'
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
  listeners[event] = listeners[event].filter(cb => cb !== callback);
};

/**
 * 触发同步事件
 * @param {string} event 事件类型
 * @param {Object} data 事件数据
 */
const triggerEvent = (event, data) => {
  if (!listeners[event]) return;
  listeners[event].forEach(callback => {
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
  }
};

/**
 * 获取收藏子集合引用
 * @param {string} uid 用户ID
 * @returns {CollectionReference} 收藏子集合引用
 */
const getFavoritesCollectionRef = (uid) => {
  return collection(db, "users", uid, FAVORITES_COLLECTION);
};

/**
 * 获取历史记录子集合引用
 * @param {string} uid 用户ID
 * @returns {CollectionReference} 历史记录子集合引用
 */
const getHistoryCollectionRef = (uid) => {
  return collection(db, "users", uid, HISTORY_COLLECTION);
};

/**
 * 获取用户文档引用
 * @param {string} uid 用户ID
 * @returns {DocumentReference} 用户文档引用
 */
const getUserDocRef = (uid) => {
  return doc(db, "users", uid);
};

/**
 * 获取自上次同步后本地变更的数据
 * @param {number} lastSyncTime 上次同步时间戳
 * @returns {Promise<{favorites: Array, history: Array}>} 本地变更数据
 */
const getLocalChangesSince = async (lastSyncTime) => {
  try {
    // 获取所有本地数据
    const allFavorites = await getFavorites();
    const allHistory = await getHistory();
    
    // 筛选出变更的数据
    // 注意：由于当前数据结构可能没有修改时间戳，我们添加一个检测逻辑
    const changedFavorites = allFavorites.filter(item => {
      // 如果项目有modifiedAt字段，使用它判断
      if (item.modifiedAt != null) {
        return item.modifiedAt > lastSyncTime;
      }
      // 没有modifiedAt时，仅在首次同步时作为变更处理
      return lastSyncTime === 0;
    });
    
    const changedHistory = allHistory.filter(item => {
      // 历史记录通常有timestamp字段
      return item.timestamp > lastSyncTime;
    });
    
    return {
      favorites: changedFavorites,
      history: changedHistory,
      hasChanges: changedFavorites.length > 0 || changedHistory.length > 0
    };
  } catch (error) {
    logger.error('获取本地变更数据失败:', error);
    return { favorites: [], history: [], hasChanges: false };
  }
};

/**
 * 检查是否可以执行同步操作
 * @returns {Promise<{canSync: boolean, error: string|null}>}
 */
const checkSyncAvailability = async () => {
  // 检查Firebase是否可用
  if (!isFirebaseAvailable) {
    logger.warn("同步检测: Firebase初始化不可用");
    return { canSync: false, error: '当前处于离线模式，无法同步数据' };
  }
  
  // 进一步检查Firebase连接
  const firebaseAvailable = await checkFirebaseAvailability();
  if (!firebaseAvailable) {
    logger.warn("同步检测: Firebase连接测试失败");
    return { canSync: false, error: 'Firebase服务连接失败，无法同步数据' };
  }
  
  // 检查网络连接状态
  const networkStatus = await getNetworkStatus();
  if (!networkStatus.online) {
    logger.warn("同步检测: 网络连接不可用");
    return { canSync: false, error: '网络连接已断开，无法同步数据' };
  }
  
  return { canSync: true, error: null };
};

/**
 * 增量同步函数 - 使用子集合架构
 * @param {string} uid 用户ID
 * @returns {Promise<{success: boolean, data?: any, error?: any, unchanged?: boolean}>}
 */
const incrementalSyncWithSubcollections = async (uid) => {
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
        timestamp: Date.now() 
      });
      
      return { success: false, error: '用户未登录' };
    }
    
    // 获取上次同步时间
    const lastSyncTime = await getLastSyncTime(uid);
    const now = Date.now();
    logger.log(`上次同步时间: ${new Date(lastSyncTime).toLocaleString()}`);
    
    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, { 
      uid, 
      phase: 'check_changes',
      message: '检查数据变更...',
      timestamp: Date.now() 
    });
    
    // 获取本地变更数据
    const localChanges = await getLocalChangesSince(lastSyncTime);
    logger.log(`本地变更: 收藏=${localChanges.favorites.length}条, 历史=${localChanges.history.length}条`);
    
    // 获取用户文档
    const userRef = getUserDocRef(uid);
    const userDoc = await getDoc(userRef);
    
    // 如果用户文档不存在，创建一个基本文档
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        lastUpdated: now,
        createdAt: now
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
      
      // 触发同步完成事件
      triggerEvent(SyncEvents.SYNC_COMPLETED, { 
        uid, 
        timestamp: now,
        syncType: 'incremental',
        result: { success: true, unchanged: true }
      });
      
      return { success: true, unchanged: true, timestamp: now };
    }
    
    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, { 
      uid, 
      phase: 'cloud_favorites',
      message: '获取云端收藏数据...',
      timestamp: Date.now() 
    });
    
    // 获取云端收藏数据变更
    const cloudFavorites = await getCloudFavoritesFromSubcollection(uid, lastSyncTime);
    
    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, { 
      uid, 
      phase: 'cloud_history',
      message: '获取云端历史记录...',
      timestamp: Date.now() 
    });
    
    // 获取云端历史记录变更
    const cloudHistory = await getCloudHistoryFromSubcollection(uid, lastSyncTime);
    
    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, { 
      uid, 
      phase: 'merge_data',
      message: '合并数据...',
      timestamp: Date.now() 
    });
    
    // 同步收藏数据 - 本地到云端
    if (localChanges.favorites.length > 0) {
      logger.log(`同步${localChanges.favorites.length}条本地收藏到云端...`);
      await saveCloudFavoritesToSubcollection(uid, localChanges.favorites);
    }
    
    // 同步历史记录 - 本地到云端
    if (localChanges.history.length > 0) {
      logger.log(`同步${localChanges.history.length}条本地历史记录到云端...`);
      await saveCloudHistoryToSubcollection(uid, localChanges.history);
    }
    
    // 触发同步进度事件
    triggerEvent(SyncEvents.SYNC_PROGRESS, { 
      uid, 
      phase: 'update_local',
      message: '更新本地数据...',
      timestamp: Date.now() 
    });
    
    // 如果有云端数据变更，更新本地数据
    let localDataUpdated = false;
    
    // 处理云端收藏变更
    if (cloudFavorites.length > 0) {
      // 获取所有本地收藏
      const allLocalFavorites = await getFavorites();
      const favoritesMap = new Map();
      
      // 添加所有本地收藏到Map
      allLocalFavorites.forEach(item => {
        favoritesMap.set(item.id, item);
      });
      
      // 更新/添加云端变更的收藏
      cloudFavorites.forEach(item => {
        // 确保docId不存储到本地
        const itemData = { ...item };
        delete itemData.docId;
        
        const existingItem = favoritesMap.get(item.id);
        
        // 如果本地没有该项，或者云端项更新，则使用云端项
        if (!existingItem || (item.modifiedAt && (!existingItem.modifiedAt || 
            item.modifiedAt > existingItem.modifiedAt))) {
          favoritesMap.set(item.id, itemData);
          localDataUpdated = true;
        }
      });
      
      // 转换回数组并保存
      if (localDataUpdated) {
        const mergedFavorites = Array.from(favoritesMap.values());
        await saveFavorites(mergedFavorites);
        logger.log(`已更新本地收藏数据，总数: ${mergedFavorites.length}条`);
      }
    }
    
    // 处理云端历史记录变更
    if (cloudHistory.length > 0) {
      // 获取所有本地历史记录
      const allLocalHistory = await getHistory();
      const historyMap = new Map();
      
      // 添加所有本地历史记录到Map，键为歌曲ID
      allLocalHistory.forEach(item => {
        if (item.song && item.song.id) {
          historyMap.set(item.song.id, item);
        }
      });
      
      // 更新/添加云端变更的历史记录
      cloudHistory.forEach(item => {
        // 确保docId不存储到本地
        const itemData = { ...item };
        delete itemData.docId;
        
        if (item.song && item.song.id) {
          const existingItem = historyMap.get(item.song.id);
          
          // 如果本地没有该项，或者云端项更新，则使用云端项
          if (!existingItem || item.timestamp > existingItem.timestamp) {
            historyMap.set(item.song.id, itemData);
            localDataUpdated = true;
          }
        }
      });
      
      // 转换回数组，按时间戳排序，并保存
      if (localDataUpdated) {
        const mergedHistory = Array.from(historyMap.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_HISTORY_ITEMS); // 限制数量
        
        await saveHistory(mergedHistory);
        logger.log(`已更新本地历史记录，总数: ${mergedHistory.length}条`);
      }
    }
    
    // 更新同步时间戳
    await saveLastSyncTime(uid, now);
    logger.log(`同步完成，新的同步时间: ${new Date(now).toLocaleString()}`);
    
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
        localHistory: localChanges.history.length
      }
    });
    
    return { 
      success: true, 
      cloudFavorites: cloudFavorites.length,
      cloudHistory: cloudHistory.length,
      localFavorites: localChanges.favorites.length,
      localHistory: localChanges.history.length
    };
  } catch (error) {
    logger.error('子集合增量同步失败:', error);
    
    // 触发同步失败事件
    triggerEvent(SyncEvents.SYNC_FAILED, { 
      uid, 
      error: error.message || '未知错误',
      timestamp: Date.now(),
      syncType: 'incremental'
    });
    
    return { success: false, error };
  }
};

/**
 * 合并收藏数据
 * @param {Array} cloudData 云端数据
 * @param {Array} localData 本地数据
 * @returns {Array} 合并后的数据
 */
// eslint-disable-next-line no-unused-vars
const mergeFavoritesData = (cloudData, localData) => {
  // 使用Map存储最终结果，键为歌曲ID
  const resultMap = new Map();
  
  // 添加所有云端数据
  cloudData.forEach(item => {
    resultMap.set(item.id, {
      ...item,
      modifiedAt: item.modifiedAt || Date.now() // 确保有修改时间
    });
  });
  
  // 添加本地数据，可能覆盖云端数据
  localData.forEach(item => {
    const existingItem = resultMap.get(item.id);
    
    // 如果本地项目更新，或者不存在于云端，则使用本地项目
    if (!existingItem || !existingItem.modifiedAt || 
        (item.modifiedAt && item.modifiedAt >= existingItem.modifiedAt)) {
      resultMap.set(item.id, {
        ...item,
        modifiedAt: item.modifiedAt || Date.now() // 确保有修改时间
      });
    }
  });
  
  return Array.from(resultMap.values());
};

/**
 * 合并历史记录
 * @param {Array} cloudData 云端数据
 * @param {Array} localData 本地数据
 * @returns {Array} 合并后的数据
 */
// eslint-disable-next-line no-unused-vars
const mergeHistoryData = (cloudData, localData) => {
  // 使用Map存储最终结果，键为歌曲ID
  const historyMap = new Map();
  
  // 添加云端历史记录
  cloudData.forEach(item => {
    if (item.song && item.song.id) {
      historyMap.set(item.song.id, item);
    }
  });
  
  // 添加本地历史记录，如果相同歌曲则保留最新的时间戳
  localData.forEach(item => {
    if (item.song && item.song.id) {
      const existingItem = historyMap.get(item.song.id);
      if (!existingItem || item.timestamp > existingItem.timestamp) {
        historyMap.set(item.song.id, item);
      }
    }
  });
  
  // 转换回数组并按时间戳排序（最新的在前）
  return Array.from(historyMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY_ITEMS); // 限制为最大数量
};

/**
 * 增量同步函数
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
    logger.log("开始初始同步操作");
    
    // 触发同步开始事件
    triggerEvent(SyncEvents.SYNC_STARTED, { uid, timestamp: Date.now(), syncType: 'initial' });
    
    // 直接调用增量同步
    const result = await incrementalSyncWithSubcollections(uid);
    
    // 如果没有变化，也算成功
    if (result.unchanged) {
      logger.log("初始同步：没有变化需要同步");
      
      // 触发同步完成事件（虽然incrementalSync中已触发，但这里再次触发，带上更多上下文）
      triggerEvent(SyncEvents.SYNC_COMPLETED, { 
        uid, 
        timestamp: Date.now(),
        syncType: 'initial',
        result: { success: true, unchanged: true }
      });
      
      return { 
        success: true,
        favorites: result.favorites,
        history: result.history
      };
    }
    
    logger.log(`初始同步${result.success ? '成功' : '失败'}`);
    return result;
  } catch (error) {
    logger.error("初始同步失败:", error);
    
    // 触发同步失败事件
    triggerEvent(SyncEvents.SYNC_FAILED, { 
      uid, 
      error: error.message || '未知错误',
      timestamp: Date.now(),
      syncType: 'initial'
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
    const localChanges = await getLocalChangesSince(lastSyncTime);
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
      cloudLastUpdated: cloudLastUpdated
    };
  } catch (error) {
    logger.error('同步预检查失败:', error);
    // 出错时保守处理，默认需要同步
    return { shouldSync: true, reason: '预检查失败，默认执行同步' };
  }
};

/**
 * 触发延迟同步
 * 当收藏或历史记录变更时调用此函数
 * @param {string} uid 用户ID
 * @param {string} type 变更类型 'favorites' | 'history'
 * @returns {Promise<void>}
 */
export const triggerDelayedSync = async (uid) => {
  // 如果已经有一个延迟同步定时器，取消它
  if (delayedSyncTimer) {
    clearTimeout(delayedSyncTimer);
  }
  
  logger.log('设置延迟同步定时器...');
  
  // 设置新的延迟同步定时器
  delayedSyncTimer = setTimeout(async () => {
    try {
      // 检查同步可用性
      const { canSync, error } = await checkSyncAvailability();
      if (!canSync) {
        logger.warn(`延迟同步取消: ${error}`);
        
        // 触发同步失败事件
        triggerEvent(SyncEvents.SYNC_FAILED, { 
          uid, 
          error: error,
          timestamp: Date.now(),
          syncType: 'delayed'
        });
        
        return;
      }
      
      // 获取变更计数
      const changes = await getPendingSyncChanges();
      logger.log('延迟同步检查变更:', changes);
      
      // 检查是否有足够的变更触发同步
      const shouldSync = 
        changes.favorites > 0 || 
        changes.history >= DELAYED_SYNC_CONFIG.historyThreshold;
      
      if (shouldSync) {
        logger.log('延迟同步开始执行...');
        
        // 触发同步开始事件
        triggerEvent(SyncEvents.SYNC_STARTED, { 
          uid, 
          timestamp: Date.now(),
          syncType: 'delayed',
          trigger: {
            favorites: changes.favorites,
            history: changes.history
          }
        });
        
        // 执行增量同步
        const result = await incrementalSync(uid);
        
        if (result.success) {
          logger.log('延迟同步成功');
          // 重置变更计数
          await resetPendingChanges();
          
          // 触发同步完成事件（即使是跳过的同步也显示为成功）
          triggerEvent(SyncEvents.SYNC_COMPLETED, { 
            uid, 
            timestamp: Date.now(),
            syncType: 'delayed',
            result: { 
              success: true,
              unchanged: result.unchanged || false  // 传递unchanged标志
            }
          });
        } else {
          logger.warn('延迟同步失败:', result.error);
          
          // 触发同步失败事件
          triggerEvent(SyncEvents.SYNC_FAILED, { 
            uid, 
            error: result.error,
            timestamp: Date.now(),
            syncType: 'delayed'
          });
        }
      } else {
        logger.log('变更不足，跳过延迟同步');
        
        // 即使跳过同步，也触发一个"同步成功"事件，类似于无变化的情况
        const currentTime = Date.now();
        triggerEvent(SyncEvents.SYNC_COMPLETED, { 
          uid, 
          timestamp: currentTime,
          syncType: 'delayed',
          result: { 
            success: true, 
            unchanged: true,
            reason: '变更不足，跳过同步'
          }
        });
      }
    } catch (error) {
      logger.error('延迟同步失败:', error);
      
      // 触发同步失败事件
      triggerEvent(SyncEvents.SYNC_FAILED, { 
        uid, 
        error: error.message || '未知错误',
        timestamp: Date.now(),
        syncType: 'delayed'
      });
    } finally {
      // 清除定时器引用
      delayedSyncTimer = null;
    }
  }, DELAYED_SYNC_CONFIG.delayTime);
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
      favoritesQuery = query(
        favoritesRef,
        where('modifiedAt', '>', lastSyncTime)
      );
    } else {
      // 获取所有数据
      favoritesQuery = favoritesRef;
    }
    
    const snapshot = await getDocs(favoritesQuery);
    const favorites = [];
    
    snapshot.forEach(doc => {
      favorites.push({
        ...doc.data(),
        docId: doc.id // 保存文档ID用于后续操作
      });
    });
    
    logger.log(`从云端获取到${favorites.length}条收藏数据`);
    return favorites;
  } catch (error) {
    logger.error('从子集合获取收藏数据失败:', error);
    return [];
  }
};

/**
 * 从子集合获取云端历史记录数据
 * @param {string} uid 用户ID
 * @param {number} lastSyncTime 上次同步时间
 * @param {number} maxItems 最大记录数
 * @returns {Promise<Array>} 历史记录数据数组
 */
const getCloudHistoryFromSubcollection = async (uid, lastSyncTime = 0, maxItems = MAX_HISTORY_ITEMS) => {
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
      historyQuery = query(
        historyRef,
        orderBy('timestamp', 'desc'),
        limit(maxItems)
      );
    }
    
    const snapshot = await getDocs(historyQuery);
    const history = [];
    
    snapshot.forEach(doc => {
      history.push({
        ...doc.data(),
        docId: doc.id // 保存文档ID用于后续操作
      });
    });
    
    logger.log(`从云端获取到${history.length}条历史记录数据`);
    return history;
  } catch (error) {
    logger.error('从子集合获取历史记录数据失败:', error);
    return [];
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
    
    // 使用批量写入提高性能
    // Firestore每批次最多500个操作，我们分批处理
    for (let i = 0; i < favorites.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = favorites.slice(i, i + BATCH_SIZE);
      
      for (const item of chunk) {
        // 使用歌曲ID作为文档ID，确保唯一性
        const itemDocRef = doc(favoritesRef, item.id.toString());
        
        // 确保数据有修改时间
        const itemData = {
          ...item,
          modifiedAt: item.modifiedAt || now
        };
        
        // 如果有文档ID属性，删除它，避免存储冗余数据
        if (itemData.docId) {
          delete itemData.docId;
        }
        
        batch.set(itemDocRef, itemData);
        modifiedCount++;
      }
      
      await batch.commit();
      logger.log(`保存了收藏批次 ${i/BATCH_SIZE + 1}/${Math.ceil(favorites.length/BATCH_SIZE)}`);
    }
    
    // 更新用户文档的lastUpdated字段
    const userRef = getUserDocRef(uid);
    await updateDoc(userRef, { lastUpdated: now });
    
    logger.log(`成功保存${modifiedCount}条收藏数据到云端子集合`);
    return { success: true };
  } catch (error) {
    logger.error('保存收藏数据到子集合失败:', error);
    return { success: false, error };
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
    
    // 使用批量写入提高性能
    for (let i = 0; i < history.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = history.slice(i, i + BATCH_SIZE);
      
      for (const item of chunk) {
        // 使用时间戳+歌曲ID作为文档ID，确保唯一性
        // 即使同一首歌多次播放也会有不同记录
        const itemId = `${item.timestamp}_${item.song.id}`;
        const itemDocRef = doc(historyRef, itemId);
        
        // 如果有文档ID属性，删除它
        if (item.docId) {
          delete item.docId;
        }
        
        batch.set(itemDocRef, item);
        modifiedCount++;
      }
      
      await batch.commit();
      logger.log(`保存了历史记录批次 ${i/BATCH_SIZE + 1}/${Math.ceil(history.length/BATCH_SIZE)}`);
    }
    
    // 更新用户文档的lastUpdated字段
    const userRef = getUserDocRef(uid);
    await updateDoc(userRef, { lastUpdated: now });
    
    logger.log(`成功保存${modifiedCount}条历史记录到云端子集合`);
    return { success: true };
  } catch (error) {
    logger.error('保存历史记录到子集合失败:', error);
    return { success: false, error };
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
      
      keysToRemove.forEach(key => {
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
  incrementalSyncWithSubcollections as incrementalSync // 导出子集合同步作为默认同步函数
}; 

import logger from '../utils/logger.js';
/**
 * 内存级缓存系统
 * 只在当前会话中有效，不进行持久化存储
 */

// 缓存类型枚举
export const CACHE_TYPES = {
  COVER_IMAGES: 'coverImages',
  AUDIO_URLS: 'audioUrls',
  AUDIO_METADATA: 'audioMetadata',
  LYRICS: 'lyrics',
  SEARCH_RESULTS: 'searchResults',
};

// 内存缓存存储对象
const memoryCache = {
  [CACHE_TYPES.COVER_IMAGES]: new Map(),
  [CACHE_TYPES.AUDIO_URLS]: new Map(),
  [CACHE_TYPES.AUDIO_METADATA]: new Map(),
  [CACHE_TYPES.LYRICS]: new Map(),
  [CACHE_TYPES.SEARCH_RESULTS]: new Map(),
};

// 缓存配置（过期时间，单位毫秒）
const CACHE_CONFIG = {
  [CACHE_TYPES.SEARCH_RESULTS]: { ttl: 5 * 60 * 1000 }, // 5分钟
  [CACHE_TYPES.COVER_IMAGES]: { ttl: 72 * 60 * 60 * 1000 }, // 72小时
  [CACHE_TYPES.AUDIO_URLS]: { ttl: 10 * 60 * 1000 }, // 10分钟
  [CACHE_TYPES.AUDIO_METADATA]: { ttl: 10 * 60 * 1000 }, // 10分钟
  [CACHE_TYPES.LYRICS]: { ttl: 30 * 60 * 1000 }, // 30分钟
};

// 缓存容量上限（条目数）
const CACHE_MAX_ENTRIES = {
  [CACHE_TYPES.SEARCH_RESULTS]: 200,
  [CACHE_TYPES.COVER_IMAGES]: 300,
  [CACHE_TYPES.AUDIO_URLS]: 200,
  [CACHE_TYPES.AUDIO_METADATA]: 200,
  [CACHE_TYPES.LYRICS]: 300,
};

const enforceCacheLimit = (type) => {
  const maxEntries = CACHE_MAX_ENTRIES[type];
  if (!maxEntries) return;
  const cache = memoryCache[type];
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
    logger.log(`[内存缓存] 超出上限，已淘汰最旧项: ${type}/${oldestKey}`);
  }
};

/**
 * 检查缓存项是否过期
 * @param {Object} cacheItem 缓存项
 * @returns {boolean} 是否过期
 */
const isExpired = (cacheItem) => {
  return !cacheItem || !cacheItem.timestamp || Date.now() - cacheItem.timestamp > cacheItem.ttl;
};

/**
 * 设置缓存
 * @param {string} type 缓存类型
 * @param {string} key 缓存键
 * @param {*} data 要缓存的数据
 * @returns {*} 缓存的数据
 */
export const setMemoryCache = (type, key, data) => {
  try {
    const config = CACHE_CONFIG[type] || { ttl: 5 * 60 * 1000 }; // 默认5分钟
    const cacheItem = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
    };

    // 存储到对应类型的缓存映射中
    memoryCache[type].set(key, cacheItem);
    enforceCacheLimit(type);

    logger.log(`[内存缓存] 已缓存: ${type}/${key}`);
    return data;
  } catch (error) {
    logger.warn(`[内存缓存] 设置缓存失败 (${type}/${key}):`, error);
    return data; // 即使缓存失败，仍返回原始数据
  }
};

/**
 * 获取缓存
 * @param {string} type 缓存类型
 * @param {string} key 缓存键
 * @returns {*|null} 缓存的数据或null
 */
export const getMemoryCache = (type, key) => {
  try {
    const cacheItem = memoryCache[type].get(key);

    if (cacheItem && !isExpired(cacheItem)) {
      // 刷新LRU顺序
      memoryCache[type].delete(key);
      memoryCache[type].set(key, cacheItem);
      logger.log(`[内存缓存] 命中: ${type}/${key}`);
      return cacheItem.data;
    }

    // 如果过期或不存在，移除并返回null
    if (cacheItem) {
      memoryCache[type].delete(key);
      logger.log(`[内存缓存] 过期已删除: ${type}/${key}`);
    }

    return null;
  } catch (error) {
    logger.warn(`[内存缓存] 获取缓存失败 (${type}/${key}):`, error);
    return null;
  }
};

/**
 * 清除特定类型的缓存
 * @param {string} type 缓存类型，如果不提供则清除所有缓存
 */
export const clearMemoryCache = (type) => {
  try {
    if (type && memoryCache[type]) {
      // 清除特定类型的缓存
      memoryCache[type].clear();
      logger.log(`[内存缓存] 已清除缓存类型: ${type}`);
    } else if (!type) {
      // 清除所有缓存
      Object.values(CACHE_TYPES).forEach((cacheType) => {
        memoryCache[cacheType].clear();
      });
      logger.log('[内存缓存] 已清除所有缓存');
    }
  } catch (error) {
    logger.warn('[内存缓存] 清除缓存失败:', error);
  }
};

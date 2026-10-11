import logger from '../utils/logger.js';

export const CACHE_TYPES = {
  COVER_IMAGES: 'coverImages',
  AUDIO_URLS: 'audioUrls',
  LYRICS: 'lyrics',
  SEARCH_RESULTS: 'searchResults',
} as const;

export type CacheType = (typeof CACHE_TYPES)[keyof typeof CACHE_TYPES];

interface CacheItem {
  data: unknown;
  timestamp: number;
  ttl: number;
}

const memoryCache: Record<CacheType, Map<string, CacheItem>> = {
  [CACHE_TYPES.COVER_IMAGES]: new Map(),
  [CACHE_TYPES.AUDIO_URLS]: new Map(),
  [CACHE_TYPES.LYRICS]: new Map(),
  [CACHE_TYPES.SEARCH_RESULTS]: new Map(),
};

const cacheConfig: Record<CacheType, { ttl: number }> = {
  [CACHE_TYPES.SEARCH_RESULTS]: { ttl: 5 * 60 * 1000 },
  [CACHE_TYPES.COVER_IMAGES]: { ttl: 72 * 60 * 60 * 1000 },
  [CACHE_TYPES.AUDIO_URLS]: { ttl: 10 * 60 * 1000 },
  [CACHE_TYPES.LYRICS]: { ttl: 30 * 60 * 1000 },
};

const cacheMaxEntries: Record<CacheType, number> = {
  [CACHE_TYPES.SEARCH_RESULTS]: 200,
  [CACHE_TYPES.COVER_IMAGES]: 300,
  [CACHE_TYPES.AUDIO_URLS]: 200,
  [CACHE_TYPES.LYRICS]: 300,
};

const enforceCacheLimit = (type: CacheType): void => {
  const cache = memoryCache[type];
  const maxEntries = cacheMaxEntries[type];
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) return;
    cache.delete(oldestKey);
    logger.log(`[内存缓存] 超出上限，已淘汰最旧项: ${type}/${oldestKey}`);
  }
};

const isExpired = (cacheItem: CacheItem | undefined): boolean =>
  !cacheItem || !cacheItem.timestamp || Date.now() - cacheItem.timestamp > cacheItem.ttl;

export const setMemoryCache = <T>(type: CacheType, key: string, data: T): T => {
  try {
    const cacheItem: CacheItem = {
      data,
      timestamp: Date.now(),
      ttl: cacheConfig[type].ttl,
    };
    memoryCache[type].delete(key);
    memoryCache[type].set(key, cacheItem);
    enforceCacheLimit(type);
    logger.log(`[内存缓存] 已缓存: ${type}/${key}`);
    return data;
  } catch (error) {
    logger.warn(`[内存缓存] 设置缓存失败 (${type}/${key}):`, error);
    return data;
  }
};

export const getMemoryCache = <T = unknown>(type: CacheType, key: string): T | null => {
  try {
    const cache = memoryCache[type];
    const cacheItem = cache.get(key);

    if (cacheItem && !isExpired(cacheItem)) {
      cache.delete(key);
      cache.set(key, cacheItem);
      logger.log(`[内存缓存] 命中: ${type}/${key}`);
      return cacheItem.data as T;
    }

    if (cacheItem) {
      cache.delete(key);
      logger.log(`[内存缓存] 过期已删除: ${type}/${key}`);
    }

    return null;
  } catch (error) {
    logger.warn(`[内存缓存] 获取缓存失败 (${type}/${key}):`, error);
    return null;
  }
};

let cacheGeneration = 0;
export const getMemoryCacheGeneration = (): number => cacheGeneration;

export const clearMemoryCache = (type?: CacheType): void => {
  cacheGeneration += 1;
  try {
    if (type) {
      memoryCache[type].clear();
      logger.log(`[内存缓存] 已清除缓存类型: ${type}`);
      return;
    }

    Object.values(CACHE_TYPES).forEach((cacheType) => memoryCache[cacheType].clear());
    logger.log('[内存缓存] 已清除所有缓存');
  } catch (error) {
    logger.warn('[内存缓存] 清除缓存失败:', error);
  }
};

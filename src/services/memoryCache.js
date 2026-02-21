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
  SEARCH_RESULTS: 'searchResults'
};

// 内存缓存存储对象
const memoryCache = {
  [CACHE_TYPES.COVER_IMAGES]: new Map(),
  [CACHE_TYPES.AUDIO_URLS]: new Map(),
  [CACHE_TYPES.AUDIO_METADATA]: new Map(),
  [CACHE_TYPES.LYRICS]: new Map(),
  [CACHE_TYPES.SEARCH_RESULTS]: new Map()
};

// 缓存配置（过期时间，单位毫秒）
const CACHE_CONFIG = {
  [CACHE_TYPES.SEARCH_RESULTS]: { ttl: 5 * 60 * 1000 }, // 5分钟
  [CACHE_TYPES.COVER_IMAGES]: { ttl: 72 * 60 * 60 * 1000 },  // 72小时
  [CACHE_TYPES.AUDIO_URLS]: { ttl: 10 * 60 * 1000 },    // 10分钟
  [CACHE_TYPES.AUDIO_METADATA]: { ttl: 10 * 60 * 1000 },// 10分钟
  [CACHE_TYPES.LYRICS]: { ttl: 30 * 60 * 1000 },        // 30分钟
};

/**
 * 检查缓存项是否过期
 * @param {Object} cacheItem 缓存项
 * @returns {boolean} 是否过期
 */
const isExpired = (cacheItem) => {
  return !cacheItem || !cacheItem.timestamp || 
    (Date.now() - cacheItem.timestamp > cacheItem.ttl);
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
      ttl: config.ttl
    };
    
    // 存储到对应类型的缓存映射中
    memoryCache[type].set(key, cacheItem);
    
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
      Object.values(CACHE_TYPES).forEach(cacheType => {
        memoryCache[cacheType].clear();
      });
      logger.log('[内存缓存] 已清除所有缓存');
    }
  } catch (error) {
    logger.warn('[内存缓存] 清除缓存失败:', error);
  }
};

/**
 * 将图片URL转换为Base64数据
 * @param {string} imageUrl 图片URL
 * @returns {Promise<string|null>} Base64编码的图片数据
 */
const imageUrlToBase64 = async (imageUrl) => {
  try {
    // 验证URL
    if (!imageUrl || imageUrl.includes('default_cover') || !imageUrl.startsWith('http')) {
      logger.warn('[imageUrlToBase64] 无效的图片URL:', imageUrl);
      return null;
    }
    
    logger.log(`[imageUrlToBase64] 开始获取图片: ${imageUrl.substring(0, 50)}...`);
    
    const response = await fetch(imageUrl, {
      mode: 'cors',
      cache: 'force-cache',
      headers: {
        'Referrer-Policy': 'no-referrer-when-downgrade'
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      logger.warn('[imageUrlToBase64] 图片内容为空');
      return null;
    }
    
    // 检查MIME类型
    if (!blob.type.startsWith('image/')) {
      logger.warn(`[imageUrlToBase64] 非图片类型: ${blob.type}`);
      return null;
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logger.log('[imageUrlToBase64] 图片转Base64成功');
        resolve(reader.result);
      };
      reader.onerror = (error) => {
        logger.error('[imageUrlToBase64] 读取图片数据失败:', error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // 捕获跨域错误
    if (error.message && error.message.includes('CORS')) {
      logger.warn(`[imageUrlToBase64] 跨域错误: ${imageUrl.substring(0, 50)}...`);
    } else {
      logger.error('[imageUrlToBase64] 图片转Base64失败:', error);
    }
    return null;
  }
}; 

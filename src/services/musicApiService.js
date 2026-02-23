/**
 * 音乐API服务模块
 * 统一处理音乐相关API调用，包括搜索、获取URL、歌词和封面
 */
import axios from 'axios';
import { getMemoryCache, setMemoryCache, CACHE_TYPES } from './memoryCache';
import audioStateManager from './audioStateManager';
import { validateSearchResults } from '../utils/dataValidator';
import '../types';
import logger from '../utils/logger';

// Constants
// 直接从浏览器请求 API,每个用户使用自己的 IP,避免共享限制
const API_BASE = '/api-v1/api.php';
const REQUEST_TIMEOUT = 12000; // 12秒请求超时

// 添加防重复请求映射
const pendingUrlRequests = new Map();
const pendingLyricRequests = new Map();

/**
 * 检查是否允许API请求
 */
const checkApiAccess = () => {
  return true;
};

/**
 * 搜索音乐
 * @param {string} query - 搜索关键词
 * @param {string} source - 音乐源
 * @param {number} count - 结果数量
 * @param {number} page - 页码
 * @returns {Promise<Object>} - 搜索结果
 */
export const searchMusic = async (query, source, count = 20, page = 1) => {
  try {
    checkApiAccess();

    // 生成缓存键
    const cacheKey = `${query}_${source}_${count}_${page}`;

    // 检查内存缓存
    const cachedResults = getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, cacheKey);
    if (cachedResults) {
      logger.log('[searchMusic] 使用内存缓存的搜索结果');
      return cachedResults;
    }

    logger.log(`[searchMusic] 开始搜索: ${query}, 源: ${source}`);

    // 创建可取消的请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    const response = await axios.get(`${API_BASE}`, {
      params: {
        types: 'search',
        source: source,
        name: query,
        count: count,
        pages: page
      },
      signal: controller.signal,
      timeout: REQUEST_TIMEOUT
    });

    // 清除超时
    clearTimeout(timeoutId);

    // 检查响应并校验数据
    if (!response.data) {
      logger.log('[searchMusic] API未返回数据');
      return [];
    }

    const validatedData = validateSearchResults(response.data);

    if (validatedData.length === 0) {
      logger.log('[searchMusic] 搜索结果为空或数据无效');
      return [];
    }

    logger.log(`[searchMusic] 搜索成功，找到 ${validatedData.length} 条有效结果`);

    // 缓存校验后的结果到内存
    setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, cacheKey, validatedData);

    return validatedData;
  } catch (error) {
    // 处理取消请求的情况
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') {
      logger.warn('[searchMusic] 搜索请求超时或被取消');
      throw new Error('搜索请求超时，请稍后重试');
    }

    // 处理网络错误
    if (error.code === 'ERR_NETWORK') {
      logger.error('[searchMusic] 网络连接错误:', error);
      throw new Error('网络连接错误，请检查您的网络连接');
    }

    logger.error('[searchMusic] 搜索音乐失败:', error);
    throw error;
  }
};

/**
 * 获取音频URL
 * @param {Object} track - 歌曲信息
 * @param {number|string} quality - 音质参数，999为无损，320为高音质
 * @param {boolean} forceRefresh - 是否强制刷新（不使用缓存）
 * @returns {Promise<Object>} - 返回API响应结果
 */
export const getAudioUrl = async (track, quality = 999, forceRefresh = false) => {
  try {
    // 生成请求唯一标识符
    const requestId = `${track.source}_${track.id}_${quality}_${Date.now()}`;

    // 检查是否有相同URL的请求正在进行中
    const pendingKey = `${track.source}_${track.id}_${quality}`;
    if (pendingUrlRequests.has(pendingKey) && !forceRefresh) {
      logger.log(`[getAudioUrl] 检测到重复请求: ${track.name} (${track.id}), 使用现有请求`);
      return pendingUrlRequests.get(pendingKey);
    }

    logger.log(`[getAudioUrl] 开始请求: ${track.name} (${track.id}), 请求ID: ${requestId}, 强制刷新: ${forceRefresh}`);

    checkApiAccess();

    // 生成缓存键
    const cacheKey = `${track.source}_${track.id}_${quality}`;

    // 创建一个Promise并存储到映射中
    const urlPromise = (async () => {
      try {
        // 检查内存缓存
        const cachedData = !forceRefresh ? getMemoryCache(CACHE_TYPES.AUDIO_URLS, cacheKey) : null;
        if (cachedData) {
          logger.log(`[getAudioUrl] 使用内存缓存的音频URL: ${requestId}`);
          return cachedData;
        }

        logger.log(`[getAudioUrl] ${forceRefresh ? '强制刷新' : '内存缓存未命中'}，调用API: ${requestId}`);

        const response = await axios.get(`${API_BASE}`, {
          params: {
            types: 'url',
            source: track.source,
            id: track.id,
            br: quality
          },
          timeout: REQUEST_TIMEOUT
        });

        // 缓存结果到内存
        setMemoryCache(CACHE_TYPES.AUDIO_URLS, cacheKey, response.data);

        logger.log(`[getAudioUrl] 请求完成: ${requestId}`);
        return response.data;
      } finally {
        // 请求完成后从映射中移除
        pendingUrlRequests.delete(pendingKey);
        logger.log(`[getAudioUrl] 请求映射已清理: ${requestId}`);
      }
    })();

    // 存储Promise到映射中
    pendingUrlRequests.set(pendingKey, urlPromise);

    // 返回Promise
    return urlPromise;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
      logger.warn('[getAudioUrl] 请求超时或被取消');
    } else {
      logger.error('[getAudioUrl] 获取音频URL失败:', error);
    }
    throw error;
  }
};

/**
 * 获取歌词
 * @param {Object} track - 歌曲信息
 * @returns {Promise<Object>} - 歌词数据
 */
export const getLyrics = async (track) => {
  try {
    // 如果没有歌词ID，返回空歌词
    if (!track.lyric_id) {
      return { raw: '', translated: '' };
    }

    // 生成请求唯一标识符
    const requestId = `${track.source}_${track.lyric_id}_${Date.now()}`;

    // 检查是否有相同歌词的请求正在进行中
    const pendingKey = `${track.source}_${track.lyric_id}`;
    if (pendingLyricRequests.has(pendingKey)) {
      logger.log(`[getLyrics] 检测到重复请求: ${track.name} (${track.lyric_id}), 使用现有请求`);
      return pendingLyricRequests.get(pendingKey);
    }

    logger.log(`[getLyrics] 开始请求: ${track.name} (${track.lyric_id}), 请求ID: ${requestId}`);

    checkApiAccess();

    // 生成缓存键
    const cacheKey = `${track.source}_${track.lyric_id}`;
    const STORAGE_KEY_PREFIX = 'sonicflow_lyric_';

    // 创建一个Promise并存储到映射中
    const lyricPromise = (async () => {
      try {
        // 1. 检查内存缓存
        const cachedLyrics = getMemoryCache(CACHE_TYPES.LYRICS, cacheKey);
        if (cachedLyrics) {
          logger.log(`[getLyrics] 使用内存缓存的歌词: ${requestId}`);
          return cachedLyrics;
        }

        // 2. 检查 LocalStorage 持久化缓存
        try {
          const storedLyrics = localStorage.getItem(`${STORAGE_KEY_PREFIX}${cacheKey}`);
          if (storedLyrics) {
            const parsedLyrics = JSON.parse(storedLyrics);
            logger.log(`[getLyrics] 使用 LocalStorage 缓存的歌词: ${requestId}`);
            // 同时更新到内存缓存，提高下次访问速度
            setMemoryCache(CACHE_TYPES.LYRICS, cacheKey, parsedLyrics);
            return parsedLyrics;
          }
        } catch (e) {
          logger.warn('[getLyrics] 读取 LocalStorage 缓存失败:', e);
        }

        logger.log(`[getLyrics] 缓存未命中，调用API: ${requestId}`);

        const response = await axios.get(`${API_BASE}`, {
          params: {
            types: 'lyric',
            source: track.source,
            id: track.lyric_id
          },
          timeout: REQUEST_TIMEOUT
        });

        const lyrics = {
          raw: response.data.lyric || '',
          translated: response.data.tlyric || ''
        };

        // 3. 缓存结果到内存
        setMemoryCache(CACHE_TYPES.LYRICS, cacheKey, lyrics);

        // 4. 持久化到 LocalStorage
        try {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${cacheKey}`, JSON.stringify(lyrics));
        } catch (e) {
          logger.warn('[getLyrics] 写入 LocalStorage 缓存失败:', e);
        }

        logger.log(`[getLyrics] 请求完成并存入双层缓存: ${requestId}`);
        return lyrics;
      } finally {
        // 请求完成后从映射中移除
        setTimeout(() => {
          pendingLyricRequests.delete(pendingKey);
          logger.log(`[getLyrics] 请求映射已清理: ${requestId}`);
        }, 100);
      }
    })();

    // 存储Promise到映射中
    pendingLyricRequests.set(pendingKey, lyricPromise);

    // 返回Promise
    return lyricPromise;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
      logger.warn('[getLyrics] 请求超时或被取消');
    } else {
      logger.error('[getLyrics] 获取歌词失败:', error);
    }
    throw error;
  }
};

/**
 * 获取封面图片
 * @param {string} source - 音乐源
 * @param {string} picId - 封面ID
 * @param {number} size - 封面尺寸（只支持300和500）
 * @returns {Promise<string>} - 封面URL或默认封面路径
 */
export const getCoverImage = async (source, picId, size = 500) => {
  try {
    // 验证参数
    if (!picId || picId === 'undefined' || picId === 'null') {
      return 'default_cover.svg';
    }

    // 验证size参数
    if (size !== 300 && size !== 500) {
      size = 500;
    }

    const cacheKey = `${source}_${picId}_${size}`;

    // 1. 严格检查内存缓存 (最高优先级)
    const cachedUrl = getMemoryCache(CACHE_TYPES.COVER_IMAGES, cacheKey);
    if (cachedUrl) {
      return cachedUrl;
    }

    // 2. 策略调整：为了节省 API 额度，不再主动发起 types=pic 请求
    // 只有在 playMusic 等核心流程明确需要时，才会考虑请求
    logger.log(`[getCoverImage] 为节省额度，跳过主动请求: ${source}/${picId}`);
    return 'default_cover.svg';
  } catch {
    return 'default_cover.svg';
  }
};

/**
 * 强制获取封面图片 (仅限播放等核心场景按需使用，以节省API额度)
 */
export const forceGetCoverImage = async (source, picId, size = 500) => {
  try {
    const cacheKey = `${source}_${picId}_${size}`;
    const cachedUrl = getMemoryCache(CACHE_TYPES.COVER_IMAGES, cacheKey);
    if (cachedUrl && !cachedUrl.includes('default_cover')) return cachedUrl;

    logger.log(`[forceGetCoverImage] 开始按需请求封面: ${source}/${picId}`);
    const response = await axios.get(`${API_BASE}`, {
      params: { types: 'pic', source, id: picId, size },
      timeout: 5000
    });

    if (response.data?.url) {
      const url = response.data.url.replace(/\\/g, '');
      setMemoryCache(CACHE_TYPES.COVER_IMAGES, cacheKey, url);
      return url;
    }
    return 'default_cover.svg';
  } catch {
    return 'default_cover.svg';
  }
};

/**
 * 完整的播放音乐逻辑（获取URL和歌词）
 * @param {Object} track - 歌曲信息
 * @param {number|string} quality - 音质参数
 * @param {boolean} forceRefresh - 是否强制刷新URL（不使用缓存）
 * @returns {Promise<Object>} - 包含URL、歌词和文件大小的对象
 */
export const playMusic = async (track, quality = 999, forceRefresh = false) => {
  try {
    logger.log(`[playMusic] 开始请求: ${track.name} (${track.id}), 强制刷新: ${forceRefresh}`);

    checkApiAccess();

    // 先获取音频数据
    const audioData = await getAudioUrl(track, quality, forceRefresh);
    const url = audioData?.url?.replace(/\\/g, '');

    if (!url) throw new Error('无效的音频链接');

    // 将播放任务交给状态管理器（底层分发到 AudioEngine）
    audioStateManager.loadTrack(track, url);

    // 后台异步补全 500 尺寸高清封面
    forceGetCoverImage(track.source, track.pic_id, 500).catch(() => { });

    return {
      url,
      fileSize: audioData.size
    };
  } catch (error) {
    logger.error('[playMusic] 播放音乐失败:', error);
    audioStateManager.setError(error);
    throw error;
  }
};

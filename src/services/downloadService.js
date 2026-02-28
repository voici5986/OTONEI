/**
 * 下载服务模块
 * 统一处理音乐下载逻辑，支持单曲下载和批量下载
 */
import { toast } from 'react-toastify';
import { getAudioUrl } from './musicApiService';
import { getTrackArtist } from '../utils/trackFormatter';
import logger from '../utils/logger.js';

/**
 * 获取文件扩展名
 * @param {string} url - 音频URL
 * @param {number|string} quality - 音质参数
 * @returns {string} - 文件扩展名
 */
const getFileExtension = (url, quality = 999) => {
  try {
    // 处理可能包含反斜杠的URL
    const cleanUrl = url.replace(/\\/g, '');
    const fileName = new URL(cleanUrl).pathname.split('/').pop().split(/[#?]/)[0]; // 移除可能的哈希和查询参数

    // 使用正则表达式提取后缀
    const extensionMatch = fileName.match(/\.([a-z0-9]+)$/i);
    if (extensionMatch) return extensionMatch[1];

    // 如果URL没有扩展名，根据音质决定
    return quality >= 999 ? 'flac' : 'mp3';
  } catch {
    // 默认后缀也根据音质决定
    return quality >= 999 ? 'flac' : 'mp3';
  }
};

/**
 * 获取音质描述
 * @param {number|string} quality - 音质参数
 * @returns {string} - 音质描述文字
 */
const getQualityDescription = (quality) => {
  quality = Number(quality);
  if (quality >= 999) {
    return '无损音质';
  } else if (quality >= 700) {
    return 'Hi-Res';
  } else if (quality >= 320) {
    return '高品质';
  } else {
    return `${quality}kbps`;
  }
};

/**
 * 解析并格式化文件大小（兼容带单位/无单位）
 * 支持单位：B、KB、MB、GB（大小写均可）
 * 无单位时：> 1,048,576 视为字节，否则视为 KB
 */
const formatFileSizeMessage = (rawSize) => {
  if (rawSize === null || rawSize === undefined) return '';

  const text = String(rawSize).trim().toLowerCase();
  if (!text) return '';

  const numberMatch = text.match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) return '';

  const value = Number(numberMatch[0]);
  if (!Number.isFinite(value) || value <= 0) return '';

  let bytes;
  if (/\bgb\b/.test(text)) {
    bytes = value * 1024 * 1024 * 1024;
  } else if (/\bmb\b/.test(text)) {
    bytes = value * 1024 * 1024;
  } else if (/\bkb\b/.test(text) || /\bk\b/.test(text)) {
    bytes = value * 1024;
  } else if (/\bb\b/.test(text)) {
    bytes = value;
  } else {
    // 无单位时按量级推断
    bytes = value > 1024 * 1024 ? value : value * 1024;
  }

  if (!Number.isFinite(bytes) || bytes <= 0) return '';

  const sizeMB = bytes / (1024 * 1024);
  return ` (${sizeMB.toFixed(2)} MB)`;
};

// 下载队列管理
const downloadQueue = [];
let isProcessingQueue = false;
const MIN_DOWNLOAD_INTERVAL = 5000; // 5秒间隔

/**
 * 处理下载队列
 */
const processQueue = async () => {
  if (isProcessingQueue || downloadQueue.length === 0) return;

  isProcessingQueue = true;

  while (downloadQueue.length > 0) {
    const { track, quality, onStartDownload, onFinishDownload, resolve } = downloadQueue[0];

    try {
      const result = await _processDownload(track, quality, onStartDownload, onFinishDownload);
      resolve(result);
    } catch (error) {
      logger.error('Queue processing error:', error);
      resolve(false);
    }

    // 移除已处理的任务
    downloadQueue.shift();

    // 如果队列中还有任务，等待间隔时间
    if (downloadQueue.length > 0) {
      await new Promise((r) => setTimeout(r, MIN_DOWNLOAD_INTERVAL));
    }
  }

  isProcessingQueue = false;
};

/**
 * 下载单首歌曲 (加入队列)
 * @param {Object} track - 歌曲信息
 * @param {number|string} quality - 音质参数
 * @param {Function} onStartDownload - 下载开始回调
 * @param {Function} onFinishDownload - 下载结束回调
 * @returns {Promise<boolean>} - 下载是否成功
 */
export const downloadTrack = (track, quality = 999, onStartDownload, onFinishDownload) => {
  return new Promise((resolve) => {
    downloadQueue.push({
      track,
      quality,
      onStartDownload,
      onFinishDownload,
      resolve,
    });

    if (isProcessingQueue) {
      toast.info(`已加入下载队列，前方还有 ${downloadQueue.length - 1} 首任务`, {
        icon: '⏳',
        autoClose: 2000,
      });
    }

    processQueue();
  });
};

/**
 * 内部下载处理函数
 */
const _processDownload = async (track, quality = 999, onStartDownload, onFinishDownload) => {
  try {
    // 调用下载开始回调
    if (typeof onStartDownload === 'function') {
      onStartDownload(track);
    }

    // 获取音频URL数据
    let audioData;
    try {
      audioData = await getAudioUrl(track, quality);
    } catch (error) {
      logger.warn(`[downloadService] 音质 ${quality} 下载请求失败，尝试降级到 320:`, error);
      if (quality !== 320) {
        audioData = await getAudioUrl(track, 320);
        quality = 320; // 更新实际下载的音质
      } else {
        throw error;
      }
    }

    // 获取下载链接
    const downloadUrl = audioData.url.replace(/\\/g, '');
    if (!downloadUrl) {
      throw new Error('无效的下载链接');
    }

    // 设置下载文件名
    const extension = getFileExtension(downloadUrl, quality);
    const fileName = `${track.name} - ${getTrackArtist(track) || '未知歌手'}.${extension}`;

    // 确定音质描述
    const qualityDesc = getQualityDescription(quality);

    // 准备文件大小信息
    const fileSizeMsg = formatFileSizeMessage(audioData?.size);

    toast.info(`正在准备下载${qualityDesc}音频: ${fileName}${fileSizeMsg}`, {
      icon: '⏬',
      autoClose: 2000,
    });

    // 直接下载
    try {
      // 使用fetch获取音频内容
      const audioResponse = await fetch(downloadUrl);
      if (!audioResponse.ok) {
        throw new Error(`下载失败: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      const contentType = audioResponse.headers.get('content-type') || '';
      if (contentType && !contentType.startsWith('audio/')) {
        throw new Error(`下载内容类型异常: ${contentType}`);
      }
      const blob = await audioResponse.blob();

      // 创建blob URL
      const blobUrl = window.URL.createObjectURL(blob);

      // 创建下载链接并点击
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // 清理
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);

      return true;
    } catch (fetchError) {
      logger.error('Fetch error:', fetchError);

      // 备用下载方法
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      link.setAttribute('target', '_blank');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    }
  } catch (error) {
    logger.error('Download error:', error);
    toast.error('下载失败，请稍后重试', {
      icon: '❌',
      autoClose: 3000,
    });
    return false;
  } finally {
    // 调用下载结束回调
    if (typeof onFinishDownload === 'function') {
      onFinishDownload(track);
    }
  }
};

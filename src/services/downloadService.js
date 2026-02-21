/**
 * 下载服务模块
 * 统一处理音乐下载逻辑，支持单曲下载和批量下载
 */
import { toast } from 'react-toastify';
import { getAudioUrl } from './musicApiService';
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
    const fileName = new URL(cleanUrl).pathname
      .split('/')
      .pop()
      .split(/[#?]/)[0]; // 移除可能的哈希和查询参数
    
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
    return "无损音质";
  } else if (quality >= 700) {
    return "Hi-Res";
  } else if (quality >= 320) {
    return "高品质";
  } else {
    return `${quality}kbps`;
  }
};

/**
 * 下载单首歌曲
 * @param {Object} track - 歌曲信息
 * @param {number|string} quality - 音质参数，999为无损，320为高音质
 * @param {Function} onStartDownload - 下载开始回调，用于更新UI状态
 * @param {Function} onFinishDownload - 下载结束回调，用于更新UI状态
 * @returns {Promise<boolean>} - 下载是否成功
 */
export const downloadTrack = async (track, quality = 999, onStartDownload, onFinishDownload) => {
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
    const fileName = `${track.name} - ${track.artist}.${extension}`;
    
    // 确定音质描述
    const qualityDesc = getQualityDescription(quality);
    
    // 准备文件大小信息
    let fileSizeMsg = '';
    if (audioData.size) {
      const sizeMB = (parseInt(audioData.size) / 1024).toFixed(2);
      fileSizeMsg = ` (${sizeMB} MB)`;
    }
    
    toast.info(`正在准备下载${qualityDesc}音频: ${fileName}${fileSizeMsg}`, {
      icon: '⏬',
      duration: 2000
    });
    
    // 直接下载
    try {
      // 使用fetch获取音频内容
      const audioResponse = await fetch(downloadUrl);
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
      duration: 3000
    });
    return false;
  } finally {
    // 调用下载结束回调
    if (typeof onFinishDownload === 'function') {
      onFinishDownload(track);
    }
  }
};

/**
 * 批量下载多首歌曲
 * @param {Array} tracks - 要下载的歌曲列表
 * @param {number|string} quality - 音质参数
 * @param {Object} callbacks - 回调函数对象
 * @param {Function} callbacks.onStart - 开始批量下载时的回调
 * @param {Function} callbacks.onProgress - 下载进度更新的回调 (index, progress, status)
 * @param {Function} callbacks.onTrackStart - 单首歌曲开始下载的回调 (track, index)
 * @param {Function} callbacks.onTrackSuccess - 单首歌曲下载成功的回调 (track, index, info)
 * @param {Function} callbacks.onTrackError - 单首歌曲下载失败的回调 (track, index, error)
 * @param {Function} callbacks.onFinish - 批量下载完成的回调 (successCount, totalCount)
 * @returns {Promise<Object>} - 下载结果统计
 */
const downloadTracks = async (tracks, quality = 999, callbacks = {}) => {
  const { 
    onStart, 
    onProgress, 
    onTrackStart, 
    onTrackSuccess, 
    onTrackError, 
    onFinish 
  } = callbacks;
  
  // 如果没有歌曲，直接返回
  if (!tracks || tracks.length === 0) {
    return { success: false, message: '没有可下载的歌曲' };
  }
  
  // 调用开始回调
  if (typeof onStart === 'function') {
    onStart(tracks.length);
  }
  
  let successCount = 0;
  const qualityName = getQualityDescription(quality);
  
  // 对每首歌曲进行下载
  for (let i = 0; i < tracks.length; i++) {
    try {
      const track = tracks[i];
      const progress = Math.floor((i / tracks.length) * 100);
      
      // 更新进度
      if (typeof onProgress === 'function') {
        onProgress(i, progress, { status: 'downloading', message: `获取${qualityName}...` });
      }
      
      // 通知开始下载这首歌曲
      if (typeof onTrackStart === 'function') {
        onTrackStart(track, i);
      }
      
      // 获取下载链接，使用新的musicApiService
      let audioData;
      try {
        audioData = await getAudioUrl(track, quality);
      } catch (error) {
        logger.warn(`[downloadService] 批量下载歌曲 "${track.name}" 音质 ${quality} 失败，尝试降级到 320:`, error);
        if (quality !== 320) {
          audioData = await getAudioUrl(track, 320);
        } else {
          throw error;
        }
      }
      
      const downloadUrl = audioData.url.replace(/\\/g, '');
      if (!downloadUrl) {
        throw new Error('无效的下载链接');
      }
      
      // 确定文件扩展名
      const extension = getFileExtension(downloadUrl, quality);
      const fileName = `${track.name} - ${track.artist}.${extension}`;
      
      // 准备文件大小信息（如果API返回）
      let fileSize = '';
      if (audioData.size) {
        const sizeMB = (parseInt(audioData.size) / 1024).toFixed(2);
        fileSize = ` (${sizeMB} MB)`;
        
        if (typeof onProgress === 'function') {
          onProgress(i, progress, { status: 'downloading', message: `下载中${fileSize}...` });
        }
      }
      
      // 下载文件
      try {
        if (typeof onProgress === 'function') {
          onProgress(i, progress, { status: 'downloading', message: `准备下载${fileSize}...` });
        }
        
        const audioResponse = await fetch(downloadUrl);
        const blob = await audioResponse.blob();
        
        // 创建下载链接
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.style.display = 'none';
        
        // 下载文件
        document.body.appendChild(link);
        link.click();
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
      } catch (fetchError) {
        logger.error('Fetch下载失败，尝试备用方法:', fetchError);
        
        // 备用下载方法
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', fileName);
        link.setAttribute('target', '_blank');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // 更新成功状态
      successCount++;
      
      if (typeof onTrackSuccess === 'function') {
        onTrackSuccess(track, i, { fileSize });
      }
      
      if (typeof onProgress === 'function') {
        onProgress(i, progress, { status: 'success', message: `下载成功${fileSize}` });
      }
      
      // 在处理之间添加延迟，避免浏览器拦截
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      logger.error(`下载歌曲 "${tracks[i].name}" 失败:`, error);
      
      if (typeof onTrackError === 'function') {
        onTrackError(tracks[i], i, error);
      }
      
      if (typeof onProgress === 'function') {
        onProgress(i, Math.floor((i / tracks.length) * 100), { status: 'error', message: '下载失败' });
      }
    }
  }
  
  // 完成下载
  if (typeof onProgress === 'function') {
    onProgress(tracks.length - 1, 100, { status: 'complete', message: '下载完成' });
  }
  
  if (typeof onFinish === 'function') {
    onFinish(successCount, tracks.length);
  }
  

  
  return {
    success: true,
    totalCount: tracks.length,
    successCount: successCount,
    quality: quality,
    qualityName: qualityName
  };
}; 

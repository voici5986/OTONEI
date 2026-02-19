import { useState, useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import logger from '../utils/logger.js';

const DEFAULT_COVER = '/default_cover.svg';

/**
 * 专辑封面图片获取 Hook
 * 封装封面加载、缓存查找和错误处理逻辑
 * 
 * @param {Object} track - 歌曲信息对象
 * @param {number} imgSize - 图片尺寸像素值
 * @param {boolean} lazy - 是否延迟加载
 * @param {boolean} forceFetch - 是否强制获取
 * @returns {Object} { imageUrl, isLoaded, forceLoadCover, handleImageError }
 */
const useAlbumCoverImage = (track, imgSize = 500, lazy = false, forceFetch = false) => {
  const { coverCache, fetchCover } = usePlayer();
  const [imageUrl, setImageUrl] = useState(DEFAULT_COVER);
  const [isLoaded, setIsLoaded] = useState(false);

  // 加载封面逻辑
  useEffect(() => {
    // 如果是延迟加载模式，且尚未强制加载，则使用默认封面
    if (lazy && !isLoaded) {
      setImageUrl(DEFAULT_COVER);
      return;
    }

    const loadCover = async () => {
      // 如果没有track或pic_id，使用默认封面
      if (!track || !track.pic_id) {
        setImageUrl(DEFAULT_COVER);
        return;
      }

      try {
        // 生成缓存键 - 使用下划线与PlayerContext保持一致
        const cacheKey = `${track.source}_${track.pic_id}_${imgSize}`;
        
        // 检查缓存（除非强制获取）
        if (!forceFetch && coverCache[cacheKey]) {
          setImageUrl(coverCache[cacheKey]);
          return;
        }
        
        // 尝试获取封面
        const coverUrl = await fetchCover(track.source, track.pic_id, imgSize);
        setImageUrl(coverUrl);
      } catch (error) {
        logger.error('[useAlbumCoverImage] 加载封面失败:', error);
        setImageUrl(DEFAULT_COVER);
      }
    };

    loadCover();
  }, [track, coverCache, fetchCover, imgSize, lazy, isLoaded, forceFetch]);

  // 错误处理
  const handleImageError = () => {
    logger.warn(`[useAlbumCoverImage] 封面加载失败: ${imageUrl}`);
    setImageUrl(DEFAULT_COVER);
  };

  // 强制加载封面（用于延迟加载模式）
  const forceLoadCover = async () => {
    if (lazy && !isLoaded && track && track.pic_id) {
      try {
        // 生成缓存键
        const cacheKey = `${track.source}_${track.pic_id}_${imgSize}`;
        
        // 检查缓存
        if (coverCache[cacheKey]) {
          setImageUrl(coverCache[cacheKey]);
          setIsLoaded(true);
          return;
        }
        
        // 获取封面
        const coverUrl = await fetchCover(track.source, track.pic_id, imgSize);
        setImageUrl(coverUrl);
        setIsLoaded(true);
      } catch (error) {
        logger.error('[useAlbumCoverImage] 强制加载封面失败:', error);
        setImageUrl(DEFAULT_COVER);
      }
    }
  };

  return { imageUrl, isLoaded, forceLoadCover, handleImageError };
};

export default useAlbumCoverImage;

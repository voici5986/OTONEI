import { useState, useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import logger from '../utils/logger.js';
import { getTrackCoverUrl } from '../utils/trackCover';
import type { Track, TrackId } from '../types';

const DEFAULT_COVER = '/default_cover.svg';

interface PlayerCoverContext {
  coverCache: Record<string, string>;
  fetchCover: (source: string | undefined, picId: TrackId, size?: number) => Promise<string>;
}

export interface UseAlbumCoverImageResult {
  imageUrl: string;
  isLoaded: boolean;
  forceLoadCover: () => Promise<void>;
  handleImageError: () => void;
}

/** 专辑封面图片获取 Hook。 */
const useAlbumCoverImage = (
  track: Track | null | undefined,
  imgSize = 500,
  lazy = false,
  forceFetch = false
): UseAlbumCoverImageResult => {
  const { coverCache, fetchCover } = usePlayer() as PlayerCoverContext;
  const [loadedCover, setLoadedCover] = useState<{ key: string; url: string } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const cacheKey = track?.pic_id ? `${track.source}_${track.pic_id}_${imgSize}` : '';
  const directCoverUrl = getTrackCoverUrl(track);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedImageUrl =
    lazy && !isLoaded
      ? DEFAULT_COVER
      : directCoverUrl ||
        (!forceFetch && coverCache[cacheKey]) ||
        (loadedCover?.key === cacheKey ? loadedCover.url : DEFAULT_COVER);
  const imageUrl = failedUrl === resolvedImageUrl ? DEFAULT_COVER : resolvedImageUrl;
  const setImageUrl = (url: string) => setLoadedCover({ key: cacheKey, url });

  useEffect(() => {
    if (
      (lazy && !isLoaded) ||
      directCoverUrl ||
      !track?.pic_id ||
      (!forceFetch && coverCache[cacheKey])
    )
      return;
    let active = true;
    void fetchCover(track.source, track.pic_id, imgSize)
      .then((url) => {
        if (active) setLoadedCover({ key: cacheKey, url });
      })
      .catch((error) => logger.error('[useAlbumCoverImage] 加载封面失败:', error));
    return () => {
      active = false;
    };
  }, [
    track,
    coverCache,
    fetchCover,
    imgSize,
    lazy,
    isLoaded,
    forceFetch,
    cacheKey,
    directCoverUrl,
  ]);

  const handleImageError = () => {
    logger.warn(`[useAlbumCoverImage] 封面加载失败: ${imageUrl}`);
    setFailedUrl(resolvedImageUrl);
  };

  const forceLoadCover = async (): Promise<void> => {
    if (!lazy || isLoaded || !track || !track.pic_id) return;

    try {
      const directCoverUrl = getTrackCoverUrl(track);
      if (directCoverUrl) {
        setImageUrl(directCoverUrl);
        setIsLoaded(true);
        return;
      }

      const cacheKey = `${track.source}_${track.pic_id}_${imgSize}`;
      if (coverCache[cacheKey]) {
        setImageUrl(coverCache[cacheKey]);
        setIsLoaded(true);
        return;
      }

      const coverUrl = await fetchCover(track.source, track.pic_id, imgSize);
      setImageUrl(coverUrl);
      setIsLoaded(true);
    } catch (error) {
      logger.error('[useAlbumCoverImage] 强制加载封面失败:', error);
      setImageUrl(DEFAULT_COVER);
    }
  };

  return { imageUrl, isLoaded, forceLoadCover, handleImageError };
};

export default useAlbumCoverImage;

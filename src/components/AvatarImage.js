import React, { useEffect, useMemo, useState } from 'react';
import { fetchAvatarDataUrl, getAvatarCache, setAvatarCache } from '../utils/avatarCache';

const AvatarImage = ({
  src,
  cacheKey,
  alt = 'Avatar',
  className,
  style,
  fallback = null
}) => {
  const [cachedSrc, setCachedSrc] = useState(null);
  const [currentSrc, setCurrentSrc] = useState(null);
  const [hasError, setHasError] = useState(false);

  const resolvedCacheKey = useMemo(() => cacheKey || null, [cacheKey]);

  useEffect(() => {
    if (!resolvedCacheKey) return;
    const cached = getAvatarCache(resolvedCacheKey);
    if (cached) {
      setCachedSrc(cached);
    }
  }, [resolvedCacheKey]);

  useEffect(() => {
    setHasError(false);
    if (src) {
      setCurrentSrc(src);
      return;
    }
    if (cachedSrc) {
      setCurrentSrc(cachedSrc);
      return;
    }
    setCurrentSrc(null);
  }, [src, cachedSrc]);

  const handleError = () => {
    if (cachedSrc && currentSrc !== cachedSrc) {
      setCurrentSrc(cachedSrc);
      return;
    }
    setHasError(true);
  };

  const handleLoad = async () => {
    if (!src || !resolvedCacheKey) return;
    if (currentSrc !== src) return;
    if (cachedSrc) return;
    const dataUrl = await fetchAvatarDataUrl(src);
    if (dataUrl) {
      setAvatarCache(resolvedCacheKey, dataUrl);
      setCachedSrc(dataUrl);
    }
  };

  if (!currentSrc || hasError) {
    return fallback;
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      onError={handleError}
      onLoad={handleLoad}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
    />
  );
};

export default AvatarImage;

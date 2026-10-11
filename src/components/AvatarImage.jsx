import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getMemoryCacheGeneration } from '../services/memoryCache';
import {
  fetchAvatarDataUrl,
  getAvatarCache,
  setAvatarCache,
  subscribeAvatarCache,
  getAvatarCacheVersion,
} from '../utils/avatarCache';

// A source/account change starts a fresh image lifecycle instead of resetting state in effects.
const AvatarImageContent = ({
  src,
  cacheKey,
  alt = 'Avatar',
  className,
  style,
  fallback = null,
}) => {
  const [cachedSrc, setCachedSrc] = useState(() => getAvatarCache(cacheKey));
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [hasError, setHasError] = useState(false);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const currentSrc = src && !primaryFailed ? src : cachedSrc;
  const handleError = () => {
    if (cachedSrc && currentSrc !== cachedSrc) {
      setPrimaryFailed(true);
      return;
    }
    setHasError(true);
  };

  const handleLoad = async () => {
    if (!src || !cacheKey || currentSrc !== src || cachedSrc) return;
    const generation = getMemoryCacheGeneration();
    const dataUrl = await fetchAvatarDataUrl(src);
    // A replaced image must not overwrite the account's cache with its old URL.
    if (!active.current || !dataUrl || generation !== getMemoryCacheGeneration()) return;
    setAvatarCache(cacheKey, dataUrl);
    setCachedSrc(dataUrl);
  };

  if (!currentSrc || hasError) return fallback;

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

const AvatarImage = (props) => {
  const version = useSyncExternalStore(
    subscribeAvatarCache,
    getAvatarCacheVersion,
    getAvatarCacheVersion
  );
  return (
    <AvatarImageContent key={JSON.stringify([props.src, props.cacheKey, version])} {...props} />
  );
};

export default AvatarImage;

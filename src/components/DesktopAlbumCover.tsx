import type { CSSProperties } from 'react';
import useAlbumCoverImage from '../hooks/useAlbumCoverImage';
import type { Track } from '../types';

export interface DesktopAlbumCoverProps {
  track: Track | null | undefined;
  size?: string | number;
  onClick?: () => void;
  className?: string;
  imgSize?: number;
  lazy?: boolean;
  forceFetch?: boolean;
}

const DesktopAlbumCover = ({
  track,
  size = 'small',
  onClick,
  className = '',
  imgSize = 300,
  lazy = false,
  forceFetch = false,
}: DesktopAlbumCoverProps) => {
  const { imageUrl, isLoaded, forceLoadCover, handleImageError } = useAlbumCoverImage(
    track,
    imgSize,
    lazy,
    forceFetch
  );

  const getStyles = (): CSSProperties => {
    if (size === 'small') return {};

    const dimension = typeof size === 'number' ? `${size}px` : size;
    return {
      width: dimension,
      height: dimension,
      objectFit: 'cover',
      backgroundColor: 'var(--card-hover-background)',
    };
  };

  const sizeClass = size === 'small' ? 'player-thumbnail rounded me-2' : 'rounded';

  const handleClick = () => {
    if (lazy && !isLoaded) void forceLoadCover();
    onClick?.();
  };

  const interactive = Boolean(onClick || (lazy && !isLoaded));
  const wrapperStyle: CSSProperties = {
    display: 'inline-block',
    cursor: interactive ? 'pointer' : 'default',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-alt)',
    borderRadius: 'var(--radius-sm)',
    ...(interactive
      ? {
          border: 0,
          padding: 0,
          font: 'inherit',
          color: 'inherit',
          background: 'var(--color-background-alt)',
        }
      : {}),
    ...getStyles(),
  };

  const image = (
    <img
      src={imageUrl}
      alt="当前播放"
      className="album-cover-image"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: 'inherit',
      }}
      onError={handleImageError}
      loading="lazy"
    />
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={`${className} ${sizeClass} album-cover-wrapper`}
        onClick={handleClick}
        style={wrapperStyle}
      >
        {image}
      </button>
    );
  }

  return (
    <div className={`${className} ${sizeClass} album-cover-wrapper`} style={wrapperStyle}>
      {image}
    </div>
  );
};

export default DesktopAlbumCover;

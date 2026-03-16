import React from 'react';
import useAlbumCoverImage from '../hooks/useAlbumCoverImage';

/**
 * 桌面端专辑封面组件
 * 简单的缩略图显示，无复杂动画
 *
 * @param {Object} props
 * @param {Object} props.track - 歌曲信息
 * @param {string|number} props.size - 尺寸 'small' | number
 * @param {Function} props.onClick - 点击处理
 * @param {string} props.className - 额外类名
 * @param {number} props.imgSize - 图片加载尺寸
 * @param {boolean} props.lazy - 是否懒加载
 * @param {boolean} props.forceFetch - 是否强制加载
 */
const DesktopAlbumCover = ({
  track,
  size = 'small',
  onClick,
  className = '',
  imgSize = 300,
  lazy = false,
  forceFetch = false,
}) => {
  const { imageUrl, isLoaded, forceLoadCover, handleImageError } = useAlbumCoverImage(
    track,
    imgSize,
    lazy,
    forceFetch
  );

  // 确定样式和尺寸
  const getStyles = () => {
    if (size === 'small') {
      return {};
    }

    return {
      width: typeof size === 'number' ? `${size}px` : size,
      height: typeof size === 'number' ? `${size}px` : size,
      objectFit: 'cover',
      backgroundColor: 'var(--card-hover-background)',
    };
  };

  // 样式类名
  const sizeClass = size === 'small' ? 'player-thumbnail rounded me-2' : 'rounded';

  const handleClick = () => {
    if (lazy && !isLoaded) {
      forceLoadCover();
    }
    if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`${className} ${sizeClass} album-cover-wrapper`}
      onClick={handleClick}
      style={{
        display: 'inline-block',
        cursor: (lazy && !isLoaded) || onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--color-background-alt)',
        borderRadius: 'var(--border-radius-sm)',
        ...getStyles(),
      }}
    >
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
    </div>
  );
};

export default DesktopAlbumCover;

import React from 'react';
import useAlbumCoverImage from '../hooks/useAlbumCoverImage';

/**
 * 移动端专辑封面组件
 * 包含"呼吸动画"和"大图模式"
 *
 * @param {Object} props
 * @param {Object} props.track - 歌曲信息
 * @param {string|number} props.size - 尺寸 'small' | 'large' | number
 * @param {boolean} props.isPlaying - 是否正在播放 (用于呼吸动画)
 * @param {Function} props.onClick - 点击处理
 * @param {string} props.className - 额外类名
 * @param {number} props.imgSize - 图片加载尺寸
 * @param {boolean} props.lazy - 是否懒加载
 * @param {boolean} props.forceFetch - 是否强制加载
 */
const MobileAlbumCover = ({
  track,
  size = 'small',
  isPlaying = false,
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
    if (size === 'small' || size === 'large') {
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
  let sizeClass =
    size === 'small'
      ? 'player-thumbnail rounded me-2'
      : size === 'large'
        ? 'album-cover-large'
        : 'rounded';

  // 添加呼吸动画类 (仅在大图模式且播放时)
  const animationClass = size === 'large' && isPlaying ? 'breathing-animation' : '';

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
      className={`${className} ${sizeClass} ${animationClass} album-cover-wrapper`}
      onClick={handleClick}
      style={{
        display: 'inline-block',
        cursor: (lazy && !isLoaded) || onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--color-background-alt)',
        borderRadius: size === 'small' ? 'var(--border-radius-sm)' : 'var(--border-radius-md)',
        ...getStyles(),
      }}
    >
      <img
        src={imageUrl}
        alt={size === 'small' ? '当前播放' : '专辑封面'}
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

export default MobileAlbumCover;

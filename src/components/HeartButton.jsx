import React, { useState } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useFavorites } from '../contexts/FavoritesContext';
import logger from '../utils/logger.js';

const HeartButton = ({ track, className = '', size = 'sm', onToggle }) => {
  const [isToggling, setIsToggling] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  // 判断当前歌曲是否已收藏
  const isFav = track && track.id && typeof isFavorite === 'function' ? isFavorite(track) : false;

  // 处理收藏/取消收藏
  const handleToggleFavorite = async () => {
    if (!track || !track.id || isToggling) return;

    setIsToggling(true);
    try {
      // 切换收藏状态
      const result = await toggleFavorite(track);

      // 如果收藏列表已满，显示提示
      if (result.error === 'favorites_limit') {
        toast.warning('收藏列表已满，请删除一些收藏后再试');
        return;
      }

      // 如果传入了回调函数，执行它
      if (onToggle) {
        onToggle(result.added);
      }
    } catch (error) {
      logger.error('Toggle favorite error:', error);
      toast.error('操作失败，请重试');
    } finally {
      setIsToggling(false);
    }
  };

  // 检查size是否为数字，用于图标尺寸
  const iconSize = typeof size === 'number' ? size : undefined;
  return (
    <button
      type="button"
      className={`ui-icon-button ${isFav ? 'is-active' : ''} ${isToggling ? 'is-busy' : ''} ${className}`.trim()}
      onClick={handleToggleFavorite}
      disabled={isToggling}
      title={isFav ? '取消收藏' : '收藏'}
      aria-label={isFav ? '取消收藏' : '收藏'}
    >
      {isFav ? <FaHeart size={iconSize} /> : <FaRegHeart size={iconSize} />}
    </button>
  );
};

export default HeartButton;

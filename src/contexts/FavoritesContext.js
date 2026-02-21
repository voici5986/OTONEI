import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFavorites, toggleFavorite as toggleFavoriteStorage } from '../services/storage';
import { useAuth } from './AuthContext';
import { useSync } from './SyncContext';
import { triggerDelayedSync } from '../services/syncService';
import logger from '../utils/logger.js';

// 创建Context
const FavoritesContext = createContext();

// 自定义Hook，用于在组件中访问FavoritesContext
export const useFavorites = () => useContext(FavoritesContext);

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentUser } = useAuth();
  const { updatePendingChanges } = useSync();

  // 初始化时加载收藏列表
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        setIsLoading(true);
        const favList = await getFavorites();
        setFavorites(favList);
      } catch (error) {
        logger.error('加载收藏列表失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFavorites();
  }, []);

  // 检查歌曲是否已收藏
  const isFavorite = useCallback((trackId) => {
    if (!trackId) return false;
    // 使用强制字符串比较，防止数字和字符串类型不匹配导致判断失效
    const idToSearch = String(trackId);
    return favorites.some(item => String(item.id) === idToSearch);
  }, [favorites]);

  // 切换收藏状态
  const toggleFavorite = useCallback(async (track) => {
    try {
      // 调用存储服务的toggleFavorite方法
      const result = await toggleFavoriteStorage(track);
      
      // 如果收藏列表已满，直接返回结果
      if (result.error === 'favorites_limit') {
        return result;
      }
      
      // 更新本地状态
      if (result.added) {
        // 添加到收藏列表开头
        setFavorites(prev => [{ ...track, modifiedAt: Date.now() }, ...prev]);
      } else {
        // 从收藏列表中移除
        setFavorites(prev => prev.filter(item => item.id !== track.id));
      }

      // 触发全局事件，通知其他页面刷新状态（如搜索、历史记录）
      window.dispatchEvent(new CustomEvent('favorites_changed', { 
        detail: { track, added: result.added } 
      }));
      
      // 如果已登录并添加了收藏，增加待同步计数，并触发延迟同步
      if (currentUser && !currentUser.isLocal && result.added) {
        try {
          const { incrementPendingChanges } = await import('../services/storage');
          // 增加收藏待同步计数
          await incrementPendingChanges('favorites');
          // 更新待同步项显示
          updatePendingChanges();
          // 触发30秒后的延迟同步
          triggerDelayedSync(currentUser.uid);
        } catch (error) {
          logger.error('更新待同步计数失败:', error);
        }
      }
      
      return result;
    } catch (error) {
      logger.error('切换收藏状态失败:', error);
      return { added: false, error: 'toggle_failed' };
    }
  }, [currentUser, updatePendingChanges]);

  // 提供Context值
  const contextValue = {
    favorites,
    isLoading,
    isFavorite,
    toggleFavorite
  };

  return (
    <FavoritesContext.Provider value={contextValue}>
      {children}
    </FavoritesContext.Provider>
  );
};


import { useState, useEffect, useCallback } from 'react';
import { getNetworkStatus, saveNetworkStatus } from '../services/storage';
import logger from '../utils/logger.js';

/**
 * 网络状态管理Hook
 * 
 * @param {Object} options 配置选项
 * @param {boolean} options.showToasts 是否显示网络状态变化的提示
 * @param {boolean} options.dispatchEvents 是否分发自定义事件
 * @returns {Object} 网络状态相关数据和方法
 */
export const useNetworkStatus = (options = {}) => {
  const {
    dispatchEvents = true
  } = options;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastChecked, setLastChecked] = useState(Date.now());
  const [connectionType, setConnectionType] = useState('unknown');

  // 发送网络状态变化的自定义事件
  const dispatchNetworkStatusChange = useCallback((online) => {
    if (!dispatchEvents) return;

    // 创建并分发自定义事件，带有网络状态信息
    const timestamp = Date.now();
    const event = new CustomEvent('networkStatusChange', {
      detail: { online, lastChecked: timestamp, connectionType }
    });
    window.dispatchEvent(event);
    setLastChecked(timestamp);
    logger.log(`[useNetworkStatus] 已分发网络状态变化事件: ${online ? '在线' : '离线'}`);
  }, [dispatchEvents, connectionType]);

  // 检测网络连接类型
  const detectConnectionType = useCallback(() => {
    if (!navigator.onLine) {
      setConnectionType('offline');
      return 'offline';
    }

    // 使用Network Information API（如果可用）
    if ('connection' in navigator) {
      const connection = navigator.connection;
      if (connection) {
        const type = connection.effectiveType || connection.type || 'unknown';
        const saveData = connection.saveData || false;

        let connectionQuality = 'unknown';

        // 根据effectiveType或type确定连接质量
        if (type === '4g' || type === 'wifi') {
          connectionQuality = 'fast';
        } else if (type === '3g') {
          connectionQuality = 'medium';
        } else if (type === '2g' || type === 'cellular') {
          connectionQuality = 'slow';
        } else if (saveData) {
          connectionQuality = 'saveData';
        }

        setConnectionType(connectionQuality);
        return connectionQuality;
      }
    }

    // 默认情况
    setConnectionType('unknown');
    return 'unknown';
  }, []);

  // 处理网络在线事件
  const handleOnline = useCallback(() => {
    logger.log('[useNetworkStatus] 网络已恢复连接');
    setIsOnline(true);

    // 检测连接类型
    const type = detectConnectionType();

    // 保存到本地存储
    const timestamp = Date.now();
    saveNetworkStatus({ online: true, lastChecked: timestamp, connectionType: type });
    setLastChecked(timestamp);

    // 分发网络状态变化事件
    dispatchNetworkStatusChange(true);

    // 不显示网络恢复提示
  }, [dispatchNetworkStatusChange, detectConnectionType]);

  // 处理网络离线事件
  const handleOffline = useCallback(() => {
    logger.log('[useNetworkStatus] 网络连接已断开');
    setIsOnline(false);
    setConnectionType('offline');

    // 保存到本地存储
    const timestamp = Date.now();
    saveNetworkStatus({ online: false, lastChecked: timestamp, connectionType: 'offline' });
    setLastChecked(timestamp);

    // 分发网络状态变化事件
    dispatchNetworkStatusChange(false);

    // 不显示网络断开提示
  }, [dispatchNetworkStatusChange]);

  // 手动检查网络状态
  const checkNetworkStatus = useCallback(async () => {
    try {
      const status = await getNetworkStatus();

      // 检测当前网络状态
      const online = navigator.onLine;
      const type = detectConnectionType();

      // 更新状态
      setIsOnline(online);
      setLastChecked(Date.now());

      // 如果状态与存储中的不同，则更新并分发事件
      if (status.online !== online || status.connectionType !== type) {
        const newStatus = { online, lastChecked: Date.now(), connectionType: type };
        saveNetworkStatus(newStatus);

        // 分发网络状态变化事件
        dispatchNetworkStatusChange(online);

        return newStatus;
      }

      return status;
    } catch (error) {
      logger.error('[useNetworkStatus] 获取网络状态失败:', error);
      const online = navigator.onLine;
      return { online, lastChecked: Date.now(), connectionType: online ? 'unknown' : 'offline' };
    }
  }, [dispatchNetworkStatusChange, detectConnectionType]);

  // 初始化网络状态并添加事件监听
  useEffect(() => {
    // 初始化时从存储中加载网络状态
    const initNetworkStatus = async () => {
      await checkNetworkStatus();
    };

    initNetworkStatus();

    // 添加浏览器网络事件监听
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 监听Network Information API的变化（如果可用）
    if ('connection' in navigator && navigator.connection) {
      navigator.connection.addEventListener('change', detectConnectionType);
    }

    // 组件卸载时清理
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if ('connection' in navigator && navigator.connection) {
        navigator.connection.removeEventListener('change', detectConnectionType);
      }
    };
  }, [handleOnline, handleOffline, checkNetworkStatus, detectConnectionType]);

  return {
    isOnline,
    lastChecked,
    connectionType,
    checkNetworkStatus,
    dispatchNetworkStatusChange
  };
};

export default useNetworkStatus; 
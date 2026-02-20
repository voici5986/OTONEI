import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getPendingSyncChanges, resetPendingChanges, getSyncStatus, saveSyncStatus } from '../services/storage';
import { getLastSyncTime, getLocalChangesSince, addSyncListener, removeSyncListener, SyncEvents } from '../services/syncService';
import logger from '../utils/logger.js';

// 创建同步上下文
const SyncContext = createContext();

// 导出自定义钩子以便组件使用
export const useSync = () => useContext(SyncContext);

export const SyncProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({ favorites: 0, history: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ 
    loading: false, 
    success: null, 
    message: '', 
    timestamp: null 
  });
  
  // 更新同步状态
  const updateSyncStatus = useCallback(async (newStatus) => {
    setSyncStatus(newStatus);
    if (currentUser && !currentUser.isLocal) {
      await saveSyncStatus(newStatus, currentUser.uid);
    }
  }, [currentUser]);
  
  // 开始同步
  const startSync = useCallback(() => {
    setIsSyncing(true);
    updateSyncStatus({
      loading: true,
      success: null,
      message: '正在同步...',
      timestamp: null
    });
  }, [updateSyncStatus]);
  
  // 更新待同步数据
  const updatePendingChanges = useCallback(async () => {
    if (!currentUser || currentUser.isLocal) return;
    
    try {
      // 获取上次同步时间
      const lastSync = await getLastSyncTime(currentUser.uid);
      
      // 获取本地变更数据
      const localChanges = await getLocalChangesSince(lastSync);
      
      // 获取待同步计数
      const pendingCounter = await getPendingSyncChanges();
      
      // 更新状态
      setPendingChanges({
        favorites: pendingCounter.favorites ?? localChanges.favorites.length,
        history: pendingCounter.history ?? localChanges.history.length
      });
    } catch (error) {
      logger.error('更新待同步数据失败:', error);
    }
  }, [currentUser]);
  
  // 同步完成后更新状态
  const handleSyncComplete = useCallback(async (success, message = null) => {
    const now = new Date();
    const newStatus = {
      loading: false,
      success: success,
      message: message || (success ? '同步完成' : '同步失败'),
      timestamp: now
    };
    
    await updateSyncStatus(newStatus);
    
    // 重置待同步计数器
    if (success) {
      await resetPendingChanges();
      setPendingChanges({ favorites: 0, history: 0 });
      
      // 更新最后同步时间
      const lastSync = await getLastSyncTime(currentUser.uid);
      if (lastSync) {
        setLastSyncTime(new Date(parseInt(lastSync)));
      }
    }
    
    // 关闭同步状态
    setIsSyncing(false);
  }, [currentUser, updateSyncStatus]);
  
  // 加载初始同步状态
  useEffect(() => {
    const loadSyncStatus = async () => {
      if (currentUser && !currentUser.isLocal) {
        try {
          // 获取上次同步时间
          const lastSync = await getLastSyncTime(currentUser.uid);
          if (lastSync) {
            setLastSyncTime(new Date(parseInt(lastSync)));
          }
          
          // 获取同步状态
          const status = await getSyncStatus(currentUser.uid);
          setSyncStatus(status);
          
          // 获取待同步数据
          const changes = await getPendingSyncChanges();
          if (changes) {
            setPendingChanges({
              favorites: changes.favorites,
              history: changes.history
            });
          }
        } catch (error) {
          logger.error('加载同步状态失败:', error);
        }
      }
    };
    
    loadSyncStatus();
  }, [currentUser]);
  
  // 监听同步事件
  useEffect(() => {
    // 当同步事件发生时更新UI
    const handleSyncStarted = (data) => {
      if (data && data.uid === currentUser?.uid) {
        startSync();
      }
    };
    
    const handleSyncCompleted = (data) => {
      if (data && data.uid === currentUser?.uid) {
        // 检查同步是否因数据未变化而跳过
        if (data.result && data.result.unchanged) {
          // 即使同步被跳过，也显示为同步成功，但使用不同的消息
          const message = data.result.reason || '同步成功：数据已是最新';
          handleSyncComplete(true, message);
        } else {
          handleSyncComplete(true, '同步完成');
        }
        // 刷新数据和待同步项
        updatePendingChanges();
        
        // 触发刷新事件，让组件可以刷新数据
        window.dispatchEvent(new CustomEvent('sync:data_refreshed'));
      }
    };
    
    const handleSyncFailed = (data) => {
      if (data && data.uid === currentUser?.uid) {
        const errorMessage = data.error || '同步失败';
        handleSyncComplete(false, errorMessage);
      }
    };
    
    // 添加事件监听
    if (currentUser && !currentUser.isLocal) {
      addSyncListener(SyncEvents.SYNC_STARTED, handleSyncStarted);
      addSyncListener(SyncEvents.SYNC_COMPLETED, handleSyncCompleted);
      addSyncListener(SyncEvents.SYNC_FAILED, handleSyncFailed);
    }
    
    // 移除事件监听
    return () => {
      if (currentUser && !currentUser.isLocal) {
        removeSyncListener(SyncEvents.SYNC_STARTED, handleSyncStarted);
        removeSyncListener(SyncEvents.SYNC_COMPLETED, handleSyncCompleted);
        removeSyncListener(SyncEvents.SYNC_FAILED, handleSyncFailed);
      }
    };
  }, [currentUser, startSync, handleSyncComplete, updatePendingChanges]);
  
  // 获取总待同步项数
  const getTotalPendingChanges = useCallback(() => {
    return pendingChanges.favorites + pendingChanges.history;
  }, [pendingChanges]);
  
  // 上下文值
  const contextValue = {
    lastSyncTime,
    pendingChanges,
    isSyncing,
    syncStatus,
    setIsSyncing,
    updateSyncStatus,
    startSync,
    handleSyncComplete,
    updatePendingChanges,
    getTotalPendingChanges
  };
  
  return (
    <SyncContext.Provider value={contextValue}>
      {children}
    </SyncContext.Provider>
  );
};

export default SyncProvider; 

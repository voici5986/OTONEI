import { useState, useEffect, useCallback } from 'react';
import { 
  isFirebaseAvailable as getFirebaseAvailability, 
  checkFirebaseAvailability 
} from '../services/firebase';
import useNetworkStatus from './useNetworkStatus';
import { toast } from 'react-toastify';
import logger from '../utils/logger';

/**
 * Firebase状态管理Hook
 * 
 * @param {Object} options 配置选项
 * @param {boolean} options.showToasts 是否显示Firebase状态变化的提示
 * @param {boolean} options.manualCheck 是否仅在手动调用时进行检测
 * @returns {Object} Firebase状态相关数据和方法
 */
const useFirebaseStatus = (options = {}) => {
  const { 
    showToasts = false, 
    manualCheck = false 
  } = options;
  
  // 获取网络状态
  const { isOnline } = useNetworkStatus({ showToasts: false });
  
  const [isAvailable, setIsAvailable] = useState(getFirebaseAvailability);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(Date.now());
  
  // 分发Firebase状态变化事件
  const dispatchFirebaseStatusChange = useCallback((available) => {
    const event = new CustomEvent('firebaseStatusChange', { 
      detail: { available, lastChecked: Date.now() } 
    });
    window.dispatchEvent(event);
    logger.log(`[useFirebaseStatus] 已分发Firebase状态变化事件: ${available ? '可用' : '不可用'}`);
  }, []);
  
  // 检查Firebase可用性
  const checkAvailability = useCallback(async (force = false) => {
    // 如果正在检查，直接返回当前状态
    if (isChecking && !force) {
      return isAvailable;
    }
    
    // 如果网络离线，Firebase必定不可用
    if (!isOnline) {
      logger.log("[useFirebaseStatus] 网络离线，Firebase不可用");
      setIsAvailable(false);
      setLastChecked(Date.now());
      return false;
    }
    
    setIsChecking(true);
    try {
      logger.log("[useFirebaseStatus] 开始检查Firebase可用性...");
      const available = await checkFirebaseAvailability();
      
      // 只有当状态有变化时才更新和通知
      if (available !== isAvailable) {
        logger.log(`[useFirebaseStatus] Firebase可用性变化: ${available ? '可用' : '不可用'}`);
        setIsAvailable(available);
        
        // 显示提示
        if (showToasts) {
          if (available) {
            toast.success('数据库连接已恢复');
          } else {
            toast.error('数据库连接已断开，部分功能可能受限');
          }
        }
        
        // 分发Firebase状态变化事件
        dispatchFirebaseStatusChange(available);
      } else {
        logger.log(`[useFirebaseStatus] Firebase可用性未变化: ${available ? '可用' : '不可用'}`);
      }
      
      const timestamp = Date.now();
      setLastChecked(timestamp);
      
      return available;
    } catch (error) {
      logger.error("[useFirebaseStatus] Firebase可用性检查失败:", error);
      
      // 检查失败时，假定不可用
      if (isAvailable) {
        setIsAvailable(false);
        
        // 显示提示
        if (showToasts) {
          toast.error('数据库连接出现问题，部分功能可能受限');
        }
        
        // 分发Firebase状态变化事件
        dispatchFirebaseStatusChange(false);
      }
      
      const timestamp = Date.now();
      setLastChecked(timestamp);
      
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [isOnline, isAvailable, isChecking, showToasts, dispatchFirebaseStatusChange]);
  
  // 网络状态变化时自动检查Firebase
  useEffect(() => {
    // 如果设置为手动检查，则不自动检查
    if (manualCheck) return;
    
    // 只有在网络状态变为在线时才检查
    if (isOnline) {
      // 网络恢复时，延迟一段时间再检查Firebase状态
      const timer = setTimeout(() => {
        checkAvailability();
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      // 网络离线时，Firebase必定不可用
      if (isAvailable) {
        setIsAvailable(false);
        setLastChecked(Date.now());
        
        // 显示提示
        if (showToasts) {
          toast.error('网络已断开，数据库连接不可用');
        }
        
        // 分发Firebase状态变化事件
        dispatchFirebaseStatusChange(false);
      }
    }
  }, [isOnline, isAvailable, checkAvailability, showToasts, manualCheck, dispatchFirebaseStatusChange]);
  
  // 组件挂载时执行一次检查
  useEffect(() => {
    if (!manualCheck) {
      checkAvailability();
    }
  }, [checkAvailability, manualCheck]);
  
  return {
    isAvailable,
    isChecking,
    lastChecked,
    checkAvailability
  };
};

export default useFirebaseStatus; 

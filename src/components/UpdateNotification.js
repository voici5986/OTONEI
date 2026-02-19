import React, { useState, useEffect } from 'react';
import { FaSync, FaTimes } from 'react-icons/fa';

/**
 * 应用更新通知组件
 * 当检测到应用有新版本时，提示用户刷新
 */
const UpdateNotification = ({ registration }) => {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  
  useEffect(() => {
    // 如果没有registration，则不需要显示更新通知
    if (!registration) return;
    
    // 检查是否有新的Service Worker等待安装
    const checkUpdate = () => {
      if (registration.waiting) {
        // 有新版本等待安装
        setShowUpdateToast(true);
      }
    };
    
    // 初始检查
    checkUpdate();
    
    // 监听新版本安装事件
    const handleUpdate = () => {
      if (registration.waiting) {
        setShowUpdateToast(true);
      }
    };
    
    // 监听onupdatefound事件
    registration.addEventListener('updatefound', handleUpdate);
    
    return () => {
      registration.removeEventListener('updatefound', handleUpdate);
    };
  }, [registration]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleControllerChange = () => {
      // 新的 Service Worker 接管后刷新页面
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);
  
  // 处理更新应用按钮点击
  const handleUpdateClick = () => {
    setShowUpdateToast(false);
    
    if (registration && registration.waiting) {
      // 发送消息给等待中的Service Worker，通知它接管并刷新页面
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // 控制权切换后由 controllerchange 触发刷新
    }
  };
  
  if (!showUpdateToast) {
    return null;
  }
  
  return (
    <div 
      style={{ 
        position: 'fixed', 
        bottom: '100px', 
        right: '20px', 
        zIndex: 'var(--z-index-modal)'
      }}
    >
      <div className="toast-custom toast-info-custom">
        <div className="toast-header-custom">
          <span>应用更新</span>
          <button 
            onClick={() => setShowUpdateToast(false)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0' }}
          >
            <FaTimes />
          </button>
        </div>
        <div className="toast-body-custom">
          <p className="mb-2">发现新版本！更新以获取最新功能和修复。</p>
          <div className="d-flex justify-content-end">
            <button 
              onClick={handleUpdateClick}
              className="d-flex align-items-center btn-primary-custom"
              style={{ 
                padding: '6px 16px', 
                fontSize: '0.85rem', 
                backgroundColor: 'var(--color-background)', 
                color: 'var(--color-primary)', 
                border: '1px solid var(--color-primary)' 
              }}
            >
              <FaSync className="me-1" />
              <span>立即更新</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification; 

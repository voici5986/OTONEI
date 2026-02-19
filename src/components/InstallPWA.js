import React, { useState, useEffect } from 'react';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { useDevice } from '../contexts/DeviceContext';
import logger from '../utils/logger.js';

/**
 * PWA安装提示组件
 * 当检测到用户未安装PWA时，显示安装提示
 */
const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallToast, setShowInstallToast] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  useDevice();
  
  // 检测是否为已安装的PWA
  useEffect(() => {
    // 通过显示模式检测是否为PWA
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      setIsInstalled(true);
    }
    
    // 防止重复显示安装提示
    const hasPromptedBefore = localStorage.getItem('pwaPromptDismissed');
    if (hasPromptedBefore && Date.now() - parseInt(hasPromptedBefore) < 7 * 24 * 60 * 60 * 1000) {
      // 如果在过去7天内已经提示过，不再显示
      return;
    }
    
    // 监听beforeinstallprompt事件
    const handler = (e) => {
      // 阻止Chrome自动显示安装提示
      e.preventDefault();
      // 保存事件，以便稍后触发
      setDeferredPrompt(e);
      // 显示自定义安装提示
      setTimeout(() => {
        setShowInstallToast(true);
      }, 3000); // 延迟3秒显示，避免打扰用户
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);
  
  // 应用安装状态变化监听
  useEffect(() => {
    const handleAppInstalled = () => {
      // 应用被安装时，隐藏提示
      setShowInstallToast(false);
      setDeferredPrompt(null);
      setIsInstalled(true);
      
      // 显示安装成功消息
      alert('OTONEI已成功安装！您可以从主屏幕启动应用。');
    };
    
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
  
  // 处理安装按钮点击
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      logger.log('无法安装，安装提示不可用');
      return;
    }
    
    // 显示安装提示
    deferredPrompt.prompt();
    
    // 等待用户响应
    const { outcome } = await deferredPrompt.userChoice;
    logger.log(`用户选择: ${outcome}`);
    
    // 无论结果如何，都清除保存的提示
    setDeferredPrompt(null);
    setShowInstallToast(false);
  };
  
  // 处理关闭提示
  const handleDismiss = () => {
    setShowInstallToast(false);
    // 记录用户关闭时间，避免频繁打扰
    localStorage.setItem('pwaPromptDismissed', Date.now().toString());
  };
  
  // 如果已安装或没有安装提示，不渲染任何内容
  if (isInstalled || !deferredPrompt) {
    return null;
  }

  if (!showInstallToast) {
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
      <div className="toast-custom">
        <div className="toast-header-custom">
          <span>安装 OTONEI</span>
          <button 
            onClick={handleDismiss}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0' }}
          >
            <FaTimes />
          </button>
        </div>
        <div className="toast-body-custom">
          <p className="mb-2">安装 OTONEI 到主屏幕，获得更好的使用体验和离线访问功能。</p>
          <div className="d-flex justify-content-end">
            <button 
              onClick={handleInstallClick}
              className="d-flex align-items-center btn-primary-custom"
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
            >
              <FaDownload className="me-1" />
              <span>立即安装</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPWA; 

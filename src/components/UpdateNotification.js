import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FaSync, FaTimes } from 'react-icons/fa';
import logger from '../utils/logger.js';

/**
 * 应用更新通知组件 (重构版 - 使用 vite-plugin-pwa)
 * 当检测到应用有新版本时，提示用户刷新
 */
const UpdateNotification = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      logger.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      logger.error('SW registration error', error);
    },
  });

  // 处理关闭提示
  const close = () => {
    setNeedRefresh(false);
  };

  // 如果不需要更新，不渲染任何内容
  if (!needRefresh) {
    return null;
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '20px', 
        zIndex: 'var(--z-index-modal)'
      }}
    >
      <div className="toast-custom">
        <div className="toast-header-custom">
          <span>发现新版本</span>
          <button 
            onClick={close}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0' }}
          >
            <FaTimes />
          </button>
        </div>
        <div className="toast-body-custom">
          <p className="mb-2">OTONEI 有新的更新可用。</p>
          <div className="d-flex justify-content-end">
            <button 
              onClick={() => updateServiceWorker(true)}
              className="d-flex align-items-center btn-primary-custom"
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
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

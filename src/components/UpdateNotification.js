import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FaSync, FaTimes } from 'react-icons/fa';
import logger from '../utils/logger.js';
import { useDevice } from '../contexts/DeviceContext';

/**
 * 应用更新通知组件 (重构版 - 使用 vite-plugin-pwa)
 * 当检测到应用有新版本时，提示用户刷新
 */
const UpdateNotification = () => {
  const { isMobile, isTablet } = useDevice();
  const isMobileModal = isMobile || isTablet;
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

  useEffect(() => {
    if (!needRefresh || !isMobileModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [needRefresh, isMobileModal]);

  // 如果不需要更新，不渲染任何内容
  if (!needRefresh) {
    return null;
  }

  // 移动端（手机和平板）使用居中遮罩弹窗 (Modal)
  if (isMobileModal) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 'var(--z-index-notification)',
          padding: '20px'
        }}
      >
        <div 
          className="toast-custom"
          style={{
            width: '100%',
            maxWidth: '320px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            animation: 'zoomIn 0.3s ease-out'
          }}
        >
          <div className="toast-header-custom" style={{ padding: '15px' }}>
            <span style={{ fontSize: '1.1rem' }}>发现新版本</span>
            <button 
              onClick={close}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '5px' }}
              aria-label="关闭"
            >
              <FaTimes />
            </button>
          </div>
          <div className="toast-body-custom" style={{ padding: '20px' }}>
            <p className="mb-4" style={{ fontSize: '1rem', lineHeight: '1.5' }}>
              OTONEI 有重要的更新可用。为了获得最佳体验，建议您立即更新。
            </p>
            <div className="d-grid">
              <button 
                onClick={() => updateServiceWorker(true)}
                className="d-flex align-items-center justify-content-center btn-primary-custom"
                style={{ 
                  padding: '12px', 
                  fontSize: '1rem',
                  width: '100%',
                  fontWeight: '600'
                }}
              >
                <FaSync className="me-2" />
                <span>立即更新</span>
              </button>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes zoomIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  // 桌面端保持原有右下角 Toast 样式
  return (
    <div 
      style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '20px', 
        zIndex: 'var(--z-index-notification)'
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

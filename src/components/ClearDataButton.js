import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { FaTrash, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { clearMemoryCache } from '../services/memoryCache';
import {
  clearHistory,
  clearSearchHistory,
  saveFavorites,
  resetPendingChanges
} from '../services/storage';
import { clearSyncTimestamp } from '../services/syncService';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger.js';

const ClearDataButton = ({ 
  onClick, 
  showAsMenuItem = false, 
  text = "清除数据", 
  icon = <FaTrash className="me-2" />,
  className = "",
  style = {},
  variant = "danger", // 'danger' or 'normal'
  children
}) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState({
    favorites: false,
    history: true,
    searchHistory: true,
    cache: true,
    syncTimestamp: true
  });

  const { currentUser } = useAuth();

  const handleClose = () => setShowModal(false);
  const handleShow = (e) => {
    if (e) e.stopPropagation();
    if (onClick) onClick();
    setShowModal(true);
  };

  const handleOptionChange = (option) => {
    setSelectedOptions({
      ...selectedOptions,
      [option]: !selectedOptions[option]
    });
  };

  const handleClearData = async () => {
    setLoading(true);
    try {
      const operations = [];

      // 清除收藏
      if (selectedOptions.favorites) {
        operations.push(saveFavorites([]));
      }

      // 清除历史记录
      if (selectedOptions.history) {
        operations.push(clearHistory());
      }

      // 清除搜索历史
      if (selectedOptions.searchHistory) {
        operations.push(clearSearchHistory());
      }

      // 清除缓存
      if (selectedOptions.cache) {
        operations.push(Promise.resolve(clearMemoryCache()));

        // 通知Service Worker清理缓存
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'CLEAN_CACHE'
          });
        }
      }

      // 清除同步时间戳
      if (selectedOptions.syncTimestamp) {
        const uid = currentUser ? currentUser.uid : null;
        operations.push(clearSyncTimestamp(uid));
      }

      // 重置待同步变更计数
      operations.push(resetPendingChanges());

      // 等待所有操作完成
      await Promise.all(operations);

      // 显示成功消息
      toast.success('本地数据已清除');

      // 触发自定义事件以通知其他组件刷新
      window.dispatchEvent(new CustomEvent('local:data_cleared'));

      // 关闭模态框
      handleClose();
    } catch (error) {
      logger.error('清除数据失败:', error);
      toast.error('清除数据时发生错误');
    } finally {
      setLoading(false);
    }
  };

  // 模态框渲染逻辑 (解耦遮罩和内容，使用 Portal 挂载到 body)
  const renderModal = () => {
    if (!showModal) return null;

    const modalContent = (
      <>
        {/* 背景遮罩 - 独立层 */}
        <div 
          className="modal-overlay-custom" 
          onClick={handleClose} 
          style={{ zIndex: 10000 }}
        />
        
        {/* 弹窗内容 - 独立层，确保不响应父级点击 */}
        <div 
          className="modal-container-wrapper-custom" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            pointerEvents: 'none' // 让容器本身不响应点击，只响应子元素
          }}
        >
          <div 
            className="modal-container-custom" 
            onClick={e => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }} // 恢复子元素的交互
          >
            <div className="modal-header-custom border-0 pb-0">
              <h5 className="modal-title-custom fw-bold">清除本地数据</h5>
              <button className="modal-close-custom" onClick={handleClose}>
                <FaTimes size={18} />
              </button>
            </div>
            <div className="modal-body-custom py-4">
              <p className="text-muted small mb-4">请选择要从当前设备移除的数据：</p>
              
              <div className="d-flex flex-column gap-2">
                {[
                  { id: 'clearFavorites', key: 'favorites', label: '收藏的歌曲' },
                  { id: 'clearHistory', key: 'history', label: '播放历史' },
                  { id: 'clearSearchHistory', key: 'searchHistory', label: '搜索历史' },
                  { id: 'clearCache', key: 'cache', label: '缓存数据 (封面、结果等)' },
                  { id: 'clearSyncTimestamp', key: 'syncTimestamp', label: '同步状态 (重置云端同步)' },
                ].map(option => (
                  <div 
                    key={option.id} 
                    className="form-check custom-checkbox-notion p-2 rounded d-flex align-items-center" 
                    style={{ 
                      transition: 'background 0.2s',
                      backgroundColor: 'var(--color-background-alt)',
                      marginBottom: '4px',
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input ms-0 me-3 mt-0"
                      id={option.id}
                      checked={selectedOptions[option.key]}
                      onChange={() => handleOptionChange(option.key)}
                      style={{ 
                        cursor: 'pointer',
                        width: '18px',
                        height: '18px',
                        flexShrink: 0
                      }}
                    />
                    <label className="form-check-label small mb-0 w-100" htmlFor={option.id} style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded" style={{ backgroundColor: 'rgba(231, 76, 60, 0.05)', border: '1px solid rgba(231, 76, 60, 0.1)' }}>
                <div className="d-flex align-items-start text-danger">
                  <div className="small fw-bold" style={{ whiteSpace: 'nowrap' }}>注意:</div>
                  <div className="ms-2 small">此操作无法撤销。清除后的本地数据将无法恢复。</div>
                </div>
              </div>
            </div>
            <div className="modal-footer-custom border-0 pt-0">
              <button className="minimal-action-btn" onClick={handleClose} style={{ padding: '8px 16px' }}>
                取消
              </button>
              <button 
                className="btn-danger-notion text-white border-0" 
                onClick={handleClearData}
                disabled={loading || !Object.values(selectedOptions).some(v => v)}
                style={{ 
                  padding: '8px 20px', 
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: 'var(--bs-danger)',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem'
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = '#d32f2f';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = 'var(--bs-danger)';
                  }
                }}
              >
                {loading ? <span className="spinner-custom" style={{ width: '1rem', height: '1rem' }}></span> : '确认清除'}
              </button>
            </div>
          </div>
        </div>
      </>
    );

    return ReactDOM.createPortal(modalContent, document.body);
  };

  // 如果提供了 children，则使用自定义触发器
  if (children) {
    return (
      <>
        {React.cloneElement(children, { onClick: handleShow })}
        {renderModal()}
      </>
    );
  }

  // 下拉菜单模式
  if (showAsMenuItem) {
    return (
      <>
        <div className={`dropdown-item ${variant === 'danger' ? 'danger' : ''} ${className}`} onClick={handleShow} style={style}>
          {icon} {text}
        </div>
        {renderModal()}
      </>
    );
  }

  // 默认按钮模式
  return (
    <>
      <button 
        className={`minimal-action-btn ${variant === 'danger' ? 'text-danger' : ''} d-flex align-items-center justify-content-center ${className}`}
        onClick={handleShow}
        style={{ 
          padding: '8px 16px', 
          borderRadius: '10px',
          backgroundColor: 'transparent',
          border: 'none',
          fontSize: '15px',
          fontWeight: '500',
          transition: 'background 0.15s ease, transform 0.12s ease',
          height: '40px',
          color: variant === 'danger' ? '#EB5757' : 'inherit',
          ...style
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-background-alt)';
          if (variant === 'danger') e.currentTarget.style.color = '#EB5757';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          if (variant === 'danger') e.currentTarget.style.color = '#EB5757';
        }}
      >
        {icon} {text}
      </button>
      {renderModal()}
    </>
  );
};

export default ClearDataButton; 
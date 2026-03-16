import React, { useState, useEffect } from 'react';
import UserProfile from '../components/UserProfile';
import AuthContainer from '../components/AuthContainer';
import ClearDataButton from '../components/ClearDataButton';
import { useAuth } from '../contexts/AuthContext';
import { getFavorites, getHistory } from '../services/storage';
import { FaHeart, FaHistory } from 'react-icons/fa';
import '../styles/User.mobile.css'; // 引入新的移动端优先样式
import '../styles/User.notion.css'; // 引入桌面端类 Notion 样式

const User = ({ onTabChange }) => {
  const { currentUser } = useAuth();
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);

  // 加载统计数据
  useEffect(() => {
    const loadCounts = async () => {
      const favorites = await getFavorites();
      const history = await getHistory();
      setFavoritesCount(favorites.length);
      setHistoryCount(history.length);
    };

    loadCounts();

    // 监听数据清除事件
    const handleDataCleared = () => {
      loadCounts();
    };

    window.addEventListener('local:data_cleared', handleDataCleared);

    return () => {
      window.removeEventListener('local:data_cleared', handleDataCleared);
    };
  }, []);

  // 处理登录/注册成功
  const handleAuthSuccess = () => {
    // 不需要做任何事情，因为User组件会自动根据currentUser的变化重新渲染
  };

  // 处理统计卡片点击
  const handleStatsCardClick = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  // 已登录状态下，显示用户资料
  if (currentUser) {
    return (
      <div className="user-page page-content-wrapper">
        <UserProfile onTabChange={onTabChange} />
      </div>
    );
  }

  // 未登录状态下，显示登录表单和统计卡片
  // 移动端视图：只显示登录表单
  // 桌面端视图：显示两栏布局
  return (
    <div className="user-page page-content-wrapper">
      {/* 桌面端布局 */}
      <div className="d-none d-lg-block">
        <div className="d-flex gap-4 align-items-stretch">
          {/* 左侧：登录/注册表单 */}
          <div className="flex-grow-1" style={{ maxWidth: '480px' }}>
            <AuthContainer onAuthSuccess={handleAuthSuccess} />
          </div>

          {/* 右侧：统计与设置 */}
          <div className="d-flex flex-column gap-3" style={{ width: '320px' }}>
            {/* 本地统计 */}
            <div className="stats-card-notion p-4 h-100 d-flex flex-column">
              <div className="mb-4">
                <h5
                  className="fw-bold mb-1"
                  style={{ color: 'var(--color-text-primary)', fontSize: '1.1rem' }}
                >
                  本地统计
                </h5>
                <p className="text-muted small mb-0">数据仅存储在当前设备</p>
              </div>

              <div className="d-flex flex-column gap-2 flex-grow-1">
                <div
                  className="stats-item-notion clickable"
                  onClick={() => handleStatsCardClick('favorites')}
                >
                  <div className="stats-icon-wrapper">
                    <FaHeart className="text-danger" size={16} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="stats-label-notion">我的收藏</div>
                  </div>
                  <div className="stats-value-notion">{favoritesCount}</div>
                </div>

                <div
                  className="stats-item-notion clickable"
                  onClick={() => handleStatsCardClick('history')}
                >
                  <div className="stats-icon-wrapper">
                    <FaHistory className="text-primary" size={16} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="stats-label-notion">播放历史</div>
                  </div>
                  <div className="stats-value-notion">{historyCount}</div>
                </div>
              </div>

              {/* 隐私与存储 - 移入统计卡片底部或单独放置 */}
              <div className="mt-auto pt-4 border-top">
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <span
                      className="fw-bold"
                      style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}
                    >
                      隐私与存储
                    </span>
                  </div>
                  <p
                    className="text-muted"
                    style={{ fontSize: '0.75rem', lineHeight: '1.4', marginBottom: '12px' }}
                  >
                    清除所有本地缓存、收藏和历史记录。此操作不可撤销。
                  </p>
                  <ClearDataButton
                    className="w-100"
                    style={{
                      justifyContent: 'center',
                      backgroundColor: 'var(--color-background-alt)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 移动端布局 */}
      <div className="d-block d-lg-none">
        <AuthContainer onAuthSuccess={handleAuthSuccess} />
      </div>
    </div>
  );
};

export default User;

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  getFavorites, 
  getHistory, 
  saveFavorites
} from '../services/storage';
import { 
  FaHeart, 
  FaHistory, 
  FaSignOutAlt, 
  FaCloud, 
  FaChevronRight, 
  FaDatabase, 
  FaChevronDown, 
  FaChevronUp,
  FaFileExport,
  FaFileImport,
  FaTimes
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useSync } from '../contexts/SyncContext';
import { initialSync } from '../services/syncService';
import { searchMusic } from '../services/musicApiService';
import ClearDataButton from './ClearDataButton';
import AvatarImage from './AvatarImage';
import '../styles/User.mobile.css';
import logger from '../utils/logger.js';

const UserProfile = ({ onTabChange }) => {
  const { currentUser, signOut } = useAuth();
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [syncCooldown, setSyncCooldown] = useState(false);
  
  const [showDataMgmt, setShowDataMgmt] = useState(false);

  // 导入导出相关状态
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importStatus, setImportStatus] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef(null);
  
  // 使用同步上下文
  const { 
    syncStatus, 
    startSync,
    handleSyncComplete,
    updatePendingChanges
  } = useSync();
  
  // 加载收藏和历史记录计数
  const loadCounts = useCallback(async () => {
    const favorites = await getFavorites();
    const history = await getHistory();
    setFavoritesCount(favorites.length);
    setHistoryCount(history.length);
  }, []);

  // 组件挂载时加载数据并监听相关事件
  useEffect(() => {
    const refreshData = () => {
      loadCounts();
      updatePendingChanges();
    };

    refreshData();
    
    // 监听同步刷新、收藏变化及本地数据清除事件
    const handleDataRefreshed = () => refreshData();
    const handleFavoritesChanged = () => refreshData();
    const handleDataCleared = () => {
      refreshData();
      toast.info('本地数据已更新');
    };
    
    window.addEventListener('sync:data_refreshed', handleDataRefreshed);
    window.addEventListener('favorites_changed', handleFavoritesChanged);
    window.addEventListener('local:data_cleared', handleDataCleared);
    
    return () => {
      window.removeEventListener('sync:data_refreshed', handleDataRefreshed);
      window.removeEventListener('favorites_changed', handleFavoritesChanged);
      window.removeEventListener('local:data_cleared', handleDataCleared);
    };
  }, [loadCounts, updatePendingChanges]);
  
  // 处理手动同步
  const handleManualSync = async () => {
    if (!currentUser) return;
    
    // 如果在冷却期，显示提示但不执行同步
    if (syncCooldown) {
      toast.info('请稍后再试，系统正在冷却中');
      return;
    }
    
    // 检查是否在短时间内（1分钟）已经同步过
    if (syncStatus.timestamp) {
      const lastSyncTime = new Date(syncStatus.timestamp).getTime();
      const now = Date.now();
      const timeDiff = now - lastSyncTime;
      
      // 如果在1分钟内已同步，提示并返回
      if (timeDiff < 60000) { // 60000毫秒 = 1分钟
        toast.info('刚刚已同步，无需再次同步');
        return;
      }
    }
    
    // 设置冷却状态
    setSyncCooldown(true);
    
    // 使用setTimeout在8秒后解除冷却状态
    setTimeout(() => {
      setSyncCooldown(false);
    }, 8000); // 8秒冷却期
    
    try {
      // 开始同步
      startSync();
      
      // 执行同步
      const result = await initialSync(currentUser.uid);
      
      // 处理同步结果（事件监听器将会自动更新UI）
      if (!result.success) {
        toast.error(`同步失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      logger.error('手动同步失败:', error);
      handleSyncComplete(false, `同步错误: ${error.message}`);
      toast.error(`同步错误: ${error.message}`);
    }
  };
  
  // 处理退出登录
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      logger.error('退出登录失败:', error);
    }
  };
  
  // 处理收藏和历史记录点击
// 处理统计卡片点击
  const handleStatsCardClick = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  // --- 导入导出逻辑开始 ---
  
  const searchTrack = async (trackInfo, source) => {
    try {
      const searchWithKeyword = async (keyword, source) => {
        try {
          const results = await searchMusic(keyword, source, 15, 1);
          return { data: results };
        } catch (error) {
          logger.error(`搜索 "${keyword}" 在 ${source} 失败:`, error);
          return null;
        }
      };

      let response = await searchWithKeyword(trackInfo.name, source);
      if (!response || !response.data || response.data.length === 0) {
        const simplifiedName = trackInfo.name.replace(/[^\w\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '');
        if (simplifiedName !== trackInfo.name) {
          response = await searchWithKeyword(simplifiedName, source);
        }
      }
      if (!response || !response.data || response.data.length === 0) {
        const nameFirst = trackInfo.name.split(' ')[0];
        if (nameFirst && nameFirst !== trackInfo.name && nameFirst.length > 1) {
          response = await searchWithKeyword(nameFirst, source);
        }
      }
      if (!response || !response.data || response.data.length === 0) {
        const shortQuery = `${trackInfo.artist} ${trackInfo.name.substring(0, 5)}`;
        response = await searchWithKeyword(shortQuery, source);
      }

      if (!response || !response.data || response.data.length === 0) return null;

      if (trackInfo.id) {
        const idMatch = response.data.find(item => item.id === trackInfo.id);
        if (idMatch) return idMatch;
      }
      if (trackInfo.url) {
        const urlMatch = response.data.find(item => item.url === trackInfo.url);
        if (urlMatch) return urlMatch;
      }
      const exactMatch = response.data.find(item =>
        item.name.toLowerCase() === trackInfo.name.toLowerCase() &&
        item.artist.toLowerCase() === trackInfo.artist.toLowerCase()
      );
      if (exactMatch) return exactMatch;

      const nameMatches = response.data.filter(item =>
        item.name.toLowerCase() === trackInfo.name.toLowerCase()
      );
      if (nameMatches.length > 0) return nameMatches[0];

      const partialMatch = response.data.find(item =>
        item.name.toLowerCase().includes(trackInfo.name.toLowerCase()) ||
        trackInfo.name.toLowerCase().includes(item.name.toLowerCase())
      );
      if (partialMatch) return partialMatch;

      return response.data[0];
    } catch (error) {
      logger.error(`在 ${source} 搜索 "${trackInfo.name}" 时发生错误:`, error);
      return null;
    }
  };

  const handleExport = async () => {
    try {
      const favorites = await getFavorites();
      if (favorites.length === 0) {
        toast.info('没有收藏可以导出');
        return;
      }

      const exportData = {
        version: '1.1',
        timestamp: Date.now(),
        favorites: favorites.map(item => ({
          name: item.name,
          artist: item.artist,
          album: item.album,
          source: item.source,
          id: item.id,
          pic_id: item.pic_id,
          lyric_id: item.lyric_id,
          url: item.url,
          play_url: item.play_url,
          duration: item.duration,
          picUrl: item.picUrl,
          alia: item.alia,
          mark: item.mark,
          tns: item.tns,
          ar: item.ar,
          al: item.al,
        }))
      };

      const jsonData = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `music_favorites_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      toast.success('收藏导出成功');
    } catch (error) {
      logger.error('导出失败:', error);
      toast.error('导出失败，请重试');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.favorites || !Array.isArray(data.favorites)) {
          throw new Error('无效的文件格式');
        }
        setImportData(data);
        setShowImportModal(true);
        setImportStatus(data.favorites.map(() => ({ status: 'pending', message: '等待导入' })));
        toast.info(`找到 ${data.favorites.length} 首歌曲`);
      } catch (error) {
        logger.error('读取文件失败:', error);
        toast.error('无法读取文件或格式不正确');
      }
    };
    reader.readAsText(file);
  };

  const startImport = async () => {
    if (!importData || !importData.favorites || isImporting) return;
    setIsImporting(true);

    const currentFavorites = await getFavorites();
    const newFavorites = [...currentFavorites];
    const newStatus = [...importStatus];
    let importedCount = 0;

    for (let i = 0; i < importData.favorites.length; i++) {
      const track = importData.favorites[i];
      setImportProgress(Math.floor((i / importData.favorites.length) * 100));

      try {
        const existingByIdIndex = currentFavorites.findIndex(item =>
          item.id === track.id && item.source === track.source
        );
        if (existingByIdIndex >= 0) {
          newStatus[i] = { status: 'exists', message: '已存在' };
          setImportStatus([...newStatus]);
          continue;
        }

        const existingByNameIndex = currentFavorites.findIndex(item =>
          item.name === track.name && item.artist === track.artist
        );
        if (existingByNameIndex >= 0) {
          newStatus[i] = { status: 'exists', message: '已存在' };
          setImportStatus([...newStatus]);
          continue;
        }

        newStatus[i] = { status: 'pending', message: '匹配中...' };
        setImportStatus([...newStatus]);

        let matchedTrack = await searchTrack(track, track.source);
        if (!matchedTrack) {
          const sources = ['netease', 'ytmusic'];
          for (const source of sources) {
            if (source !== track.source) {
              matchedTrack = await searchTrack(track, source);
              if (matchedTrack) break;
            }
          }
        }

        if (matchedTrack) {
          const isDuplicate = newFavorites.some(item =>
            item.id === matchedTrack.id && item.source === matchedTrack.source
          );
          if (!isDuplicate) {
            newFavorites.unshift(matchedTrack);
            importedCount++;
            newStatus[i] = { status: 'success', message: `匹配: ${matchedTrack.source}` };
          } else {
            newStatus[i] = { status: 'duplicate', message: '重复' };
          }
        } else {
          newStatus[i] = { status: 'fail', message: '未找到' };
        }
      } catch {
        newStatus[i] = { status: 'error', message: '出错' };
      }
      setImportStatus([...newStatus]);
      if (importedCount > 0) await saveFavorites(newFavorites);
    }

    if (importedCount > 0) {
      await saveFavorites(newFavorites);
      loadCounts();
      window.dispatchEvent(new Event('favorites_changed'));
      toast.success(`成功导入 ${importedCount} 首歌曲`);
    } else {
      toast.info('没有新增歌曲');
    }
    setImportProgress(100);
    setIsImporting(false);
  };

  const handleCloseImport = () => {
    setShowImportModal(false);
    setImportData(null);
    setImportStatus([]);
    setImportProgress(0);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- 导入导出逻辑结束 ---

  if (!currentUser) {
    return null;
  }
  
  const userInitial = currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 
                     (currentUser.email ? currentUser.email[0].toUpperCase() : '?');
  
  // 格式化时间
  const formatTime = (date) => {
    if (!date) return '';
    if (typeof date === 'string') {
      date = new Date(date);
    }
    return date.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 获取同步状态文本
  const getSyncStatusText = () => {
    if (syncStatus.loading) return '正在同步...';
    if (syncStatus.success === true) return `上次同步 ${formatTime(syncStatus.timestamp)}`;
    if (syncStatus.success === false) return '同步失败';
    return '未同步';
  };
  
  return (
    <div>
      {/* 1. 用户信息头部 */}
      <div className="user-header">
        <div className="avatar-rect">
          <AvatarImage
            src={currentUser?.photoURL || null}
            cacheKey={currentUser?.uid || currentUser?.email || 'guest'}
            alt="Avatar"
            className="avatar-image"
            fallback={userInitial}
          />
        </div>
        <h3 className="user-name-large">{currentUser.displayName || '用户'}</h3>
        <p className="user-email-text">{currentUser.email}</p>
      </div>
      
      {/* 2. 功能卡片列表 */}
      <div className="card-list">
        {/* 收藏卡片 */}
        <div 
          className="long-card" 
          onClick={() => handleStatsCardClick('favorites')}
        >
          <div className="card-icon" style={{ color: '#EB5757' }}>
              <FaHeart />
            </div>
          <div className="card-label">收藏</div>
          <div className="card-number">{favoritesCount}</div>
          <div className="card-arrow">
            <FaChevronRight />
          </div>
        </div>

        {/* 历史卡片 */}
        <div 
          className="long-card" 
          onClick={() => handleStatsCardClick('history')}
        >
          <div className="card-icon" style={{ color: '#787774' }}>
            <FaHistory />
          </div>
          <div className="card-label">历史</div>
          <div className="card-number">{historyCount}</div>
          <div className="card-arrow">
            <FaChevronRight />
          </div>
        </div>

        {/* 云端同步 */}
        <div className="long-card" onClick={handleManualSync}>
          <div className="card-icon" style={{ color: '#4A90E2' }}>
            <FaCloud />
          </div>
          <div className="card-label">多端数据同步</div>
          <div className="card-number" style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>
             {syncStatus.loading ? (
                <span className="spinner-custom" style={{ width: '1rem', height: '1rem' }}></span>
             ) : (
                getSyncStatusText().replace('上次同步 ', '')
             )}
          </div>
          <div className="card-arrow">
            <FaChevronRight />
          </div>
        </div>

        {/* 数据管理下拉 */}
        <div className="data-mgmt-container">
          <div 
            className={`long-card ${showDataMgmt ? 'active' : ''}`} 
            onClick={() => setShowDataMgmt(!showDataMgmt)}
          >
            <div className="card-icon" style={{ color: 'var(--color-text-muted)' }}>
              <FaDatabase />
            </div>
            <div className="card-label">数据管理</div>
            <div className="card-arrow">
              {showDataMgmt ? <FaChevronUp /> : <FaChevronDown />}
            </div>
          </div>
          
          {showDataMgmt && (
            <div className="data-mgmt-dropdown">
              <div className="dropdown-item" onClick={handleExport}>
                <FaFileExport className="me-2" /> 导出收藏数据
              </div>
              <div className="dropdown-item" onClick={() => fileInputRef.current.click()}>
                <FaFileImport className="me-2" /> 导入收藏数据
              </div>
              <div className="dropdown-item p-0">
                <ClearDataButton showAsMenuItem={true} text="清除本地数据" />
              </div>
              <div className="dropdown-item logout" onClick={handleLogout}>
                <FaSignOutAlt className="me-2" /> 退出登录
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 导入功能所需组件 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json"
        onChange={handleFileSelect}
      />

      {showImportModal && (
        <div className="modal-overlay-custom" onClick={handleCloseImport} style={{ zIndex: 2000 }}>
          <div className="modal-container-custom" style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h5 className="modal-title-custom">导入收藏</h5>
              <button className="modal-close-custom" onClick={handleCloseImport}>
                <FaTimes size={18} />
              </button>
            </div>
            <div className="modal-body-custom">
              {importData && (
                <>
                  <div className="alert-custom alert-info-custom mb-3" style={{ 
                    padding: '12px', 
                    borderRadius: 'var(--border-radius-md)', 
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    border: '1px solid rgba(52, 152, 219, 0.2)',
                    fontSize: '0.9rem'
                  }}>
                    <div className="fw-bold mb-1">检测到 {importData.favorites.length} 首歌曲</div>
                    <div className="text-muted small">导出时间: {new Date(importData.timestamp).toLocaleString()}</div>
                  </div>

                  <div className="progress-custom mb-3" style={{ height: '8px', backgroundColor: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      className="progress-bar-custom" 
                      style={{ 
                        width: `${importProgress}%`,
                        height: '100%',
                        backgroundColor: 'var(--color-primary)',
                        transition: 'width 0.3s ease'
                      }}
                    >
                    </div>
                  </div>
                  <div className="text-end small text-muted mb-3">{importProgress}%</div>

                  <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '10px', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--color-border)' }}>
                    {importData.favorites.slice(0, 100).map((track, index) => {
                      const status = importStatus[index] || { status: 'pending', message: '等待' };
                      let statusColor = 'text-muted';
                      if (status.status === 'success') statusColor = 'text-success';
                      else if (status.status === 'exists') statusColor = 'text-info';
                      else if (status.status === 'fail') statusColor = 'text-danger';

                      return (
                        <div key={index} className={`d-flex align-items-center mb-1 small ${statusColor}`} style={{ fontSize: '0.8rem' }}>
                          <span className="text-truncate" style={{ maxWidth: '70%' }}>{track.name} - {track.artist}</span>
                          <span className="ms-auto flex-shrink-0 opacity-75">{status.message}</span>
                        </div>
                      );
                    })}
                    {importData.favorites.length > 100 && <div className="text-center text-muted small mt-2">... 以及更多 {importData.favorites.length - 100} 首歌曲</div>}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer-custom">
              <button 
                className="minimal-action-btn" 
                onClick={handleCloseImport} 
                disabled={isImporting}
                style={{ borderRadius: 'var(--border-radius)', padding: '6px 16px' }}
              >
                取消
              </button>
              <button
                className="btn-primary-custom ms-2"
                onClick={startImport}
                disabled={!importData || isImporting}
                style={{ borderRadius: 'var(--border-radius)', padding: '6px 20px' }}
              >
                {isImporting ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="version">OTONEI v{process.env.VITE_APP_VERSION}</div>
    </div>
  );
};

export default UserProfile; 

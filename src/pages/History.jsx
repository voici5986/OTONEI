import { subscribeStorageChanges } from '../services/storage';
import PageStatus from '../components/PageStatus';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getHistoryStrict } from '../services/storage';
import { toast } from 'react-toastify';
import MusicCardActions from '../components/MusicCardActions';
import './History.css';
import { useDownload } from '../contexts/DownloadContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger.js';
import { getTrackKey } from '../utils/trackIdentity';
import { getTrackArtist } from '../utils/trackFormatter';

const getHistoryTrack = (item) => item?.song || item;
const getHistoryTimestamp = (item) => item?.timestamp || 0;

const HistoryContent = ({ globalSearchQuery, onTabChange, onClearSearch }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { handleDownload, isTrackDownloading } = useDownload();

  const performSearch = (query, currentHistory) => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return currentHistory;
    }

    const filtered = currentHistory.filter((item) => {
      const song = getHistoryTrack(item);
      const nameMatch = song.name && song.name.toLowerCase().includes(trimmedQuery);
      const albumName =
        typeof song.album === 'string'
          ? song.album
          : song.album && typeof song.album === 'object'
            ? song.album.name || ''
            : '';
      const albumMatch = albumName.toLowerCase().includes(trimmedQuery);

      let artistMatch = false;
      if (typeof song.artist === 'string') {
        artistMatch = song.artist.toLowerCase().includes(trimmedQuery);
      } else if (Array.isArray(song.artists)) {
        artistMatch = song.artists.some((a) =>
          (typeof a === 'string' ? a : a?.name || '').toLowerCase().includes(trimmedQuery)
        );
      }

      return nameMatch || albumMatch || artistMatch;
    });
    return filtered;
  };

  const filteredHistory = useMemo(
    () => performSearch(globalSearchQuery || '', history),
    [globalSearchQuery, history]
  );

  // 从PlayerContext获取状态和方法
  const { handlePlay, currentTrack } = usePlayer();

  // 从AuthContext获取用户状态
  const { currentUser } = useAuth();
  const activeUserIdRef = useRef(currentUser?.uid);
  useEffect(() => {
    activeUserIdRef.current = currentUser?.uid;
  }, [currentUser?.uid]);

  // 添加单独的播放处理函数
  const handleTrackPlay = (track) => {
    logger.log('从历史记录播放曲目:', track.id, track.name);
    // 创建纯歌曲列表作为播放列表
    const songsList = filteredHistory.map(getHistoryTrack);
    const trackIndex = songsList.findIndex((item) => getTrackKey(item) === getTrackKey(track));
    handlePlay(track, trackIndex >= 0 ? trackIndex : -1, songsList);
  };

  // 定义loadHistory函数在useEffect之前
  const loadHistory = useCallback(async () => {
    const requestedUserId = currentUser?.uid;
    setLoading(true);
    setLoadError(false);
    try {
      const historyItems = await getHistoryStrict(requestedUserId);
      if (activeUserIdRef.current !== requestedUserId) return;
      setHistory(historyItems);
    } catch (error) {
      if (activeUserIdRef.current !== requestedUserId) return;
      setLoadError(true);
      logger.error('加载历史记录失败:', error);
      toast.error('加载历史记录失败，请重试', { icon: '⚠️' });
    } finally {
      if (activeUserIdRef.current === requestedUserId) setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    void Promise.resolve().then(loadHistory);
  }, [loadHistory, currentUser?.uid]);

  useEffect(() => {
    const handleHistoryChanged = () => {
      loadHistory();
    };
    const handleLocalDataCleared = (event) => {
      if (event.detail?.history) {
        loadHistory();
      }
    };

    window.addEventListener('local:data_cleared', handleLocalDataCleared);
    window.addEventListener('sync:data_refreshed', handleHistoryChanged);
    const unsubscribe = subscribeStorageChanges((event) => {
      const scope = currentUser?.uid ? `user:${currentUser.uid}` : 'guest';
      if (event.type === 'history' && event.scope === scope) void loadHistory();
    });

    return () => {
      window.removeEventListener('local:data_cleared', handleLocalDataCleared);
      window.removeEventListener('sync:data_refreshed', handleHistoryChanged);
      unsubscribe();
    };
  }, [loadHistory, currentUser?.uid]);

  const formatCompactTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day}  ${hours}:${minutes}`;
  };

  // 渲染登录提醒组件
  const renderLoginReminder = () => {
    if (!currentUser) {
      return (
        <button
          type="button"
          className="login-prompt-container"
          onClick={() => onTabChange('user')}
        >
          <p className="login-prompt-desc">立即登录，在任何设备继续音乐旅程</p>
        </button>
      );
    }
    return null;
  };

  return (
    <div className="history-page page-content-wrapper">
      {/* 移除标题栏，功能已迁移至账号页 */}

      {/* 添加登录提醒 */}
      {renderLoginReminder()}

      {loading ? (
        <PageStatus busy title="正在加载历史记录" />
      ) : loadError ? (
        <PageStatus
          error
          title="加载历史记录失败"
          description="请稍后重试。"
          action="重新加载"
          onAction={loadHistory}
        />
      ) : history.length === 0 ? (
        <PageStatus
          title="还没有历史记录"
          description="播放歌曲后，你听过的音乐会显示在这里。"
          action="去搜索音乐"
          onAction={() => onTabChange('home')}
        />
      ) : filteredHistory.length === 0 ? (
        <PageStatus
          title="没有匹配的历史记录"
          description="试试其他关键词，或清除搜索查看全部。"
          action="清除筛选"
          onAction={onClearSearch}
        />
      ) : (
        <div className="history-grid row g-3">
          {filteredHistory.map((item) => {
            const track = getHistoryTrack(item);
            return (
              <div key={getTrackKey(track)} className="col-12 col-md-6">
                <div
                  className={`music-card ${currentTrack && getTrackKey(currentTrack) === getTrackKey(track) ? 'is-active' : ''}`}
                  onClick={() => handleTrackPlay(track)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleTrackPlay(track);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`播放 ${track.name} - ${getTrackArtist(track) || '未知歌手'}`}
                  aria-current={
                    currentTrack && getTrackKey(currentTrack) === getTrackKey(track)
                      ? 'true'
                      : undefined
                  }
                >
                  <div className="music-card-row">
                    <div className="music-card-info">
                      <div className="d-flex align-items-center">
                        <h6 className="mb-0 text-truncate">{track.name}</h6>
                        <span className="ms-2 badge-time">
                          {formatCompactTimestamp(getHistoryTimestamp(item))}
                        </span>
                      </div>
                      <small className="text-truncate">{getTrackArtist(track) || '未知歌手'}</small>
                    </div>

                    <MusicCardActions
                      track={track}
                      isDownloading={isTrackDownloading(track)}
                      onDownload={handleDownload}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const History = (props) => {
  const { currentUser } = useAuth();
  return <HistoryContent key={currentUser?.uid || 'guest'} {...props} />;
};
export default History;

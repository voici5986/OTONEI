import React, { useState, useEffect } from 'react';
import { getHistory } from '../services/storage';
import { toast } from 'react-toastify';
import moment from 'moment';
import 'moment/locale/zh-cn';
import MusicCardActions from '../components/MusicCardActions';
import './History.css';
import { downloadTrack } from '../services/downloadService';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger.js';

// 设置moment为中文
moment.locale('zh-cn');

const History = ({ globalSearchQuery, onTabChange }) => {
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [currentDownloadingTrack, setCurrentDownloadingTrack] = useState(null);

  // 监听全局搜索
  useEffect(() => {
    if (globalSearchQuery !== undefined) {
      performSearch(globalSearchQuery, history);
    }
  }, [globalSearchQuery, history]);

  const performSearch = (query, currentHistory) => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      setFilteredHistory(currentHistory);
      return;
    }

    const filtered = currentHistory.filter(item => {
      const song = item.song;
      const nameMatch = song.name && song.name.toLowerCase().includes(trimmedQuery);
      const albumMatch = song.album && song.album.toLowerCase().includes(trimmedQuery);
      
      let artistMatch = false;
      if (typeof song.artist === 'string') {
        artistMatch = song.artist.toLowerCase().includes(trimmedQuery);
      } else if (Array.isArray(song.artists)) {
        artistMatch = song.artists.some(a => 
          (typeof a === 'string' ? a : a.name).toLowerCase().includes(trimmedQuery)
        );
      }
      
      return nameMatch || albumMatch || artistMatch;
    });
    setFilteredHistory(filtered);
  };
  
  // 从PlayerContext获取状态和方法
  const { handlePlay, currentTrack } = usePlayer();
  
  // 从AuthContext获取用户状态
  const { currentUser } = useAuth();

  // 添加单独的播放处理函数
  const handleTrackPlay = (track) => {
    logger.log('从历史记录播放曲目:', track.id, track.name);
    // 创建纯歌曲列表作为播放列表
    const songsList = filteredHistory.map(item => item.song);
    const trackIndex = songsList.findIndex(item => item.id === track.id);
    handlePlay(track, trackIndex >= 0 ? trackIndex : -1, songsList);
  };

  // 定义loadHistory函数在useEffect之前
  const loadHistory = async () => {
    setLoading(true);
    try {
      const historyItems = await getHistory();
      setHistory(historyItems);
      setFilteredHistory(historyItems);
    } catch (error) {
      logger.error('加载历史记录失败:', error);
      toast.error('加载历史记录失败，请重试', { icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // 监听收藏状态变化，同步更新历史记录中的心形图标
  useEffect(() => {
    const handleFavoritesChanged = () => {
      setHistory(prev => [...prev]);
    };

    window.addEventListener('favorites_changed', handleFavoritesChanged);
    return () => window.removeEventListener('favorites_changed', handleFavoritesChanged);
  }, []);

  const formatCompactTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return moment(date).format('MM-DD  HH:mm');
  };

  // 处理下载功能
  const handleDownload = async (track) => {
    try {
      // 使用下载服务模块处理下载
      setDownloading(true);
      setCurrentDownloadingTrack(track);
      
      await downloadTrack(
        track, 
        999, // 使用无损音质
        null, // 下载开始回调
        () => {
          // 下载结束回调
          setDownloading(false);
          setCurrentDownloadingTrack(null);
        }
      );
    } catch (error) {
      logger.error('Download error:', error);
      toast.error('下载失败，请稍后重试', {
        icon: '❌',
        duration: 3000
      });
      setDownloading(false);
      setCurrentDownloadingTrack(null);
    }
  };

  // 渲染登录提醒组件
  const renderLoginReminder = () => {
    if (!currentUser) {
      return (
        <div 
          className="login-prompt-container" 
          onClick={() => onTabChange('user')}
        >
          <p className="login-prompt-desc">立即登录，在任何设备继续音乐旅程</p>
        </div>
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
        <div className="text-center my-5">
          <span className="spinner-custom"></span>
        </div>
      ) : history.length === 0 ? null : filteredHistory.length === 0 ? (
        <div className="alert-light text-center py-4 rounded" style={{ backgroundColor: 'var(--color-background-alt)', border: '1px solid var(--color-border)' }}>
          没有匹配的历史记录
        </div>
      ) : (
        <div className="history-grid row g-3">
          {filteredHistory.map((item, index) => {
            const track = item.song;
            return (
              <div key={`${track.id}-${index}`} className="col-12 col-md-6">
                <div 
                  className={`music-card ${currentTrack?.id === track.id ? 'is-active' : ''}`}
                  onClick={() => handleTrackPlay(track)}
                >
                  <div className="music-card-row">
                    <div className="music-card-info">
                      <div className="d-flex align-items-center">
                        <h6 className="mb-0 text-truncate">{track.name}</h6>
                        <span className="ms-2 badge-time">{formatCompactTimestamp(item.timestamp)}</span>
                      </div>
                      <small className="text-truncate">{track.artist}</small>
                    </div>

                    <MusicCardActions 
                      track={track}
                      isDownloading={downloading && currentDownloadingTrack?.id === track.id}
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

export default History; 

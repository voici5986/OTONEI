import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { playMusic, forceGetCoverImage, getLyrics } from '../services/musicApiService';
import { addToHistory, getCoverFromStorage, saveCoverToStorage } from '../services/storage';
import { handleError, ErrorTypes, ErrorSeverity } from '../utils/errorHandler';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import audioStateManager from '../services/audioStateManager';
import audioEngine from '../services/AudioEngine';

const DEFAULT_COVER = '/default_cover.svg';
const PlayerContext = createContext();
export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
  const { isOnline } = useNetworkStatus();
  // 状态维护
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playerUrl, setPlayerUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [currentPlaylist, setCurrentPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playMode, setPlayMode] = useState(localStorage.getItem('playMode') || 'repeat-all');
  const [lyricData, setLyricData] = useState({ rawLyric: '', tLyric: '', parsedLyric: [] });
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const [coverCache, setCoverCache] = useState({});
  const retryCountRef = useRef(0); // 记录单曲播放重试次数
  const MAX_RETRIES = 1; // 每个曲目最多自动刷新一次 URL

  const lyricsContainerRef = useRef(null);

  // 歌词解析
  const parseLyric = useCallback((text) => {
    if (!text) return [];
    const lines = text.split('\n');
    const pattern = /\[(\d+):(\d+\.\d+)\]/;
    return lines.map(line => {
      const match = line.match(pattern);
      if (match) {
        const minutes = parseFloat(match[1]);
        const seconds = parseFloat(match[2]);
        return { time: minutes * 60 + seconds, text: line.replace(match[0], '').trim() };
      }
      return null;
    }).filter(Boolean);
  }, []);

  const formatTime = useCallback((seconds) => {
    if (isNaN(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }, []);

  // 播放控制
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  }, [isPlaying]);

  // 按需获取歌词的方法
  const fetchLyrics = useCallback(async (track) => {
    if (!track) return;
    try {
      const data = await getLyrics(track);
      if (data && data.raw) {
        setLyricData({
          rawLyric: data.raw,
          tLyric: data.translated || '',
          parsedLyric: parseLyric(data.raw)
        });
      }
    } catch (error) {
      console.error('[PlayerContext] 按需获取歌词失败:', error);
    }
  }, [parseLyric]);

  const toggleLyric = useCallback(() => {
    setLyricExpanded(prev => {
      const nextState = !prev;
      // 如果即将展开且当前没有歌词，则触发加载
      if (nextState && currentTrack && !lyricData.rawLyric) {
        fetchLyrics(currentTrack);
      }
      return nextState;
    });
  }, [currentTrack, lyricData.rawLyric, fetchLyrics]);

  // 监听切歌：如果歌词面板已展开，自动获取新歌词
  useEffect(() => {
    if (lyricExpanded && currentTrack && !lyricData.rawLyric) {
      fetchLyrics(currentTrack);
    }
  }, [currentTrack, lyricExpanded, lyricData.rawLyric, fetchLyrics]);

  // 获取封面的统一方法
  const fetchCover = useCallback(async (source, picId, size = 500) => {
    const cacheKey = `${source}_${picId}_${size}`;
    
    // 1. 检查内存缓存
    if (coverCache[cacheKey]) return coverCache[cacheKey];

    // 2. 检查本地存储
    try {
      const storedUrl = await getCoverFromStorage(cacheKey);
      if (storedUrl) {
        setCoverCache(prev => ({ ...prev, [cacheKey]: storedUrl }));
        return storedUrl;
      }
    } catch (e) {
      console.warn('[PlayerContext] 从本地存储获取封面失败:', e);
    }

    // 3. 强制获取并缓存
    try {
      const url = await forceGetCoverImage(source, picId, size);
      if (url && !url.includes('default_cover')) {
        setCoverCache(prev => ({ ...prev, [cacheKey]: url }));
        saveCoverToStorage(cacheKey, url).catch(() => {});
      }
      return url;
    } catch (e) {
      console.error('[PlayerContext] fetchCover 失败:', e);
      return DEFAULT_COVER;
    }
  }, [coverCache]);

  const handlePlay = useCallback(async (track, index = -1, playlist = null, quality = 999, forceRefresh = false) => {
    try {
      if (!isOnline) {
        toast.warn('离线状态无法播放在线音乐'); // 假设全局有toast或通过其他方式提示
        return;
      }

      // 如果不是重试，则重置重试计数
      if (!forceRefresh) {
        retryCountRef.current = 0;
      }

      // 更新列表逻辑
      if (playlist) setCurrentPlaylist(playlist);
      if (index >= 0) setCurrentIndex(index);

      // 重置 UI 进度项（防止旧歌进度闪烁）
      if (!forceRefresh) {
        setPlayProgress(0);
        setPlayedSeconds(0);
        setTotalSeconds(0);
        setLyricData({ rawLyric: '', tLyric: '', parsedLyric: [] });
        setCurrentLyricIndex(-1);
      }

      // 加载并播放
      try {
        await playMusic(track, quality, forceRefresh);
      } catch (error) {
        console.warn(`[PlayerContext] 音质 ${quality} 请求失败，尝试降级到 320:`, error);
        if (quality !== 320) {
          await playMusic(track, 320, forceRefresh);
        } else {
          throw error; // 如果已经是 320 还失败，则抛出
        }
      }

      if (!forceRefresh) {
        addToHistory(track);
      }

      // 核心流程：仅请求并补全 500 尺寸的高清封面
      fetchCover(track.source, track.pic_id, 500).catch(() => {});
    } catch (error) {
      console.error('[PlayerContext] handlePlay error:', error);
    }
  }, [isOnline, fetchCover]);

  const handleNext = useCallback(() => {
    if (currentPlaylist.length <= 1) return;
    let nextIndex = (currentIndex + 1) % currentPlaylist.length;
    if (playMode === 'random') {
      nextIndex = Math.floor(Math.random() * currentPlaylist.length);
    }
    handlePlay(currentPlaylist[nextIndex], nextIndex, currentPlaylist);
  }, [currentPlaylist, currentIndex, playMode, handlePlay]);

  const handlePrevious = useCallback(() => {
    if (currentPlaylist.length <= 1) return;
    const prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    handlePlay(currentPlaylist[prevIndex], prevIndex, currentPlaylist);
  }, [currentPlaylist, currentIndex, handlePlay]);

  const handleEnded = useCallback(() => {
    if (playMode === 'repeat-one') {
      // 单曲循环：优先直接重播
      audioEngine.seek(0);
      audioEngine.play();
      // 如果播放失败，AudioEngine 会抛出 error，触发上面的监听器逻辑自动刷新 URL
    } else {
      handleNext();
    }
  }, [playMode, handleNext]);

  const handleTogglePlayMode = useCallback(() => {
    const modes = ['repeat-all', 'repeat-one', 'random'];
    const idx = modes.indexOf(playMode);
    const nextMode = modes[(idx + 1) % modes.length];
    setPlayMode(nextMode);
    localStorage.setItem('playMode', nextMode);
  }, [playMode]);

  const seekTo = useCallback((seconds) => {
    audioEngine.seek(seconds);
  }, []);

  // 1. 核心状态同步：从 AudioEngine 采集实时数据
  useEffect(() => {
    const updateProgress = () => {
      const current = audioEngine.currentTime;
      const duration = audioEngine.duration;
      setPlayedSeconds(current);
      if (duration > 0) {
        setTotalSeconds(duration);
        setPlayProgress((current / duration) * 100);
      }

      // 更新歌词索引
      if (lyricData.parsedLyric.length > 0) {
        let index = lyricData.parsedLyric.findIndex(line => line.time > current);
        index = index === -1 ? lyricData.parsedLyric.length - 1 : Math.max(0, index - 1);
        if (index !== currentLyricIndex) {
          setCurrentLyricIndex(index);
        }
      }
    };

    const cleanupTime = audioEngine.on('timeupdate', updateProgress);
    const cleanupPlay = audioEngine.on('play', () => setIsPlaying(true));
    const cleanupPause = audioEngine.on('pause', () => setIsPlaying(false));
    const cleanupEnded = audioEngine.on('ended', () => handleEnded());

    return () => {
      cleanupTime();
      cleanupPlay();
      cleanupPause();
      cleanupEnded();
    };
  }, [lyricData.parsedLyric, currentLyricIndex, handleEnded]);

  // 处理状态管理器的状态变化（主要用于切歌和URL更新）
  useEffect(() => {
    return audioStateManager.addListener((state) => {
      if (state.track) setCurrentTrack(state.track);
      if (state.url) setPlayerUrl(state.url);
      if (state.error) {
        // 如果发生播放错误，尝试自动刷新 URL 并重试一次
        if (retryCountRef.current < MAX_RETRIES && currentTrack) {
          console.warn(`[PlayerContext] 播放出错，尝试刷新 URL 并重试 (${retryCountRef.current + 1}/${MAX_RETRIES})`);
          retryCountRef.current += 1;
          handlePlay(currentTrack, currentIndex, currentPlaylist, 999, true); // 强制刷新重试
        } else {
          handleError(state.error, ErrorTypes.PLAYBACK, ErrorSeverity.ERROR, '播放器引擎错误');
          retryCountRef.current = 0; // 超过最大重试次数，重置
        }
      }
    });
  }, [currentTrack, currentIndex, currentPlaylist, handlePlay]);

  const contextValue = {
    currentTrack, playerUrl, isPlaying, playProgress, playedSeconds, totalSeconds,
    currentPlaylist, currentIndex, playMode, lyricData, currentLyricIndex, lyricExpanded,
    coverCache, lyricsContainerRef,
    setIsPlaying, setTotalSeconds, setCurrentPlaylist, togglePlay, setLyricExpanded,
    toggleLyric, handleProgress: () => { }, // 兼容性空函数，现在由监听器处理
    handleEnded, handlePlay, handleNext, handlePrevious, handleTogglePlayMode,
    formatTime, parseLyric, seekTo, fetchCover
  };

  return <PlayerContext.Provider value={contextValue}>{children}</PlayerContext.Provider>;
};

export default PlayerProvider;

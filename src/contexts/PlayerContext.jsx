import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { toast } from 'react-toastify';
import { playMusic, forceGetCoverImage, getLyrics } from '../services/musicApiService';
import { addToHistory, getCoverFromStorage, saveCoverToStorage } from '../services/storage';
import { handleError, ErrorTypes, ErrorSeverity } from '../utils/errorHandler';
import useNetworkStatus from '../hooks/useNetworkStatus';
import audioStateManager from '../services/audioStateManager';
import audioEngine, { isPlaybackRequestReplacedError } from '../services/AudioEngine';
import '../types';
import logger from '../utils/logger';
import { useAuth } from './AuthContext';
import { incrementPendingChanges } from '../services/storage';
import { triggerDelayedSync } from '../services/syncService';
import { getTrackKey } from '../utils/trackIdentity';
import { getMemoryCacheGeneration } from '../services/memoryCache';

const DEFAULT_COVER = '/default_cover.svg';
const PlayerContext = createContext();
export const usePlayer = () => useContext(PlayerContext);
const PlayerProgressContext = createContext({ playProgress: 0, playedSeconds: 0, totalSeconds: 0 });
export const usePlayerProgress = () => useContext(PlayerProgressContext);
const PlayerProgressProvider = ({ children }) => {
  const [progress, setProgress] = useState({ playProgress: 0, playedSeconds: 0, totalSeconds: 0 });
  useEffect(() => {
    const update = () => {
      const playedSeconds = audioEngine.currentTime || 0;
      const totalSeconds = Number.isFinite(audioEngine.duration) ? audioEngine.duration : 0;
      setProgress({
        playedSeconds,
        totalSeconds,
        playProgress: totalSeconds > 0 ? (playedSeconds / totalSeconds) * 100 : 0,
      });
    };
    let trackKey = null;
    const cleanupTrack = audioStateManager.addListener((state) => {
      const nextKey = state.track ? getTrackKey(state.track) : null;
      if (nextKey !== trackKey) {
        trackKey = nextKey;
        setProgress({ playProgress: 0, playedSeconds: 0, totalSeconds: 0 });
      }
    });
    const cleanups = ['timeupdate', 'loadedmetadata'].map((event) => audioEngine.on(event, update));
    cleanups.push(cleanupTrack);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);
  return (
    <PlayerProgressContext.Provider value={progress}>{children}</PlayerProgressContext.Provider>
  );
};

export const PlayerProvider = ({ children }) => {
  const { isOnline } = useNetworkStatus();
  const { currentUser } = useAuth();
  // 状态维护
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playerUrl, setPlayerUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaylist, setCurrentPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playMode, setPlayMode] = useState(localStorage.getItem('playMode') || 'repeat-all');
  const [lyricData, setLyricData] = useState({ rawLyric: '', tLyric: '', parsedLyric: [] });
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const [coverCache, setCoverCache] = useState({});
  const coverCacheRef = useRef({});
  const lyricIndexRef = useRef(-1);
  const cacheGenerationRef = useRef(0);
  const selectedQualityRef = useRef(999);
  const retryCountRef = useRef(0); // 记录单曲播放重试次数
  const playRequestIdRef = useRef(0);
  const historyRecordedKeyRef = useRef(null);
  const historyRecordingPromiseRef = useRef(null);
  const MAX_RETRIES = 1; // 每个曲目最多自动刷新一次 URL

  const lyricsContainerRef = useRef(null);

  // 歌词解析
  const parseLyric = useCallback((text) => {
    if (!text) return [];
    const lines = text.split('\n');
    const pattern = /\[(\d+):(\d+\.\d+)\]/;
    return lines
      .map((line) => {
        const match = line.match(pattern);
        if (match) {
          const minutes = parseFloat(match[1]);
          const seconds = parseFloat(match[2]);
          return { time: minutes * 60 + seconds, text: line.replace(match[0], '').trim() };
        }
        return null;
      })
      .filter(Boolean);
  }, []);

  const formatTime = useCallback((seconds) => {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }, []);

  // 播放控制
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      audioStateManager.pause();
    } else {
      audioStateManager.play();
    }
  }, [isPlaying]);

  const recordPlaybackHistory = useCallback(
    async (track) => {
      if (!track) return false;
      const scopeKey = currentUser?.uid || 'guest';
      const recordKey = `${scopeKey}:${getTrackKey(track)}`;
      if (historyRecordedKeyRef.current === recordKey) return true;
      if (historyRecordingPromiseRef.current?.key === recordKey) {
        return historyRecordingPromiseRef.current.promise;
      }

      const promise = (async () => {
        const historySaved = await addToHistory(track, currentUser?.uid);
        if (!historySaved) return false;

        historyRecordedKeyRef.current = recordKey;
        if (currentUser && !currentUser.isLocal) {
          await incrementPendingChanges('history', currentUser.uid);
          void triggerDelayedSync(currentUser.uid, 'history');
        }
        return true;
      })();
      historyRecordingPromiseRef.current = { key: recordKey, promise };
      try {
        return await promise;
      } finally {
        if (historyRecordingPromiseRef.current?.promise === promise) {
          historyRecordingPromiseRef.current = null;
        }
      }
    },
    [currentUser]
  );

  // 用户在自动播放被拦截后手动点击播放，也应在真正开始播放时写入历史。
  useEffect(() => {
    return audioEngine.on('playing', () => {
      const track = audioStateManager.getCurrentTrack();
      if (track) void recordPlaybackHistory(track);
    });
  }, [recordPlaybackHistory]);

  // 按需获取歌词的方法
  const fetchLyrics = useCallback(
    async (track) => {
      if (!track) return;
      try {
        const generation = cacheGenerationRef.current;
        const memoryGeneration = getMemoryCacheGeneration();
        const data = await getLyrics(track);
        const activeTrack = audioStateManager.getCurrentTrack();
        if (
          generation !== cacheGenerationRef.current ||
          memoryGeneration !== getMemoryCacheGeneration() ||
          !activeTrack ||
          getTrackKey(activeTrack) !== getTrackKey(track)
        )
          return;
        if (data && data.raw) {
          setLyricData({
            rawLyric: data.raw,
            tLyric: data.translated || '',
            parsedLyric: parseLyric(data.raw),
          });
        }
      } catch (error) {
        logger.error('[PlayerContext] 按需获取歌词失败:', error);
      }
    },
    [parseLyric]
  );

  const toggleLyric = useCallback(() => {
    setLyricExpanded((prev) => !prev);
  }, []);

  // 监听切歌：如果歌词面板已展开，自动获取新歌词
  useEffect(() => {
    if (lyricExpanded && currentTrack && !lyricData.rawLyric) {
      const timer = setTimeout(() => void fetchLyrics(currentTrack), 0);
      return () => clearTimeout(timer);
    }
  }, [currentTrack, lyricExpanded, lyricData.rawLyric, fetchLyrics]);

  // 获取封面的统一方法
  const fetchCover = useCallback(async (source, picId, size = 500) => {
    const generation = cacheGenerationRef.current;
    const memoryGeneration = getMemoryCacheGeneration();
    const cacheKey = `${source}_${picId}_${size}`;

    // 1. 检查内存缓存（使用ref避免频繁重建）
    if (coverCacheRef.current[cacheKey]) return coverCacheRef.current[cacheKey];

    // 2. 检查本地存储
    try {
      const storedUrl = await getCoverFromStorage(cacheKey);
      if (
        generation !== cacheGenerationRef.current ||
        memoryGeneration !== getMemoryCacheGeneration()
      )
        return DEFAULT_COVER;
      if (storedUrl) {
        coverCacheRef.current[cacheKey] = storedUrl;
        setCoverCache((prev) => ({ ...prev, [cacheKey]: storedUrl }));
        return storedUrl;
      }
    } catch (e) {
      logger.warn('[PlayerContext] 从本地存储获取封面失败:', e);
    }

    // 3. 强制获取并缓存
    try {
      const url = await forceGetCoverImage(source, picId, size);
      if (
        generation !== cacheGenerationRef.current ||
        memoryGeneration !== getMemoryCacheGeneration()
      )
        return DEFAULT_COVER;
      if (url && !url.includes('default_cover')) {
        coverCacheRef.current[cacheKey] = url;
        setCoverCache((prev) => ({ ...prev, [cacheKey]: url }));
        saveCoverToStorage(cacheKey, url).catch(() => {});
      }
      return url;
    } catch (e) {
      logger.error('[PlayerContext] fetchCover 失败:', e);
      return DEFAULT_COVER;
    }
  }, []);

  const handlePlay = useCallback(
    async (track, index = -1, playlist = null, quality = 999, forceRefresh = false) => {
      const requestId = ++playRequestIdRef.current;
      const isSuperseded = () => requestId !== playRequestIdRef.current;

      try {
        if (!isOnline) {
          toast.warn('离线状态无法播放在线音乐'); // 假设全局有toast或通过其他方式提示
          return;
        }

        // 如果不是重试，则重置重试计数
        if (!forceRefresh) {
          retryCountRef.current = 0;
          selectedQualityRef.current = quality;
        }

        // 更新列表逻辑
        if (playlist) setCurrentPlaylist(playlist);
        if (index >= 0) setCurrentIndex(index);

        // 重置 UI 进度项（防止旧歌进度闪烁）
        if (!forceRefresh) {
          setLyricData({ rawLyric: '', tLyric: '', parsedLyric: [] });
          setCurrentLyricIndex(-1);
        }

        // 加载并播放
        try {
          await playMusic(track, quality, forceRefresh, () => !isSuperseded());
          if (isSuperseded()) return;
        } catch (error) {
          if (isSuperseded() || isPlaybackRequestReplacedError(error)) return;
          if (error?.code === 'PLAYBACK_NOT_STARTED') {
            toast.info('浏览器阻止了自动播放，请点击播放按钮继续');
            return;
          }
          logger.warn(`[PlayerContext] 音质 ${quality} 请求失败，尝试降级到 320:`, error);
          if (quality !== 320) {
            if (isSuperseded()) return;
            selectedQualityRef.current = 320;
            await playMusic(track, 320, forceRefresh, () => !isSuperseded());
            if (isSuperseded()) return;
          } else {
            throw error; // 如果已经是 320 还失败，则抛出
          }
        }

        if (isSuperseded()) return;
        if (!forceRefresh) {
          await recordPlaybackHistory(track);
        }

        if (isSuperseded()) return;
        // 核心流程：仅请求并补全 500 尺寸的高清封面
        fetchCover(track.source, track.pic_id, 500).catch(() => {});
      } catch (error) {
        if (isSuperseded() || isPlaybackRequestReplacedError(error)) return;
        logger.error('[PlayerContext] handlePlay error:', error);
      }
    },
    [isOnline, fetchCover, recordPlaybackHistory]
  );

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

  useEffect(() => {
    coverCacheRef.current = coverCache;
  }, [coverCache]);

  useEffect(() => {
    lyricIndexRef.current = currentLyricIndex;
  }, [currentLyricIndex]);

  // 1. 核心状态同步：从 AudioEngine 采集实时数据
  useEffect(() => {
    const updateProgress = () => {
      const current = audioEngine.currentTime;
      // 更新歌词索引
      if (lyricData.parsedLyric.length > 0) {
        let index = lyricData.parsedLyric.findIndex((line) => line.time > current);
        index = index === -1 ? lyricData.parsedLyric.length - 1 : Math.max(0, index - 1);
        if (index !== lyricIndexRef.current) {
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
  }, [lyricData.parsedLyric, handleEnded]);

  // 处理状态管理器的状态变化（主要用于切歌和URL更新）
  useEffect(() => {
    return audioStateManager.addListener((state) => {
      if (state.track) setCurrentTrack(state.track);
      if (state.url) setPlayerUrl(state.url);
      if (state.error) {
        // 如果发生播放错误，尝试自动刷新 URL 并重试一次
        if (retryCountRef.current < MAX_RETRIES && state.track) {
          logger.warn(
            `[PlayerContext] 播放出错，尝试刷新 URL 并重试 (${retryCountRef.current + 1}/${MAX_RETRIES})`
          );
          retryCountRef.current += 1;
          handlePlay(state.track, currentIndex, currentPlaylist, selectedQualityRef.current, true); // 强制刷新重试
        } else {
          handleError(state.error, ErrorTypes.PLAYBACK, ErrorSeverity.ERROR, '播放器引擎错误');
          retryCountRef.current = 0; // 超过最大重试次数，重置
        }
        // 处理完毕后清除错误态，避免后续状态通知重复触发重试（限流约束下尤为重要）
        audioStateManager.clearError();
      }
    });
  }, [currentTrack, currentIndex, currentPlaylist, handlePlay]);

  useEffect(() => {
    const clearCache = (event) => {
      if (!event.detail?.cache) return;
      cacheGenerationRef.current += 1;
      coverCacheRef.current = {};
      setCoverCache({});
      setLyricData({ rawLyric: '', tLyric: '', parsedLyric: [] });
      setCurrentLyricIndex(-1);
    };
    window.addEventListener('local:data_cleared', clearCache);
    return () => window.removeEventListener('local:data_cleared', clearCache);
  }, []);

  const contextValue = useMemo(
    () => ({
      currentTrack,
      playerUrl,
      isPlaying,
      currentPlaylist,
      currentIndex,
      playMode,
      lyricData,
      currentLyricIndex,
      lyricExpanded,
      coverCache,
      lyricsContainerRef,
      setIsPlaying,
      setCurrentPlaylist,
      togglePlay,
      setLyricExpanded,
      toggleLyric,
      handleEnded,
      handlePlay,
      handleNext,
      handlePrevious,
      handleTogglePlayMode,
      formatTime,
      parseLyric,
      seekTo,
      fetchCover,
    }),
    [
      currentTrack,
      playerUrl,
      isPlaying,
      currentPlaylist,
      currentIndex,
      playMode,
      lyricData,
      currentLyricIndex,
      lyricExpanded,
      coverCache,
      togglePlay,
      toggleLyric,
      handleEnded,
      handlePlay,
      handleNext,
      handlePrevious,
      handleTogglePlayMode,
      formatTime,
      parseLyric,
      seekTo,
      fetchCover,
    ]
  );

  return (
    <PlayerContext.Provider value={contextValue}>
      <PlayerProgressProvider>{children}</PlayerProgressProvider>
    </PlayerContext.Provider>
  );
};

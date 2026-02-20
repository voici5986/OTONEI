import React, { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import Navigation from './components/Navigation';
import DeviceDebugger from './components/DeviceDebugger';
import OrientationPrompt from './components/OrientationPrompt';
import InstallPWA from './components/InstallPWA';
import UpdateNotification from './components/UpdateNotification';
import AudioPlayer from './components/AudioPlayer';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import { useDevice } from './contexts/DeviceContext';
import { usePlayer } from './contexts/PlayerContext';
import { lockToPortrait } from './utils/orientationManager';
import useNetworkStatus from './hooks/useNetworkStatus';
import useFirebaseStatus from './hooks/useFirebaseStatus';
import { clearExpiredCovers } from './services/storage';
import useSearch from './hooks/useSearch';
import SearchResultItem from './components/SearchResultItem';
import SearchService from './services/SearchService';
// 导入样式文件
// 已移除旧的 Header.css 引用，样式现在由 Header 组件内部管理
import './styles/AudioPlayer.css';
import './styles/Orientation.css';
import logger from './utils/logger.js';

// 懒加载页面组件
const Favorites = React.lazy(() => import('./pages/Favorites'));
const History = React.lazy(() => import('./pages/History'));
const User = React.lazy(() => import('./pages/User'));


// 搜索结果项组件 - 已迁移至 components/SearchResultItem.js

const AppContent = () => {
  const [activeTab, setActiveTab] = useState('home');

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  // 关键修复：解决跨 Tab 切换时滚动位置继承的问题
  useEffect(() => {
    // 强制页面回到顶部
    window.scrollTo(0, 0);

    // 如果主内容区域有内部滚动容器，也需要重置
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }, [activeTab]);



  const { isOnline } = useNetworkStatus({
    showToasts: true,
    dispatchEvents: true
  });

  // 使用自定义Hook管理Firebase状态
  useFirebaseStatus({
    showToasts: true,
    manualCheck: false
  });

  // 使用自定义Hook管理搜索逻辑
  const {
    query,
    results,
    source,
    quality,
    loading,
    handleSearch,
    setQuery,
    setSource,
    setQuality
  } = useSearch(isOnline);

  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [localSuggestions, setLocalSuggestions] = useState({ favorites: [], history: [] });
  const [localSuggestionsLoading, setLocalSuggestionsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // 获取搜索历史
  useEffect(() => {
    const fetchSearchHistory = async () => {
      try {
        const { getSearchHistory } = await import('./services/storage');
        const history = await getSearchHistory();
        setSearchHistory(history || []);
      } catch (error) {
        logger.error('获取搜索历史失败:', error);
      }
    };

    if (suggestionsOpen && !query.trim()) {
      fetchSearchHistory();
    }

    const handleCleared = () => setSearchHistory([]);
    window.addEventListener('search_history_cleared', handleCleared);
    return () => window.removeEventListener('search_history_cleared', handleCleared);
  }, [suggestionsOpen, query]);

  // 下载相关状态 - 使用全局 Context
  // 可选音乐源
  const sources = useMemo(() => ([
    'netease', 'kuwo', 'joox', 'bilibili'
  ]), []);

  // 可选音质
  const qualities = useMemo(() => ([128, 192, 320, 740, 999]), []);

  // 从PlayerContext获取封面相关方法
  const { setCurrentPlaylist, handlePlay: playTrack } = usePlayer();

  // 当搜索结果变化时，同步更新播放列表
  useEffect(() => {
    if (results && results.length > 0) {
      setCurrentPlaylist(results);
    }
  }, [results, setCurrentPlaylist]);

  const deviceInfo = useDevice();

  const getTrackArtist = useCallback((track) => {
    if (!track) return '';
    if (Array.isArray(track.ar)) return track.ar.map(a => a?.name || '').filter(Boolean).join(' / ');
    if (Array.isArray(track.artists)) return track.artists.map(a => a?.name || '').filter(Boolean).join(' / ');
    if (track.artist) {
      return typeof track.artist === 'string' ? track.artist : (track.artist.name || '');
    }
    return '';
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setLocalSuggestions({ favorites: [], history: [] });
      setLocalSuggestionsLoading(false);
      return;
    }

    let active = true;
    setLocalSuggestionsLoading(true);
    const timer = setTimeout(() => {
      SearchService.searchLocal(trimmedQuery)
        .then((result) => {
          if (!active) return;
          logger.log(`[Search Debug] SearchService 返回结果: 收藏=${result.favorites.length}, 历史=${result.history.length}`);
          setLocalSuggestions(result);
          setLocalSuggestionsLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setLocalSuggestionsLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSearchFocus = () => {
    setSuggestionsOpen(true);
    setSelectedIndex(-1);
  };
  const handleSearchBlur = () => {
    // 延迟关闭，以便处理建议项的点击
    setTimeout(() => {
      setSuggestionsOpen(false);
      setSelectedIndex(-1);
    }, 200);
  };

  const buildSuggestionItems = useCallback((tracks) => {
    return tracks.map((track, index) => {
      const stableId = track?.id || `${track?.name || 'idx'}-${track?.source || 'unknown'}-${index}`;
      return {
        id: stableId,
        name: track?.name || '未命名',
        artist: getTrackArtist(track) || '未知歌手',
        raw: track
      };
    });
  }, [getTrackArtist]);

  const handleSuggestionPick = (item) => {
    // 处理“查看更多”跳转
    if (item.type === 'more') {
      handleShowMore(item.subType);
      return;
    }

    if (item.isSearchHistory) {
      // 如果是搜索历史建议
      setQuery(item.rawQuery);
      setSource(item.rawSource);
      setSuggestionsOpen(false);
      // 触发搜索
      setTimeout(() => {
        handleSearch();
      }, 0);
      return;
    }

    if (item.raw) {
      // 1. 如果是歌曲建议，直接播放
      playTrack(item.raw, -1, [item.raw], quality);
      // 2. 清空搜索框并关闭建议
      setQuery('');
      setSuggestionsOpen(false);
      setSelectedIndex(-1);
      // 3. 主动失去焦点，强制触发 CSS 状态回退
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } else {
      // 如果没有原始数据，则回退到普通搜索
      setQuery(item.name);
      setSuggestionsOpen(false);
      setSelectedIndex(-1);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const favoritesItems = useMemo(
    () => buildSuggestionItems(localSuggestions.favorites || []),
    [buildSuggestionItems, localSuggestions.favorites]
  );
  const historyItems = useMemo(
    () => buildSuggestionItems(localSuggestions.history || []),
    [buildSuggestionItems, localSuggestions.history]
  );

  // 格式化搜索历史建议
  const historySuggestionItems = useMemo(() => (
    searchHistory.slice(0, 5).map((item, index) => ({
      id: `history-${index}-${item.timestamp}`,
      name: item.query,
      artist: `历史搜索 · ${item.source}`,
      isSearchHistory: true,
      rawQuery: item.query,
      rawSource: item.source
    }))
  ), [searchHistory]);

  // 合并后的建议列表，用于键盘导航
  const allLimitedItems = useMemo(() => {
    if (!query.trim()) return historySuggestionItems;

    const limit = 5;
    const items = [];

    // 1. 加入收藏匹配项
    const favs = favoritesItems.slice(0, limit);
    items.push(...favs);

    // 2. 如果还有更多收藏，加入“更多收藏”占位项
    if (favoritesItems.length > limit) {
      items.push({ id: 'more-favorites', type: 'more', subType: 'favorites' });
    }

    // 3. 加入历史匹配项
    const hists = historyItems.slice(0, limit);
    items.push(...hists);

    // 4. 如果还有更多历史，加入“更多历史”占位项
    if (historyItems.length > limit) {
      items.push({ id: 'more-history', type: 'more', subType: 'history' });
    }

    return items;
  }, [query, historySuggestionItems, favoritesItems, historyItems]);

  const handleSearchAction = useCallback((e) => {
    handleSearch(e);
    setSuggestionsOpen(false);
    setSelectedIndex(-1);
    // 关键修复：主动失去焦点，让 CSS :focus-within 状态消失，搜索框样式恢复
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (activeTab !== 'home') {
      handleTabChange('home');
    }
  }, [handleSearch, activeTab, handleTabChange]);

  const handleKeyDown = (e) => {
    // 处理输入法组合输入，避免误触发搜索
    if (e.isComposing || e.nativeEvent?.isComposing) {
      return;
    }
    if (!suggestionsOpen || allLimitedItems.length === 0) {
      if (e.key === 'Enter') {
        // 显式触发搜索逻辑，避免因 blur 导致 submit 事件丢失
        e.preventDefault();
        handleSearchAction(e);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % allLimitedItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allLimitedItems.length) % allLimitedItems.length);
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < allLimitedItems.length) {
        e.preventDefault();
        handleSuggestionPick(allLimitedItems[selectedIndex]);
      } else {
        // 如果没有选中项，也应该触发普通搜索
        e.preventDefault();
        handleSearchAction(e);
      }
    } else if (e.key === 'Escape') {
      setSuggestionsOpen(false);
      setSelectedIndex(-1);
    }
  };


  const handleShowMore = (type) => {
    // 切换到对应的标签页
    if (type === 'favorites') {
      setActiveTab('favorites');
    } else if (type === 'history') {
      setActiveTab('history');
    }
    // 1. 立即关闭建议弹窗
    setSuggestionsOpen(false);
    setSelectedIndex(-1);

    // 2. 主动失去焦点，解决搜索框“圆角未恢复”的问题
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const renderHomePage = () => {
    const isDesktop = !deviceInfo.isMobile;

    return (
      <div className={`page-content-wrapper ${isDesktop ? 'home-desktop' : ''}`}>
        <div className="home-search-filter-bar mb-4">
          <form onSubmit={handleSearch} className="home-filter-form">
            <div className="d-flex align-items-center flex-wrap gap-3">
              <div className="filter-group d-flex align-items-center">
                <span className="text-muted small me-2">音源:</span>
                <select
                  className="form-select-custom"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  style={{ height: '38px', width: isDesktop ? '120px' : 'auto', fontSize: '0.85rem', flex: isDesktop ? 'none' : 1 }}
                >
                  {sources.map((src) => (<option key={src} value={src}>{src}</option>))}
                </select>
              </div>
              <div className="filter-group d-flex align-items-center">
                <span className="text-muted small me-2">音质:</span>
                <select
                  className="form-select-custom"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  style={{ height: '38px', width: isDesktop ? '120px' : 'auto', fontSize: '0.85rem', flex: isDesktop ? 'none' : 1 }}
                >
                  {qualities.map((q) => (<option key={q} value={q}>{q === 999 ? '无损' : `${q}kbps`}</option>))}
                </select>
              </div>
              {isDesktop && (
                <button
                  type="submit"
                  className="search-submit-btn"
                  disabled={loading}
                  style={{ height: '38px', padding: '0 24px', fontSize: '0.85rem' }}
                >
                  {loading ? <span className="spinner-custom" style={{ width: '1rem', height: '1rem' }}></span> : '开始搜索'}
                </button>
              )}
            </div>
          </form>
        </div>

        {results.length > 0 ? (
          <div className={isDesktop ? 'home-results' : ''}>
            <div className={`row g-3 ${isDesktop ? 'home-results-row' : ''}`}>
              {results.map((track) => (
                <div key={track.id} className="col-12 col-md-6 col-lg-4">
                  <SearchResultItem track={track} searchResults={results} quality={quality} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // 渲染不同标签页的内容
  const renderContent = () => {
    const loadingFallback = (
      <div className="text-center my-5">
        <span className="spinner-custom" style={{ width: '2.5rem', height: '2.5rem' }}></span>
        <p className="mt-3">加载中...</p>
      </div>
    );

    switch (activeTab) {
      case 'home':
        return renderHomePage();
      case 'favorites':
        return (
          <Suspense fallback={loadingFallback}>
            <Favorites globalSearchQuery={query} onTabChange={handleTabChange} />
          </Suspense>
        );
      case 'history':
        return (
          <Suspense fallback={loadingFallback}>
            <History globalSearchQuery={query} onTabChange={handleTabChange} />
          </Suspense>
        );
      case 'user':
        return (
          <Suspense fallback={loadingFallback}>
            <User onTabChange={handleTabChange} />
          </Suspense>
        );
      default:
        return renderHomePage();
    }
  };

  // 尝试锁定屏幕方向为竖屏（仅在移动设备和平板上）
  useEffect(() => {
    if (deviceInfo.isMobile || deviceInfo.isTablet) {
      lockToPortrait().then(success => {
        if (process.env.NODE_ENV === 'development') {
          logger.log(success ?
            '成功锁定屏幕方向为竖屏' :
            '无法锁定屏幕方向，将使用备选方案'
          );
        }
      });
    }
  }, [deviceInfo.isMobile, deviceInfo.isTablet]);

  // 初始化应用
  useEffect(() => {
    const initialize = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          logger.log("应用初始化中...");
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.error("初始化失败:", error);
        }
      }
    };

    initialize();
  }, []);

  // 启动时清理过期的封面缓存
  useEffect(() => {
    // 异步清理过期封面缓存，不阻塞主流程
    clearExpiredCovers()
      .then(count => {
        logger.log(`已清理 ${count} 个过期封面缓存`);
      })
      .catch(error => {
        logger.error('清理封面缓存失败:', error);
      });
  }, []);

  return (
    <div className={`app-container ${!deviceInfo.isMobile ? 'desktop-layout' : ''}`}>
      <OrientationPrompt />
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={query}
        onSearchChange={setQuery}
        onSearchSubmit={handleSearchAction}
        suggestionsOpen={suggestionsOpen}
        suggestionsLoading={localSuggestionsLoading}
        suggestions={{
          favorites: favoritesItems,
          history: historyItems,
          searchHistory: historySuggestionItems
        }}
        onSearchFocus={handleSearchFocus}
        onSearchBlur={handleSearchBlur}
        onKeyDown={handleKeyDown}
        selectedIndex={selectedIndex}
        onSuggestionPick={handleSuggestionPick}
        onShowMore={handleShowMore}
        loading={loading}
      />
      <Navigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <div className={!deviceInfo.isMobile ? 'main-content' : 'main-content'}>
        <div className={!deviceInfo.isMobile ? 'content-area' : 'content-area'}>
          {renderContent()}
        </div>
      </div>

      <AudioPlayer />

      <InstallPWA />
      <UpdateNotification />
      {process.env.NODE_ENV === 'development' && <DeviceDebugger />}
    </div>
  );
};

// 主App组件
const App = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;

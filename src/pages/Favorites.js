import React, { useState, useEffect } from 'react';
import MusicCardActions from '../components/MusicCardActions';
import { getFavorites } from '../services/storage';
import { toast } from 'react-toastify';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useDownload } from '../contexts/DownloadContext';

const Favorites = ({ globalSearchQuery, onTabChange }) => {
  // 从PlayerContext获取状态和方法（防御性处理，避免上下文缺失导致崩溃）
  const player = usePlayer();
  const handlePlay = player?.handlePlay || (() => {});
  const currentTrack = player?.currentTrack || null;

  // 从AuthContext获取用户状态
  const { currentUser } = useAuth();

  // 从DownloadContext获取下载状态和方法
  const { isTrackDownloading, handleDownload } = useDownload();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filteredFavorites, setFilteredFavorites] = useState([]);

  // 监听全局搜索
  useEffect(() => {
    if (globalSearchQuery !== undefined) {
      performSearch(globalSearchQuery, favorites);
    }
  }, [globalSearchQuery, favorites]);

  // 将搜索逻辑提取出来
  const performSearch = (query, currentFavorites) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setFilteredFavorites(currentFavorites);
      return;
    }

    const filtered = currentFavorites.filter(track => {
      if (isMatch(track.name, trimmedQuery) || isMatch(track.album, trimmedQuery)) {
        return true;
      }
      return isArtistMatch(track, trimmedQuery);
    });
    setFilteredFavorites(filtered);
  };

  // 定义loadFavorites函数在useEffect之前
  const loadFavorites = async () => {
    setLoading(true);
    try {
      const favItems = await getFavorites();
      setFavorites(favItems);
      setFilteredFavorites(favItems); // 初始化过滤结果
    } catch (error) {
      console.error('加载收藏失败:', error);
      toast.error('加载收藏失败，请重试', { icon: '⚠️' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载收藏时强制检查日文艺术家
  useEffect(() => {
    if (favorites.length > 0) {
      // 检查是否有日文艺术家数据，并打印详细信息
      const japaneseItems = favorites.filter(item =>
        typeof item.artist === 'string' &&
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(item.artist)
      );
      console.log(`日文艺术家测试 - 总数: ${japaneseItems.length}`);

      if (japaneseItems.length > 0) {
        // 测试一个已知的日文艺术家名称
        const testArtist = "ずっと真夜中でいいのに。";
        const testItem = japaneseItems.find(item => item.artist.includes(testArtist));

        if (testItem) {
          console.log(`找到艺术家"${testArtist}":`);
          console.log(`- 完整艺术家名: ${testItem.artist}`);
          // 测试子字符串搜索
          console.log(`- 测试"ずっと"是否匹配: ${testItem.artist.includes("ずっと")}`);
          console.log(`- 测试"真夜中"是否匹配: ${testItem.artist.includes("真夜中")}`);

          // 字符编码测试
          const artistChars = Array.from(testItem.artist);
          const searchChars = Array.from("ずっと");
          console.log(`- 艺术家编码: ${artistChars.map(c => c.charCodeAt(0).toString(16)).join(' ')}`);
          console.log(`- 搜索词编码: ${searchChars.map(c => c.charCodeAt(0).toString(16)).join(' ')}`);
        }
      }
    }
  }, [favorites]);

  // 递归搜索任何值是否匹配查询词
  const searchInValue = (value, query) => {
    // 处理字符串直接比较
    if (typeof value === 'string') {
      return isMatch(value, query);
    }

    // 处理数组 - 检查数组中的每个元素
    if (Array.isArray(value)) {
      return value.some(item => searchInValue(item, query));
    }

    // 处理对象 - 检查所有属性值
    if (value !== null && typeof value === 'object') {
      return Object.values(value).some(propValue =>
        searchInValue(propValue, query)
      );
    }

    // 其他类型无法搜索
    return false;
  };

  // 检查字符串是否匹配查询词
  const isMatch = (text, query) => {
    // 处理null/undefined
    if (!text) return false;

    // 确保为字符串
    const str = typeof text === 'string' ? text : String(text);

    // 1. 精确匹配检查
    if (str === query) return true;

    // 2. 包含检查 - 保持原始大小写
    if (str.includes(query)) return true;

    // 3. 不区分大小写检查
    const lowerStr = str.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lowerStr.includes(lowerQuery)) return true;

    // 4. 分词检查 - 适用于由空格分隔的多个单词
    const words = query.split(/\s+/).filter(word => word.length > 0);
    if (words.length > 1) {
      return words.every(word => isMatch(str, word));
    }

    return false;
  };

  // 专门检查艺术家字段的匹配
  const isArtistMatch = (track, query) => {
    // 1. 检查artist字段（字符串形式）
    if (typeof track.artist === 'string' && isMatch(track.artist, query)) {
      return true;
    }

    // 2. 检查artist字段（对象形式）
    if (track.artist !== null && typeof track.artist === 'object') {
      // 检查name属性
      if (track.artist.name && isMatch(track.artist.name, query)) {
        return true;
      }

      // 递归搜索整个对象
      if (searchInValue(track.artist, query)) {
        return true;
      }
    }

    // 3. 检查artists数组（某些API返回数组）
    if (Array.isArray(track.artists)) {
      // 检查数组中的每个艺术家
      return track.artists.some(artist => {
        if (typeof artist === 'string') {
          return isMatch(artist, query);
        }

        if (artist && typeof artist === 'object') {
          // 检查name属性
          if (artist.name && isMatch(artist.name, query)) {
            return true;
          }

          // 递归搜索整个对象
          return searchInValue(artist, query);
        }

        return false;
      });
    }

    // 4. 检查ar字段（网易云音乐常用）
    if (Array.isArray(track.ar)) {
      return track.ar.some(artist => {
        if (typeof artist === 'string') {
          return isMatch(artist, query);
        }

        if (artist && typeof artist === 'object') {
          // 检查name属性
          if (artist.name && isMatch(artist.name, query)) {
            return true;
          }

          // 递归搜索整个对象
          return searchInValue(artist, query);
        }

        return false;
      });
    }

    // 5. 检查album对象中的artist信息
    if (track.al && typeof track.al === 'object') {
      if (searchInValue(track.al, query)) {
        return true;
      }
    }

    // 6. 尝试在整个track对象中搜索（仅限特定字段）
    const fieldsToSearch = ['artistsname', 'singer', 'author', 'composer'];
    for (const field of fieldsToSearch) {
      if (track[field] && isMatch(track[field], query)) {
        return true;
      }
    }

    return false;
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

  // 添加单独的播放处理函数
  const handleTrackPlay = (track) => {
    console.log('从收藏播放曲目:', track.id, track.name);
    // 使用当前收藏列表作为播放列表，并找到当前曲目的索引
    const trackIndex = filteredFavorites.findIndex(item => item.id === track.id);
    handlePlay(track, trackIndex >= 0 ? trackIndex : -1, filteredFavorites);
  };

  return (
    <div className="favorites-page page-content-wrapper">
      {/* 移除标题栏，功能已迁移至账号页 */}
      
      {/* 添加登录提醒 */}
      {renderLoginReminder()}

      {loading ? (
        <div className="text-center my-5">
          <span className="spinner-custom"></span>
        </div>
      ) : favorites.length === 0 ? null : filteredFavorites.length === 0 ? (
        <div className="alert-light text-center py-4 rounded" style={{ backgroundColor: 'var(--color-background-alt)', border: '1px solid var(--color-border)' }}>
          <p className="mb-0">没有匹配的收藏歌曲</p>
          <small className="text-muted">
            尝试使用不同的关键词搜索
          </small>
        </div>
      ) : (
        <div className="favorites-grid row g-3">
          {filteredFavorites.map((track, index) => (
            <div key={`${track.id}-${track.source}-${index}`} className="col-12 col-md-6">
              <div 
                className={`music-card ${currentTrack?.id === track.id ? 'is-active' : ''}`}
                onClick={() => handleTrackPlay(track)}
              >
                <div className="music-card-row">
                  <div className="music-card-info">
                    <h6>{track.name}</h6>
                    <small>{track.artist}</small>
                  </div>

                  <MusicCardActions 
                    track={track}
                    isDownloading={isTrackDownloading(track.id)}
                    onDownload={handleDownload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Favorites; 

import React from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useDownload } from '../contexts/DownloadContext';
import MusicCardActions from './MusicCardActions';
import '../types';
import logger from '../utils/logger.js';

const SearchResultItem = ({ track, searchResults, quality }) => {
  const { handlePlay, currentTrack } = usePlayer();
  const { isTrackDownloading, handleDownload } = useDownload();

  // 获取全局音质设置，如果没传则默认使用 999
  const activeQuality = quality || 999;

  // 添加单独的播放处理函数
  const handleTrackPlay = (track) => {
    logger.log('从搜索结果播放曲目:', track.id, track.name, '音质:', activeQuality);
    // 使用当前搜索结果作为播放列表
    const trackIndex = searchResults.findIndex(item => item.id === track.id);
    handlePlay(track, trackIndex >= 0 ? trackIndex : -1, searchResults, activeQuality);
  };

  const onDownloadClick = (e) => {
    e.stopPropagation();
    handleDownload(track, activeQuality);
  };

  return (
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
          onDownload={onDownloadClick}
        />
      </div>
    </div>
  );
};

export default SearchResultItem;

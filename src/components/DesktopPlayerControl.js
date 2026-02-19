import React from 'react';
import { FaPlay, FaPause, FaDownload } from 'react-icons/fa';
import { MdSkipPrevious, MdSkipNext } from 'react-icons/md';
import DesktopAlbumCover from './DesktopAlbumCover';
import HeartButton from './HeartButton';
import { LyricToggleButton } from './PlayerSubComponents';
import { useDownload } from '../contexts/DownloadContext';

/**
 * 桌面端播放控制组件
 * 包含左侧歌曲信息、中间播放控制、右侧辅助功能
 */
const DesktopPlayerControl = ({
  currentTrack,
  isPlaying,
  togglePlay,
  toggleLyric,
  lyricExpanded,
  handlePrevious,
  handleNext,
  handleTogglePlayMode,
  getPlayModeTitle,
  renderPlayModeIcon
}) => {
  const { handleDownload } = useDownload();

  return (
    <div className="player-info-controls d-none d-md-flex">
      {/* 左侧：歌曲信息 */}
      <div className="player-left-section">
        <DesktopAlbumCover track={currentTrack} size="small" onClick={toggleLyric} imgSize={500} />
        <div className="track-info-container ms-3">
          <h6 className="mb-0 text-truncate track-name">{currentTrack.name}</h6>
          <small className="text-muted text-truncate track-artist">{currentTrack.artist}</small>
        </div>
      </div>

      {/* 中间：播放控制 */}
      <div className="player-center-section">
        <div className="d-flex align-items-center justify-content-center">
          <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}>
            <button 
              onClick={handleTogglePlayMode} 
              className="control-icon-btn p-0"
              title={getPlayModeTitle()}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              {renderPlayModeIcon()}
            </button>
          </div>
          
          <button onClick={handlePrevious} className="control-icon-btn p-0 ms-3" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><MdSkipPrevious size={28} /></button>
          
          <button onClick={togglePlay} className="control-icon-btn accent-control mx-3 p-0" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <div className="play-pause-button">
              {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} className="play-icon" />}
            </div>
          </button>
          
          <button onClick={handleNext} className="control-icon-btn p-0 me-3" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><MdSkipNext size={28} /></button>
          
          <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}>
            <HeartButton track={currentTrack} size={20} variant="link" className="p-0 control-button accent-control" />
          </div>
        </div>
      </div>

      {/* 右侧：辅助功能 */}
      <div className="player-right-section">
        <LyricToggleButton expanded={lyricExpanded} onToggle={toggleLyric} className="p-2 control-button" />
        <button 
          className="p-2 control-button ms-2" 
          title="下载歌曲"
          onClick={() => handleDownload(currentTrack)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <FaDownload size={18} />
        </button>
      </div>
    </div>
  );
};

export default DesktopPlayerControl;

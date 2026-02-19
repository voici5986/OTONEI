import React from 'react';
import { FaTimes } from 'react-icons/fa';
import DesktopAlbumCover from './DesktopAlbumCover';
import { LyricLine } from './PlayerSubComponents';

/**
 * 桌面端全屏展开视图组件
 * 采用左右布局：左侧封面，右侧歌词
 * 已移除所有移动端触摸交互逻辑
 */
const DesktopExpandedView = ({
  currentTrack,
  toggleLyric,
  lyricsContainerRef,
  processedLyrics,
  currentLyricIndex
}) => {
  return (
    <div className="player-expanded-view desktop-expanded-view">
      {/* 关闭按钮 */}
      <button 
        onClick={toggleLyric} 
        className="close-lyrics-btn"
        title="收起播放器"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <FaTimes />
      </button>
      
      <div className="expanded-main-wrapper">
        {/* 左侧：封面信息区 */}
        <div className="album-info-section">
          <div className="album-cover-container">
            <DesktopAlbumCover 
              track={currentTrack} 
              size={450} 
              imgSize={500}
            />
          </div>
          <div className="track-details mt-4">
            <h2 className="track-title">{currentTrack.name}</h2>
            <p className="track-artist-album">{currentTrack.artist}</p>
          </div>
        </div>

        {/* 右侧：歌词显示区 */}
        <div className="lyrics-section">
          <div className="lyrics-scroll-container" ref={lyricsContainerRef}>
            {processedLyrics.length > 0 ? (
              processedLyrics.map((line, idx) => (
                <LyricLine 
                  key={idx} 
                  line={line} 
                  isActive={idx === currentLyricIndex} 
                />
              ))
            ) : (
              <div className="lyric-line no-lyrics">暂无歌词</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopExpandedView;

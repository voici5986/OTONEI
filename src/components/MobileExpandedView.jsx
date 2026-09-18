import React from 'react';
import { FaChevronLeft, FaTimes } from 'react-icons/fa';
import MobileAlbumCover from './MobileAlbumCover';
import { LyricLine } from './PlayerSubComponents';

/**
 * 移动端全屏展开视图组件
 * 包含专辑封面、歌词滚动显示等
 */
const MobileExpandedView = ({
  currentTrack,
  isPlaying,
  toggleLyric,
  showMobileLyrics,
  setShowMobileLyrics,
  isDragging,
  dragOffsetY,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  lyricsContainerRef,
  processedLyrics,
  currentLyricIndex,
}) => {
  return (
    <div
      className={`player-expanded-view ${showMobileLyrics ? 'mobile-lyrics-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : '',
        transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <button
        type="button"
        onClick={toggleLyric}
        className="close-lyrics-btn ui-icon-button"
        aria-label="收起播放器"
      >
        <FaTimes />
      </button>

      <div className="expanded-main-wrapper">
        <button
          type="button"
          className="album-info-section"
          aria-label={showMobileLyrics ? '显示专辑信息' : '显示歌词'}
          onClick={() => {
            if (window.innerWidth <= 768) setShowMobileLyrics(!showMobileLyrics);
          }}
        >
          <div className="album-cover-container">
            <MobileAlbumCover
              track={currentTrack}
              size="large"
              isPlaying={isPlaying}
              imgSize={500}
            />
          </div>
        </button>
        <div className="lyrics-section">
          <button
            type="button"
            className="mobile-lyrics-toggle ui-icon-button"
            aria-label="显示专辑信息"
            title="显示专辑信息"
            onClick={() => setShowMobileLyrics(false)}
          >
            <FaChevronLeft aria-hidden="true" />
          </button>
          <div className="lyrics-scroll-container" ref={lyricsContainerRef}>
            {processedLyrics.map((line, idx) => (
              <LyricLine key={idx} line={line} isActive={idx === currentLyricIndex} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileExpandedView;

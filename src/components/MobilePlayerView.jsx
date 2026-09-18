import React, { memo } from 'react';
import ProgressBar from './ProgressBar';
import MobileMiniPlayer from './MobileMiniPlayer';
import MobileExpandedView from './MobileExpandedView';

/**
 * 移动端播放器视图
 * 锁定移动端特有的 DOM 结构和交互逻辑
 */
const MobilePlayerView = ({
  currentTrack,
  isPlaying,
  lyricExpanded,
  currentLyricIndex,
  playMode,
  togglePlay,
  toggleLyric,
  handlePrevious,
  handleNext,
  handleTogglePlayMode,
  lyricsContainerRef,
  processedLyrics,
  showMobileLyrics,
  setShowMobileLyrics,
  isDragging,
  dragOffsetY,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  renderPlayModeIcon,
  getPlayModeTitle,
}) => {
  if (!currentTrack) return null;

  return (
    <>
      <button
        type="button"
        className={`player-backdrop ${lyricExpanded ? 'visible' : ''}`}
        onClick={toggleLyric}
        aria-label="关闭歌词视图"
      ></button>
      <div className={`audio-player ${lyricExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="player-inner">
          <div className="progress-control-container">
            <ProgressBar />
          </div>

          <div className="player-content">
            <MobileMiniPlayer
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              togglePlay={togglePlay}
              toggleLyric={toggleLyric}
              lyricExpanded={lyricExpanded}
              showMobileLyrics={showMobileLyrics}
              setShowMobileLyrics={setShowMobileLyrics}
              handleTogglePlayMode={handleTogglePlayMode}
              handlePrevious={handlePrevious}
              handleNext={handleNext}
              playMode={playMode}
              getPlayModeTitle={getPlayModeTitle}
              renderPlayModeIcon={renderPlayModeIcon}
            />
          </div>
        </div>
      </div>

      {lyricExpanded && (
        <MobileExpandedView
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          toggleLyric={toggleLyric}
          showMobileLyrics={showMobileLyrics}
          setShowMobileLyrics={setShowMobileLyrics}
          isDragging={isDragging}
          dragOffsetY={dragOffsetY}
          handleTouchStart={handleTouchStart}
          handleTouchMove={handleTouchMove}
          handleTouchEnd={handleTouchEnd}
          lyricsContainerRef={lyricsContainerRef}
          processedLyrics={processedLyrics}
          currentLyricIndex={currentLyricIndex}
        />
      )}
    </>
  );
};

export default memo(MobilePlayerView);

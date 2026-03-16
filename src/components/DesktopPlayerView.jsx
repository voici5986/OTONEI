import React, { memo } from 'react';
import ProgressBar from './ProgressBar';
import DesktopPlayerControl from './DesktopPlayerControl';
import DesktopExpandedView from './DesktopExpandedView';

/**
 * 桌面端播放器视图
 * 优化桌面端横向布局，移除移动端特有逻辑
 */
const DesktopPlayerView = ({
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
  renderPlayModeIcon,
  getPlayModeTitle,
  playerUrl,
}) => {
  if (!currentTrack) return null;

  return (
    <>
      <div
        className={`player-backdrop ${lyricExpanded ? 'visible' : ''}`}
        onClick={toggleLyric}
      ></div>
      <div className={`audio-player ${lyricExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="player-inner">
          <div className="progress-control-container">
            <ProgressBar />
          </div>

          <div className="player-content">
            <DesktopPlayerControl
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              togglePlay={togglePlay}
              toggleLyric={toggleLyric}
              lyricExpanded={lyricExpanded}
              handlePrevious={handlePrevious}
              handleNext={handleNext}
              handleTogglePlayMode={handleTogglePlayMode}
              playMode={playMode}
              getPlayModeTitle={getPlayModeTitle}
              renderPlayModeIcon={renderPlayModeIcon}
              playerUrl={playerUrl}
            />
          </div>
        </div>
      </div>

      {lyricExpanded && (
        <DesktopExpandedView
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          toggleLyric={toggleLyric}
          lyricsContainerRef={lyricsContainerRef}
          processedLyrics={processedLyrics}
          currentLyricIndex={currentLyricIndex}
        />
      )}
    </>
  );
};

export default memo(DesktopPlayerView);

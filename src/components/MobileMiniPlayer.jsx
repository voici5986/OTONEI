import React from 'react';
import { FaPlay, FaPause } from 'react-icons/fa';
import { MdSkipPrevious, MdSkipNext } from 'react-icons/md';
import MobileAlbumCover from './MobileAlbumCover';
import HeartButton from './HeartButton';
import ProgressBar from './ProgressBar';
import { FaChevronDown } from 'react-icons/fa';
import { getTrackArtist } from '../utils/trackFormatter';

/**
 * 移动端迷你播放器组件
 * 负责移动端底部的迷你播放条显示，包含歌曲信息、播放控制和进度条
 * 以及展开模式的入口
 */
const MobileMiniPlayer = ({
  currentTrack,
  isPlaying,
  togglePlay,
  toggleLyric,
  lyricExpanded,
  handleTogglePlayMode,
  handlePrevious,
  handleNext,
  getPlayModeTitle,
  renderPlayModeIcon,
}) => {
  return (
    <div className="d-md-none h-100 w-100 mobile-mini-player">
      {/* 收起模式：左侧大空间信息，右侧仅红心和播放 */}
      <div className="row align-items-center h-100 m-0">
        <button
          type="button"
          className="col-8 d-flex align-items-center p-0 overflow-hidden player-track-summary"
          onClick={toggleLyric}
          aria-label="展开播放器和歌词"
        >
          <MobileAlbumCover track={currentTrack} size="small" imgSize={500} />
          <div className="track-info-container flex-grow-1 ms-2">
            <h6 className="mb-0 text-truncate track-name" style={{ width: '100%' }}>
              {currentTrack.name}
            </h6>
            <small
              className="text-muted text-truncate track-artist d-block"
              style={{ width: '100%' }}
            >
              {getTrackArtist(currentTrack) || '未知歌手'}
            </small>
          </div>
        </button>
        <div className="col-4 d-flex justify-content-end align-items-center p-0 player-mini-actions">
          <div className="d-flex align-items-center">
            <HeartButton
              track={currentTrack}
              size={24}
              variant="link"
              className="control-button accent-control me-1 p-0"
            />
            <button
              type="button"
              onClick={togglePlay}
              className="control-icon-btn ui-icon-button accent-control p-0"
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <FaPause size={24} /> : <FaPlay size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* 展开模式下的内容：通过 mobile-expanded-content CSS 控制显示隐藏 */}
      {lyricExpanded && (
        <div
          className="mobile-expanded-content"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 'var(--z-index-above)',
            pointerEvents: 'none',
          }}
        >
          <div
            className="mobile-expanded-player-content d-flex flex-column h-100 justify-content-end pb-2"
            style={{ position: 'relative', pointerEvents: 'auto' }}
          >
            {/* 歌曲信息：移至播放控制上方，作为模块的一部分 */}
            <div className="mobile-track-info-expanded d-md-none">
              <h5 className="track-name">{currentTrack.name}</h5>
              <div className="track-artist">{getTrackArtist(currentTrack) || '未知歌手'}</div>
            </div>

            {/* 移动端专用的进度条容器：放在歌曲信息和控制按钮之间 */}
            <div className="mobile-progress-container d-md-none px-4 w-100">
              <ProgressBar />
            </div>

            <div className="d-flex align-items-center justify-content-between px-4">
              <div className="player-control-slot">
                <button
                  type="button"
                  onClick={handleTogglePlayMode}
                  className="control-icon-btn ui-icon-button p-0"
                  title={getPlayModeTitle()}
                >
                  {renderPlayModeIcon()}
                </button>
              </div>

              <div className="player-control-slot">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="control-icon-btn ui-icon-button p-0"
                  aria-label="上一首"
                >
                  <MdSkipPrevious size={32} />
                </button>
              </div>

              <div className="player-control-slot player-control-slot--play">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="control-icon-btn ui-icon-button ui-icon-button--play accent-control p-0"
                  aria-label={isPlaying ? '暂停' : '播放'}
                >
                  <div className="play-pause-button mobile-expanded-play-button">
                    {isPlaying ? <FaPause size={48} /> : <FaPlay size={48} className="ms-1" />}
                  </div>
                </button>
              </div>

              <div className="player-control-slot">
                <button
                  type="button"
                  onClick={handleNext}
                  className="control-icon-btn ui-icon-button p-0"
                  aria-label="下一首"
                >
                  <MdSkipNext size={32} />
                </button>
              </div>

              <div className="player-control-slot">
                <HeartButton
                  track={currentTrack}
                  size={24}
                  variant="link"
                  className="control-button accent-control p-0"
                />
              </div>
            </div>

            {/* 收起按钮：作为 Flex 序列的最后一项，保持统一间距 */}
            <div className="d-flex justify-content-center mt-2">
              <button
                type="button"
                onClick={toggleLyric}
                className="ui-icon-button mobile-expanded-close text-muted opacity-75"
                aria-label="收起播放器"
              >
                <FaChevronDown size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileMiniPlayer;

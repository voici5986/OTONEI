import { memo } from 'react';
import '../styles/AudioPlayer.css';
import useAudioPlayerViewState from '../hooks/useAudioPlayerViewState';
import { usePlayer } from '../contexts/PlayerContext';
import { useDevice, useViewportWidth } from '../contexts/DeviceContext';
import { getPlayerViewportLayout } from '../config/responsive.mjs';
import MobilePlayerView from './MobilePlayerView';
import DesktopPlayerView from './DesktopPlayerView';
import PlayerHint from './PlayerHint';

/** 音频播放器容器，负责将状态分发到移动端或桌面端视图。 */
const AudioPlayer = ({ guideOpen = false }: { guideOpen?: boolean }) => {
  const playerContextProps = usePlayer();
  const viewState = useAudioPlayerViewState();
  const { isMobile } = useDevice();
  const viewportWidth = useViewportWidth();
  const { usesMobilePlayer } = getPlayerViewportLayout(isMobile, viewportWidth);
  const { currentTrack } = viewState;

  if (!currentTrack) return null;

  return (
    <>
      {usesMobilePlayer ? (
        <MobilePlayerView {...viewState} />
      ) : (
        <DesktopPlayerView {...viewState} playerUrl={playerContextProps.playerUrl} />
      )}
      <PlayerHint
        isPlaying={viewState.isPlaying}
        expanded={viewState.lyricExpanded}
        showMobileLyrics={viewState.showMobileLyrics}
        guideOpen={guideOpen}
        hasLyrics={viewState.processedLyrics.length > 0}
      />
    </>
  );
};

export default memo(AudioPlayer);

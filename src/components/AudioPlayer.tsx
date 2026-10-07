import { memo, useEffect, useState } from 'react';
import '../styles/AudioPlayer.css';
import useAudioPlayerViewState from '../hooks/useAudioPlayerViewState';
import { usePlayer } from '../contexts/PlayerContext';
import { useDevice } from '../contexts/DeviceContext';
import MobilePlayerView from './MobilePlayerView';
import DesktopPlayerView from './DesktopPlayerView';
import { VIEWPORT_BREAKPOINTS } from '../config/responsive.mjs';

/** 音频播放器容器，负责将状态分发到移动端或桌面端视图。 */
const AudioPlayer = () => {
  const playerContextProps = usePlayer();
  const viewState = useAudioPlayerViewState();
  const { isMobile } = useDevice();
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < VIEWPORT_BREAKPOINTS.md
  );
  const { currentTrack } = viewState;

  useEffect(() => {
    const updateViewport = () => setIsCompactViewport(window.innerWidth < VIEWPORT_BREAKPOINTS.md);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  if (!currentTrack) return null;

  return isMobile || isCompactViewport ? (
    <MobilePlayerView {...viewState} />
  ) : (
    <DesktopPlayerView {...viewState} playerUrl={playerContextProps.playerUrl} />
  );
};

export default memo(AudioPlayer);

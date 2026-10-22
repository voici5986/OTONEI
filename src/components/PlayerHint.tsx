import { useEffect, useRef, useState } from 'react';
import useGuidanceDismissal from '../hooks/useGuidanceDismissal';
import {
  COVER_LYRICS_HINT_STORAGE_KEY,
  DESKTOP_LYRICS_HINT_STORAGE_KEY,
  MOBILE_PLAYER_HINT_STORAGE_KEY,
} from '../services/guidanceStorage';
import useGuidanceLayout from '../hooks/useGuidanceLayout';
import ContextualCoachmark from './ContextualCoachmark';
import '../styles/UserGuidance.css';

interface PlayerHintProps {
  isPlaying: boolean;
  expanded: boolean;
  showMobileLyrics?: boolean;
  guideOpen?: boolean;
  hasLyrics?: boolean;
}

export default function PlayerHint({
  isPlaying,
  expanded,
  showMobileLyrics = false,
  guideOpen = false,
  hasLyrics = true,
}: PlayerHintProps) {
  const layout = useGuidanceLayout();
  const [hasEverPlayed, setHasEverPlayed] = useState(isPlaying);
  const [expansionDismissed, dismissExpansion] = useGuidanceDismissal(
    layout.usesMobilePlayer ? MOBILE_PLAYER_HINT_STORAGE_KEY : DESKTOP_LYRICS_HINT_STORAGE_KEY
  );
  const [coverDismissed, dismissCover] = useGuidanceDismissal(COVER_LYRICS_HINT_STORAGE_KEY);

  useEffect(() => {
    // This historical playback latch outlives pauses; the effect runs only on playback changes.
    // oxlint-disable-next-line react/set-state-in-effect
    if (isPlaying && !hasEverPlayed) setHasEverPlayed(true);
  }, [isPlaying, hasEverPlayed]);
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (expanded && !wasExpanded.current && !expansionDismissed) dismissExpansion();
    wasExpanded.current = expanded;
  }, [expanded, expansionDismissed, dismissExpansion]);
  const wasShowingLyrics = useRef(false);
  useEffect(() => {
    const showingLyrics = hasLyrics && layout.usesCoverLyricsToggle && expanded && showMobileLyrics;
    if (showingLyrics && !wasShowingLyrics.current && !coverDismissed) dismissCover();
    wasShowingLyrics.current = showingLyrics;
  }, [
    hasLyrics,
    layout.usesCoverLyricsToggle,
    expanded,
    showMobileLyrics,
    coverDismissed,
    dismissCover,
  ]);

  if ((!isPlaying && !hasEverPlayed) || guideOpen) return null;
  if (expanded) {
    if (!hasLyrics || !layout.usesCoverLyricsToggle || showMobileLyrics || coverDismissed)
      return null;
    return (
      <ContextualCoachmark
        key="cover"
        target="cover-lyrics"
        text="点封面查看歌词"
        label="歌词提示"
        onDismiss={dismissCover}
      />
    );
  }
  if (expansionDismissed || (layout.usesMobilePlayer && !layout.hasMiniPlayerEntry)) return null;
  return (
    <ContextualCoachmark
      key={layout.usesMobilePlayer ? 'summary' : 'lyrics'}
      target={layout.usesMobilePlayer ? 'player-summary' : 'lyric-toggle'}
      text={layout.usesMobilePlayer ? '点这里展开播放器' : '点这里展开歌词'}
      label="播放提示"
      onDismiss={dismissExpansion}
    />
  );
}

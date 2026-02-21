import React, { useEffect, useMemo, useState } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { FaRandom, FaRedo } from 'react-icons/fa';
import { MdRepeatOne } from 'react-icons/md';
import logger from '../utils/logger.js';

const useAudioPlayerViewState = () => {
  const {
    currentTrack,
    isPlaying,
    lyricExpanded,
    lyricData,
    currentLyricIndex,
    coverCache,
    currentPlaylist,
    playMode,
    playedSeconds,
    totalSeconds,
    togglePlay,
    toggleLyric,
    handlePrevious,
    handleNext,
    handleTogglePlayMode,
    seekTo,
    lyricsContainerRef,
    parseLyric
  } = usePlayer();

  const [showMobileLyrics, setShowMobileLyrics] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [startY, setStartY] = useState(0);

  useEffect(() => {
    if (lyricExpanded) {
      document.body.classList.add('player-expanded');
    } else {
      setShowMobileLyrics(false);
      document.body.classList.remove('player-expanded');
    }
  }, [lyricExpanded]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name,
      artist: currentTrack.artist,
      album: currentTrack.album || '',
      artwork: [
        {
          src: coverCache[`${currentTrack.source}_${currentTrack.pic_id}_500`] || 
               coverCache[`${currentTrack.source}_${currentTrack.pic_id}_300`] || 
               '/default_cover.svg',
          sizes: '500x500',
          type: 'image/png'
        }
      ]
    });

    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seekTo(details.seekTime);
      }
    });

    if (currentPlaylist.length > 1) {
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [currentTrack, coverCache, currentPlaylist, togglePlay, handlePrevious, handleNext, seekTo]);

  useEffect(() => {
    if ('mediaSession' in navigator && totalSeconds > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: totalSeconds,
          playbackRate: 1.0,
          position: Math.min(playedSeconds, totalSeconds)
        });
      } catch (error) {
        logger.error('[MediaSession] setPositionState failed:', error);
      }
    }
  }, [playedSeconds, totalSeconds]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const processedLyrics = useMemo(() => {
    if (!lyricData.parsedLyric) return [];
    const translatedLines = lyricData.tLyric ? parseLyric(lyricData.tLyric) : [];
    return lyricData.parsedLyric.map((line, index) => ({
      ...line,
      translatedText: translatedLines[index]?.text || ''
    }));
  }, [lyricData, parseLyric]);

  useEffect(() => {
    if (lyricExpanded && currentLyricIndex >= 0 && lyricsContainerRef.current) {
      const activeLine = lyricsContainerRef.current.querySelector('.active');
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLyricIndex, lyricExpanded, lyricsContainerRef]);

  const handleTouchStart = (e) => {
    if (!lyricExpanded || showMobileLyrics) return;
    setStartY(e.touches[0].clientY);
    setIsDragging(false);
    setDragOffsetY(0);
  };

  const handleTouchMove = (e) => {
    if (!lyricExpanded || showMobileLyrics) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      setDragOffsetY(deltaY);
      if (deltaY > 10 && !isDragging) {
        setIsDragging(true);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!lyricExpanded || showMobileLyrics) return;

    if (isDragging && dragOffsetY > 120) {
      toggleLyric();
    }

    setIsDragging(false);
    setDragOffsetY(0);
  };

  const getPlayModeTitle = () => {
    switch (playMode) {
      case 'random': return '随机播放';
      case 'repeat-one': return '单曲循环';
      case 'sequence': return '列表循环';
      default: return '列表循环';
    }
  };

  const renderPlayModeIcon = () => {
    switch (playMode) {
      case 'random': return <FaRandom size={20} />;
      case 'repeat-one': return <MdRepeatOne size={22} />;
      case 'sequence': return <FaRedo size={18} />;
      default: return <FaRedo size={18} />;
    }
  };

  return {
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
    getPlayModeTitle,
    renderPlayModeIcon
  };
};

export default useAudioPlayerViewState;

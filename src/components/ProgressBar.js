import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { usePlayer } from '../contexts/PlayerContext';

const ProgressBar = () => {
  const {
    currentTrack,
    playProgress,
    totalSeconds,
    seekTo,
    formatTime,
    isPlaying,
    setIsPlaying
  } = usePlayer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [lastReleasedProgress, setLastReleasedProgress] = useState(null);

  const justReleasedRef = useRef(false);
  const releaseTimeoutRef = useRef(null);
  const wasPlayingRef = useRef(false);
  const progressBarRef = useRef(null);

  // 全局事件处理：处理拖拽过程和结束
  useEffect(() => {
    if (!isDragging) return;

    const handleDragMove = (e) => {
      if (!progressBarRef.current || !currentTrack) return;

      // 兼容鼠标和触摸事件
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      setDragProgress(position * 100);
      // 实时 seek 实现“听音辨位” (Scrubbing)，如果性能有问题可改为仅更新 UI
      seekTo(position * totalSeconds);
    };

    const handleDragEnd = () => {
      // 兼容触摸结束
      setLastReleasedProgress(dragProgress);
      justReleasedRef.current = true;

      if (releaseTimeoutRef.current) clearTimeout(releaseTimeoutRef.current);
      releaseTimeoutRef.current = setTimeout(() => {
        justReleasedRef.current = false;
        setLastReleasedProgress(null);
      }, 1000);

      setIsDragging(false);
      setIsTouched(false);

      // 如果之前在播放，则恢复
      if (wasPlayingRef.current) {
        setTimeout(() => setIsPlaying(true), 50);
      }
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);

    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, dragProgress, setIsPlaying, currentTrack, seekTo, totalSeconds]);

  // 只保留 MouseDown/TouchStart 在元素上
  const handleMouseDown = useCallback((e) => {
    if (!currentTrack) return;

    // 阻止默认行为防止选中文本
    // e.preventDefault(); 

    wasPlayingRef.current = isPlaying;
    setIsDragging(true);
    if (e.touches) setIsTouched(true);

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    setDragProgress(position * 100);
    seekTo(position * totalSeconds);
  }, [currentTrack, isPlaying, seekTo, totalSeconds]);

  const displayProgress = isDragging
    ? dragProgress
    : (justReleasedRef.current && lastReleasedProgress !== null)
      ? lastReleasedProgress
      : playProgress;

  const currentTimeInSeconds = (totalSeconds * displayProgress) / 100;

  return (
    <div
      className="progress-wrapper"
      ref={progressBarRef}
      style={{
        padding: '10px 0', // 增加上下内边距，扩大移动端点击区域
        margin: '-10px 0', //抵消 padding，保持视觉位置不变
        width: '100%',
        cursor: currentTrack ? 'pointer' : 'default',
        position: 'relative',
        zIndex: 'var(--z-index-above)',
        touchAction: 'none' // 禁用默认触摸行为，优化滑动体验
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {(isHovering || isDragging || isTouched) && (
        <div 
          className="time-display-dynamic" 
          style={{ 
            position: 'absolute',
            top: '-45px', // 稍微再调高一点
            left: `${displayProgress}%`,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.75rem', 
            fontWeight: '600',
            color: 'var(--color-text-primary)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            backgroundColor: 'var(--card-background, #fff)', // 使用主题背景色
            padding: '4px 10px',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            zIndex: 'var(--z-index-player-base)',
            border: '1px solid var(--color-border, rgba(0,0,0,0.1))'
          }}
        >
          <span>{formatTime(currentTimeInSeconds)} / {formatTime(totalSeconds)}</span>
          {/* 小三角形 */}
          <div style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--card-background, #fff)',
          }} />
        </div>
      )}

      <div 
        className={`progress ${(isHovering || isDragging || isTouched) ? 'is-active' : ''}`}
        style={{ 
          height: (isHovering || isDragging || isTouched) ? '6px' : '3px', 
          minHeight: '3px',
          position: 'relative', 
          transition: 'height 0.2s ease',
          backgroundColor: 'transparent',
          borderRadius: '0',
          border: 'none',
          boxShadow: 'none'
        }}
      >
        <div 
          className="progress-bar" 
          style={{ 
            width: `${displayProgress}%`, 
            height: '100%', 
            minHeight: '3px',
            transition: 'none',
            backgroundColor: 'var(--color-accent, #ff4d4f)',
            border: 'none',
            boxShadow: 'none'
          }} 
        />
        {(isDragging || isHovering || isTouched) && (
          <div
            className="progress-handle"
            style={{
              position: 'absolute',
              left: `calc(${displayProgress}% - 6px)`,
              top: '-4px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent, #ff4d4f)',
              boxShadow: '0 0 4px rgba(0,0,0,0.2)',
              zIndex: 'var(--z-index-above)'
            }}
          />
        )}
      </div>
    </div>
  );
};

export default memo(ProgressBar);

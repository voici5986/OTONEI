import React from 'react';

/**
 * 歌词切换按钮组件
 * 封装歌词展开/收起按钮的逻辑，减少代码重复
 */
export const LyricToggleButton = ({ expanded, onToggle, className = '', iconOnly = true, customIcon = null }) => {
  return (
    <button
      onClick={onToggle}
      className={`${className} control-button`}
      aria-label={expanded ? "收起歌词" : "展开歌词"}
      title={expanded ? "收起歌词" : "展开歌词"}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {customIcon ? (
        customIcon
      ) : iconOnly ? (
        <img
          src="/lyric.svg"
          alt="歌词"
          width="20"
          height="20"
          className="lyric-icon"
        />
      ) : (
        expanded ? "收起歌词" : "展开歌词"
      )}
    </button>
  );
};

/**
 * 歌词行组件
 * 封装歌词行的渲染逻辑，减少代码重复
 */
export const LyricLine = ({ line, index, isActive, isNextActive }) => {
  return (
    <div
      key={index}
      className={`lyric-line ${isActive ? 'active' : ''} ${isNextActive ? 'next-active' : ''}`}
      data-time={line.time}
      data-index={index}
      style={{
        padding: '10px 15px',
        textAlign: 'center',
        width: '100%',
        maxWidth: '100%',
        wordBreak: 'break-word',
        whiteSpace: 'normal',
        overflow: 'hidden',
        boxSizing: 'border-box',
        backgroundColor: 'transparent',
        borderLeft: 'none',
        transition: 'all 0.3s ease',
        fontWeight: isActive ? '600' : 'normal',
        fontSize: isActive ? '1.25rem' : '1rem',
        color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        borderRadius: 0,
        boxShadow: 'none',
        marginBottom: '12px',
        position: 'relative'
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: '100%',
        wordBreak: 'break-word',
        letterSpacing: isActive ? '0.02em' : 'normal'
      }}>
        {line.text}
      </div>
      {line.translatedText && (
        <div style={{
          width: '100%',
          maxWidth: '100%',
          wordBreak: 'break-word',
          paddingLeft: 0,
          marginTop: '6px',
          color: isActive ? 'var(--color-text-tertiary)' : 'var(--color-text-muted)',
          fontSize: isActive ? '1rem' : '0.9rem',
          fontWeight: isActive ? '500' : 'normal'
        }} className="translated-lyric">
          {line.translatedText}
        </div>
      )}
    </div>
  );
};

/**
 * 虚拟滚动歌词组件
 * 封装虚拟滚动歌词的渲染逻辑，减少代码重复
 */
const VirtualizedLyrics = ({ processedLyrics, visibleRange, lyricLineHeight, currentLyricIndex }) => {
  // 如果没有歌词，显示提示
  if (!processedLyrics || processedLyrics.length === 0) {
    return <div className="text-center text-muted py-5">暂无歌词</div>;
  }

  // 计算占位元素高度
  const placeholderHeight = visibleRange.start * lyricLineHeight;
  const bottomPlaceholderHeight = Math.max(0, (processedLyrics.length - visibleRange.end) * lyricLineHeight);

  return (
    <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {placeholderHeight > 0 && (
        <div style={{ height: `${placeholderHeight}px` }}></div>
      )}

      {processedLyrics.slice(visibleRange.start, visibleRange.end).map((line, virtualIndex) => {
        const index = visibleRange.start + virtualIndex;
        const isActive = index === currentLyricIndex;
        const isNextActive = index === currentLyricIndex + 1;

        return (
          <LyricLine
            key={index}
            line={line}
            index={index}
            isActive={isActive}
            isNextActive={isNextActive}
          />
        );
      })}

      {bottomPlaceholderHeight > 0 && (
        <div style={{ height: `${bottomPlaceholderHeight}px` }}></div>
      )}
    </div>
  );
};

/**
 * 播放控制按钮组件
 * 封装播放控制按钮的通用逻辑，减少代码重复
 */
const PlayerControlButton = ({
  onClick,
  disabled = false,
  className = '',
  ariaLabel = '',
  title = '',
  children
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`control-button control-icon-btn ${className}`}
      aria-label={ariaLabel}
      title={title}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {children}
    </button>
  );
};

import React from 'react';
import { FaDownload, FaTrash } from 'react-icons/fa';
import HeartButton from './HeartButton';

/**
 * MusicCardActions - 统一的音乐卡片操作按钮组件
 *
 * @param {Object} track - 歌曲对象
 * @param {Boolean} isDownloading - 是否正在下载当前歌曲
 * @param {Function} onDownload - 下载回调
 * @param {Boolean} showDelete - 是否显示删除按钮（目前统一用 HeartButton 代替，保留参数供未来扩展）
 * @param {Function} onDelete - 删除回调（目前统一用 HeartButton 的 toggle 逻辑）
 */
const MusicCardActions = ({
  track,
  isDownloading,
  onDownload,
  showDelete = false,
  onDelete = null,
}) => {
  return (
    <div className="music-card-actions" onClick={(e) => e.stopPropagation()}>
      {/* 收藏按钮 - 统一使用 HeartButton */}
      <HeartButton track={track} variant="link" className="accent-action" />

      {/* 删除按钮 - 如果明确需要独立删除按钮则显示 */}
      {showDelete && onDelete && (
        <button
          className="me-1 btn-outline-danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(track);
          }}
        >
          <FaTrash />
        </button>
      )}

      {/* 下载按钮 - 统一下载状态反馈 */}
      <button
        className="btn-outline-success"
        onClick={(e) => {
          e.stopPropagation();
          onDownload(track);
        }}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <span className="spinner-custom" style={{ width: '1rem', height: '1rem' }}></span>
        ) : (
          <FaDownload />
        )}
      </button>
    </div>
  );
};

export default MusicCardActions;

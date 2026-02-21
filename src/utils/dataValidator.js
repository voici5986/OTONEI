/**
 * 数据校验工具
 * 确保从API返回的数据结构符合预期，防止运行时错误
 */

/**
 * 校验单个音轨对象
 * @param {any} track - 从API获取的原始音轨对象
 * @returns {object} - 经过校验和清洗的音轨对象
 */
const validateTrack = (track) => {
  if (!track || typeof track !== 'object') {
    return null; // 如果track无效，则返回null
  }
  return {
    id: track.id || `unknown-${Date.now()}-${Math.random()}`,
    name: String(track.name || '未知歌曲'),
    artist: String(track.artist || '未知艺术家'),
    album: String(track.album || '未知专辑'),
    pic_id: track.pic_id || null,
    lyric_id: track.lyric_id || null,
    source: track.source || 'unknown',
  };
};

/**
 * 校验搜索结果数组
 * @param {any} results - 从API获取的原始搜索结果
 * @returns {Array<object>} - 经过校验和清洗的音轨对象数组
 */
export const validateSearchResults = (results) => {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map(validateTrack).filter(Boolean); // filter(Boolean) 会移除所有无效的track
};

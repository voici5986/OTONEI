/**
 * Resolve a direct cover URL from various possible track shapes.
 * Returns empty string if not found.
 * @param {Object} track
 * @returns {string}
 */
export const getTrackCoverUrl = (track) => {
  if (!track) return '';
  const candidates = [
    track.picUrl,
    track.pic_url,
    track.cover,
    track.coverUrl,
    track.image,
    track.img,
    track.al?.picUrl,
    track.al?.pic_url,
    track.album?.picUrl,
    track.album?.pic_url,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

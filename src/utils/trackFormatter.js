/**
 * Normalize track artist display for inconsistent API shapes.
 * @param {Object} track
 * @returns {string}
 */
export const getTrackArtist = (track) => {
  if (!track) return '';
  if (Array.isArray(track.ar)) {
    return track.ar.map(a => a?.name || '').filter(Boolean).join(' / ');
  }
  if (Array.isArray(track.artists)) {
    return track.artists.map(a => a?.name || '').filter(Boolean).join(' / ');
  }
  if (track.artist) {
    return typeof track.artist === 'string' ? track.artist : (track.artist.name || '');
  }
  return '';
};


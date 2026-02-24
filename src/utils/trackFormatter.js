/**
 * Normalize track artist display for inconsistent API shapes.
 * @param {Object} track
 * @returns {string}
 */
export const getTrackArtist = (track) => {
  if (!track) return '';
  if (Array.isArray(track.ar)) {
    return track.ar
      .map((a) => a?.name || '')
      .filter(Boolean)
      .join(' / ');
  }
  if (Array.isArray(track.artists)) {
    return track.artists
      .map((a) => a?.name || '')
      .filter(Boolean)
      .join(' / ');
  }
  if (Array.isArray(track.artist)) {
    return track.artist
      .map((a) => (typeof a === 'string' ? a : a?.name || ''))
      .filter(Boolean)
      .join(' / ');
  }
  if (track.artist) {
    return typeof track.artist === 'string' ? track.artist : track.artist.name || '';
  }
  if (track.artistsname) return String(track.artistsname);
  if (track.singer) return String(track.singer);
  if (track.author) return String(track.author);
  if (track.composer) return String(track.composer);
  if (track.al?.artist) {
    const alArtist = track.al.artist;
    return typeof alArtist === 'string' ? alArtist : alArtist?.name || '';
  }
  return '';
};

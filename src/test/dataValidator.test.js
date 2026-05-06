import { describe, expect, it } from 'vitest';
import { validateSearchResults } from '../utils/dataValidator';

describe('validateSearchResults', () => {
  it('keeps raw track fields needed by cover and artist formatters', () => {
    const [track] = validateSearchResults([
      {
        id: '1',
        name: 'Track',
        source: 'netease',
        picUrl: 'https://example.com/cover.jpg',
        ar: [{ name: 'Artist A' }],
        album: { picUrl: 'https://example.com/album.jpg' },
      },
    ]);

    expect(track.picUrl).toBe('https://example.com/cover.jpg');
    expect(track.ar).toEqual([{ name: 'Artist A' }]);
    expect(track.album).toEqual({ picUrl: 'https://example.com/album.jpg' });
  });

  it('normalizes common pic and lyric id aliases', () => {
    const [track] = validateSearchResults([
      {
        id: '1',
        name: 'Track',
        picId: 'pic-1',
        lyricId: 'lyric-1',
      },
    ]);

    expect(track.pic_id).toBe('pic-1');
    expect(track.lyric_id).toBe('lyric-1');
  });

  it('drops invalid rows and fills required defaults', () => {
    const result = validateSearchResults([null, { name: null }]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('未知歌曲');
    expect(result[0].source).toBe('unknown');
  });
});

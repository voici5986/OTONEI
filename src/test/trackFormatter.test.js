import { describe, expect, it } from 'vitest';
import { getTrackArtist } from '../utils/trackFormatter';

describe('getTrackArtist', () => {
  // --- 基础功能测试 ---
  describe('Basic Functionality', () => {
    it('handles artist string', () => {
      expect(getTrackArtist({ artist: 'Artist A' })).toBe('Artist A');
    });

    it('handles artist object', () => {
      expect(getTrackArtist({ artist: { name: 'Artist B' } })).toBe('Artist B');
    });

    it('handles artist array of strings', () => {
      expect(getTrackArtist({ artist: ['A', 'B'] })).toBe('A / B');
    });

    it('handles artist array of objects', () => {
      expect(getTrackArtist({ artist: [{ name: 'A' }, { name: 'B' }] })).toBe('A / B');
    });
  });

  // --- 优先级测试 (Precedence) ---
  describe('Field Precedence', () => {
    it('prioritizes "ar" array over "artists"', () => {
      const track = {
        ar: [{ name: 'Primary' }],
        artists: [{ name: 'Secondary' }],
      };
      expect(getTrackArtist(track)).toBe('Primary');
    });

    it('prioritizes "artists" array over "artist"', () => {
      const track = {
        artists: [{ name: 'Primary' }],
        artist: 'Secondary',
      };
      expect(getTrackArtist(track)).toBe('Primary');
    });

    it('prioritizes "artist" over fallback fields', () => {
      const track = {
        artist: 'Primary',
        artistsname: 'Secondary',
        singer: 'Tertiary',
      };
      expect(getTrackArtist(track)).toBe('Primary');
    });

    it('prioritizes "artist" over "al.artist"', () => {
      const track = {
        artist: 'Primary',
        al: { artist: 'Secondary' },
      };
      expect(getTrackArtist(track)).toBe('Primary');
    });
  });

  // --- 备用字段测试 (Fallbacks) ---
  describe('Fallback Fields', () => {
    it('falls back to "artistsname"', () => {
      expect(getTrackArtist({ artistsname: 'Artist C' })).toBe('Artist C');
    });

    it('falls back to "singer"', () => {
      expect(getTrackArtist({ singer: 'Singer A' })).toBe('Singer A');
    });

    it('falls back to "author"', () => {
      expect(getTrackArtist({ author: 'Author B' })).toBe('Author B');
    });

    it('falls back to "composer"', () => {
      expect(getTrackArtist({ composer: 'Composer C' })).toBe('Composer C');
    });

    it('falls back to "al.artist" (nested object)', () => {
      expect(getTrackArtist({ al: { artist: 'Album Artist' } })).toBe('Album Artist');
      expect(getTrackArtist({ al: { artist: { name: 'Album Artist Obj' } } })).toBe(
        'Album Artist Obj'
      );
    });
  });

  // --- 边界情况与脏数据 (Edge Cases & Dirty Data) ---
  describe('Edge Cases & Dirty Data', () => {
    it('returns empty string for null/undefined input', () => {
      expect(getTrackArtist(null)).toBe('');
      expect(getTrackArtist(undefined)).toBe('');
    });

    it('returns empty string for empty object', () => {
      expect(getTrackArtist({})).toBe('');
    });

    it('filters out null/undefined/empty values in arrays', () => {
      const track = {
        ar: [{ name: 'Valid' }, null, undefined, { name: '' }, { name: null }],
      };
      expect(getTrackArtist(track)).toBe('Valid');
    });

    it('handles mixed types in "artist" array', () => {
      const track = {
        artist: ['String Artist', { name: 'Object Artist' }, null],
      };
      expect(getTrackArtist(track)).toBe('String Artist / Object Artist');
    });

    it('ignores artist array items without name', () => {
      const track = {
        artist: [{ id: 1 }, { name: 'Valid' }, null],
      };
      expect(getTrackArtist(track)).toBe('Valid');
    });
  });
});

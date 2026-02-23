import { describe, expect, it } from 'vitest';
import { getTrackArtist } from '../utils/trackFormatter';

describe('getTrackArtist', () => {
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

  it('handles artists array', () => {
    expect(getTrackArtist({ artists: [{ name: 'A' }, { name: 'B' }] })).toBe('A / B');
  });

  it('handles ar array', () => {
    expect(getTrackArtist({ ar: [{ name: 'A' }, { name: 'B' }] })).toBe('A / B');
  });

  it('falls back to other fields', () => {
    expect(getTrackArtist({ artistsname: 'Artist C' })).toBe('Artist C');
  });
});


import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_TYPES,
  clearMemoryCache,
  getMemoryCache,
  setMemoryCache,
} from '../services/memoryCache';

describe('memory cache', () => {
  beforeEach(() => {
    clearMemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves typed values', () => {
    const value = { id: 'track-1' };
    expect(setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'track', value)).toBe(value);
    expect(getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'track')).toEqual(value);
  });

  it('returns null after an item expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'track', 'value');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'track')).toBeNull();
  });

  it('retains an overwritten entry as most recently used when evicting', () => {
    for (let index = 0; index < 200; index++)
      setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, String(index), index);
    setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, '0', 'updated');
    setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'new', 'new');
    expect(getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, '0')).toBe('updated');
    expect(getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, '1')).toBeNull();
  });

  it('clears one cache type without touching another', () => {
    setMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'search', ['result']);
    setMemoryCache(CACHE_TYPES.LYRICS, 'lyric', { raw: 'text', translated: '' });

    clearMemoryCache(CACHE_TYPES.SEARCH_RESULTS);

    expect(getMemoryCache(CACHE_TYPES.SEARCH_RESULTS, 'search')).toBeNull();
    expect(getMemoryCache(CACHE_TYPES.LYRICS, 'lyric')).toEqual({ raw: 'text', translated: '' });
  });
});

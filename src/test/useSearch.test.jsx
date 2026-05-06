import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useSearch from '../hooks/useSearch';
import { searchMusic } from '../services/musicApiService';

vi.mock('../services/musicApiService', () => ({
  searchMusic: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  addSearchHistory: vi.fn(),
}));

vi.mock('../utils/errorHandler', () => ({
  handleError: vi.fn(),
  ErrorTypes: { SEARCH: 'SEARCH' },
  ErrorSeverity: { ERROR: 'ERROR' },
  checkNetworkStatus: vi.fn(() => true),
  validateSearchParams: vi.fn(() => true),
}));

vi.mock('react-toastify', () => ({
  toast: {
    info: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

const createTracks = (start, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${start + index}`,
    name: `Track ${start + index}`,
    source: 'netease',
  }));

describe('useSearch pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads page 1 then appends page 2 with the current API rule', async () => {
    searchMusic
      .mockResolvedValueOnce(createTracks(1, 20))
      .mockResolvedValueOnce(createTracks(21, 3));

    const { result } = renderHook(() => useSearch(true));

    act(() => {
      result.current.setQuery('周杰伦');
    });

    await act(async () => {
      await result.current.handleSearch({ preventDefault: vi.fn() });
    });

    expect(searchMusic).toHaveBeenCalledWith('周杰伦', 'netease', 20, 1);
    expect(result.current.results).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.handleLoadMore();
    });

    expect(searchMusic).toHaveBeenLastCalledWith('周杰伦', 'netease', 20, 2);
    expect(result.current.results).toHaveLength(23);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.page).toBe(2);
  });

  it('dedupes same-source duplicate ids on the first page', async () => {
    searchMusic.mockResolvedValueOnce([
      { id: '1', name: 'Same A', source: 'netease' },
      { id: '1', name: 'Same B', source: 'netease' },
      { id: '1', name: 'Other Source', source: 'kuwo' },
    ]);

    const { result } = renderHook(() => useSearch(true));

    act(() => {
      result.current.setQuery('重复歌曲');
    });

    await act(async () => {
      await result.current.handleSearch({ preventDefault: vi.fn() });
    });

    expect(result.current.results).toEqual([
      { id: '1', name: 'Same A', source: 'netease' },
      { id: '1', name: 'Other Source', source: 'kuwo' },
    ]);
  });
});

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { fetchAvatarDataUrl, getAvatarCache, setAvatarCache } = vi.hoisted(() => ({
  fetchAvatarDataUrl: vi.fn(),
  getAvatarCache: vi.fn(),
  setAvatarCache: vi.fn(),
}));
vi.mock('../utils/avatarCache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAvatarDataUrl,
  getAvatarCache,
  setAvatarCache,
}));
import { clearMemoryCache } from '../services/memoryCache';
import { clearAvatarCache } from '../utils/avatarCache';
import AvatarImage from '../components/AvatarImage';

describe('avatar image lifecycle', () => {
  it('drops the displayed cache and prevents an old load from repopulating cleared avatars', async () => {
    getAvatarCache.mockReturnValueOnce('data:cached').mockReturnValue(null);
    const { rerender } = render(<AvatarImage cacheKey="account" fallback={<span>Missing</span>} />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:cached');
    act(() => {
      clearMemoryCache();
      clearAvatarCache();
    });
    expect(screen.queryByRole('img')).toBeNull();
    let resolveFetch;
    fetchAvatarDataUrl.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    rerender(<AvatarImage src="https://test/photo" cacheKey="account" />);
    fireEvent.load(screen.getByRole('img'));
    act(() => {
      clearMemoryCache();
      clearAvatarCache();
    });
    await act(async () => resolveFetch('data:old'));
    expect(setAvatarCache).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    fetchAvatarDataUrl.mockReset();
    getAvatarCache.mockReset();
    setAvatarCache.mockReset();
  });

  it('does not reuse the previous account cache when the key changes', () => {
    getAvatarCache.mockImplementation((key) => (key === 'first' ? 'data:first' : null));
    const { rerender } = render(<AvatarImage cacheKey="first" fallback={<span>Missing</span>} />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:first');
    rerender(<AvatarImage cacheKey="second" fallback={<span>Missing</span>} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Missing')).toBeTruthy();
  });

  it('ignores a completed fetch from a replaced source, even for the same cache key', async () => {
    let completeOld;
    fetchAvatarDataUrl.mockReturnValueOnce(
      new Promise((resolve) => {
        completeOld = resolve;
      })
    );
    fetchAvatarDataUrl.mockResolvedValueOnce('data:new');
    const { rerender } = render(<AvatarImage src="https://test/old" cacheKey="account" />);
    fireEvent.load(screen.getByRole('img'));
    rerender(<AvatarImage src="https://test/new" cacheKey="account" />);
    await act(async () => {
      completeOld('data:old');
    });
    expect(setAvatarCache).not.toHaveBeenCalled();
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://test/new');
    await act(async () => {
      fireEvent.load(screen.getByRole('img'));
    });
    expect(setAvatarCache).toHaveBeenCalledWith('account', 'data:new');
  });

  it('tries cached image on error and resets failure when the source changes', () => {
    getAvatarCache.mockReturnValue('data:cached');
    const { rerender } = render(
      <AvatarImage src="https://test/bad" cacheKey="account" fallback={<span>Missing</span>} />
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:cached');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<AvatarImage src="https://test/good" cacheKey="account" />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://test/good');
  });
});

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const player = vi.hoisted(() => ({
  coverCache: {} as Record<string, string>,
  fetchCover: vi.fn(),
}));
vi.mock('../contexts/PlayerContext', () => ({ usePlayer: () => player }));
import useAlbumCoverImage from '../hooks/useAlbumCoverImage';
describe('album image fallback', () => {
  it.each(['direct', 'cached'])('keeps the fallback when a %s cover fails', (kind) => {
    const track = {
      id: 'one',
      source: 'netease',
      name: 'Song',
      pic_id: 'pic',
      ...(kind === 'direct' ? { picUrl: '/broken.jpg' } : {}),
    };
    player.coverCache = kind === 'cached' ? { netease_pic_500: '/broken.jpg' } : {};
    const { result } = renderHook(() => useAlbumCoverImage(track));
    expect(result.current.imageUrl).toBe('/broken.jpg');
    act(() => result.current.handleImageError());
    expect(result.current.imageUrl).toBe('/default_cover.svg');
  });
});

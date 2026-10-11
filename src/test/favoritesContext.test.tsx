import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, getFavorites } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'user-a', isLocal: false } },
  getFavorites: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser }),
}));

vi.mock('../contexts/SyncContext', () => ({
  useSync: () => ({ updatePendingChanges: vi.fn() }),
}));

vi.mock('../services/storage', () => ({
  getFavorites,
  subscribeStorageChanges: () => () => {},
  toggleFavorite: vi.fn(),
}));

vi.mock('../services/syncService', () => ({
  triggerDelayedSync: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  default: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { FavoritesProvider, useFavorites } from '../contexts/FavoritesContext';

const FavoriteNames = () => {
  const { favorites } = useFavorites();
  return <div>{favorites.map((favorite) => favorite.name).join(',')}</div>;
};

describe('FavoritesProvider account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'user-a', isLocal: false };
  });

  it('ignores a previous account read that completes after the account changes', async () => {
    let resolveUserA: (value: unknown[]) => void = () => {};
    getFavorites.mockImplementation((uid) => {
      if (uid === 'user-a') {
        return new Promise((resolve) => {
          resolveUserA = resolve;
        });
      }
      return Promise.resolve([{ id: 'b', source: 'kuwo', name: 'User B song' }]);
    });

    const view = render(
      <FavoritesProvider>
        <FavoriteNames />
      </FavoritesProvider>
    );

    authState.currentUser = { uid: 'user-b', isLocal: false };
    view.rerender(
      <FavoritesProvider>
        <FavoriteNames />
      </FavoritesProvider>
    );
    expect(await screen.findByText('User B song')).toBeInTheDocument();

    await act(async () => {
      resolveUserA([{ id: 'a', source: 'netease', name: 'User A song' }]);
    });

    expect(screen.getByText('User B song')).toBeInTheDocument();
    expect(screen.queryByText('User A song')).not.toBeInTheDocument();
  });
});

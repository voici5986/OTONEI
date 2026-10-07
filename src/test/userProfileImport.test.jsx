import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getFavorites: vi.fn(),
  getFavoritesStrict: vi.fn(),
  getHistory: vi.fn(),
  saveFavorites: vi.fn(),
  searchMusic: vi.fn(),
  updatePendingChanges: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../contexts/SyncContext', () => ({
  useSync: () => ({ syncStatus: {}, updatePendingChanges: mocks.updatePendingChanges }),
}));
vi.mock('../services/storage', () => ({
  getFavorites: mocks.getFavorites,
  getFavoritesStrict: mocks.getFavoritesStrict,
  getHistory: mocks.getHistory,
  saveFavorites: mocks.saveFavorites,
  incrementPendingChanges: vi.fn(),
  MAX_FAVORITES_ITEMS: 1000,
}));
vi.mock('../services/musicApiService', () => ({ searchMusic: mocks.searchMusic }));
vi.mock('../services/syncService', () => ({
  triggerDelayedSync: vi.fn(),
  triggerImmediateSync: vi.fn(),
}));
vi.mock('react-toastify', () => ({ toast: mocks.toast }));
vi.mock('../utils/logger.js', () => ({ default: mocks.logger }));
vi.mock('../components/ClearDataButton', () => ({ default: () => null }));
vi.mock('../components/AvatarImage', () => ({ default: () => null }));

import UserProfile from '../components/UserProfile';

const track = { id: 'song-1', name: 'Song', artist: 'Artist', source: 'netease' };
const localUser = { uid: 'local-user', displayName: 'Local user', isLocal: true };

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const openImport = async (container) => {
  fireEvent.click(screen.getByRole('button', { name: '数据管理' }));
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: {
      files: [
        new File([JSON.stringify({ timestamp: 0, favorites: [track] })], 'favorites.json', {
          type: 'application/json',
        }),
      ],
    },
  });
  return screen.findByRole('dialog', { name: '导入收藏' });
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useAuth.mockReturnValue({ currentUser: localUser, signOut: vi.fn() });
  mocks.getFavorites.mockResolvedValue([]);
  mocks.getFavoritesStrict.mockResolvedValue([]);
  mocks.getHistory.mockResolvedValue([]);
  mocks.saveFavorites.mockResolvedValue(true);
  mocks.searchMusic.mockResolvedValue([track]);
});

afterEach(cleanup);

describe('UserProfile import lifecycle', () => {
  it.each(['Escape', 'backdrop', 'close button'])(
    'blocks %s and reentry while importing',
    async (closeMethod) => {
      const search = deferred();
      mocks.searchMusic.mockReturnValue(search.promise);
      const { container } = render(<UserProfile />);
      const dialog = await openImport(container);
      const start = screen.getByRole('button', { name: '开始导入' });

      // Both clicks arrive before React commits disabled state.
      act(() => {
        start.click();
        start.click();
      });
      await waitFor(() => expect(mocks.searchMusic).toHaveBeenCalledTimes(1));

      if (closeMethod === 'Escape') {
        fireEvent.keyDown(document, { key: 'Escape' });
      } else if (closeMethod === 'backdrop') {
        fireEvent.click(dialog.parentElement);
      } else {
        fireEvent.click(screen.getByRole('button', { name: '关闭导入收藏对话框' }));
      }
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(screen.getByRole('button', { name: '导入中...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '关闭导入收藏对话框' })).toBeDisabled();

      // A second selected file cannot replace the running import's state.
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [new File(['{"favorites":[]}'], 'second.json')] },
      });
      expect(screen.getByText('检测到 1 首歌曲')).toBeInTheDocument();
      fireEvent.click(start);
      expect(mocks.searchMusic).toHaveBeenCalledTimes(1);
      expect(mocks.saveFavorites).not.toHaveBeenCalled();

      await act(async () => search.resolve([track]));
      await waitFor(() => expect(screen.getByRole('button', { name: '开始导入' })).toBeEnabled());
      expect(mocks.saveFavorites).toHaveBeenCalledTimes(1);
      expect(mocks.saveFavorites).toHaveBeenCalledWith(
        [expect.objectContaining(track)],
        localUser.uid
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it('keeps the dialog locked until favorites persistence completes', async () => {
    const save = deferred();
    mocks.saveFavorites.mockReturnValue(save.promise);
    const { container } = render(<UserProfile />);
    const dialog = await openImport(container);
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
    await waitFor(() => expect(mocks.saveFavorites).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByRole('button', { name: '导入中...' })).toBeDisabled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await act(async () => save.resolve(true));
    expect(screen.getByRole('button', { name: '开始导入' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['read rejection', 'save rejection', 'save refusal'])(
    'releases the import lock after %s',
    async (failure) => {
      const { container } = render(<UserProfile />);
      await openImport(container);
      if (failure === 'read rejection') {
        mocks.getFavoritesStrict.mockRejectedValueOnce(new Error('Read failed'));
      } else if (failure === 'save rejection') {
        mocks.saveFavorites.mockRejectedValueOnce(new Error('Save failed'));
      } else {
        mocks.saveFavorites.mockResolvedValueOnce(false);
      }

      fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
      await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
      if (failure === 'read rejection') {
        expect(mocks.saveFavorites).not.toHaveBeenCalled();
        expect(mocks.searchMusic).not.toHaveBeenCalled();
      }
      expect(screen.getByRole('button', { name: '开始导入' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
      await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('成功导入 1 首歌曲'));
      fireEvent.click(screen.getByRole('button', { name: '关闭导入收藏对话框' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it('keeps the account switch guard and unlocks after declining to save', async () => {
    const search = deferred();
    mocks.searchMusic.mockReturnValue(search.promise);
    const { container, rerender } = render(<UserProfile />);
    await openImport(container);
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
    await waitFor(() => expect(mocks.searchMusic).toHaveBeenCalledTimes(1));
    mocks.useAuth.mockReturnValue({ currentUser: { ...localUser, uid: 'another-user' } });
    rerender(<UserProfile />);
    await act(async () => search.resolve([track]));
    expect(mocks.saveFavorites).not.toHaveBeenCalled();
    expect(mocks.toast.warning).toHaveBeenCalledWith('账号已切换，本次导入未保存');
    expect(screen.getByRole('button', { name: '开始导入' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

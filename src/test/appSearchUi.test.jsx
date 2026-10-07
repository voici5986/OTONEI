import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useDevice } from '../contexts/DeviceContext';
import Favorites from '../pages/Favorites';
import History from '../pages/History';
import { searchMusic } from '../services/musicApiService';
import { getFavoritesStrict, getHistoryStrict } from '../services/storage';

vi.mock('../contexts/DeviceContext', () => ({ useDevice: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({ handlePlay: vi.fn(), currentTrack: null }),
}));
vi.mock('../contexts/DownloadContext', () => ({
  useDownload: () => ({ isTrackDownloading: () => false, handleDownload: vi.fn() }),
}));
vi.mock('../hooks/useNetworkStatus', () => ({ default: () => ({ isOnline: true }) }));
vi.mock('../hooks/useFirebaseStatus', () => ({ default: () => ({}) }));
vi.mock('../utils/orientationManager', () => ({ lockToPortrait: () => Promise.resolve(true) }));
vi.mock('../config/env', () => ({ env: { isDevelopment: false } }));
vi.mock('../services/musicApiService', () => ({ searchMusic: vi.fn() }));
vi.mock('../services/storage', () => ({
  clearExpiredCovers: () => Promise.resolve(0),
  getSearchHistory: () => Promise.resolve([{ query: '晴天', source: 'kuwo', timestamp: 1 }]),
  addSearchHistory: vi.fn(),
  getFavorites: vi.fn(),
  getHistory: vi.fn(),
  getFavoritesStrict: vi.fn(),
  getHistoryStrict: vi.fn(),
}));
vi.mock('../services/SearchService', () => ({
  default: { searchLocal: () => Promise.resolve({ favorites: [], history: [] }) },
}));
vi.mock('../services/downloadService', () => ({ downloadTrack: vi.fn() }));
vi.mock('../utils/errorHandler', () => ({
  checkNetworkStatus: () => true,
  validateSearchParams: (query) => Boolean(query),
  handleError: vi.fn(),
  ErrorTypes: { SEARCH: 'SEARCH' },
  ErrorSeverity: { ERROR: 'ERROR' },
}));
vi.mock('react-toastify', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('../components/Navigation', () => ({
  default: ({ onTabChange }) => (
    <nav>
      {['home', 'favorites', 'history', 'user'].map((tab) => (
        <button key={tab} onClick={() => onTabChange(tab)}>
          {tab}
        </button>
      ))}
    </nav>
  ),
}));
vi.mock('../pages/User', () => ({ default: () => <div>账号页面</div> }));
vi.mock('../components/SearchResultItem', () => ({
  default: ({ track }) => <div>{track.name}</div>,
}));
vi.mock('../components/MusicCardActions', () => ({ default: () => null }));
vi.mock('../components/AvatarImage', () => ({ default: () => null }));
vi.mock('../components/AudioPlayer', () => ({ default: () => null }));
vi.mock('../components/OrientationPrompt', () => ({ default: () => null }));
vi.mock('../components/InstallPWA', () => ({ default: () => null }));
vi.mock('../components/UpdateNotification', () => ({ default: () => null }));
vi.mock('../components/DeviceDebugger', () => ({ default: () => null }));

const mobileInput = () => document.querySelector('.mobile-search-input');
const submitSearch = (query) => {
  fireEvent.change(mobileInput(), { target: { value: query } });
  fireEvent.submit(mobileInput().closest('form'));
};

beforeEach(() => {
  vi.resetAllMocks();
  useDevice.mockReturnValue({ isMobile: true });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return this.classList.contains('mobile-search-input') ? [{ width: 300, height: 44 }] : [];
  });
  getFavoritesStrict.mockResolvedValue([]);
  getHistoryStrict.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('search page UI', () => {
  it('focuses the visible mobile header for both status actions on a narrow desktop', async () => {
    useDevice.mockReturnValue({ isMobile: false });
    searchMusic.mockResolvedValueOnce([]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '搜索音乐', exact: true }));
    expect(mobileInput()).toHaveFocus();
    expect(document.querySelector('.header-search-input')).not.toHaveFocus();
    submitSearch('无结果');
    await screen.findByText('没有找到相关歌曲');
    fireEvent.click(screen.getByRole('button', { name: '修改关键词' }));
    expect(mobileInput()).toHaveFocus();
    expect(document.querySelector('.header-search-input')).not.toHaveFocus();
  });

  it('distinguishes initial, loading, and completed empty states on mobile', async () => {
    let resolveSearch;
    searchMusic.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    render(<App />);
    expect(screen.getByText('开始你的音乐搜索')).toBeInTheDocument();
    expect(screen.queryByText('没有找到相关歌曲')).not.toBeInTheDocument();
    submitSearch('不存在的歌曲');
    expect(screen.getByText('正在搜索音乐')).toBeInTheDocument();
    expect(mobileInput()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('没有找到相关歌曲')).not.toBeInTheDocument();
    await act(async () => resolveSearch([]));
    expect(screen.getByText('没有找到相关歌曲')).toBeInTheDocument();
    expect(screen.getByText(/不存在的歌曲.*网易云音乐没有搜索结果/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '修改关键词' }));
    expect(mobileInput()).toHaveFocus();
  });

  it.each(['favorites', 'history', 'user'])(
    'replays recent search from %s and returns to home with explicit source',
    async (tab) => {
      searchMusic.mockResolvedValueOnce([{ id: '1', name: '回放搜索结果', source: 'kuwo' }]);
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: tab, exact: true }));
      if (tab === 'user') await screen.findByText('账号页面');
      else await screen.findByText(tab === 'favorites' ? '还没有收藏' : '还没有历史记录');
      act(() => mobileInput().focus());
      fireEvent.focus(mobileInput());
      const suggestions = await screen.findAllByRole('option', {
        name: /晴天.*历史搜索.*酷我音乐/,
      });
      fireEvent.click(suggestions[suggestions.length - 1]);
      expect(searchMusic).toHaveBeenCalledWith('晴天', 'kuwo', 20, 1, expect.any(AbortSignal));
      expect(await screen.findByText('回放搜索结果')).toBeInTheDocument();
      expect(document.querySelector('.home-search-filter-bar')).toBeInTheDocument();
      expect(mobileInput()).toHaveValue('晴天');
      expect(mobileInput()).not.toHaveFocus();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(document.querySelector('.home-filter-select')).toHaveValue('kuwo');
    }
  );

  it('identifies retained results after another query fails and offers retry', async () => {
    searchMusic
      .mockResolvedValueOnce([{ id: 'old', name: '原有结果', source: 'netease' }])
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce([]);
    render(<App />);
    submitSearch('旧关键词');
    await screen.findByText('原有结果');
    submitSearch('新关键词');
    await screen.findByText('搜索未完成');
    expect(screen.getByRole('alert')).toHaveTextContent('旧关键词');
    expect(screen.getByRole('alert')).toHaveTextContent('上次结果');
    expect(screen.getByText('原有结果')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试搜索' }));
    await screen.findByText('没有找到相关歌曲');
    expect(searchMusic).toHaveBeenLastCalledWith(
      '新关键词',
      'netease',
      20,
      1,
      expect.any(AbortSignal)
    );
    expect(screen.queryByText('原有结果')).not.toBeInTheDocument();
  });
});

describe('saved music page status', () => {
  it.each([
    [Favorites, getFavoritesStrict, '收藏'],
    [History, getHistoryStrict, '历史记录'],
  ])(
    'shows loading, strict read rejection, retry and actionable empty state',
    async (Page, read, label) => {
      let rejectRead;
      read
        .mockReturnValueOnce(
          new Promise((_, reject) => {
            rejectRead = reject;
          })
        )
        .mockResolvedValueOnce([]);
      const onTabChange = vi.fn();
      render(<Page globalSearchQuery="" onTabChange={onTabChange} />);
      expect(screen.getByText(`正在加载${label}`)).toBeInTheDocument();
      await act(async () => rejectRead(new Error('storage unavailable')));
      expect(screen.getByRole('alert')).toHaveTextContent(`加载${label}失败`);
      expect(screen.queryByText(`还没有${label}`)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
      await screen.findByText(`还没有${label}`);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '去搜索音乐' }));
      expect(onTabChange).toHaveBeenCalledWith('home');
      await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    }
  );
});

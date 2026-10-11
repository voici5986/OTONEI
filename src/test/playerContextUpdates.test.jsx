import React, { StrictMode, useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listeners: new Map(),
  stateListeners: new Set(),
  engine: { currentTime: 0, duration: 100, on: vi.fn(), seek: vi.fn(), play: vi.fn() },
  playMusic: vi.fn(),
  getLyrics: vi.fn(),
  getCover: vi.fn(),
  track: null,
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('../hooks/useNetworkStatus', () => ({ default: () => ({ isOnline: true }) }));
vi.mock('../services/musicApiService', () => ({
  playMusic: mocks.playMusic,
  getLyrics: mocks.getLyrics,
  forceGetCoverImage: mocks.getCover,
}));
vi.mock('../services/storage', () => ({
  addToHistory: vi.fn().mockResolvedValue(true),
  getCoverFromStorage: vi.fn().mockResolvedValue(null),
  saveCoverToStorage: vi.fn().mockResolvedValue(true),
  incrementPendingChanges: vi.fn(),
}));
vi.mock('../services/syncService', () => ({ triggerDelayedSync: vi.fn() }));
vi.mock('../services/AudioEngine', () => ({
  default: mocks.engine,
  isPlaybackRequestReplacedError: () => false,
}));
vi.mock('../services/audioStateManager', () => ({
  default: {
    addListener: (callback) => {
      mocks.stateListeners.add(callback);
      return () => mocks.stateListeners.delete(callback);
    },
    getCurrentTrack: () => mocks.track,
    clearError: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
  },
}));
import { PlayerProvider, usePlayer, usePlayerProgress } from '../contexts/PlayerContext';
import { clearMemoryCache } from '../services/memoryCache';
import { saveCoverToStorage } from '../services/storage';

describe('PlayerProvider update isolation', () => {
  let player;
  let mainRenders;
  const Main = () => {
    const value = usePlayer();
    useEffect(() => {
      player = value;
      mainRenders++;
    });
    return null;
  };
  const Progress = () => {
    const { playedSeconds } = usePlayerProgress();
    return <output>{playedSeconds}</output>;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listeners.clear();
    mocks.stateListeners.clear();
    mocks.track = null;
    mocks.engine.currentTime = 0;
    mainRenders = 0;
    mocks.engine.on.mockImplementation((event, callback) => {
      const callbacks = mocks.listeners.get(event) || new Set();
      callbacks.add(callback);
      mocks.listeners.set(event, callbacks);
      return () => callbacks.delete(callback);
    });
    mocks.playMusic.mockResolvedValue(undefined);
    mocks.getCover.mockResolvedValue('/cover.png');
    mocks.getLyrics.mockResolvedValue({ raw: '[00:01.00]line' });
  });
  it('updates progress without broadcasting to main consumers and cleans StrictMode listeners', () => {
    const view = render(
      <StrictMode>
        <PlayerProvider>
          <Main />
          <Progress />
        </PlayerProvider>
      </StrictMode>
    );
    const baseline = mainRenders;
    act(() => {
      mocks.engine.currentTime = 25;
      mocks.listeners.get('timeupdate').forEach((callback) => callback());
    });
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(mainRenders).toBe(baseline);
    expect(mocks.listeners.get('timeupdate').size).toBe(2);
    view.unmount();
    expect(mocks.stateListeners.size).toBe(0);
    expect(mocks.listeners.get('timeupdate').size).toBe(0);
  });
  it('blocks cover persistence as soon as cache clearing starts, before the completion event', async () => {
    let resolveCover;
    mocks.getCover.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCover = resolve;
      })
    );
    render(
      <PlayerProvider>
        <Main />
      </PlayerProvider>
    );
    let request;
    act(() => {
      request = player.fetchCover('netease', 'clear-race');
    });
    await waitFor(() => expect(mocks.getCover).toHaveBeenCalled());
    // Browser/IndexedDB clearing can still be pending; local:data_cleared has not fired.
    act(() => clearMemoryCache());
    await act(async () => {
      resolveCover('https://test/old.png');
      await request;
    });
    expect(saveCoverToStorage).not.toHaveBeenCalled();
    expect(player.coverCache).toEqual({});
  });
  it('retries the selected quality and fetches expanded lyrics once', async () => {
    render(
      <StrictMode>
        <PlayerProvider>
          <Main />
        </PlayerProvider>
      </StrictMode>
    );
    const track = { id: 'one', source: 'netease', pic_id: 'cover' };
    await act(async () => player.handlePlay(track, -1, null, 320));
    mocks.track = track;
    await act(async () =>
      mocks.stateListeners.forEach((callback) => callback({ track, error: new Error('expired') }))
    );
    expect(mocks.playMusic).toHaveBeenLastCalledWith(track, 320, true, expect.any(Function));
    act(() => player.toggleLyric());
    await waitFor(() => expect(mocks.getLyrics).toHaveBeenCalledTimes(1));
  });
});

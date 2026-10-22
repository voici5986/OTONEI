import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  listeners: new Map(),
  getLastSyncTime: vi.fn(),
  getLocalChangesSince: vi.fn(),
  getPendingSyncChanges: vi.fn(),
  getSyncStatus: vi.fn(),
  saveSyncStatus: vi.fn(),
  triggerImmediateSync: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/storage', () => ({
  getPendingSyncChanges: mocks.getPendingSyncChanges,
  getSyncStatus: mocks.getSyncStatus,
  saveSyncStatus: mocks.saveSyncStatus,
}));
vi.mock('../services/syncService', () => ({
  getLastSyncTime: mocks.getLastSyncTime,
  getLocalChangesSince: mocks.getLocalChangesSince,
  triggerImmediateSync: mocks.triggerImmediateSync,
  SyncEvents: {
    SYNC_STARTED: 'started',
    SYNC_COMPLETED: 'completed',
    SYNC_SKIPPED: 'skipped',
    SYNC_FAILED: 'failed',
  },
  addSyncListener: (event, listener) => {
    if (!mocks.listeners.has(event)) mocks.listeners.set(event, new Set());
    mocks.listeners.get(event).add(listener);
  },
  removeSyncListener: (event, listener) => mocks.listeners.get(event)?.delete(listener),
}));
vi.mock('../utils/logger.js', () => ({ default: { error: vi.fn() } }));

import { SyncProvider, useSync } from '../contexts/SyncContext';

const user = (uid) => ({ uid, isLocal: false });
const status = (message = '') => ({
  loading: false,
  success: null,
  message,
  timestamp: null,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};
const emit = (event, payload) =>
  mocks.listeners.get(event)?.forEach((listener) => listener(payload));
const foreground = () => document.dispatchEvent(new Event('visibilitychange'));
const network = (online) =>
  window.dispatchEvent(new CustomEvent('networkStatusChange', { detail: { online } }));
const wrapper = ({ children }) => <SyncProvider>{children}</SyncProvider>;
const strictWrapper = ({ children }) => (
  <StrictMode>
    <SyncProvider>{children}</SyncProvider>
  </StrictMode>
);
const settle = async () => {
  await act(async () => {});
};

describe('SyncProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listeners.clear();
    mocks.auth.currentUser = user('user-a');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    mocks.getLastSyncTime.mockResolvedValue(null);
    mocks.getSyncStatus.mockResolvedValue(status());
    mocks.getPendingSyncChanges.mockResolvedValue({ favorites: 0, history: 0 });
    mocks.getLocalChangesSince.mockResolvedValue({
      favorites: [],
      favoriteTombstones: [],
      history: [],
    });
    mocks.saveSyncStatus.mockResolvedValue(undefined);
    mocks.triggerImmediateSync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('syncs on reconnect even when foreground sync was skipped offline 500ms earlier', async () => {
    mocks.triggerImmediateSync.mockImplementation(async (uid, reason) => {
      if (reason === 'foreground') emit('skipped', { uid });
    });
    const { result } = renderHook(useSync, { wrapper });
    await settle();

    await act(async () => foreground());
    expect(result.current.isSyncing).toBe(false);
    vi.setSystemTime(Date.now() + 500);
    act(() => network(true));

    expect(mocks.triggerImmediateSync.mock.calls).toEqual([
      ['user-a', 'foreground'],
      ['user-a', 'online'],
    ]);
  });

  it('throttles repeated events of each reason and allows them after the window', async () => {
    renderHook(useSync, { wrapper });
    await settle();
    act(() => {
      foreground();
      network(true);
      foreground();
      network(true);
    });
    vi.setSystemTime(Date.now() + 1999);
    act(() => {
      foreground();
      network(true);
    });
    expect(mocks.triggerImmediateSync).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 1);
    act(() => {
      foreground();
      network(true);
    });
    expect(mocks.triggerImmediateSync.mock.calls).toEqual([
      ['user-a', 'foreground'],
      ['user-a', 'online'],
      ['user-a', 'foreground'],
      ['user-a', 'online'],
    ]);
  });

  it('allows a fresh reconnect within the online throttle after going offline', async () => {
    renderHook(useSync, { wrapper });
    await settle();
    act(() => network(true));
    vi.setSystemTime(Date.now() + 500);
    act(() => {
      network(false);
      network(true);
    });
    expect(mocks.triggerImmediateSync.mock.calls).toEqual([
      ['user-a', 'online'],
      ['user-a', 'online'],
    ]);
  });

  it.each(['status', 'pending counts'])(
    'ignores a delayed initial %s read from the previous account',
    async (read) => {
      const oldRead = deferred();
      mocks.getLastSyncTime.mockImplementation(async (uid) => (uid === 'user-b' ? '2000' : '1000'));
      mocks.getSyncStatus.mockImplementation((uid) =>
        uid === 'user-a' && read === 'status' ? oldRead.promise : Promise.resolve(status(uid))
      );
      mocks.getPendingSyncChanges.mockImplementation((uid) =>
        uid === 'user-a' && read === 'pending counts'
          ? oldRead.promise
          : Promise.resolve({ favorites: 2, history: 3 })
      );
      const { result, rerender } = renderHook(useSync, { wrapper });
      await settle();

      mocks.auth.currentUser = user('user-b');
      rerender();
      await settle();
      expect(result.current.syncStatus.message).toBe('user-b');
      expect(result.current.pendingChanges).toEqual({ favorites: 2, history: 3 });

      await act(async () => {
        oldRead.resolve(
          read === 'status' ? status('stale user-a') : { favorites: 90, history: 90 }
        );
      });
      expect(result.current.syncStatus.message).toBe('user-b');
      expect(result.current.lastSyncTime).toEqual(new Date(2000));
      expect(result.current.pendingChanges).toEqual({ favorites: 2, history: 3 });
    }
  );

  it('ignores an in-flight pending refresh after switching accounts', async () => {
    const oldRead = deferred();
    const { result, rerender } = renderHook(useSync, { wrapper });
    await settle();
    mocks.getPendingSyncChanges.mockImplementation((uid) =>
      uid === 'user-a' ? oldRead.promise : Promise.resolve({ favorites: 4, history: 5 })
    );
    let refresh;
    act(() => {
      refresh = result.current.updatePendingChanges();
    });
    await settle();
    expect(mocks.getPendingSyncChanges).toHaveBeenLastCalledWith('user-a');

    mocks.auth.currentUser = user('user-b');
    rerender();
    await settle();
    await act(async () => {
      oldRead.resolve({ favorites: 90, history: 90 });
      await refresh;
    });
    expect(result.current.pendingChanges).toEqual({ favorites: 4, history: 5 });
  });

  it('shows the larger counter or dirty data count, including removed favorites', async () => {
    const { result } = renderHook(useSync, { wrapper });
    await settle();
    mocks.getPendingSyncChanges.mockResolvedValue({ favorites: 1, history: 8 });
    mocks.getLocalChangesSince.mockResolvedValue({
      favorites: [{}],
      favoriteTombstones: [{}, {}],
      history: [{}, {}],
    });
    await act(async () => result.current.updatePendingChanges());
    expect(result.current.pendingChanges).toEqual({ favorites: 3, history: 8 });
    expect(result.current.getTotalPendingChanges()).toBe(11);

    mocks.getPendingSyncChanges.mockResolvedValue({ favorites: 7, history: 0 });
    await act(async () => result.current.updatePendingChanges());
    expect(result.current.pendingChanges).toEqual({ favorites: 7, history: 2 });
    expect(result.current.getTotalPendingChanges()).toBe(9);
  });

  it('ignores other users events and exposes matching start, failure, skip and completion', async () => {
    const refreshed = vi.fn();
    window.addEventListener('sync:data_refreshed', refreshed);
    try {
      const { result } = renderHook(useSync, { wrapper });
      await settle();
      mocks.getPendingSyncChanges.mockClear();
      await act(async () => {
        for (const event of ['started', 'failed', 'skipped', 'completed']) {
          emit(event, { uid: 'user-b', error: 'other account' });
          emit(event, {});
        }
      });
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.syncStatus).toEqual(status());
      expect(mocks.saveSyncStatus).not.toHaveBeenCalled();
      expect(mocks.getPendingSyncChanges).not.toHaveBeenCalled();
      expect(refreshed).not.toHaveBeenCalled();

      act(() => emit('started', { uid: 'user-a' }));
      expect(result.current.isSyncing).toBe(true);
      expect(result.current.syncStatus.loading).toBe(true);
      await act(async () => emit('failed', { uid: 'user-a', error: 'Please retry' }));
      expect(result.current.syncStatus).toMatchObject({ success: false, message: 'Please retry' });
      expect(result.current.isSyncing).toBe(false);

      act(() => emit('started', { uid: 'user-a' }));
      await act(async () => emit('skipped', { uid: 'user-a' }));
      expect(result.current.isSyncing).toBe(false);
      mocks.getLastSyncTime.mockResolvedValue('3000');
      await act(async () =>
        emit('completed', { uid: 'user-a', result: { unchanged: true, reason: 'Already current' } })
      );
      expect(result.current.syncStatus).toMatchObject({
        success: true,
        message: 'Already current',
      });
      expect(result.current.lastSyncTime).toEqual(new Date(3000));
      expect(refreshed).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('sync:data_refreshed', refreshed);
    }
  });

  it('cleans StrictMode subscriptions on account change and unmount', async () => {
    const { result, rerender, unmount } = renderHook(useSync, { wrapper: strictWrapper });
    await settle();
    expect([...mocks.listeners.values()].map((listeners) => listeners.size)).toEqual([1, 1, 1, 1]);
    act(() => foreground());
    mocks.auth.currentUser = user('user-b');
    rerender();
    await settle();
    expect([...mocks.listeners.values()].map((listeners) => listeners.size)).toEqual([1, 1, 1, 1]);
    act(() => {
      emit('started', { uid: 'user-a' });
      foreground();
    });
    expect(result.current.isSyncing).toBe(false);
    expect(mocks.triggerImmediateSync.mock.calls).toEqual([
      ['user-a', 'foreground'],
      ['user-b', 'foreground'],
    ]);

    unmount();
    expect([...mocks.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    mocks.triggerImmediateSync.mockClear();
    act(() => {
      foreground();
      network(true);
      emit('started', { uid: 'user-b' });
    });
    expect(mocks.triggerImmediateSync).not.toHaveBeenCalled();
  });

  it('does not read cloud status, subscribe or trigger sync for local and signed-out users', async () => {
    mocks.auth.currentUser = { uid: 'local', isLocal: true };
    const { result, rerender } = renderHook(useSync, { wrapper });
    await settle();
    for (const currentUser of [mocks.auth.currentUser, null]) {
      mocks.auth.currentUser = currentUser;
      rerender();
      await settle();
      await act(async () => {
        foreground();
        network(true);
        await result.current.updatePendingChanges();
      });
      expect(mocks.listeners.size).toBe(0);
      expect(mocks.triggerImmediateSync).not.toHaveBeenCalled();
      expect(mocks.getLastSyncTime).not.toHaveBeenCalled();
      expect(mocks.getSyncStatus).not.toHaveBeenCalled();
      expect(mocks.getPendingSyncChanges).not.toHaveBeenCalled();
      expect(result.current.pendingChanges).toEqual({ favorites: 0, history: 0 });
    }
  });
});

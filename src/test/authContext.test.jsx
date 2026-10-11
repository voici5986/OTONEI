import React from 'react';
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  callback: null,
  user: null,
  reset: vi.fn(),
  available: true,
  logout: vi.fn(),
  check: vi.fn(),
  network: vi.fn(),
  initial: vi.fn(),
  save: vi.fn(),
  local: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../services/firebase', () => ({
  auth: {
    get currentUser() {
      return fixture.user;
    },
    onAuthStateChanged: (callback) => {
      fixture.callback = (user) => {
        fixture.user = user;
        return callback(user);
      };
      return fixture.unsubscribe;
    },
  },
  logout: fixture.logout,
  firebaseInitError: null,
  loginWithEmailAndPassword: vi.fn(),
  loginWithGoogle: vi.fn(),
  registerWithEmailAndPassword: vi.fn(),
  sendPasswordReset: vi.fn(),
}));
vi.mock('../hooks/useFirebaseStatus', () => ({
  default: () => ({ isAvailable: fixture.available, checkAvailability: fixture.check }),
}));
vi.mock('../services/storage', () => ({
  saveSyncStatus: fixture.save,
  getLocalUser: fixture.local,
  saveLocalUser: vi.fn(),
  getNetworkStatus: fixture.network,
  setStorageScope: vi.fn(),
}));
vi.mock('../services/syncService', () => ({
  SyncEvents: {},
  resetSyncScheduler: fixture.reset,
  triggerEvent: vi.fn(),
  shouldSyncOnLogin: vi.fn().mockResolvedValue({ shouldSync: true }),
  initialSync: fixture.initial,
}));
import { AuthProvider, useAuth } from '../contexts/AuthContext';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.available = true;
  fixture.user = null;
  vi.useRealTimers();
  localStorage.clear();
});
describe('auth lifecycle', () => {
  it('keeps actions stable across auth state updates and reports logout errors', async () => {
    fixture.network.mockResolvedValue({ online: false });
    fixture.logout.mockResolvedValue({ error: new Error('sign out failed') });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    const login = result.current.login;
    await act(() => fixture.callback({ uid: 'first' }));
    expect(result.current.login).toBe(login);
    let response;
    await act(async () => {
      response = await result.current.signOut();
    });
    expect(response.success).toBe(false);
    expect(response.error.message).toBe('sign out failed');
  });
  it('keeps the local attempt limit across provider remounts without storing email keys', async () => {
    fixture.available = false;
    fixture.local.mockResolvedValue(null);
    let hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await act(() => hook.result.current.login('person@example.com', 'wrong'));
    }
    hook.unmount();
    hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
    let response;
    await act(async () => {
      response = await hook.result.current.login('other@example.com', 'wrong');
    });
    expect(response.error.message).toContain('15分钟');
    expect(fixture.local).toHaveBeenCalledTimes(5);
    expect(Object.keys(localStorage)).toEqual(['otonei:local-login-attempts']);
  });

  it.each([false, true])(
    'does not sign out or cancel B when A logout sync is pending (timeout=%s)',
    async (timeout) => {
      vi.useFakeTimers();
      fixture.network.mockResolvedValue({ online: false });
      fixture.check.mockResolvedValue(true);
      let resolveSync;
      fixture.initial.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSync = resolve;
          })
      );
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(() => fixture.callback({ uid: 'A' }));
      fixture.network.mockResolvedValueOnce({ online: true });
      let pendingLogout;
      await act(async () => {
        pendingLogout = result.current.signOut();
        await Promise.resolve();
      });
      expect(fixture.initial).toHaveBeenCalledWith('A');
      await act(() => fixture.callback({ uid: 'B' }));
      const resets = fixture.reset.mock.calls.length;
      const writes = fixture.save.mock.calls.length;
      let response;
      await act(async () => {
        if (timeout) await vi.advanceTimersByTimeAsync(30000);
        else resolveSync({ success: true });
        response = await pendingLogout;
      });
      expect(response.success).toBe(false);
      expect(fixture.logout).not.toHaveBeenCalled();
      expect(fixture.reset).toHaveBeenCalledTimes(resets);
      expect(fixture.save).toHaveBeenCalledTimes(writes);
      expect(result.current.currentUser.uid).toBe('B');
    }
  );

  it('ignores an older identity callback after a new identity arrives', async () => {
    let resolveNetwork;
    fixture.network.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        })
    );
    fixture.network.mockResolvedValue({ online: false });
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    let old;
    act(() => {
      old = fixture.callback({ uid: 'old' });
    });
    await act(() => fixture.callback({ uid: 'new' }));
    await act(async () => {
      resolveNetwork({ online: true });
      await old;
    });
    expect(result.current.currentUser.uid).toBe('new');
    expect(fixture.initial).not.toHaveBeenCalled();
    expect(fixture.save).not.toHaveBeenCalled();
    unmount();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });
});

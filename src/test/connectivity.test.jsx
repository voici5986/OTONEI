import React, { StrictMode } from 'react';
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ check: vi.fn(), save: vi.fn() }));
vi.mock('../services/firebase', () => ({
  isFirebaseAvailable: false,
  checkFirebaseAvailability: fixtures.check,
}));
vi.mock('../services/storage', () => ({ saveNetworkStatus: fixtures.save }));
import useFirebaseStatus from '../hooks/useFirebaseStatus';
import useNetworkStatus from '../hooks/useNetworkStatus';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('shared connectivity lifecycle', () => {
  it('checks once under StrictMode and never restarts from its result', async () => {
    vi.useFakeTimers();
    fixtures.check.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useFirebaseStatus(), { wrapper: StrictMode });
    const callback = result.current.checkAvailability;
    await act(() => vi.runAllTimersAsync());
    expect(fixtures.check).toHaveBeenCalledTimes(1);
    expect(result.current.isAvailable).toBe(true);
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(result.current.checkAvailability).toBe(callback);
    expect(fixtures.check).toHaveBeenCalledTimes(1);
  });
  it('shares one online/offline listener pair among consumers', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = renderHook(() => useNetworkStatus());
    const second = renderHook(() => useNetworkStatus());
    expect(add.mock.calls.filter(([event]) => event === 'online')).toHaveLength(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event('offline')));
    expect(first.result.current.isOnline).toBe(false);
    expect(second.result.current.isOnline).toBe(false);
    first.unmount();
    expect(remove.mock.calls.filter(([event]) => event === 'online')).toHaveLength(0);
    second.unmount();
    expect(remove.mock.calls.filter(([event]) => event === 'online')).toHaveLength(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });
});

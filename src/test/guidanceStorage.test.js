import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COVER_LYRICS_HINT_STORAGE_KEY,
  DESKTOP_LYRICS_HINT_STORAGE_KEY,
  MOBILE_PLAYER_HINT_STORAGE_KEY,
  dismissGuidance,
  getGuidanceDismissed,
  resetGuidance,
  subscribeGuidance,
} from '../services/guidanceStorage';

beforeEach(() => {
  localStorage.clear();
  resetGuidance();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetGuidance();
  localStorage.clear();
});

describe('guidance storage service', () => {
  it('delivers local choices and browser storage changes until unsubscribed', () => {
    const observed = [];
    const unsubscribe = subscribeGuidance(() =>
      observed.push(getGuidanceDismissed(MOBILE_PLAYER_HINT_STORAGE_KEY))
    );
    dismissGuidance(MOBILE_PLAYER_HINT_STORAGE_KEY);
    expect(observed).toEqual([true]);
    expect(localStorage.getItem(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBe('dismissed');
    localStorage.removeItem(MOBILE_PLAYER_HINT_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: MOBILE_PLAYER_HINT_STORAGE_KEY }));
    expect(observed).toEqual([true, false]);
    unsubscribe();
    dismissGuidance(MOBILE_PLAYER_HINT_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: MOBILE_PLAYER_HINT_STORAGE_KEY }));
    expect(observed).toEqual([true, false]);
  });

  it('resets active consumers and retired guidance without deleting account preferences', () => {
    for (const key of [
      DESKTOP_LYRICS_HINT_STORAGE_KEY,
      MOBILE_PLAYER_HINT_STORAGE_KEY,
      COVER_LYRICS_HINT_STORAGE_KEY,
      'otonei:quick-start:v1',
      'otonei:player-hint:v1',
    ])
      localStorage.setItem(key, 'dismissed');
    localStorage.setItem('otonei:account-preference', 'retain');
    const listener = vi.fn();
    const unsubscribe = subscribeGuidance(listener);
    resetGuidance();
    expect(listener).toHaveBeenCalledOnce();
    expect(getGuidanceDismissed(DESKTOP_LYRICS_HINT_STORAGE_KEY)).toBe(false);
    expect(getGuidanceDismissed(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBe(false);
    expect(getGuidanceDismissed(COVER_LYRICS_HINT_STORAGE_KEY)).toBe(false);
    expect(localStorage.getItem('otonei:quick-start:v1')).toBeNull();
    expect(localStorage.getItem('otonei:player-hint:v1')).toBeNull();
    expect(localStorage.getItem('otonei:account-preference')).toBe('retain');
    unsubscribe();
  });

  it('retains session dismissal and reset when browser storage throws', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'])
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('blocked');
      });
    const states = [];
    const unsubscribe = subscribeGuidance(() =>
      states.push(getGuidanceDismissed(COVER_LYRICS_HINT_STORAGE_KEY))
    );
    expect(getGuidanceDismissed(COVER_LYRICS_HINT_STORAGE_KEY)).toBe(false);
    dismissGuidance(COVER_LYRICS_HINT_STORAGE_KEY);
    expect(getGuidanceDismissed(COVER_LYRICS_HINT_STORAGE_KEY)).toBe(true);
    resetGuidance();
    expect(getGuidanceDismissed(COVER_LYRICS_HINT_STORAGE_KEY)).toBe(false);
    expect(states).toEqual([true, false]);
    unsubscribe();
  });

  it('works without browser globals or a React hook', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);
    const listener = vi.fn();
    const unsubscribe = subscribeGuidance(listener);
    dismissGuidance(MOBILE_PLAYER_HINT_STORAGE_KEY);
    expect(getGuidanceDismissed(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBe(true);
    resetGuidance();
    expect(getGuidanceDismissed(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

export const DESKTOP_LYRICS_HINT_STORAGE_KEY = 'otonei:desktop-lyrics-hint:v1';
export const MOBILE_PLAYER_HINT_STORAGE_KEY = 'otonei:mobile-player-hint:v1';
export const COVER_LYRICS_HINT_STORAGE_KEY = 'otonei:cover-lyrics-hint:v1';
const guidanceKeys = [
  DESKTOP_LYRICS_HINT_STORAGE_KEY,
  MOBILE_PLAYER_HINT_STORAGE_KEY,
  COVER_LYRICS_HINT_STORAGE_KEY,
  'otonei:quick-start:v1',
  'otonei:player-hint:v1',
];
const sessionChoices = new Map();
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
export const subscribeGuidance = (listener) => {
  listeners.add(listener);
  const browserWindow = typeof window === 'undefined' ? null : window;
  browserWindow?.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    browserWindow?.removeEventListener('storage', listener);
  };
};
export function getGuidanceDismissed(key) {
  if (sessionChoices.has(key)) return sessionChoices.get(key);
  try {
    return localStorage.getItem(key) === 'dismissed';
  } catch {
    return false;
  }
}
/** Reset only known guidance choices, including retired versions. */
export function resetGuidance() {
  for (const key of guidanceKeys) {
    sessionChoices.set(key, false);
    try {
      localStorage.removeItem(key);
      sessionChoices.delete(key);
    } catch {
      /* Session reset still works. */
    }
  }
  notify();
}
/** Persist a choice when possible, otherwise retain it for this session. */
export function dismissGuidance(key) {
  sessionChoices.set(key, true);
  try {
    localStorage.setItem(key, 'dismissed');
    sessionChoices.delete(key);
  } catch {
    /* Keep this session's choice. */
  }
  notify();
}

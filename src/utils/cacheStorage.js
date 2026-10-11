import { clearCoverCache } from '../services/storage';
import { clearAvatarCache } from './avatarCache';

export const clearApplicationCaches = async () => {
  await clearCoverCache();
  clearAvatarCache();
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sonicflow_lyric_')) localStorage.removeItem(key);
  }
};

export const clearBrowserCaches = async () => {
  const registrations =
    'serviceWorker' in (globalThis.navigator ?? {})
      ? await globalThis.navigator.serviceWorker.getRegistrations()
      : [];
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!('caches' in globalThis)) {
    return { deletedCaches: 0, unregisteredWorkers: registrations.length };
  }

  const cacheNames = await globalThis.caches.keys();
  const results = await Promise.all(
    cacheNames.map((cacheName) => globalThis.caches.delete(cacheName))
  );
  return {
    deletedCaches: results.filter(Boolean).length,
    unregisteredWorkers: registrations.length,
  };
};

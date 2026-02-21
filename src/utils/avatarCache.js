const AVATAR_CACHE_PREFIX = 'avatar-cache:';
const MAX_DATA_URL_LENGTH = 200000; // ~200KB safety cap
const AVATAR_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const getAvatarCache = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${AVATAR_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || !payload.dataUrl || !payload.savedAt) return null;
    if (Date.now() - payload.savedAt > AVATAR_CACHE_TTL_MS) {
      localStorage.removeItem(`${AVATAR_CACHE_PREFIX}${key}`);
      return null;
    }
    return payload.dataUrl || null;
  } catch {
    return null;
  }
};

export const setAvatarCache = (key, dataUrl) => {
  if (!key || !dataUrl) return;
  if (dataUrl.length > MAX_DATA_URL_LENGTH) return;
  try {
    const payload = JSON.stringify({
      dataUrl,
      savedAt: Date.now()
    });
    localStorage.setItem(`${AVATAR_CACHE_PREFIX}${key}`, payload);
  } catch {
    // Storage might be full or blocked; ignore silently.
  }
};

export const fetchAvatarDataUrl = async (url) => {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || !blob.type.startsWith('image/')) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

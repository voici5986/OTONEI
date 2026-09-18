/**
 * Cloudflare Pages Functions: API Proxy for OTONEI
 * Handles OTONEI API requests and forwards them to the upstream api.php endpoint.
 */

const TARGET_API_BASE = 'https://music-api.gdstudio.xyz';
const SOURCE_PATH_PREFIX = '/api-v1';
const TARGET_PATH_ACTUAL = '/api.php';
const ALLOWED_PATHS = new Set([
  SOURCE_PATH_PREFIX,
  `${SOURCE_PATH_PREFIX}/`,
  `${SOURCE_PATH_PREFIX}${TARGET_PATH_ACTUAL}`,
]);
const ALLOWED_QUERY_KEYS = new Set([
  'types',
  'source',
  'name',
  'count',
  'pages',
  'id',
  'br',
  'size',
]);
const ALLOWED_TYPES = new Set(['search', 'url', 'lyric', 'pic']);
const ALLOWED_SOURCES = new Set(['netease', 'kuwo', 'joox', 'bilibili', 'ytmusic']);
const ALLOWED_BITRATES = new Set(['128', '192', '320', '740', '999']);

// Pages Functions instances are short lived, so this is deliberately a soft
// per-instance guard rather than a durable/global quota. It protects an
// instance and the upstream from bursts while leaving durable enforcement to
// a platform rate-limit/WAF product when one is configured.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_MAX_KEYS = 1_000;
const requestCounters = new Map();

const createRequestId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};

const getClientKey = (request) => {
  // CF-Connecting-IP is set by Cloudflare. Do not trust a client-supplied
  // X-Forwarded-For value, which would let callers evade the soft guard.
  return request.headers.get('CF-Connecting-IP')?.trim().slice(0, 100) || 'unknown';
};

const checkSoftRateLimit = (request) => {
  const now = Date.now();
  const key = getClientKey(request);
  const current = requestCounters.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    if (requestCounters.size >= RATE_LIMIT_MAX_KEYS) {
      for (const [entryKey, entry] of requestCounters) {
        if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) requestCounters.delete(entryKey);
      }
      if (requestCounters.size >= RATE_LIMIT_MAX_KEYS) requestCounters.clear();
    }
    requestCounters.set(key, { startedAt: now, count: 1 });
    return { allowed: true };
  }

  current.count += 1;
  return {
    allowed: current.count <= RATE_LIMIT_MAX_REQUESTS,
    retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000)),
  };
};

const isIntegerInRange = (value, min, max) => {
  if (!/^\d+$/.test(value || '')) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max;
};

const validateQuery = (searchParams) => {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key) || searchParams.getAll(key).length !== 1) {
      return `Unsupported or repeated query parameter: ${key}`;
    }
  }

  const type = searchParams.get('types');
  const source = searchParams.get('source');
  if (!ALLOWED_TYPES.has(type)) return 'Unsupported request type';
  if (!ALLOWED_SOURCES.has(source)) return 'Unsupported music source';

  if (type === 'search') {
    const name = searchParams.get('name')?.trim() || '';
    if (name.length < 1 || name.length > 100) return 'Invalid search query';
    if (!isIntegerInRange(searchParams.get('count'), 1, 50)) return 'Invalid result count';
    if (!isIntegerInRange(searchParams.get('pages'), 1, 100)) return 'Invalid page number';
  } else {
    const id = searchParams.get('id') || '';
    if (id.length < 1 || id.length > 200 || /\s/.test(id)) return 'Invalid track identifier';
  }

  if (type === 'url' && !ALLOWED_BITRATES.has(searchParams.get('br'))) {
    return 'Invalid bitrate';
  }
  if (type === 'pic' && !isIntegerInRange(searchParams.get('size'), 50, 2000)) {
    return 'Invalid image size';
  }

  return null;
};

const jsonResponse = (body, status, requestId, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
  });

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const requestId = createRequestId();

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: 'GET, OPTIONS', 'X-Request-Id': requestId },
    });
  }

  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: 'GET, OPTIONS',
        'X-Request-Id': requestId,
      },
    });
  }

  const rateLimit = checkSoftRateLimit(request);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'Too Many Requests', requestId }, 429, requestId, {
      'Retry-After': String(rateLimit.retryAfter),
    });
  }

  if (!ALLOWED_PATHS.has(url.pathname)) {
    return jsonResponse({ error: 'Not Found', requestId }, 404, requestId);
  }

  const queryError = validateQuery(url.searchParams);
  if (queryError) {
    return jsonResponse({ error: 'Bad Request', message: queryError, requestId }, 400, requestId);
  }

  const targetUrlString = `${TARGET_API_BASE}${TARGET_PATH_ACTUAL}${url.search}`;

  // 临时实验：不复制任何浏览器 headers、不设 Host / User-Agent，
  // 验证上游是否因转发的请求头（如 Host 或 cf-* 等）而拒绝。
  const upstreamHeaders = new Headers({
    Accept: 'application/json',
  });

  try {
    const response = await fetch(targetUrlString, {
      method: 'GET',
      headers: upstreamHeaders,
      // The proxy is intentionally single-origin. Following an upstream
      // redirect would turn this fixed-target proxy into an open fetcher.
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      console.warn('[API proxy] upstream redirect rejected', {
        requestId,
        status: response.status,
      });
      return jsonResponse({ error: 'Upstream Redirect', requestId }, 502, requestId);
    }

    console.log('[API proxy] upstream response', {
      requestId,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Access-Control-Allow-Origin');
    responseHeaders.delete('Access-Control-Allow-Credentials');
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Request-Id', requestId);
    responseHeaders.delete('X-Powered-By');
    responseHeaders.delete('Server');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[API proxy] fetch failed', { requestId, errorName: error?.name || 'Error' });
    return jsonResponse({ error: 'Proxy Fetch Failed', requestId }, 502, requestId);
  }
}

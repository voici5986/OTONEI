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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: 'GET, OPTIONS',
        ...corsHeaders,
      },
    });
  }

  if (!ALLOWED_PATHS.has(url.pathname)) {
    return jsonResponse({ error: 'Not Found', message: 'Unsupported API proxy path' }, 404);
  }

  const targetUrlString = `${TARGET_API_BASE}${TARGET_PATH_ACTUAL}${url.search}`;

  const newHeaders = new Headers(request.headers);
  newHeaders.set('Host', new URL(TARGET_API_BASE).host);
  newHeaders.set(
    'User-Agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  newHeaders.delete('cf-connecting-ip');
  newHeaders.delete('cf-ipcountry');
  newHeaders.delete('cf-ray');
  newHeaders.delete('x-forwarded-proto');
  newHeaders.delete('x-real-ip');
  newHeaders.delete('cookie');

  try {
    const response = await fetch(targetUrlString, {
      method: request.method,
      headers: newHeaders,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.delete('X-Powered-By');
    responseHeaders.delete('Server');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return jsonResponse({ error: 'Proxy Fetch Failed', message: error.message }, 502);
  }
}

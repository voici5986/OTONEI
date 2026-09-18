import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/api-v1/[[path]].js';

const createRequest = (path, init) => new Request(`https://otonei.pages.dev${path}`, init);

describe('Cloudflare API proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the app API path to upstream api.php', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          Server: 'nginx',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequest({
      request: createRequest(
        '/api-v1/api.php?types=search&source=netease&name=test&count=20&pages=1'
      ),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=test&count=20&pages=1'
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Server')).toBe(false);
    expect(response.headers.get('X-Request-Id')).toMatch(/.+/);
  });

  it('maps /api-v1 to upstream api.php', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await onRequest({
      request: createRequest('/api-v1?types=url&source=netease&id=1&br=320'),
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=1&br=320'
    );
  });

  it('forwards lyric and cover requests without following redirects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lyric: 'line' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cover.test/a.jpg' })));
    vi.stubGlobal('fetch', fetchMock);

    const lyricResponse = await onRequest({
      request: createRequest('/api-v1?types=lyric&source=netease&id=lyric-1'),
    });
    const coverResponse = await onRequest({
      request: createRequest('/api-v1?types=pic&source=netease&id=cover-1&size=500'),
    });

    expect(lyricResponse.status).toBe(200);
    expect(coverResponse.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.redirect])).toEqual([
      ['https://music-api.gdstudio.xyz/api.php?types=lyric&source=netease&id=lyric-1', 'manual'],
      [
        'https://music-api.gdstudio.xyz/api.php?types=pic&source=netease&id=cover-1&size=500',
        'manual',
      ],
    ]);
  });

  it('turns an upstream redirect into a parseable proxy error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://unexpected.example.test/' },
        })
      )
    );

    const response = await onRequest({
      request: createRequest('/api-v1?types=lyric&source=netease&id=lyric-1'),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Upstream Redirect',
      requestId: response.headers.get('X-Request-Id'),
    });
  });

  it('rejects unsupported subpaths', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequest({
      request: createRequest('/api-v1/other?types=search'),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported query shapes before contacting the upstream API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const invalidType = await onRequest({
      request: createRequest('/api-v1/api.php?types=admin&source=netease'),
    });
    const oversizedPage = await onRequest({
      request: createRequest(
        '/api-v1/api.php?types=search&source=netease&name=test&count=20&pages=9999'
      ),
    });

    expect(invalidType.status).toBe(400);
    expect(oversizedPage.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a generic upstream failure with a diagnostic request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret upstream detail')));

    const response = await onRequest({
      request: createRequest('/api-v1?types=url&source=netease&id=1&br=320'),
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Proxy Fetch Failed',
      requestId: response.headers.get('X-Request-Id'),
    });
    expect(JSON.stringify(body)).not.toContain('secret upstream detail');
  });
});

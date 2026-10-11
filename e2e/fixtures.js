export const fixtureTrack = {
  id: 'fixture-1',
  name: 'Fixture Song',
  artist: 'Fixture Artist',
  album: 'Fixture Album',
  source: 'netease',
  pic_id: 'fixture-cover',
  lyric_id: 'fixture-lyric',
};

const fixtureCover =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%23f0f0f0"/%3E%3C/svg%3E';

const respondWithFixture = async (route) => {
  const requestUrl = new URL(route.request().url());
  if (!requestUrl.pathname.startsWith('/api-v1/api.php')) return false;

  const type = requestUrl.searchParams.get('types');
  let payload;
  switch (type) {
    case 'search':
      payload = [fixtureTrack];
      break;
    case 'url':
      payload = { url: '/fixtures/audio.mp3', size: 1024 };
      break;
    case 'pic':
      payload = { url: fixtureCover };
      break;
    case 'lyric':
      payload = { lyric: '[00:01.00] Fixture Song', tlyric: '' };
      break;
    default:
      payload = {};
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
  return true;
};

export const installDeterministicBrowser = async (page) => {
  await page.addInitScript(() => {
    const mediaPlay = HTMLMediaElement.prototype.play;
    const mediaPause = HTMLMediaElement.prototype.pause;
    const mediaLoad = HTMLMediaElement.prototype.load;

    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event('pause'));
    };
    HTMLMediaElement.prototype.load = function load() {};

    window.addEventListener('beforeunload', () => {
      HTMLMediaElement.prototype.play = mediaPlay;
      HTMLMediaElement.prototype.pause = mediaPause;
      HTMLMediaElement.prototype.load = mediaLoad;
    });
  });
};

export const installApiFixtures = async (page) => {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (await respondWithFixture(route)) return;

    const isLocalApp =
      requestUrl.hostname === '127.0.0.1' &&
      (requestUrl.port === '3000' ||
        requestUrl.port === '4173' ||
        requestUrl.port === process.env.PLAYWRIGHT_PORT);
    if (requestUrl.protocol === 'data:' || isLocalApp) {
      await route.continue();
      return;
    }

    await route.abort('blockedbyclient');
  });
};

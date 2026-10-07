import { devices, expect, test } from '@playwright/test';
import { installApiFixtures, installDeterministicBrowser } from './fixtures.js';

const timedLyrics = {
  lyric: '[00:01.00]First source line\n[00:05.00]Second source line\n[00:09.00]Third source line',
  tlyric: '[00:01.00]第一句翻译\n[00:05.00]第二句翻译\n[00:09.00]第三句翻译',
};

const installTimedLyrics = async (page) => {
  await page.route('**/api-v1/api.php*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get('types') === 'lyric') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(timedLyrics),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/fixtures/audio.mp3', async (route) => {
    const silentWav = Buffer.alloc(46);
    silentWav.write('RIFF', 0);
    silentWav.writeUInt32LE(silentWav.length - 8, 4);
    silentWav.write('WAVEfmt ', 8);
    silentWav.writeUInt32LE(16, 16);
    silentWav.writeUInt16LE(1, 20);
    silentWav.writeUInt16LE(1, 22);
    silentWav.writeUInt32LE(8000, 24);
    silentWav.writeUInt32LE(16000, 28);
    silentWav.writeUInt16LE(2, 32);
    silentWav.writeUInt16LE(16, 34);
    silentWav.write('data', 36);
    silentWav.writeUInt32LE(2, 40);
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: silentWav,
    });
  });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = function FixtureAudio(...args) {
      const audio = new NativeAudio(...args);
      window.__fixtureAudio = audio;
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    const currentTimes = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get: () => 30,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get() {
        return currentTimes.get(this) ?? 0;
      },
      set(value) {
        currentTimes.set(this, Number(value));
      },
    });
  });
};

const lyricContrast = (element) => {
  const parseColor = (value) => {
    const numbers = value.match(/[\d.]+/g)?.map(Number);
    if (!numbers || numbers.length < 3) return null;
    return { channels: numbers.slice(0, 3), alpha: numbers.length > 3 ? numbers[3] : 1 };
  };
  const luminance = (channels) => {
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const backgroundFor = (node) => {
    let background = [255, 255, 255];
    const ancestors = [];
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) ancestors.push(ancestor);
    for (const ancestor of ancestors.reverse()) {
      const color = parseColor(getComputedStyle(ancestor).backgroundColor);
      if (!color || color.alpha === 0) continue;
      background = color.channels.map((channel, index) =>
        Math.round(channel * color.alpha + background[index] * (1 - color.alpha))
      );
    }
    return background;
  };
  const foreground = parseColor(getComputedStyle(element).color)?.channels;
  if (!foreground) return null;
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(backgroundFor(element));
  const style = getComputedStyle(element);
  let ancestorOpacity = 1;
  let hasMask = false;
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor);
    ancestorOpacity *= Number(ancestorStyle.opacity);
    hasMask ||=
      (ancestorStyle.maskImage && ancestorStyle.maskImage !== 'none') ||
      (ancestorStyle.webkitMaskImage && ancestorStyle.webkitMaskImage !== 'none');
  }
  return {
    foreground,
    background: backgroundFor(element),
    ratio:
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    fontSize: Number.parseFloat(style.fontSize),
    fontWeight: Number.parseInt(style.fontWeight, 10),
    ancestorOpacity,
    hasMask,
  };
};

const prepareLyricPlayer = async (page) => {
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await installTimedLyrics(page);
  await page.goto('/');
  const search = page
    .locator('.mobile-search-input:visible, input[placeholder="搜索歌曲、歌手、专辑..."]:visible')
    .first();
  await search.fill('fixture');
  await search.press('Enter');
  await page.getByRole('button', { name: '播放 Fixture Song - Fixture Artist' }).click();
  await expect(page.locator('.audio-player')).toBeVisible();
};

const activateSecondLyric = async (page) => {
  await page.evaluate(() => {
    const audio = window.__fixtureAudio;
    audio.currentTime = 5;
    audio.dispatchEvent(new Event('timeupdate'));
  });
};

const expectReadableLyrics = async (container, { activeMinimum = 4.5 } = {}) => {
  const lines = container.locator('.lyric-line');
  await expect(lines).toHaveCount(3);
  await expect(container.getByText('第一句翻译')).toBeVisible();
  await expect(container.getByText('第二句翻译')).toBeVisible();
  await expect(container.getByText('第三句翻译')).toBeVisible();
  await expect(container.locator('.lyric-line.active')).toContainText('Second source line');

  const lineCount = await lines.count();
  const lineReadability = [];
  for (let index = 0; index < lineCount; index += 1) {
    const line = lines.nth(index);
    const original = await line.locator(':scope > div').first().evaluate(lyricContrast);
    const translated = line.locator('.translated-lyric');
    lineReadability.push({
      original,
      translated: (await translated.count()) > 0 ? await translated.evaluate(lyricContrast) : null,
      active: (await line.getAttribute('class')).split(/\s+/).includes('active'),
    });
  }
  for (const line of lineReadability) {
    expect(line.original.ratio).toBeGreaterThanOrEqual(line.active ? activeMinimum : 4.5);
    expect(line.original.ancestorOpacity).toBeGreaterThanOrEqual(0.99);
    expect(line.original.hasMask).toBe(false);
    if (line.translated) {
      expect(line.translated.ratio).toBeGreaterThanOrEqual(4.5);
      expect(line.translated.ancestorOpacity).toBeGreaterThanOrEqual(0.99);
      expect(line.translated.hasMask).toBe(false);
    }
  }
  return lineReadability;
};

test('recent search suggestions return to home from another tab', async ({ page }) => {
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await page.goto('/');

  const search = page.locator('input[placeholder="搜索歌曲、歌手、专辑..."]').first();
  await search.fill('remembered query');
  await search.press('Enter');
  await expect(page.locator('.music-card').first()).toContainText('Fixture Song');

  await page.locator('.nav-item').filter({ hasText: '收藏' }).first().click();
  await expect(page.locator('.favorites-page')).toBeVisible();
  await search.fill('');
  await search.focus();

  const recentSuggestion = page
    .locator('.desktop-search-suggestions')
    .getByRole('option', { name: /remembered query/ });
  await expect(recentSuggestion).toBeVisible();
  await recentSuggestion.click();

  await expect(page.locator('.home-search-filter-bar')).toBeVisible();
  await expect(page.locator('.favorites-page')).toHaveCount(0);
  await expect(page.locator('.music-card').first()).toContainText('Fixture Song');
});

test('player controls remain reachable on narrow non-touch desktop viewports', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
  });
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await page.goto('/');

  const search = page.locator('input[placeholder="搜索歌曲、歌手、专辑..."]').first();
  await search.fill('fixture');
  await search.press('Enter');
  await page.locator('.music-card').first().click();
  await expect(page.locator('.audio-player')).toBeVisible();

  for (const width of [650, 767, 768, 769]) {
    await page.setViewportSize({ width, height: 900 });

    if (width < 768) {
      await page.getByRole('button', { name: '展开播放器和歌词' }).click();
    }

    await expect(page.getByRole('button', { name: '上一首' })).toBeVisible();
    await expect(page.getByRole('button', { name: '下一首' })).toBeVisible();
    const playToggle = page.locator(
      '.audio-player .player-control-slot--play button, .audio-player .player-center-section button[aria-label="暂停"], .audio-player .player-center-section button[aria-label="播放"]'
    );
    await expect(playToggle).toHaveCount(1);
    await expect(playToggle).toHaveAttribute('aria-label', /^(播放|暂停)$/);
    await expect(playToggle).toBeVisible();
    await expect(page.getByRole('button', { name: '上一首' })).toBeInViewport();
    await expect(page.getByRole('button', { name: '下一首' })).toBeInViewport();

    if (width < 768) await page.locator('.mobile-expanded-close').click();
    if (width === 768) {
      await page.getByRole('button', { name: '展开歌词' }).click();
      await expect(page.locator('.desktop-expanded-view')).toBeVisible();
      const desktopPlay = page.locator('.player-center-section button[aria-label="暂停"]');
      await expect(desktopPlay).toBeVisible();
      await desktopPlay.click();
      await expect(page.locator('.player-center-section button[aria-label="播放"]')).toBeVisible();
      const close = page.locator('.desktop-expanded-view .close-lyrics-btn');
      await close.click();
    }
  }
});

test('desktop expanded original and translated lyrics remain readable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepareLyricPlayer(page);
  await page.getByRole('button', { name: '展开歌词' }).click();

  const lyrics = page.locator('.desktop-expanded-view .lyrics-scroll-container');
  await expect(lyrics.locator('.lyric-line')).toHaveCount(3);
  await activateSecondLyric(page);
  await expect(lyrics.locator('.lyric-line.active')).toBeVisible();
  await page.waitForTimeout(650);
  const readability = await expectReadableLyrics(lyrics, { activeMinimum: 3 });
  const active = readability.find((line) => line.active);
  expect(active.original.fontSize).toBeGreaterThanOrEqual(22.4);
  expect(active.original.fontWeight).toBeGreaterThanOrEqual(700);
});

test('mobile expanded original and translated lyrics and artist remain readable', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  try {
    await prepareLyricPlayer(page);
    await page.getByRole('button', { name: '展开播放器和歌词' }).click();
    await expect(page.locator('.player-expanded-view')).toBeVisible();
    await expect(page.locator('.player-expanded-view .lyric-line')).toHaveCount(3);
    await page.waitForTimeout(800);
    const toggle = page.getByRole('button', { name: '显示歌词' });
    const beforeToggle = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      visualViewportWidth: window.visualViewport?.width,
    }));
    expect(beforeToggle.innerWidth).toBeLessThanOrEqual(768);
    await toggle.tap();
    await expect(page.locator('.player-expanded-view')).toHaveClass(/mobile-lyrics-active/);
    const expanded = page.locator('.player-expanded-view.mobile-lyrics-active');
    const lyrics = expanded.locator('.lyrics-scroll-container');
    await expect(lyrics.locator('.lyric-line')).toHaveCount(3);
    await activateSecondLyric(page);
    await expect(lyrics.locator('.lyric-line.active')).toBeVisible();
    await page.waitForTimeout(700);
    await expectReadableLyrics(lyrics);
    const backToCover = expanded.getByRole('button', { name: '显示专辑信息' });
    await backToCover.tap();
    await expect(page.locator('.player-expanded-view')).not.toHaveClass(/mobile-lyrics-active/);
    await page.getByRole('button', { name: '显示歌词' }).tap();
    await expect(page.locator('.player-expanded-view')).toHaveClass(/mobile-lyrics-active/);

    const mobileContent = page.locator('.audio-player .mobile-expanded-player-content');
    const artist = page.locator(
      '.audio-player .mobile-expanded-player-content .mobile-track-info-expanded .track-artist'
    );
    await expect(artist).toBeVisible();
    const artistReadability = await artist.evaluate(lyricContrast);
    expect(artistReadability.ratio).toBeGreaterThanOrEqual(4.5);
    expect(artistReadability.ancestorOpacity).toBeGreaterThanOrEqual(0.99);
    expect(artistReadability.hasMask).toBe(false);

    const playButton = mobileContent.getByRole('button', { name: '暂停', exact: true });
    await expect(playButton).toBeVisible();
    await playButton.tap();
    const resumeButton = mobileContent.getByRole('button', { name: '播放', exact: true });
    await expect(resumeButton).toBeVisible();
    await resumeButton.tap();
    await expect(playButton).toBeVisible();

    const progress = mobileContent.getByRole('slider', { name: '播放进度' });
    await expect(progress).toBeVisible();
    await progress.focus();
    const progressBefore = Number(await progress.getAttribute('aria-valuenow'));
    await progress.press('ArrowRight');
    await expect
      .poll(async () => Number(await progress.getAttribute('aria-valuenow')))
      .toBeGreaterThan(progressBefore);

    await mobileContent.getByRole('button', { name: '收起播放器' }).tap();
    await expect(page.locator('.player-expanded-view')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('long result titles preserve card boundaries and one page scroller at responsive widths', async ({
  page,
}) => {
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await page.route('**/api-v1/api.php*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get('types') !== 'search') {
      await route.fallback();
      return;
    }

    const tracks = Array.from({ length: 20 }, (_, index) => ({
      id: `long-title-${index}`,
      name:
        index % 2 === 0
          ? `A very long fixture song title ${index} `.repeat(12)
          : `LongFixtureSongTitleWithoutSpaces${index}`.repeat(12),
      artist: `Fixture Artist ${index}`,
      album: 'Long Title Album',
      source: 'netease',
      pic_id: 'fixture-cover',
      lyric_id: 'fixture-lyric',
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tracks),
    });
  });
  await page.goto('/');

  const search = page.locator('input[placeholder="搜索歌曲、歌手、专辑..."]').first();
  await search.fill('long-layout');
  await search.press('Enter');
  await expect(page.locator('.music-card')).toHaveCount(20);

  for (const width of [390, 768, 900, 992, 1280]) {
    await page.setViewportSize({ width, height: 900 });

    const geometry = await page.locator('.music-card').evaluateAll((cards) => {
      const rect = (element) => element.getBoundingClientRect();
      const visible = (element) => rect(element).width > 0 && rect(element).height > 0;
      const rows = cards.map((card) => {
        const info = card.querySelector('.music-card-info');
        const title = info?.querySelector('h6');
        const actions = card.querySelector('.music-card-actions');
        const infoRect = rect(info);
        const titleRect = rect(title);
        const actionRect = rect(actions);
        const cardRect = rect(card);
        return {
          height: cardRect.height,
          infoRight: infoRect.right,
          titleLeft: titleRect.left,
          titleRight: titleRect.right,
          actionLeft: actionRect.left,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          visible: visible(info) && visible(title) && visible(actions),
        };
      });
      const extraScrollers = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        const box = rect(element);
        return (
          !element.matches('.main-content') &&
          box.width > 0 &&
          box.height > 0 &&
          /(auto|scroll)/.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 1
        );
      }).length;
      const main = document.querySelector('.main-content');
      if (main) main.scrollTop = 120;
      return {
        rows,
        extraScrollers,
        mainScrollTop: main?.scrollTop ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: document.documentElement.clientHeight,
        documentScrollTop: document.documentElement.scrollTop,
      };
    });

    expect(geometry.rows.every((row) => row.visible)).toBe(true);
    expect(geometry.rows.every((row) => row.infoRight <= row.actionLeft + 1)).toBe(true);
    expect(geometry.rows.every((row) => row.titleLeft >= row.cardLeft - 1)).toBe(true);
    expect(geometry.rows.every((row) => row.titleRight <= row.actionLeft + 1)).toBe(true);
    expect(geometry.rows.every((row) => row.cardRight <= width + 1)).toBe(true);
    const heights = geometry.rows.map((row) => row.height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    expect(geometry.extraScrollers).toBe(0);
    expect(geometry.mainScrollTop).toBeGreaterThan(0);
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.documentScrollTop).toBe(0);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  }
});

test('iPhone search loading, empty state, hit targets, and text contrast', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  let releaseSearch;
  const delayedSearch = new Promise((resolve) => {
    releaseSearch = resolve;
  });

  try {
    await installDeterministicBrowser(page);
    await installApiFixtures(page);
    await page.route('**/api-v1/api.php*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get('types') !== 'search') {
        await route.fallback();
        return;
      }
      await delayedSearch;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto('/');

    const mobileSearch = page.locator('.mobile-search-input');
    await mobileSearch.fill('no matches');
    await mobileSearch.press('Enter');
    await expect(page.getByRole('heading', { name: '正在搜索音乐' })).toBeVisible();
    releaseSearch();
    await expect(page.getByRole('heading', { name: '没有找到相关歌曲' })).toBeVisible();

    const headerAndSelectHeights = await page
      .locator('.mobile-search-input:visible, .home-filter-select:visible')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(headerAndSelectHeights.length).toBeGreaterThanOrEqual(2);
    expect(headerAndSelectHeights.every((height) => height >= 44)).toBe(true);

    await page.getByRole('button', { name: '我的' }).click();
    await expect(page.locator('.auth-form-container:visible')).toHaveCount(1);
    const authHitTargetHeights = await page
      .locator('.btn-auth:visible')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(authHitTargetHeights.length).toBeGreaterThanOrEqual(2);
    expect(authHitTargetHeights.every((height) => height >= 44)).toBe(true);

    const contrast = await page.evaluate(() => {
      const parseColor = (value) => {
        const match = value.match(/[\d.]+/g);
        return match ? match.slice(0, 3).map(Number) : null;
      };
      const luminance = (color) => {
        const channels = color.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const ratio = (foreground, background) => {
        const fg = luminance(foreground);
        const bg = luminance(background);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      };
      const opaqueBackground = (element) => {
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const color = parseColor(getComputedStyle(ancestor).backgroundColor);
          if (color && getComputedStyle(ancestor).backgroundColor !== 'rgba(0, 0, 0, 0)') {
            return color;
          }
        }
        return [255, 255, 255];
      };
      const colorPair = (element) => {
        const style = getComputedStyle(element);
        return ratio(parseColor(style.color), opaqueBackground(element));
      };
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].find(
          (element) => element.getClientRects().length > 0
        );
      const primary = visible('.btn-primary-auth');
      const defaultButton = visible('.btn-google-auth');
      return {
        primary: primary ? colorPair(primary) : null,
        defaultButton: defaultButton ? colorPair(defaultButton) : null,
      };
    });
    expect(contrast.primary).toBeGreaterThanOrEqual(4.5);
    expect(contrast.defaultButton).toBeGreaterThanOrEqual(4.5);
  } finally {
    await context.close();
  }
});

test('visible desktop privacy explanation meets text contrast', async ({ page }) => {
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await page.goto('/');

  await page.locator('.header-user-profile').click();
  const privacyText = page.getByText('清除所有本地缓存、收藏和历史记录。此操作不可撤销。', {
    exact: true,
  });
  await expect(privacyText).toBeVisible();

  const contrast = await privacyText.evaluate((element) => {
    const parseColor = (value) => {
      const match = value.match(/[\d.]+/g);
      return match ? match.slice(0, 3).map(Number) : null;
    };
    const luminance = (color) => {
      const channels = color.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    let background = [255, 255, 255];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const color = parseColor(style.backgroundColor);
      if (color && !/rgba\([^)]*,\s*0\s*\)$/.test(style.backgroundColor)) {
        background = color;
        break;
      }
    }
    const foreground = parseColor(getComputedStyle(element).color);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

import { devices, expect, test } from '@playwright/test';
import { COACHMARK_OBSTACLE_SELECTOR } from '../src/config/coachmark.mjs';
import { installApiFixtures, installDeterministicBrowser } from './fixtures.js';

const prepare = async (page) => {
  await installDeterministicBrowser(page);
  await installApiFixtures(page);
  await page.goto('/');
};

const playFixture = async (page) => {
  const search = page.locator('.mobile-search-input:visible, .header-search-input:visible').first();
  await search.fill('fixture');
  await search.press('Enter');
  const track = page.locator('.music-card').first();
  await expect(track).toContainText('Fixture Song');
  await track.click();
  await waitForTransientToasts(page);
};

const waitForTransientToasts = async (page) => {
  await page
    .locator('.Toastify__close-button')
    .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  await expect(page.locator('.Toastify__toast')).toHaveCount(0);
};

const expectCoachmarkArrowAtTarget = async (page, targetSelector) => {
  await expect
    .poll(() =>
      page.evaluate(
        ({ selector, obstacleSelector }) => {
          const targetElement = [...document.querySelectorAll(selector)].find(
            (element) => element.getClientRects().length
          );
          const anchor = targetElement.querySelector('[data-coachmark-anchor]') ?? targetElement;
          const target = anchor.getBoundingClientRect();
          const bubble = document.querySelector('.player-coachmark').getBoundingClientRect();
          const arrow = document.querySelector('.coachmark-arrow').getBoundingClientRect();
          const centerX = arrow.left + arrow.width / 2;
          const centerY = arrow.top + arrow.height / 2;
          const targetX = target.left + target.width / 2;
          const arrowGap =
            bubble.bottom < target.top ? target.top - centerY : centerY - target.bottom;
          const controls = [...document.querySelectorAll(obstacleSelector)].filter(
            (control) =>
              control.getClientRects().length &&
              getComputedStyle(control).visibility !== 'hidden' &&
              control !== targetElement &&
              !control.contains(targetElement) &&
              !targetElement.contains(control)
          );
          return {
            viewport:
              centerX >= 0 && centerX <= innerWidth && centerY >= 0 && centerY <= innerHeight,
            arrowTracksTarget: Math.abs(centerX - targetX) <= 2 && arrowGap >= 0 && arrowGap <= 28,
            bubbleInViewport:
              bubble.left >= 0 &&
              bubble.top >= 0 &&
              bubble.right <= innerWidth &&
              bubble.bottom <= innerHeight,
            noTargetOverlap:
              bubble.right <= target.left ||
              bubble.left >= target.right ||
              bubble.bottom <= target.top ||
              bubble.top >= target.bottom,
            noControlsOverlap: controls.every((control) => {
              const box = control.getBoundingClientRect();
              return (
                bubble.right <= box.left ||
                bubble.left >= box.right ||
                bubble.bottom <= box.top ||
                bubble.top >= box.bottom
              );
            }),
            targetAccessible: targetElement
              .getAttribute('aria-describedby')
              ?.split(/\s+/)
              .some((id) =>
                document
                  .getElementById(id)
                  ?.textContent.includes(
                    document.querySelector('.coachmark-description').textContent
                  )
              ),
          };
        },
        { selector: targetSelector, obstacleSelector: COACHMARK_OBSTACLE_SELECTOR }
      )
    )
    .toEqual({
      viewport: true,
      arrowTracksTarget: true,
      bubbleInViewport: true,
      noTargetOverlap: true,
      noControlsOverlap: true,
      targetAccessible: true,
    });
};

test('home prompt stays concise and help remains available from the account page', async ({
  page,
}) => {
  await prepare(page);
  await expect(page.getByRole('heading', { name: '搜索你想听的音乐' })).toBeVisible();
  await expect(page.getByText('输入歌曲、歌手或专辑名称。')).toBeVisible();
  await page.locator('.header-user-profile').click();
  await page.getByRole('button', { name: '使用帮助' }).click();
  const help = page.getByRole('dialog', { name: '使用帮助' });
  await expect(help).toBeVisible();
  for (const topic of ['音源与音质', '本地数据与账号同步', '下载与安装', '收藏备份']) {
    await expect(help.getByRole('heading', { name: topic })).toBeVisible();
  }
});

test('mobile coachmark follows the actual player entry and cover control', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await prepare(page);
    await playFixture(page);
    const summary = page.locator('[data-coachmark="player-summary"]');
    const hint = page.getByRole('region', { name: '播放提示' });
    await expect(summary).toBeVisible();
    await expect(hint).toContainText('点这里展开播放器');
    await expectCoachmarkArrowAtTarget(page, '[data-coachmark="player-summary"]');
    await waitForTransientToasts(page);
    await page.screenshot({ path: testInfo.outputPath('coachmark-mobile-summary.png') });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await expect(page.getByRole('region', { name: '播放提示' })).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem('otonei:mobile-player-hint:v1'))
    ).toBeNull();
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await expect(hint).toBeVisible();
    await cdp.detach();

    await summary.click();
    expect(await page.evaluate(() => localStorage.getItem('otonei:mobile-player-hint:v1'))).toBe(
      'dismissed'
    );
    const cover = page.locator('[data-coachmark="cover-lyrics"]');
    const lyricHint = page.getByRole('region', { name: '歌词提示' });
    await expect(cover).toBeVisible();
    await expect(lyricHint).toContainText('点封面查看歌词');
    await expect(page.getByRole('region', { name: '播放提示' })).toHaveCount(0);
    await expectCoachmarkArrowAtTarget(page, '[data-coachmark="cover-lyrics"]');
    await page.screenshot({ path: testInfo.outputPath('coachmark-mobile-cover.png') });

    await cover.click();
    await expect(lyricHint).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('otonei:cover-lyrics-hint:v1'))).toBe(
      'dismissed'
    );
    await expect(page.locator('.player-expanded-view')).toHaveClass(/mobile-lyrics-active/);
    await expect(page.locator('.audio-player button[aria-label="暂停"]').first()).toBeVisible();
    await page.reload();
    await playFixture(page);
    await page.locator('[data-coachmark="player-summary"]').click();
    await expect(page.getByRole('region', { name: '歌词提示' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('mobile expansion dismissal stays independent and keyboard close persists only the cover tip', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() =>
      localStorage.setItem('otonei:mobile-player-hint:v1', 'dismissed')
    );
    await prepare(page);
    await playFixture(page);
    await expect(page.getByRole('region', { name: '播放提示' })).toHaveCount(0);
    await page.locator('[data-coachmark="player-summary"]').click();
    const coverTip = page.getByRole('region', { name: '歌词提示' });
    await expect(coverTip).toBeVisible();
    await page.locator('[data-coachmark="cover-lyrics"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '关闭歌词提示' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-coachmark="cover-lyrics"]')).toBeFocused();
    await expect(coverTip).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('otonei:cover-lyrics-hint:v1'))).toBe(
      'dismissed'
    );
    await page.reload();
    await playFixture(page);
    await page.locator('[data-coachmark="player-summary"]').click();
    await expect(page.getByRole('region', { name: '歌词提示' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('desktop coachmark targets the lyric button and leaves it usable', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await playFixture(page);
  const target = page.locator('[data-coachmark="lyric-toggle"]:visible').first();
  const hint = page.getByRole('region', { name: '播放提示' });
  await expect(target).toBeVisible();
  await expect(hint).toContainText('点这里展开歌词');
  expect(
    await hint.evaluate((bubble) => ({
      surface: getComputedStyle(bubble).pointerEvents,
      close: getComputedStyle(bubble.querySelector('button')).pointerEvents,
      layer: getComputedStyle(bubble.parentElement).pointerEvents,
      highlight: getComputedStyle(document.querySelector('.coachmark-highlight')).pointerEvents,
    }))
  ).toEqual({ surface: 'none', close: 'auto', layer: 'none', highlight: 'none' });

  await expectCoachmarkArrowAtTarget(page, '[data-coachmark="lyric-toggle"]');
  await waitForTransientToasts(page);
  await page.screenshot({ path: testInfo.outputPath('coachmark-desktop.png') });
  await page.setViewportSize({ width: 1024, height: 700 });
  await expectCoachmarkArrowAtTarget(page, '[data-coachmark="lyric-toggle"]');
  await target.focus();
  await page.keyboard.press('Escape');
  await expect(hint).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(hint.getByRole('button', { name: '关闭播放提示' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(target).toBeFocused();
  await target.click();
  await expect(page.locator('.desktop-expanded-view')).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test('open modal suppresses a pending coachmark and the tip resumes when the modal closes', async ({
  page,
}) => {
  await prepare(page);
  await playFixture(page);
  const hint = page.getByRole('region', { name: '播放提示' });
  await expect(hint).toBeVisible();
  await page.locator('.header-user-profile').click();
  await page.getByRole('button', { name: '使用帮助' }).click();
  const dialog = page.getByRole('dialog', { name: '使用帮助' });
  await expect(dialog).toBeVisible();
  await expect(hint).toHaveCount(0);
  await page.getByRole('button', { name: '关闭帮助' }).click();
  await expect(hint).toBeVisible();
  await page.evaluate(() => {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.cssText = 'position:fixed;inset:0;display:block;visibility:visible;opacity:1';
    modal.dataset.testModal = 'custom';
    document.body.append(modal);
  });
  await expect(hint).toHaveCount(0);
  await page.locator('[data-test-modal="custom"]').evaluate((modal) => modal.remove());
  await expect(hint).toBeVisible();
});

test('home search action focuses the visible search input', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '搜索音乐', exact: true }).click();
  await expect(
    page.locator('.mobile-search-input:visible, .header-search-input:visible').first()
  ).toBeFocused();
});

for (const fallback of [false, true]) {
  test(`help supports keyboard focus and Escape with ${fallback ? 'capability fallback' : 'native dialog'}`, async ({
    page,
  }) => {
    if (fallback) {
      await page.addInitScript(() => {
        delete HTMLDialogElement.prototype.showModal;
        delete HTMLDialogElement.prototype.close;
      });
    }
    await prepare(page);
    const trigger = page.locator('.quick-start').getByRole('button', { name: '使用帮助' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '使用帮助' });
    const close = dialog.getByRole('button', { name: '关闭帮助' });
    const reset = dialog.getByRole('button', { name: '重新查看引导' });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    if (fallback) await expect(page.locator('[inert]').first()).toBeAttached();
    await page.keyboard.press('Shift+Tab');
    await expect(reset).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator('[inert]')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(close).toBeFocused();
    await close.click();
    await expect(trigger).toBeFocused();
    if (fallback) {
      await trigger.click();
      const backdrop = page.locator('.user-guide-backdrop');
      await expect(backdrop).toBeVisible();
      await dialog.getByRole('heading', { name: '音源与音质' }).click();
      await expect(dialog).toBeVisible();
      await backdrop.click({ position: { x: 4, y: 4 } });
      await expect(dialog).not.toBeVisible();
      await expect(backdrop).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.locator('[inert]')).toHaveCount(0);
    }
  });
}

test('help reset re-enables pending guidance while preserving account preferences', async ({
  page,
}) => {
  const keys = [
    'otonei:desktop-lyrics-hint:v1',
    'otonei:mobile-player-hint:v1',
    'otonei:cover-lyrics-hint:v1',
    'otonei:player-hint:v1',
    'otonei:quick-start:v1',
  ];
  await page.addInitScript((guidanceKeys) => {
    for (const key of guidanceKeys) localStorage.setItem(key, 'dismissed');
    localStorage.setItem('otonei:accountpref', 'keep-account-preference');
  }, keys);
  await prepare(page);
  await playFixture(page);
  const hint = page.getByRole('region', { name: '播放提示' });
  await expect(hint).toHaveCount(0);
  await page.locator('.header-user-profile').click();
  const trigger = page.getByRole('button', { name: '使用帮助' });
  await trigger.click();
  await page
    .getByRole('dialog', { name: '使用帮助' })
    .getByRole('button', { name: '重新查看引导' })
    .click();
  await expect(page.getByRole('dialog', { name: '使用帮助' })).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(
      (guidanceKeys) => guidanceKeys.map((key) => localStorage.getItem(key)),
      keys
    )
  ).toEqual(keys.map(() => null));
  expect(await page.evaluate(() => localStorage.getItem('otonei:accountpref'))).toBe(
    'keep-account-preference'
  );
  await expect(hint).toBeVisible();
  await expectCoachmarkArrowAtTarget(page, '[data-coachmark="lyric-toggle"]');
});

import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render as testingRender,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import User from '../pages/User';
import PlayerHint from '../components/PlayerHint';
import UserGuide from '../components/UserGuide';
import { useAuth } from '../contexts/AuthContext';
import { DeviceProvider, useDevice } from '../contexts/DeviceContext';
import useGuidanceDismissal from '../hooks/useGuidanceDismissal';
import { mockResizeAnimationFrame } from './resizeAnimationFrame';
import {
  COVER_LYRICS_HINT_STORAGE_KEY,
  DESKTOP_LYRICS_HINT_STORAGE_KEY,
  MOBILE_PLAYER_HINT_STORAGE_KEY,
  resetGuidance,
} from '../services/guidanceStorage';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../contexts/DeviceContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useDevice: vi.fn(),
}));

const render = (ui, options) => testingRender(ui, { wrapper: DeviceProvider, ...options });
vi.mock('../components/UserProfile', () => ({ default: () => <p>账号资料</p> }));
vi.mock('../components/AuthContainer', () => ({ default: () => <p>登录表单</p> }));
vi.mock('../components/ClearDataButton', () => ({ default: () => null }));
vi.mock('../services/storage', () => ({
  getFavorites: () => Promise.resolve([]),
  getHistory: () => Promise.resolve([]),
}));

const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const dialogDescriptors = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);
beforeEach(() => {
  resetGuidance();
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 40, height: 40 }]);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('coachmark-layer'))
      return { left: 0, top: 0, right: 1500, bottom: 900, width: 1500, height: 900 };
    if (this.classList.contains('player-coachmark'))
      return { left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 };
    return { left: 140, top: 300, right: 180, bottom: 340, width: 40, height: 40 };
  });
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => {
      const text = document.querySelector('.player-coachmark')?.textContent ?? '';
      const target = text.includes('封面')
        ? 'cover-lyrics'
        : text.includes('播放器')
          ? 'player-summary'
          : 'lyric-toggle';
      return [document.querySelector(`[data-coachmark="${target}"]`)];
    },
  });
  const targets = document.createElement('div');
  targets.id = 'guidance-test-targets';
  targets.innerHTML =
    '<button data-coachmark="lyric-toggle">lyrics</button><button data-coachmark="player-summary">summary</button><button data-coachmark="cover-lyrics">cover</button>';
  document.body.append(targets);
  localStorage.clear();
  useAuth.mockReturnValue({ currentUser: null });
  useDevice.mockReturnValue({ isMobile: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.getElementById('guidance-test-targets')?.remove();
  delete document.elementsFromPoint;
  Object.defineProperty(window, 'innerWidth', widthDescriptor);
  for (const key of ['showModal', 'close']) {
    if (dialogDescriptors[key])
      Object.defineProperty(HTMLDialogElement.prototype, key, dialogDescriptors[key]);
    else delete HTMLDialogElement.prototype[key];
  }
});

describe('guidance dismissal persistence', () => {
  it.each([
    [DESKTOP_LYRICS_HINT_STORAGE_KEY, 'desktop lyrics hint'],
    [MOBILE_PLAYER_HINT_STORAGE_KEY, 'mobile player hint'],
    [COVER_LYRICS_HINT_STORAGE_KEY, 'cover lyrics hint'],
  ])('restores dismissed %s after remount', (key) => {
    const { result, unmount } = renderHook(() => useGuidanceDismissal(key));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(localStorage.getItem(key)).toBe('dismissed');
    unmount();
    const restored = renderHook(() => useGuidanceDismissal(key));
    expect(restored.result.current[0]).toBe(true);
  });

  it('switches keys immediately and resets mounted hooks without touching account data', () => {
    localStorage.setItem('account', 'keep');
    const { result, rerender } = renderHook(({ storageKey }) => useGuidanceDismissal(storageKey), {
      initialProps: { storageKey: DESKTOP_LYRICS_HINT_STORAGE_KEY },
    });
    act(() => result.current[1]());
    rerender({ storageKey: MOBILE_PLAYER_HINT_STORAGE_KEY });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    act(() => resetGuidance());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('account')).toBe('keep');
  });

  it('notifies every mounted consumer and removes only known retired keys', () => {
    localStorage.setItem('otonei:quick-start:v1', 'dismissed');
    localStorage.setItem('otonei:player-hint:v1', 'dismissed');
    localStorage.setItem('otonei:account-preference', 'keep');
    const first = renderHook(() => useGuidanceDismissal(MOBILE_PLAYER_HINT_STORAGE_KEY));
    const second = renderHook(() => useGuidanceDismissal(MOBILE_PLAYER_HINT_STORAGE_KEY));
    act(() => first.result.current[1]());
    expect(second.result.current[0]).toBe(true);
    act(() => resetGuidance());
    expect(first.result.current[0]).toBe(false);
    expect(second.result.current[0]).toBe(false);
    expect(localStorage.getItem('otonei:quick-start:v1')).toBeNull();
    expect(localStorage.getItem('otonei:player-hint:v1')).toBeNull();
    expect(localStorage.getItem('otonei:account-preference')).toBe('keep');
  });

  it('keeps guidance usable when storage reads and writes throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });
    const { result } = renderHook(() => useGuidanceDismissal(MOBILE_PLAYER_HINT_STORAGE_KEY));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked reset');
    });
    act(() => resetGuidance());
    expect(result.current[0]).toBe(false);
  });
});

describe('guidance components', () => {
  it('keeps the desktop lyric entry tip independent of lazy lyric loading', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    useDevice.mockReturnValue({ isMobile: false });
    render(<PlayerHint isPlaying expanded={false} hasLyrics={false} />);
    expect(await screen.findByRole('region', { name: '播放提示' })).toHaveTextContent(
      '点这里展开歌词'
    );
  });

  it('waits for lyrics on mobile cover guidance and remembers showing them', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    useDevice.mockReturnValue({ isMobile: true });
    const { rerender } = render(
      <PlayerHint isPlaying expanded showMobileLyrics={false} hasLyrics={false} />
    );
    expect(screen.queryByRole('region', { name: '歌词提示' })).not.toBeInTheDocument();

    rerender(<PlayerHint isPlaying expanded showMobileLyrics={false} hasLyrics />);
    expect(await screen.findByRole('region', { name: '歌词提示' })).toHaveTextContent(
      '点封面查看歌词'
    );

    rerender(<PlayerHint isPlaying expanded showMobileLyrics hasLyrics />);
    await waitFor(() =>
      expect(localStorage.getItem(COVER_LYRICS_HINT_STORAGE_KEY)).toBe('dismissed')
    );
    expect(screen.queryByRole('region', { name: '歌词提示' })).not.toBeInTheDocument();
  });

  it('does not consume cover guidance when lyrics are unavailable', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const { rerender } = render(
      <PlayerHint isPlaying expanded showMobileLyrics hasLyrics={false} />
    );
    expect(localStorage.getItem(COVER_LYRICS_HINT_STORAGE_KEY)).toBeNull();
    rerender(<PlayerHint isPlaying expanded={false} showMobileLyrics={false} hasLyrics={false} />);
    rerender(<PlayerHint isPlaying expanded showMobileLyrics={false} hasLyrics />);
    expect(await screen.findByRole('region', { name: '歌词提示' })).toBeInTheDocument();
  });

  it.each([true, false])(
    'keeps mobile and desktop expansion independent starting mobile=%s',
    async (mobile) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: mobile ? 390 : 1280,
      });
      useDevice.mockReturnValue({ isMobile: mobile });
      const { rerender } = render(<PlayerHint isPlaying expanded={false} />);
      fireEvent.click(await screen.findByRole('button', { name: '关闭播放提示' }));
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: mobile ? 1280 : 390,
      });
      useDevice.mockReturnValue({ isMobile: !mobile });
      const frames = mockResizeAnimationFrame();
      act(() => {
        window.dispatchEvent(new Event('resize'));
        frames.flush();
      });
      act(() => frames.flush());
      frames.request.mockRestore();
      frames.cancel.mockRestore();
      rerender(<PlayerHint isPlaying expanded={false} />);
      expect(await screen.findByRole('region', { name: '播放提示' })).toHaveTextContent(
        mobile ? '点这里展开歌词' : '点这里展开播放器'
      );
    }
  );

  it('does not consume desktop expansion when resizing an already expanded mobile player', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const { rerender } = render(<PlayerHint isPlaying expanded />);
    expect(localStorage.getItem(MOBILE_PLAYER_HINT_STORAGE_KEY)).toBe('dismissed');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    useDevice.mockReturnValue({ isMobile: false });
    const frames = mockResizeAnimationFrame();
    act(() => {
      window.dispatchEvent(new Event('resize'));
      frames.flush();
    });
    rerender(<PlayerHint isPlaying expanded />);
    expect(localStorage.getItem(DESKTOP_LYRICS_HINT_STORAGE_KEY)).toBeNull();
  });

  it('keeps replay reset while lyrics are already visible', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<PlayerHint isPlaying expanded showMobileLyrics hasLyrics />);
    expect(localStorage.getItem(COVER_LYRICS_HINT_STORAGE_KEY)).toBe('dismissed');
    act(() => resetGuidance());
    expect(localStorage.getItem(COVER_LYRICS_HINT_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['guest', null],
    ['local account', { uid: 'local-account', isLocal: true }],
    ['cloud account', { uid: 'cloud-account' }],
  ])('keeps help reachable for a %s', async (_, currentUser) => {
    useAuth.mockReturnValue({ currentUser });
    const onOpenGuide = vi.fn();
    await act(async () => render(<User onOpenGuide={onOpenGuide} onTabChange={vi.fn()} />));
    expect(screen.getAllByText(currentUser ? '账号资料' : '登录表单').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '使用帮助' }));
    expect(onOpenGuide).toHaveBeenCalledOnce();
    localStorage.setItem(DESKTOP_LYRICS_HINT_STORAGE_KEY, 'dismissed');
    fireEvent.click(screen.getByRole('button', { name: '重新查看引导' }));
    expect(localStorage.getItem(DESKTOP_LYRICS_HINT_STORAGE_KEY)).toBeNull();
  });
});

describe('help dialog keyboard access', () => {
  it('uses a real fallback backdrop that closes only on an outside click', () => {
    for (const key of ['showModal', 'close']) {
      Object.defineProperty(HTMLDialogElement.prototype, key, {
        configurable: true,
        value: undefined,
      });
    }
    const trigger = document.querySelector('[data-coachmark="lyric-toggle"]');
    trigger.focus();
    const onClose = vi.fn();
    const { rerender } = render(<UserGuide open onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: '使用帮助' });
    const backdrop = document.querySelector('.user-guide-backdrop');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toContainElement(dialog);
    fireEvent.click(screen.getByRole('heading', { name: '音源与音质' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<UserGuide open={false} onClose={onClose} />);
    expect(backdrop).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger.closest('#guidance-test-targets')).not.toHaveAttribute('inert');
  });

  it.each([true, false])(
    'opens, traps focus and restores the trigger with native dialog=%s',
    (native) => {
      if (native) {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          configurable: true,
          value() {
            this.open = true;
          },
        });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', {
          configurable: true,
          value() {
            this.open = false;
          },
        });
      } else {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          configurable: true,
          value: undefined,
        });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', {
          configurable: true,
          value: undefined,
        });
      }
      const trigger = document.querySelector('[data-coachmark="lyric-toggle"]');
      trigger.focus();
      const onClose = vi.fn();
      const { rerender } = render(<UserGuide open onClose={onClose} />);
      const dialog = screen.getByRole('dialog', { name: '使用帮助' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const close = screen.getByRole('button', { name: '关闭帮助' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(screen.getByRole('button', { name: '重新查看引导' })).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(close).toHaveFocus();
      if (!native) {
        expect(trigger.closest('#guidance-test-targets')).toHaveAttribute('inert');
        fireEvent.keyDown(dialog, { key: 'Escape' });
      } else {
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
      }
      expect(onClose).toHaveBeenCalledOnce();
      rerender(<UserGuide open={false} onClose={onClose} />);
      expect(trigger).toHaveFocus();
      expect(trigger.closest('#guidance-test-targets')).not.toHaveAttribute('inert');
    }
  );
});

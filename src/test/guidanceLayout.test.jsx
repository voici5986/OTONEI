import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceProvider, useDevice } from '../contexts/DeviceContext';
import useGuidanceLayout from '../hooks/useGuidanceLayout';
import { mockResizeAnimationFrame } from './resizeAnimationFrame';

vi.mock('../contexts/DeviceContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useDevice: vi.fn(),
}));

const originalWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');

let frames;

beforeEach(() => {
  frames = mockResizeAnimationFrame();
  useDevice.mockReturnValue({ isMobile: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', originalWidthDescriptor);
});

describe('guidance follows independently responsive controls', () => {
  it.each([
    [false, 767, true, true, true, true],
    [false, 768, true, false, false, false],
    [false, 769, true, false, false, false],
    [false, 900, true, false, false, false],
    [false, 992, false, false, false, false],
    [true, 767, true, true, true, true],
    [true, 768, true, true, true, false],
    [true, 769, true, true, false, false],
    [true, 1280, false, true, false, false],
  ])(
    'matches mobile=%s at width=%s',
    (isMobile, width, bottomNavigation, mobilePlayer, coverToggle, miniEntry) => {
      useDevice.mockReturnValue({ isMobile });
      window.innerWidth = width;
      const { result } = renderHook(() => useGuidanceLayout(), { wrapper: DeviceProvider });
      expect(result.current.usesBottomNavigation).toBe(bottomNavigation);
      expect(result.current.usesMobilePlayer).toBe(mobilePlayer);
      expect(result.current.usesCoverLyricsToggle).toBe(coverToggle);
      expect(result.current.hasMiniPlayerEntry).toBe(miniEntry);
    }
  );

  it('updates mixed and compact layouts on resize without a device change', () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useGuidanceLayout(), { wrapper: DeviceProvider });
    for (const [width, bottom, mobilePlayer] of [
      [991, true, false],
      [992, false, false],
      [900, true, false],
      [650, true, true],
      [1280, false, false],
    ]) {
      act(() => {
        window.innerWidth = width;
        window.dispatchEvent(new Event('resize'));
        frames.flush();
      });
      expect(result.current.usesBottomNavigation).toBe(bottom);
      expect(result.current.usesMobilePlayer).toBe(mobilePlayer);
    }
  });
});

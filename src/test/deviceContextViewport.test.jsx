import React, { Profiler, StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceProvider, useDevice, useViewportWidth } from '../contexts/DeviceContext';
import { addDeviceChangeListener } from '../utils/deviceDetector';
import { mockResizeAnimationFrame } from './resizeAnimationFrame';

const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
let frames;

function WidthConsumer({ id }) {
  const { viewportInfo, deviceType, orientation } = useDevice();
  const width = useViewportWidth();
  return (
    <output
      data-testid={id}
    >{`${width}:${deviceType}:${orientation}:${viewportInfo.height}`}</output>
  );
}

beforeEach(() => {
  frames = mockResizeAnimationFrame();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 767 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 1000 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', widthDescriptor);
  Object.defineProperty(window, 'innerHeight', heightDescriptor);
});

describe('DeviceProvider shared viewport', () => {
  it.each([false, true])(
    'commits only the latest dimensions once per frame, StrictMode=%s',
    (strict) => {
      const commits = vi.fn();
      const consumers = (
        <Profiler id="viewport" onRender={commits}>
          <DeviceProvider>
            <WidthConsumer id="first" />
            <WidthConsumer id="second" />
            <WidthConsumer id="third" />
          </DeviceProvider>
        </Profiler>
      );
      render(strict ? <StrictMode>{consumers}</StrictMode> : consumers);
      commits.mockClear();
      for (const [width, height] of [
        [768, 1001],
        [769, 1002],
        [992, 1003],
      ]) {
        act(() => {
          window.innerWidth = width;
          window.innerHeight = height;
          window.dispatchEvent(new Event('resize'));
        });
      }
      expect(commits).not.toHaveBeenCalled();
      expect(frames.callbacks.size).toBe(1);
      act(() => {
        // Read dimensions at frame time, even if they changed after the last event.
        window.innerHeight = 1004;
        frames.flush();
      });
      expect(commits).toHaveBeenCalledOnce();
      for (const id of ['first', 'second', 'third']) {
        expect(screen.getByTestId(id).textContent).toMatch(/^992:.*:1004$/);
      }
      commits.mockClear();
      act(() => {
        window.innerHeight = 1005;
        window.dispatchEvent(new Event('resize'));
      });
      expect(frames.callbacks.size).toBe(1);
      act(() => frames.flush());
      expect(commits).toHaveBeenCalledOnce();
      expect(screen.getByTestId('first').textContent).toMatch(/^992:.*:1005$/);
    }
  );

  it('ignores a same-frame round trip and schedules the following frame normally', () => {
    const callback = vi.fn();
    const unsubscribe = addDeviceChangeListener(callback, {
      includeViewportChanges: true,
      coalesceResize: true,
    });
    window.innerWidth = 768;
    window.dispatchEvent(new Event('resize'));
    window.innerWidth = 767;
    window.dispatchEvent(new Event('resize'));
    frames.flush();
    expect(callback).not.toHaveBeenCalled();
    window.innerHeight = 1001;
    window.dispatchEvent(new Event('resize'));
    frames.flush();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].viewportInfo).toMatchObject({ width: 767, height: 1001 });
    unsubscribe();
  });

  it('cancels pending work and ignores stale frame callbacks after unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = addDeviceChangeListener(callback, {
      includeViewportChanges: true,
      coalesceResize: true,
    });
    window.innerWidth = 768;
    window.dispatchEvent(new Event('resize'));
    const [[id, staleFrame]] = [...frames.callbacks];
    unsubscribe();
    expect(frames.cancel).toHaveBeenCalledWith(id);
    expect(frames.callbacks.size).toBe(0);
    staleFrame(performance.now());
    window.dispatchEvent(new Event('resize'));
    expect(callback).not.toHaveBeenCalled();
    expect(frames.request).toHaveBeenCalledOnce();
  });

  it.each([false, true])('cancels provider work on unmount, StrictMode=%s', (strict) => {
    const app = (
      <DeviceProvider>
        <WidthConsumer id="first" />
      </DeviceProvider>
    );
    const { unmount } = render(strict ? <StrictMode>{app}</StrictMode> : app);
    act(() => {
      window.innerWidth = 768;
      window.dispatchEvent(new Event('resize'));
    });
    const [[id, staleFrame]] = [...frames.callbacks];
    unmount();
    expect(frames.cancel).toHaveBeenCalledWith(id);
    expect(frames.callbacks.size).toBe(0);
    act(() => staleFrame(performance.now()));
    window.dispatchEvent(new Event('resize'));
    expect(frames.callbacks.size).toBe(0);
  });

  it.each([false, true])('shares one active resize listener, StrictMode=%s', (strict) => {
    const activeListeners = new Set();
    const addListener = window.addEventListener.bind(window);
    const removeListener = window.removeEventListener.bind(window);
    const registrations = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        if (type === 'resize') activeListeners.add(listener);
        addListener(type, listener, options);
      });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (type === 'resize') activeListeners.delete(listener);
      removeListener(type, listener, options);
    });
    const consumers = (
      <DeviceProvider>
        <WidthConsumer id="first" />
        <WidthConsumer id="second" />
        <WidthConsumer id="third" />
      </DeviceProvider>
    );
    const { unmount } = render(strict ? <StrictMode>{consumers}</StrictMode> : consumers);
    expect(activeListeners.size).toBe(1);
    expect(registrations.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(
      strict ? 2 : 1
    );
    const [, deviceType, orientation] = screen.getByTestId('first').textContent.split(':');
    for (const width of [767, 768, 769, 767]) {
      act(() => {
        window.innerWidth = width;
        window.dispatchEvent(new Event('resize'));
        frames.flush();
      });
      for (const id of ['first', 'second', 'third']) {
        expect(screen.getByTestId(id)).toHaveTextContent(`${width}:${deviceType}:${orientation}`);
      }
      expect(activeListeners.size).toBe(1);
    }
    unmount();
    expect(activeListeners.size).toBe(0);
  });

  it('uses fresh viewport dimensions when remounted within the device cache lifetime', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    const first = render(
      <DeviceProvider>
        <WidthConsumer id="width" />
      </DeviceProvider>
    );
    expect(screen.getByTestId('width').textContent).toMatch(/^767:/);
    first.unmount();
    window.innerWidth = 768;
    const second = render(
      <DeviceProvider>
        <WidthConsumer id="width" />
      </DeviceProvider>
    );
    expect(screen.getByTestId('width').textContent).toMatch(/^768:/);
    second.unmount();
    window.innerHeight = 1001;
    render(
      <DeviceProvider>
        <WidthConsumer id="width" />
      </DeviceProvider>
    );
    expect(screen.getByTestId('width').textContent).toMatch(/^768:.*:1001$/);
  });

  it('preserves type-and-orientation-only notifications for default detector subscribers', () => {
    const callback = vi.fn();
    const unsubscribe = addDeviceChangeListener(callback);
    window.innerWidth = 768;
    window.dispatchEvent(new Event('resize'));
    expect(callback).not.toHaveBeenCalled();
    window.innerWidth = 1400;
    window.dispatchEvent(new Event('resize'));
    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

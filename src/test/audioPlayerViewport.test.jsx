import React from 'react';
import { act } from '@testing-library/react';
import { mockResizeAnimationFrame } from './resizeAnimationFrame';
import { createRoot } from 'react-dom/client';

const { useDevice, useViewState, usePlayer, audioStateManager } = vi.hoisted(() => ({
  useDevice: vi.fn(),
  useViewState: vi.fn(),
  usePlayer: vi.fn(),
  audioStateManager: { pause: vi.fn(), play: vi.fn(), getCurrentTrack: vi.fn(), getState: vi.fn() },
}));

vi.mock('../contexts/DeviceContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useDevice,
}));
vi.mock('../contexts/PlayerContext', () => ({ usePlayer, usePlayerProgress: () => usePlayer() }));
vi.mock('../services/audioStateManager', () => ({ default: audioStateManager }));
vi.mock('../hooks/useAudioPlayerViewState', () => ({ default: useViewState }));
vi.mock('../components/MobilePlayerView', () => ({
  default: ({ children }) => (
    <div data-view="mobile">
      <button data-coachmark="player-summary">Expand player</button>
      <ProgressBar />
      {children}
    </div>
  ),
}));
vi.mock('../components/DesktopPlayerView', () => ({
  default: ({ children }) => (
    <div data-view="desktop">
      <button data-coachmark="lyric-toggle">Expand lyrics</button>
      <ProgressBar />
      {children}
    </div>
  ),
}));
vi.mock('../components/ContextualCoachmark', () => ({
  default: ({ target, text }) => <div data-hint-target={target}>{text}</div>,
}));
vi.mock('../contexts/DownloadContext', () => ({
  useDownload: () => ({ handleDownload: vi.fn() }),
}));
vi.mock('../components/DesktopAlbumCover', () => ({ default: () => null }));
vi.mock('../components/MobileAlbumCover', () => ({ default: () => null }));
vi.mock('../components/HeartButton', () => ({ default: () => null }));
vi.mock('../components/PlayerSubComponents', () => ({ LyricToggleButton: () => null }));

import AudioPlayer from '../components/AudioPlayer';
import { DeviceProvider } from '../contexts/DeviceContext';
import ProgressBar from '../components/ProgressBar';
import DesktopPlayerControl from '../components/DesktopPlayerControl';
import MobileExpandedView from '../components/MobileExpandedView';
import {
  DESKTOP_LYRICS_HINT_STORAGE_KEY,
  MOBILE_PLAYER_HINT_STORAGE_KEY,
  resetGuidance,
} from '../services/guidanceStorage';

const TestAudioPlayer = (props) => (
  <DeviceProvider>
    <AudioPlayer {...props} />
  </DeviceProvider>
);

describe('AudioPlayer viewport selection', () => {
  let container;
  let root;
  let originalWidthDescriptor;
  let frames;

  beforeEach(() => {
    originalWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    vi.clearAllMocks();
    frames = mockResizeAnimationFrame();
    resetGuidance();
    const currentTrack = { id: 'track-1', source: 'netease' };
    usePlayer.mockReturnValue({
      currentTrack,
      playerUrl: 'audio-url',
      isPlaying: true,
      playProgress: 20,
      totalSeconds: 100,
      seekTo: vi.fn(),
      formatTime: String,
    });
    audioStateManager.getCurrentTrack.mockReturnValue(currentTrack);
    audioStateManager.getState.mockReturnValue('paused');
    useDevice.mockReturnValue({ isMobile: false, isTablet: false });
    useViewState.mockReturnValue({ currentTrack: { id: 'track-1' }, processedLyrics: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it.each([
    [767, 768, 'player-summary', 'lyric-toggle'],
    [768, 767, 'lyric-toggle', 'player-summary'],
  ])(
    'retains playback history when paused and resizing from %spx to %spx',
    async (initialWidth, nextWidth, initialTarget, nextTarget) => {
      window.innerWidth = initialWidth;
      const state = {
        currentTrack: { id: 'track-1' },
        processedLyrics: [],
        isPlaying: true,
        lyricExpanded: false,
      };
      useViewState.mockReturnValue(state);
      await act(async () => root.render(<TestAudioPlayer />));
      expect(container.querySelector(`[data-coachmark="${initialTarget}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-hint-target="${initialTarget}"]`)).not.toBeNull();

      useViewState.mockReturnValue({ ...state, isPlaying: false });
      await act(async () => root.render(<TestAudioPlayer guideOpen={false} />));
      window.innerWidth = nextWidth;
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
        frames.flush();
      });
      expect(container.querySelector(`[data-coachmark="${nextTarget}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-hint-target="${nextTarget}"]`)).not.toBeNull();
    }
  );

  it.each([
    [767, 768, MOBILE_PLAYER_HINT_STORAGE_KEY, DESKTOP_LYRICS_HINT_STORAGE_KEY],
    [768, 767, DESKTOP_LYRICS_HINT_STORAGE_KEY, MOBILE_PLAYER_HINT_STORAGE_KEY],
  ])(
    'does not consume the unvisited expansion tip when resizing expanded from %spx to %spx',
    async (initialWidth, nextWidth, visitedKey, unvisitedKey) => {
      window.innerWidth = initialWidth;
      useViewState.mockReturnValue({
        currentTrack: { id: 'track-1' },
        processedLyrics: [],
        isPlaying: true,
        lyricExpanded: true,
      });
      await act(async () => root.render(<TestAudioPlayer />));
      expect(localStorage.getItem(visitedKey)).toBe('dismissed');
      window.innerWidth = nextWidth;
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
        frames.flush();
      });
      expect(localStorage.getItem(unvisitedKey)).toBeNull();
    }
  );

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', originalWidthDescriptor);
  });

  it.each([
    [false, 767, 'mobile'],
    [false, 768, 'desktop'],
    [false, 769, 'desktop'],
    [true, 767, 'mobile'],
    [true, 768, 'mobile'],
    [true, 769, 'mobile'],
  ])('selects %s device at %spx as %s', async (isMobile, width, view) => {
    useDevice.mockReturnValue({ isMobile });
    window.innerWidth = width;
    await act(async () => root.render(<TestAudioPlayer />));
    expect(container.querySelector(`[data-view="${view}"]`)).not.toBeNull();
  });

  it.each([
    [767, true],
    [768, true],
    [769, false],
  ])('cover toggles lyrics at %spx: %s', async (width, canToggle) => {
    window.innerWidth = width;
    const setShowMobileLyrics = vi.fn();
    await act(async () =>
      root.render(
        <MobileExpandedView
          currentTrack={{ id: 'track-1' }}
          showMobileLyrics={false}
          setShowMobileLyrics={setShowMobileLyrics}
          processedLyrics={[]}
        />
      )
    );
    await act(async () => container.querySelector('[data-coachmark="cover-lyrics"]').click());
    expect(setShowMobileLyrics).toHaveBeenCalledTimes(canToggle ? 1 : 0);
    if (canToggle) expect(setShowMobileLyrics).toHaveBeenCalledWith(true);
  });

  it('switches a desktop device across 768px on resize without a device-context change', async () => {
    window.innerWidth = 767;
    await act(async () => root.render(<TestAudioPlayer />));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();

    window.innerWidth = 768;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      frames.flush();
    });
    expect(container.querySelector('[data-view="desktop"]')).not.toBeNull();

    window.innerWidth = 600;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      frames.flush();
    });
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
  });

  it('preserves the mobile-device view at wide viewport widths', async () => {
    useDevice.mockReturnValue({ isMobile: true });
    window.innerWidth = 1024;
    await act(async () => root.render(<TestAudioPlayer />));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
  });

  it('resumes a playing track exactly once when resizing unmounts its active drag', async () => {
    window.innerWidth = 900;
    await act(async () => root.render(<TestAudioPlayer />));
    const slider = container.querySelector('[role="slider"]');
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 });
    await act(async () =>
      slider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50 }))
    );
    window.innerWidth = 767;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      frames.flush();
    });
    await act(async () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
    expect(audioStateManager.pause).toHaveBeenCalledTimes(1);
    expect(audioStateManager.play).toHaveBeenCalledTimes(1);
  });

  it('preserves the desktop view for a tablet at 768px', async () => {
    useDevice.mockReturnValue({ isMobile: false, isTablet: true });
    window.innerWidth = 768;
    await act(async () => root.render(<TestAudioPlayer />));
    expect(container.querySelector('[data-view="desktop"]')).not.toBeNull();
  });

  it('names desktop track controls and updates the play button with playback state', async () => {
    const props = {
      currentTrack: { id: 'track-1', name: 'Song' },
      isPlaying: false,
      handlePrevious: vi.fn(),
      handleNext: vi.fn(),
      togglePlay: vi.fn(),
      getPlayModeTitle: () => '列表循环',
      renderPlayModeIcon: () => null,
    };
    await act(async () => root.render(<DesktopPlayerControl {...props} />));
    for (const [label, handler] of [
      ['上一首', props.handlePrevious],
      ['播放', props.togglePlay],
      ['下一首', props.handleNext],
    ]) {
      const button = container.querySelector(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      await act(async () => button.click());
      expect(handler).toHaveBeenCalledTimes(1);
    }

    await act(async () => root.render(<DesktopPlayerControl {...props} isPlaying />));
    expect(container.querySelector('button[aria-label="暂停"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="播放"]')).toBeNull();
  });
});

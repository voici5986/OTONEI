import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const { useDevice, useViewState, usePlayer, audioStateManager } = vi.hoisted(() => ({
  useDevice: vi.fn(),
  useViewState: vi.fn(),
  usePlayer: vi.fn(),
  audioStateManager: { pause: vi.fn(), play: vi.fn(), getCurrentTrack: vi.fn(), getState: vi.fn() },
}));

vi.mock('../contexts/DeviceContext', () => ({ useDevice }));
vi.mock('../contexts/PlayerContext', () => ({ usePlayer }));
vi.mock('../services/audioStateManager', () => ({ default: audioStateManager }));
vi.mock('../hooks/useAudioPlayerViewState', () => ({ default: useViewState }));
vi.mock('../components/MobilePlayerView', () => ({
  default: () => (
    <div data-view="mobile">
      <ProgressBar />
    </div>
  ),
}));
vi.mock('../components/DesktopPlayerView', () => ({
  default: () => (
    <div data-view="desktop">
      <ProgressBar />
    </div>
  ),
}));
vi.mock('../contexts/DownloadContext', () => ({
  useDownload: () => ({ handleDownload: vi.fn() }),
}));
vi.mock('../components/DesktopAlbumCover', () => ({ default: () => null }));
vi.mock('../components/HeartButton', () => ({ default: () => null }));
vi.mock('../components/PlayerSubComponents', () => ({ LyricToggleButton: () => null }));

import AudioPlayer from '../components/AudioPlayer';
import ProgressBar from '../components/ProgressBar';
import DesktopPlayerControl from '../components/DesktopPlayerControl';

describe('AudioPlayer viewport selection', () => {
  let container;
  let root;
  let originalWidth;

  beforeEach(() => {
    originalWidth = window.innerWidth;
    vi.clearAllMocks();
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
    useViewState.mockReturnValue({ currentTrack: { id: 'track-1' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.innerWidth = originalWidth;
  });

  it('switches a desktop device across 768px on resize without a device-context change', async () => {
    window.innerWidth = 767;
    await act(async () => root.render(<AudioPlayer />));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();

    window.innerWidth = 768;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(container.querySelector('[data-view="desktop"]')).not.toBeNull();

    window.innerWidth = 600;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
  });

  it('preserves the mobile-device view at wide viewport widths', async () => {
    useDevice.mockReturnValue({ isMobile: true });
    window.innerWidth = 1024;
    await act(async () => root.render(<AudioPlayer />));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
  });

  it('resumes a playing track exactly once when resizing unmounts its active drag', async () => {
    window.innerWidth = 900;
    await act(async () => root.render(<AudioPlayer />));
    const slider = container.querySelector('[role="slider"]');
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 });
    await act(async () =>
      slider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50 }))
    );
    window.innerWidth = 767;
    await act(async () => window.dispatchEvent(new Event('resize')));
    await act(async () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    expect(container.querySelector('[data-view="mobile"]')).not.toBeNull();
    expect(audioStateManager.pause).toHaveBeenCalledTimes(1);
    expect(audioStateManager.play).toHaveBeenCalledTimes(1);
  });

  it('preserves the desktop view for a tablet at 768px', async () => {
    useDevice.mockReturnValue({ isMobile: false, isTablet: true });
    window.innerWidth = 768;
    await act(async () => root.render(<AudioPlayer />));
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

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const { usePlayer, audioEngine, audioStateManager } = vi.hoisted(() => ({
  usePlayer: vi.fn(),
  audioEngine: {
    pause: vi.fn(),
    play: vi.fn(),
    seek: vi.fn(),
  },
  audioStateManager: {
    pause: vi.fn(),
    play: vi.fn(),
    getCurrentTrack: vi.fn(),
    getState: vi.fn(),
  },
}));

vi.mock('../contexts/PlayerContext', () => ({ usePlayer }));
vi.mock('../services/AudioEngine', () => ({ default: audioEngine }));
vi.mock('../services/audioStateManager', () => ({ default: audioStateManager }));

import ProgressBar from '../components/ProgressBar';
const TestPlayerContext = React.createContext(null);

describe('ProgressBar playback controls', () => {
  let container;
  let root;

  beforeEach(() => {
    usePlayer.mockReturnValue({
      currentTrack: { id: 'track-1', name: 'Song', source: 'netease' },
      playProgress: 20,
      totalSeconds: 100,
      seekTo: vi.fn(),
      formatTime: (value) => `${value}`,
      isPlaying: true,
      setIsPlaying: vi.fn(),
    });
    vi.clearAllMocks();
    audioStateManager.getCurrentTrack.mockReturnValue({ id: 'track-1', source: 'netease' });
    audioStateManager.getState.mockReturnValue('paused');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('routes drag pause and release resume through audioStateManager', async () => {
    await act(async () => root.render(<ProgressBar />));
    const wrapper = container.querySelector('.progress-wrapper');
    wrapper.getBoundingClientRect = () => ({ left: 0, width: 100 });

    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50 }));
    });
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(audioStateManager.pause).toHaveBeenCalledTimes(1);
    expect(audioStateManager.play).toHaveBeenCalledTimes(1);
    expect(audioEngine.pause).not.toHaveBeenCalled();
    expect(audioEngine.play).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(audioStateManager.play).toHaveBeenCalledTimes(1);
  });

  it('exposes the current playback time as a focusable named slider', async () => {
    await act(async () => root.render(<ProgressBar />));
    const slider = container.querySelector('[role="slider"]');

    expect(slider.getAttribute('aria-label')).toBe('播放进度');
    expect(slider.tabIndex).toBe(0);
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
    expect(slider.getAttribute('aria-valuenow')).toBe('20');
    expect(slider.getAttribute('aria-valuetext')).toBe('20 / 100');
    await act(async () => slider.focus());
    expect(document.activeElement).toBe(slider);
    expect(container.querySelector('.progress-handle')).not.toBeNull();
  });

  it('seeks cumulatively with arrows and clamps Home/End without interrupting playback', async () => {
    await act(async () => root.render(<ProgressBar />));
    const slider = container.querySelector('[role="slider"]');
    const seekTo = usePlayer.mock.results[0].value.seekTo;
    const press = async (key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      await act(async () => slider.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    };

    await press('ArrowRight');
    await press('ArrowUp');
    await press('ArrowLeft');
    await press('ArrowDown');
    await press('Home');
    await press('ArrowLeft');
    await press('End');
    await press('ArrowRight');

    expect(seekTo.mock.calls.map(([seconds]) => seconds)).toEqual([25, 30, 25, 20, 0, 0, 100, 100]);
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    expect(slider.getAttribute('aria-valuetext')).toBe('100 / 100');
    expect(audioStateManager.pause).not.toHaveBeenCalled();
    expect(audioStateManager.play).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys and disables seeking until duration is available', async () => {
    const player = usePlayer();
    usePlayer.mockReturnValue({ ...player, totalSeconds: 0 });
    await act(async () => root.render(<ProgressBar />));
    const slider = container.querySelector('[role="slider"]');
    expect(slider.tabIndex).toBe(-1);
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(player.seekTo).not.toHaveBeenCalled();

    usePlayer.mockReturnValue(player);
    await act(async () => root.render(<ProgressBar key="available" />));
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => container.querySelector('[role="slider"]').dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('clears keyboard overrides across track identities but preserves them for cloned track objects', async () => {
    const player = usePlayer();
    usePlayer.mockImplementation(() => React.useContext(TestPlayerContext));
    const renderPlayer = async (value) => {
      await act(async () =>
        root.render(
          <TestPlayerContext.Provider value={value}>
            <ProgressBar />
          </TestPlayerContext.Provider>
        )
      );
    };
    await renderPlayer(player);
    const slider = container.querySelector('[role="slider"]');
    await act(async () =>
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    );
    await renderPlayer({ ...player, currentTrack: { ...player.currentTrack } });
    expect(slider.getAttribute('aria-valuenow')).toBe('100');

    await renderPlayer({ ...player, totalSeconds: 0, playProgress: 0 });
    await renderPlayer({
      ...player,
      currentTrack: { id: 'track-2', source: 'netease' },
      totalSeconds: 200,
      playProgress: 0,
    });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    await act(async () =>
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
    expect(player.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('does not resume a different transport track when an active drag unmounts', async () => {
    await act(async () => root.render(<ProgressBar />));
    const slider = container.querySelector('[role="slider"]');
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 });
    await act(async () =>
      slider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50 }))
    );
    audioStateManager.getCurrentTrack.mockReturnValue({ id: 'track-2', source: 'netease' });
    await act(async () => root.render(null));
    expect(audioStateManager.pause).toHaveBeenCalledTimes(1);
    expect(audioStateManager.play).not.toHaveBeenCalled();
  });

  it('yields keyboard progress to context updates and same-track replay without losing pending key presses', async () => {
    const player = usePlayer();
    usePlayer.mockImplementation(() => React.useContext(TestPlayerContext));
    const renderProgress = async (playProgress) => {
      await act(async () =>
        root.render(
          <TestPlayerContext.Provider value={{ ...player, playProgress }}>
            <ProgressBar />
          </TestPlayerContext.Provider>
        )
      );
    };
    await renderProgress(20);
    const slider = container.querySelector('[role="slider"]');
    const press = async (key) => {
      await act(async () =>
        slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      );
    };
    await press('End');
    await renderProgress(20);
    await press('ArrowLeft');
    expect(player.seekTo).toHaveBeenLastCalledWith(95);

    await renderProgress(95);
    await renderProgress(96);
    expect(slider.getAttribute('aria-valuenow')).toBe('96');
    await press('End');
    await renderProgress(100);
    await renderProgress(0);
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    await press('ArrowLeft');
    expect(player.seekTo).toHaveBeenLastCalledWith(0);
    await renderProgress(0);
    await press('ArrowRight');
    await renderProgress(0);
    await press('ArrowRight');
    expect(player.seekTo).toHaveBeenLastCalledWith(10);
  });
});

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
  },
}));

vi.mock('../contexts/PlayerContext', () => ({ usePlayer }));
vi.mock('../services/AudioEngine', () => ({ default: audioEngine }));
vi.mock('../services/audioStateManager', () => ({ default: audioStateManager }));

import ProgressBar from '../components/ProgressBar';

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
  });
});

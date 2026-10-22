// Layout breakpoints use viewport CSS pixels.
export const VIEWPORT_BREAKPOINTS = Object.freeze({ md: 768 });

// The navigation shell switches independently of the player layout.
export const NAVIGATION_BREAKPOINT = 992;

export function getPlayerViewportLayout(isMobile, viewportWidth) {
  const usesMobilePlayer = isMobile || viewportWidth < VIEWPORT_BREAKPOINTS.md;
  return {
    usesMobilePlayer,
    // The mini-player's d-md-none utility hides its entry from 768px onward.
    hasMiniPlayerEntry: usesMobilePlayer && viewportWidth < VIEWPORT_BREAKPOINTS.md,
    // The expanded player's CSS includes the 768px cover-toggle boundary.
    usesCoverLyricsToggle: usesMobilePlayer && viewportWidth <= VIEWPORT_BREAKPOINTS.md,
  };
}

// Physical screen heuristics are independent of responsive layout breakpoints.
export const DEVICE_THRESHOLDS = Object.freeze({ tabletMinScreenDimension: 768 });

import { useDevice, useViewportWidth } from '../contexts/DeviceContext';
import { getPlayerViewportLayout, NAVIGATION_BREAKPOINT } from '../config/responsive.mjs';

export interface GuidanceLayout {
  usesBottomNavigation: boolean;
  usesMobilePlayer: boolean;
  hasMiniPlayerEntry: boolean;
  usesCoverLyricsToggle: boolean;
}

/** Keep guidance aligned with the independently responsive navigation and player. */
export default function useGuidanceLayout(): GuidanceLayout {
  const { isMobile } = useDevice();
  const viewportWidth = useViewportWidth();
  return {
    usesBottomNavigation: viewportWidth < NAVIGATION_BREAKPOINT,
    ...getPlayerViewportLayout(isMobile, viewportWidth),
  };
}

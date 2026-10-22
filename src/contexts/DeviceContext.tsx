import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { detectDevice, addDeviceChangeListener } from '../utils/deviceDetector';
import type { DeviceInfo } from '../types';

const defaultDeviceInfo: DeviceInfo = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  orientation: 'portrait',
  deviceType: 'desktop',
  screenInfo: {
    width: 0,
    height: 0,
    ratio: 0,
    pixelRatio: 1,
  },
  viewportInfo: {
    width: 0,
    height: 0,
    ratio: 0,
  },
  hasTouchScreen: false,
};

const DeviceContext = createContext<DeviceInfo | undefined>(undefined);

export const DeviceProvider = ({ children }: { children: ReactNode }) => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') return defaultDeviceInfo;
    return detectDevice() as DeviceInfo;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const removeListener = addDeviceChangeListener(
      (newDeviceInfo: DeviceInfo) => {
        setDeviceInfo(newDeviceInfo);
      },
      { includeViewportChanges: true, coalesceResize: true }
    );

    return () => {
      removeListener?.();
    };
  }, []);

  return <DeviceContext.Provider value={deviceInfo}>{children}</DeviceContext.Provider>;
};

export const useDevice = (): DeviceInfo => {
  const context = useContext(DeviceContext);
  if (!context) throw new Error('useDevice must be used within a DeviceProvider');
  return context;
};

export const useViewportWidth = (): number => useDevice().viewportInfo.width;

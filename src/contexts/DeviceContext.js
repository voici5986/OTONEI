import React, { createContext, useState, useContext, useEffect } from 'react';
import { detectDevice, addDeviceChangeListener } from '../utils/deviceDetector';

// 创建设备上下文
const DeviceContext = createContext({
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  orientation: 'portrait',
  deviceType: 'desktop',
  screenInfo: {
    width: 0,
    height: 0,
    ratio: 0,
    pixelRatio: 1
  },
  viewportInfo: {
    width: 0,
    height: 0,
    ratio: 0
  },
  hasTouchScreen: false
});

// 设备上下文提供程序组件
export const DeviceProvider = ({ children }) => {
  // 初始化设备状态
  const [deviceInfo, setDeviceInfo] = useState(() => {
    // 服务器端渲染时返回默认值
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        orientation: 'portrait',
        deviceType: 'desktop',
        screenInfo: {
          width: 0,
          height: 0,
          ratio: 0,
          pixelRatio: 1
        },
        viewportInfo: {
          width: 0,
          height: 0,
          ratio: 0
        },
        hasTouchScreen: false
      };
    }
    
    // 客户端渲染时检测设备
    return detectDevice();
  });

  // 监听设备变化
  useEffect(() => {
    // 服务器端渲染时不执行
    if (typeof window === 'undefined') return;
    
    // 添加设备变化监听器
    const removeListener = addDeviceChangeListener((newDeviceInfo) => {
      setDeviceInfo(newDeviceInfo);
    });
    
    // 清理函数
    return () => {
      removeListener();
    };
  }, []);

  return (
    <DeviceContext.Provider value={deviceInfo}>
      {children}
    </DeviceContext.Provider>
  );
};

// 自定义钩子，用于访问设备信息
export const useDevice = () => {
  const context = useContext(DeviceContext);
  
  if (context === undefined) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  
  return context;
};


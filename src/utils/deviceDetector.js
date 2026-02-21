/**
 * 设备检测工具
 * 提供精确的设备类型检测，包括移动设备、平板和桌面设备
 */

// 缓存检测结果
let deviceInfoCache = null;
let lastDetectionTime = 0;
// 缓存有效期（毫秒）
const CACHE_TTL = 1000;

/**
 * 检测设备类型
 * @returns {Object} 包含设备类型信息的对象
 * - isMobile: 是否为移动设备
 * - isTablet: 是否为平板设备
 * - isDesktop: 是否为桌面设备
 * - orientation: 设备方向 ('portrait' 或 'landscape')
 * - deviceType: 设备类型 ('mobile', 'tablet', 或 'desktop')
 */
export const detectDevice = () => {
  const now = Date.now();
  
  // 如果有缓存且未过期，直接返回缓存结果
  if (deviceInfoCache && (now - lastDetectionTime < CACHE_TTL)) {
    return deviceInfoCache;
  }
  
  // 获取用户代理字符串
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // 获取屏幕信息
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const screenRatio = screenWidth / screenHeight;
  
  // 获取视口信息
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportRatio = viewportWidth / viewportHeight;
  
  // 设备像素比
  const pixelRatio = window.devicePixelRatio || 1;
  
  // 移动设备正则表达式
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  
  // 平板设备正则表达式 (更精确的检测)
  const tabletRegex = /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i;
  
  // 基础检测
  const hasTouchScreen = ('ontouchstart' in window) || 
                         (navigator.maxTouchPoints > 0) || 
                         (navigator.msMaxTouchPoints > 0);
                         
  // 初步检测设备类型
  let isMobileDevice = mobileRegex.test(userAgent);
  let isTabletDevice = tabletRegex.test(userAgent);
  
  // 更精确的平板检测
  // 如果设备报告为移动设备，但屏幕尺寸较大，可能是平板
  if (isMobileDevice && !isTabletDevice) {
    // 大屏幕移动设备可能是平板
    // iPad Pro 和一些大屏Android平板的特征
    if (
      (screenWidth >= 768 && screenHeight >= 768) || // 最小平板尺寸
      (Math.max(screenWidth, screenHeight) >= 1024) || // 大屏幕设备
      (screenRatio > 0.6 && screenRatio < 1.7) // 平板通常有更接近正方形的屏幕比例
    ) {
      isTabletDevice = true;
      isMobileDevice = false;
    }
  }
  
  // 检测是否为桌面设备
  const isDesktopDevice = !isMobileDevice && !isTabletDevice;
  
  // 如果是桌面设备但有触摸屏，可能是触摸屏笔记本或平板模式的设备
  if (isDesktopDevice && hasTouchScreen) {
    // 检查是否可能是处于平板模式的笔记本
    if (viewportRatio < 1.3 && viewportWidth < 1200) {
      isTabletDevice = true;
    }
  }
  
  // 最终设备类型判断
  // 1. 小屏幕触摸设备 = 移动设备
  // 2. 中等屏幕触摸设备 = 平板
  // 3. 大屏幕或无触摸设备 = 桌面设备
  
  let deviceType = 'desktop';
  
  if (isMobileDevice) {
    deviceType = 'mobile';
  } else if (isTabletDevice) {
    deviceType = 'tablet';
  }
  
  // 判断设备方向
  const orientation = viewportWidth > viewportHeight ? 'landscape' : 'portrait';
  
  // 构造设备信息对象
  const deviceInfo = {
    isMobile: isMobileDevice,
    isTablet: isTabletDevice,
    isDesktop: isDesktopDevice,
    orientation,
    deviceType,
    screenInfo: {
      width: screenWidth,
      height: screenHeight,
      ratio: screenRatio,
      pixelRatio
    },
    viewportInfo: {
      width: viewportWidth,
      height: viewportHeight,
      ratio: viewportRatio
    },
    hasTouchScreen
  };
  
  // 更新缓存
  deviceInfoCache = deviceInfo;
  lastDetectionTime = now;
  
  // 返回设备信息
  return deviceInfo;
};

/**
 * 获取当前设备类型
 * @returns {string} 设备类型 ('mobile', 'tablet', 或 'desktop')
 */
const getDeviceType = () => {
  const { deviceType } = detectDevice();
  return deviceType;
};

/**
 * 检查是否为移动设备
 * @returns {boolean} 是否为移动设备
 */
const isMobile = () => {
  const { isMobile } = detectDevice();
  return isMobile;
};

/**
 * 检查是否为平板设备
 * @returns {boolean} 是否为平板设备
 */
const isTablet = () => {
  const { isTablet } = detectDevice();
  return isTablet;
};

/**
 * 检查是否为桌面设备
 * @returns {boolean} 是否为桌面设备
 */
const isDesktop = () => {
  const { isDesktop } = detectDevice();
  return isDesktop;
};

/**
 * 获取设备方向
 * @returns {string} 设备方向 ('portrait' 或 'landscape')
 */
const getOrientation = () => {
  const { orientation } = detectDevice();
  return orientation;
};

/**
 * 强制刷新设备缓存
 * 当明确知道设备信息可能发生变化时调用
 */
const refreshDeviceInfo = () => {
  deviceInfoCache = null;
  return detectDevice();
};

/**
 * 添加设备类型变化监听器
 * @param {Function} callback 当设备类型变化时调用的回调函数
 * @returns {Function} 移除监听器的函数
 */
export const addDeviceChangeListener = (callback) => {
  let currentDevice = detectDevice();
  
  const handleResize = () => {
    // 强制刷新设备信息
    const newDevice = refreshDeviceInfo();
    
    // 检查设备类型或方向是否发生变化
    if (
      currentDevice.deviceType !== newDevice.deviceType || 
      currentDevice.orientation !== newDevice.orientation
    ) {
      currentDevice = newDevice;
      callback(newDevice);
    }
  };
  
  window.addEventListener('resize', handleResize);
  
  // 返回移除监听器的函数
  return () => {
    window.removeEventListener('resize', handleResize);
  };
};


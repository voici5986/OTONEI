import React, { useState, useEffect } from 'react';
import { useDevice } from '../contexts/DeviceContext';
import { getCurrentOrientation, addOrientationChangeListener } from '../utils/orientationManager';
import { FaMobileAlt } from 'react-icons/fa';

/**
 * 横屏提示组件
 * 当用户在移动设备上横屏时显示提示信息
 */
const OrientationPrompt = () => {
  const deviceInfo = useDevice();
  const [visible, setVisible] = useState(false);

  // 监听屏幕方向变化
  useEffect(() => {
    // 只在移动设备和平板上启用
    if (!deviceInfo.isMobile && !deviceInfo.isTablet) {
      return;
    }

    // 初始检查
    const currentOrientation = getCurrentOrientation();
    setVisible(currentOrientation === 'landscape');

    // 添加监听器
    const removeListener = addOrientationChangeListener((newOrientation) => {
      setVisible(newOrientation === 'landscape');
    });

    // 清理函数
    return () => {
      removeListener();
    };
  }, [deviceInfo.isMobile, deviceInfo.isTablet]);

  // 如果不是移动设备或平板，或者当前是竖屏，则不显示提示
  if ((!deviceInfo.isMobile && !deviceInfo.isTablet) || !visible) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 'var(--z-index-overlay)',
        color: 'white',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <FaMobileAlt
        size={60}
        style={{
          transform: 'rotate(90deg)',
          marginBottom: '20px',
          animation: 'rotate-phone 1.5s infinite ease-in-out',
        }}
      />
      <h3 style={{ marginBottom: '15px' }}>请旋转设备</h3>
      <p style={{ fontSize: '16px', maxWidth: '300px' }}>
        为了获得最佳体验，请将设备旋转至竖屏模式
      </p>

      {/* 添加旋转动画的CSS */}
      <style>
        {`
          @keyframes rotate-phone {
            0% { transform: rotate(90deg); }
            15% { transform: rotate(0deg); }
            85% { transform: rotate(0deg); }
            100% { transform: rotate(90deg); }
          }
        `}
      </style>
    </div>
  );
};

export default OrientationPrompt;

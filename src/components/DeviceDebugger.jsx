import React from 'react';
import { useDevice } from '../contexts/DeviceContext';

/**
 * 设备信息调试组件
 * 显示当前设备的详细信息，用于开发调试
 */
const DeviceDebugger = ({ show = false }) => {
  const deviceInfo = useDevice();

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 'var(--z-index-overlay)',
        maxWidth: '300px',
        overflowX: 'auto',
      }}
    >
      <h5 style={{ fontSize: '14px', marginBottom: '5px' }}>设备信息</h5>
      <div>
        <strong>设备类型:</strong> {deviceInfo.deviceType}
      </div>
      <div>
        <strong>移动设备:</strong> {deviceInfo.isMobile ? '是' : '否'}
      </div>
      <div>
        <strong>平板设备:</strong> {deviceInfo.isTablet ? '是' : '否'}
      </div>
      <div>
        <strong>桌面设备:</strong> {deviceInfo.isDesktop ? '是' : '否'}
      </div>
      <div>
        <strong>方向:</strong> {deviceInfo.orientation}
      </div>
      <div>
        <strong>触摸屏:</strong> {deviceInfo.hasTouchScreen ? '是' : '否'}
      </div>
      <div>
        <strong>屏幕:</strong> {deviceInfo.screenInfo.width}x{deviceInfo.screenInfo.height}
        (比例: {deviceInfo.screenInfo.ratio.toFixed(2)}, 像素比: {deviceInfo.screenInfo.pixelRatio})
      </div>
      <div>
        <strong>视口:</strong> {deviceInfo.viewportInfo.width}x{deviceInfo.viewportInfo.height}
        (比例: {deviceInfo.viewportInfo.ratio.toFixed(2)})
      </div>
    </div>
  );
};

export default DeviceDebugger;

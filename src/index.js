import React from 'react';
import ReactDOM from 'react-dom/client';
// 首先导入主题文件
import './styles/theme.css';
import './index.css';
// 其他样式文件
import './styles/App.css';
import './styles/AudioPlayer.css';
import './styles/Navigation.mobile.css';
import './styles/Navigation.desktop.css';
import './styles/Orientation.css';
import App from './App';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { AuthProvider } from './contexts/AuthContext';
import { DeviceProvider } from './contexts/DeviceContext';
import SyncProvider from './contexts/SyncContext';
import PlayerProvider from './contexts/PlayerContext';
import FavoritesProvider from './contexts/FavoritesContext';
import DownloadProvider from './contexts/DownloadContext';
import * as serviceWorkerRegistration from './utils/serviceWorkerRegistration';
import logger from './utils/logger.js';

const root = ReactDOM.createRoot(document.getElementById('root'));

// 注意：不使用React.StrictMode包裹应用
// 严格模式会导致组件在开发环境下重复渲染，可能导致多次播放音频问题
// 仅在开发环境影响，不影响生产环境
root.render(
  <AuthProvider>
    <DeviceProvider>
      <SyncProvider>
        <PlayerProvider>
          <FavoritesProvider>
            <DownloadProvider>
              <App />
              <ToastContainer
                position="bottom-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="colored"
              />
            </DownloadProvider>
          </FavoritesProvider>
        </PlayerProvider>
      </SyncProvider>
    </DeviceProvider>
  </AuthProvider>
);

// 生产环境注册 Service Worker 并派发更新事件
if (process.env.NODE_ENV === 'production') {
  serviceWorkerRegistration.register({
    onUpdate: (registration) => {
      window.dispatchEvent(new CustomEvent('sw:update', { detail: registration }));
    },
    onSuccess: (registration) => {
      window.dispatchEvent(new CustomEvent('sw:ready', { detail: registration }));
    }
  });

  // 周期性检查更新
  setInterval(() => {
    serviceWorkerRegistration.checkForUpdates();
  }, 60 * 60 * 1000);
}

// 注册Service Worker，启用PWA功能
// ⚠️ 临时禁用: 先解决 API 问题,之后再启用
// serviceWorkerRegistration.register({
//   onUpdate: (registration) => {
//     logger.log('应用有新的更新可用');
//   },
//   onSuccess: (registration) => {
//     logger.log('内容已成功缓存，可离线使用');
//   }
// });

// 强制注销旧的 Service Worker（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  serviceWorkerRegistration.unregister();
  logger.log('✅ 已发起 Service Worker 注销请求');
}



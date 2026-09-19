import React from 'react';
import ReactDOM from 'react-dom/client';
// 首先导入主题文件
import './styles/theme.css';
// 组件样式（Bootstrap 替代实现）。导入位置与原先在 theme.css 中时一致，
// 早于 App.css 与 bootstrap.min.css，改动前请先读该文件顶部的迁移前提。
import './styles/components.css';
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
import './styles/primitives.css';
import { AuthProvider } from './contexts/AuthContext';
import { DeviceProvider } from './contexts/DeviceContext';
import { SyncProvider } from './contexts/SyncContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { DownloadProvider } from './contexts/DownloadContext';
import { initInputModality } from './utils/inputModality';

// 焦点环只在键盘导航时出现，需要先记录交互方式再挂载应用
initInputModality();

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

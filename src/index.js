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
import { SyncProvider } from './contexts/SyncContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { DownloadProvider } from './contexts/DownloadContext';

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





import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import envCompatible from 'vite-plugin-env-compatible';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Vitest matches per-file coverage thresholds against POSIX-style relative paths
// on every platform. Keep these keys stable on Windows and Linux alike.
const coveragePath = (filePath) => filePath.replace(/\\/g, '/');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    envCompatible({
      // 仅为兼容旧部署变量保留；业务代码统一通过 src/config/env.ts 读取。
      prefix: 'REACT_APP_',
    }),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt', // 使用提示更新策略，避免自动刷新打断用户
      includeAssets: ['maskable-logo.svg'],
      manifest: {
        name: 'OTONEI',
        short_name: 'OTONEI',
        description: '在线音乐搜索、播放和下载，支持多平台音乐资源',
        lang: 'zh-CN',
        // 与 theme.css 的 --color-background-alt 保持一致（PWA 清单不能用 CSS 变量，只能写成字面量）
        theme_color: '#f7f7f5',
        background_color: '#f7f7f5',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'maskable-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: '搜索音乐',
            short_name: '搜索',
            description: '快速搜索音乐',
            url: '/?action=search',
            icons: [{ src: 'logo.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
          {
            name: '我的收藏',
            short_name: '收藏',
            description: '查看收藏的音乐',
            url: '/?tab=favorites',
            icons: [{ src: 'logo.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
        ],
      },
      workbox: {
        // 运行时缓存策略
        runtimeCaching: [
          // API 请求：Cloudflare Pages 上走同源 /api-v1，始终直连网络
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin && url.pathname.startsWith('/api-v1'),
            handler: 'NetworkOnly',
          },
          // 封面图片：缓存优先，设置过期时间
          {
            urlPattern: /^https:\/\/.*(jpg|jpeg|png|webp|gif).*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
              },
            },
          },
          // MiSans 完整可变字体较大，首次使用后再运行时缓存，避免阻塞 PWA 安装。
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin && url.pathname === '/MiSansVF.woff2',
            handler: 'CacheFirst',
            options: {
              cacheName: 'misans-font-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1年
              },
            },
          },
        ],
        // 确保 index.html 始终被缓存
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api-v1(?:\/|$)/],
      },
      // 开发环境下也生成 Service Worker，方便调试
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    // 兼容窗口内保留旧变量注入；业务代码统一通过 src/config/env.ts 读取。
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    'process.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version),
  },
  build: {
    outDir: 'build',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'firebase-vendor',
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
              priority: 20,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](bootstrap|react-icons|react-toastify|@popperjs)[\\/]/,
              priority: 10,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              minSize: 20000,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: './src/test/setupTests.js',
    globals: true,
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.pwa.spec.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'src/config/env.ts',
        'src/utils/dataValidator.ts',
        'src/utils/trackFormatter.ts',
        'src/utils/trackCover.ts',
        'src/services/memoryCache.ts',
        'src/services/rateLimiter.ts',
        'src/services/AudioEngine.ts',
        'src/services/audioStateManager.ts',
        'src/services/storage.js',
        'src/services/syncService.js',
        'src/services/musicApiService.js',
        'src/services/firebase.js',
        'src/hooks/useSearch.ts',
      ],
      exclude: ['**/*.test.{js,jsx}', 'src/test/**', '**/*.d.ts'],
      thresholds: {
        // 首轮门槛按当前显式 include 的实测基线设定，后续只允许递增。
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
        [coveragePath('src/hooks/useSearch.ts')]: {
          statements: 74,
          branches: 60,
          functions: 80,
          lines: 78,
        },
        [coveragePath('src/services/musicApiService.js')]: {
          statements: 69,
          branches: 43,
          functions: 80,
          lines: 70,
        },
        [coveragePath('src/services/storage.js')]: {
          statements: 60,
          branches: 60,
          functions: 60,
          lines: 60,
        },
        [coveragePath('src/services/syncService.js')]: {
          statements: 60,
          branches: 55,
          functions: 60,
          lines: 60,
        },
        [coveragePath('src/services/firebase.js')]: {
          statements: 27,
          branches: 19,
          functions: 9,
          lines: 27,
        },
        [coveragePath('src/config/env.ts')]: {
          statements: 60,
          branches: 50,
          functions: 75,
          lines: 60,
        },
      },
    },
  },
  server: {
    host: true, // 开启局域网访问
    port: 3000,
    open: true,
    proxy: {
      '/api-v1': {
        target: 'https://music-api.gdstudio.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-v1/, ''),
      },
    },
  },
});

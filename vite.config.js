import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import envCompatible from 'vite-plugin-env-compatible';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        envCompatible({
            prefix: 'REACT_APP_',
        }),
        svgr(),
        VitePWA({
            injectRegister: false,
            registerType: 'prompt', // 使用提示更新策略，避免自动刷新打断用户
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
                name: 'OTONEI',
                short_name: 'OTONEI',
                description: '在线音乐搜索、播放和下载，支持多平台音乐资源',
                theme_color: '#f5f5f7',
                background_color: '#f5f5f7',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                orientation: 'portrait',
                icons: [
                    {
                        src: 'logo.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    },
                    {
                        src: 'maskable-logo.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'maskable'
                    }
                ],
                shortcuts: [
                    {
                        name: "搜索音乐",
                        short_name: "搜索",
                        description: "快速搜索音乐",
                        url: "/?action=search",
                        icons: [{ "src": "logo.svg", "sizes": "any", "type": "image/svg+xml" }]
                    },
                    {
                        name: "我的收藏",
                        short_name: "收藏",
                        description: "查看收藏的音乐",
                        url: "/?tab=favorites",
                        icons: [{ "src": "logo.svg", "sizes": "any", "type": "image/svg+xml" }]
                    }
                ]
            },
            workbox: {
                // 运行时缓存策略
                runtimeCaching: [
                    // API 请求：网络优先，确保数据实时性
                    {
                        urlPattern: /^https:\/\/music-api\.gdstudio\.xyz\/.*$/,
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
                    // Google Fonts：重新验证
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1年
                            },
                        },
                    },
                ],
                // 确保 index.html 始终被缓存
                navigateFallback: 'index.html',
            },
            // 开发环境下也生成 Service Worker，方便调试
            devOptions: {
                enabled: true,
                type: 'module',
            },
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    define: {
        // envCompatible 插件已经处理了环境变量，此处只需保留基础兼容性
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        'process.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version),
    },
    esbuild: {
        // 强制对 src 下的所有 .js 文件使用 jsx 加载器
        loader: 'jsx',
        include: /src\/.*\.js$/,
        exclude: [],
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                '.js': 'jsx',
            },
        },
    },
    build: {
        outDir: 'build',
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

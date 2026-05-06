# OTONEI

OTONEI 是一个基于 React 19 + Vite 8 的在线音乐搜索、播放、下载和收藏同步应用。

## 功能

- 多音源搜索：网易云、酷我、JOOX、Bilibili
- 在线播放和音质选择：128、192、320、740、999
- 收藏、播放历史、搜索历史
- PWA 安装和更新提示
- Firebase 云端同步（可选）

## 技术栈

- React 19
- Vite 8
- Context API + 自定义 Hooks
- Localforage / IndexedDB
- Firebase Auth / Firestore
- vite-plugin-pwa
- Vitest / ESLint / Prettier

## 本地开发

要求：

- Node.js >= 20.19.0
- pnpm 10.33.0

安装和启动：

```bash
pnpm install
pnpm start
```

默认开发地址是 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`。

| 变量                                     | 说明                    | 默认值            |
| ---------------------------------------- | ----------------------- | ----------------- |
| `REACT_APP_API_BASE`                     | 音乐 API 入口           | `/api-v1/api.php` |
| `REACT_APP_FIREBASE_API_KEY`             | Firebase API Key        | 可选              |
| `REACT_APP_FIREBASE_AUTH_DOMAIN`         | Firebase Auth 域名      | 可选              |
| `REACT_APP_FIREBASE_PROJECT_ID`          | Firebase 项目 ID        | 可选              |
| `REACT_APP_FIREBASE_STORAGE_BUCKET`      | Firebase Storage Bucket | 可选              |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID      | 可选              |
| `REACT_APP_FIREBASE_APP_ID`              | Firebase App ID         | 可选              |
| `REACT_APP_FIREBASE_MEASUREMENT_ID`      | Firebase Measurement ID | 可选              |

不配置 Firebase 时，应用会进入本地/降级模式。

## 常用命令

```bash
pnpm run lint
pnpm test
pnpm run format:check
pnpm run build
pnpm run serve
```

## 部署

### Cloudflare Pages

构建命令：

```bash
pnpm run build
```

输出目录：

```text
build
```

Cloudflare Pages Functions 会处理 `/api-v1/*` 代理。

### Vercel

`vercel.json` 已配置：

- `/api-v1` -> `https://music-api.gdstudio.xyz/api.php`
- `/api-v1/*` -> `https://music-api.gdstudio.xyz/*`
- 其他路径回退到 SPA 入口

### Docker

```bash
docker build -t otonei .
docker run -d -p 80:80 --name otonei --restart always otonei
```

Nginx 会提供静态文件，并代理 `/api-v1` 到音乐 API。

## 项目结构

```text
src/
  components/   UI 组件
  contexts/     全局状态
  hooks/        自定义 Hooks
  pages/        页面
  services/     API、存储、同步、音频服务
  styles/       样式
  test/         单元测试
  utils/        工具函数
functions/      Cloudflare Pages Functions
conf/           Nginx 配置
docs/           补充文档
```

## 质量检查

CI 会执行：

- `pnpm run format:check`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `pnpm audit --prod`

## 许可证

MIT

# 部署到 Cloudflare Pages

## 项目内置适配

- `functions/api-v1/[[path]].js`：代理 `/api-v1` 和 `/api-v1/api.php` 到 `https://music-api.gdstudio.xyz/api.php`
- `public/_routes.json`：只让 `/api-v1` 命中 Pages Functions，避免静态资源产生 Function 调用
- `public/_redirects`：SPA 页面刷新时回退到 `index.html`
- `public/_headers`：静态资源安全头和基础缓存策略
- `wrangler.toml`：声明 Pages 输出目录和 Functions 兼容日期

## Cloudflare Pages 设置

在 Cloudflare Dashboard 创建 Pages 项目，连接 Git 仓库后使用这些设置：

```text
Framework preset: Vite
Build command: pnpm run build
Build output directory: build
Root directory: 留空
```

环境变量建议：

```text
NODE_VERSION=22.16.0
PNPM_VERSION=10.33.0
REACT_APP_API_BASE=/api-v1/api.php
```

Firebase 同步是可选功能。需要账号同步时，再补充 `REACT_APP_FIREBASE_*` 变量。

## 验证

部署成功后检查：

- 打开网站首页是否正常加载。
- 搜索任意歌曲，Network 里 `/api-v1/api.php?types=search...` 应返回 200。
- 刷新非首页路径时不应 404。
- DevTools Application 里 Service Worker 更新正常，API 请求不进入缓存。

## 常见问题

- 构建失败：优先检查 `NODE_VERSION`、`PNPM_VERSION` 和输出目录 `build`。
- API 404：确认 `functions/api-v1/[[path]].js` 已提交，且 `_routes.json` 已在构建产物里。
- API 403 或 502：上游接口可能限频或临时拒绝，请等待后重试。

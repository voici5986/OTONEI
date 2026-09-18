# 部署到 Cloudflare Pages

## 项目内置适配

- `functions/api-v1/[[path]].js`：代理 `/api-v1` 和 `/api-v1/api.php` 到 `https://music-api.gdstudio.xyz/api.php`
- `public/_routes.json`：只让 `/api-v1` 命中 Pages Functions，避免静态资源产生 Function 调用
- `public/_redirects`：SPA 页面刷新时回退到 `index.html`
- `public/_headers`：静态资源安全头和基础缓存策略
- `wrangler.toml`：声明 Pages 输出目录和 Functions 兼容日期

API Function 在单个运行实例内按 Cloudflare 注入的客户端 IP 做 60 秒 60 次软限流，并为响应附带 `X-Request-Id`。Pages Function 实例会回收或横向扩展，因此这不是全局配额；公开部署仍应在 Cloudflare WAF / Rate Limiting 中为 `/api-v1*` 配置持久限频。

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
NODE_VERSION=26
PNPM_VERSION=12
VITE_API_BASE=/api-v1/api.php
REACT_APP_API_BASE=/api-v1/api.php
```

仓库中的 `.node-version`、`engines.node` 和 `engines.pnpm` 是版本策略来源；Dashboard 中的变量是部署环境的镜像配置，修改后应与这些策略保持一致。当前未在本地验证 Cloudflare 控制台是否自动读取 `.node-version`，请在项目设置中显式确认 Node 26.x 与 pnpm 12.x。

Firebase 配置优先使用 `VITE_FIREBASE_*`；迁移窗口内仍兼容 `REACT_APP_FIREBASE_*`，新旧变量同时存在且冲突时以 `VITE_*` 为准。外部控制面变量需在确认新变量已配置后再移除旧变量。

Firebase 同步是可选功能。需要账号同步时，补充 `VITE_FIREBASE_*` 变量；旧部署仍可在兼容窗口内使用对应的 `REACT_APP_FIREBASE_*`。

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

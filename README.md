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
- Vitest / Oxlint / Oxfmt

## 本地开发

要求：

- Node.js 26.x（以 `.node-version` 和 `engines.node` 的主版本范围为准）
- pnpm 12.x（`>=12 <13`，以 `package.json#engines.pnpm` 为准）

安装和启动：

```bash
pnpm install
pnpm start
```

默认开发地址是 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`。

| 变量                                | 说明                    | 默认值            |
| ----------------------------------- | ----------------------- | ----------------- |
| `VITE_API_BASE`                     | 音乐 API 入口           | `/api-v1/api.php` |
| `VITE_FIREBASE_API_KEY`             | Firebase API Key        | 可选              |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth 域名      | 可选              |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase 项目 ID        | 可选              |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase Storage Bucket | 可选              |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID      | 可选              |
| `VITE_FIREBASE_APP_ID`              | Firebase App ID         | 可选              |
| `VITE_FIREBASE_MEASUREMENT_ID`      | Firebase Measurement ID | 可选              |

不配置 Firebase 时，应用会进入本地/降级模式。
现有 `REACT_APP_*` 变量在兼容窗口内仍可使用；当新旧变量同时存在且值冲突时，以 `VITE_*` 为准。

## 常用命令

```bash
pnpm run lint
pnpm test
pnpm run check:toolchain
pnpm run format:check
pnpm run test:coverage
pnpm run typecheck
pnpm run test:e2e
pnpm run test:e2e:pwa
pnpm run build
pnpm run serve
```

`lint` 和 `format:check` 现在分别使用 Oxlint 和 Oxfmt；`lint:ox`、`lint:ox:check`、`format:ox`、`format:ox:check` 保留为迁移兼容别名。
运行 `format` 写入全仓库前，仍应先审查格式 diff。

## 正式发布

使用 PowerShell 脚本 `release.ps1` 执行严格校验与 semantic-release 自动发版（需要 PowerShell 7.6+，即 `pwsh`；7.6 基于 .NET 10 LTS）：

```powershell
.\release.ps1                # 交互选择（创建正式版本 / 仅运行质量门禁）
.\release.ps1 -Release       # 直接创建正式版本（跳过菜单，仍会二次确认）
.\release.ps1 -ValidateOnly  # 只运行质量门禁，不修改 Git
```

发布流程：

1. 完整质量门禁：锁定依赖安装、工具链一致性、Oxfmt 格式、Oxlint、TypeScript、Vitest 覆盖率、生产构建、普通/PWA E2E、依赖审计
2. semantic-release dry-run 预演并计算下一个版本
3. 二次确认后更新 `package.json` 与 `CHANGELOG.md`、创建 Git 提交和 Docker 兼容的 `vX.Y.Z`（可带预发布标识、不含 `+build` 元数据）标签并推送

前置要求：PowerShell 7.6+、`main` 分支、Git 工作区干净、自上一标签起存在 `fix`/`feat` 或破坏性变更提交。标签推送后，GitHub Actions 自动构建多架构 Docker 镜像推送到 GHCR，Cloudflare Pages 自动触发部署。

## 部署

Cloudflare Pages 是 OTONEI 的主部署目标，安全头、Pages Function 参数校验和 PWA 验收均以该环境为准。Docker/nginx 配置为自托管部署入口，需自行保证与 Cloudflare 一致的平台限频与函数防护。

### Cloudflare Pages

推荐部署到 Cloudflare Pages。项目已包含：

- `functions/api-v1/[[path]].js`：只代理 `/api-v1` 和 `/api-v1/api.php` 到上游 `api.php`
- `public/_routes.json`：只让 `/api-v1` 命中 Pages Functions，静态资源不消耗 Functions 调用
- `public/_redirects`：SPA 路由回退到 `index.html`
- `public/_headers`：静态资源安全头和基础缓存策略
- `wrangler.toml`：声明 Pages 输出目录和 Functions 兼容日期

构建命令：

```bash
pnpm run build
```

输出目录：

```text
build
```

建议环境变量：

```text
NODE_VERSION=26
PNPM_VERSION=12
VITE_API_BASE=/api-v1/api.php
REACT_APP_API_BASE=/api-v1/api.php
```

### Docker

```bash
docker build \
  --build-arg VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN" \
  --build-arg VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID" \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET" \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  --build-arg VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID" \
  --build-arg VITE_FIREBASE_MEASUREMENT_ID="$VITE_FIREBASE_MEASUREMENT_ID" \
  -t otonei .
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
docs/           设计规范、指南与参考文档
```

## 文档

| 文档                                                                   | 内容                                                  |
| :--------------------------------------------------------------------- | :---------------------------------------------------- |
| [`docs/guides/UI_DESIGN_SPEC.md`](docs/guides/UI_DESIGN_SPEC.md)       | **UI 设计规范（权威）**：令牌语义、组件形态、禁止事项 |
| [`docs/guides/UI_STYLE_SYSTEM.md`](docs/guides/UI_STYLE_SYSTEM.md)     | UI 原语与交互尺寸的实现细节                           |
| [`docs/guides/ZINDEX_AUDIT.md`](docs/guides/ZINDEX_AUDIT.md)           | z-index 层级清单与硬编码清理状态                      |
| [`docs/guides/CLOUDFLARE_DEPLOY.md`](docs/guides/CLOUDFLARE_DEPLOY.md) | Cloudflare Pages 部署                                 |
| [`docs/guides/FIREBASE_SETUP.md`](docs/guides/FIREBASE_SETUP.md)       | Firebase 配置                                         |
| [`docs/reference/GD_STUDIO_API.md`](docs/reference/GD_STUDIO_API.md)   | 上游音乐 API 参考                                     |

改动界面代码前先读 `UI_DESIGN_SPEC.md`。`docs/archive/` 下为历史文档，不作开发依据。

## 质量检查

CI 会执行：

- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test:coverage`
- `pnpm run build`
- `pnpm run test:e2e`（Chromium，固定 API fixture，屏蔽 Service Worker）
- `pnpm run test:e2e:pwa`（生产构建，独立 Chromium 离线验证）
- `pnpm audit --prod`

Oxlint/Oxfmt 现在是正式质量门禁；ESLint/Prettier 配置和依赖已移除。
`format:check` 遵循 Oxfmt 和 `.gitignore` 规则，自动跳过依赖、构建产物和覆盖率目录。

## 许可证

OTONEI 自有代码使用 MIT 许可证。

### 第三方资源与服务

- 字体：界面内置使用 MiSans，字体版权归小米科技有限责任公司及相关权利人所有，使用受 [MiSans 字体知识产权许可协议](https://hyperos.mi.com/font-download/MiSans%E5%AD%97%E4%BD%93%E7%9F%A5%E8%AF%86%E4%BA%A7%E6%9D%83%E8%AE%B8%E5%8F%AF%E5%8D%8F%E8%AE%AE.pdf) 约束。
- 音乐数据：搜索、音频地址、封面和歌词由 [GD 音乐台](https://music.gdstudio.xyz/) API 提供。该服务及音乐内容不属于 OTONEI 的 MIT 许可范围，仅应在对方条款和音乐版权允许的范围内使用。请支持正版音乐。
- 浏览器内的请求计数只用于正常客户端节流；Pages Function 另外提供每实例、按 Cloudflare 客户端 IP 的软限流（60 秒 60 次），不等于持久化的全局配额。公开部署仍应在 Cloudflare WAF / Rate Limiting 中另行为 `/api-v1*` 配置持久限频。

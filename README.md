# 🎵 OTONEI 现代化音乐流媒体平台

一款基于 React 19 + Vite 开发的现代化在线音乐搜索与播放应用，支持多平台聚合搜索、无损音质下载及云端数据同步。

## ✨ 核心特性

- 🎯 **全平台聚合搜索** - 支持网易云、QQ音乐、Spotify、YouTube Music 等 10+ 音乐平台
- 🎧 **无损音质体验** - 支持最高 999k FLAC 无损音质在线播放及直接下载
- ☁️ **云端数据同步** - 基于 Firebase 实现多设备间的收藏夹和播放历史无感同步

- 📱 **PWA 支持** - 可作为本地应用安装，支持离线访问核心功能，具备自动更新检查与通知机制
- 🎨 **现代化 UI** - 沉浸式播放器、双语歌词（支持滚动与预览）、响应式设计



## 🏗️ 技术架构

OTONEI 采用现代化的前端技术栈构建：

- **前端框架**: React 19 + Vite 7
- **UI 组件库**: React Bootstrap + React Icons
- **状态管理**: React Context API + 自定义 Hooks
- **离线支持**: Service Worker (Workbox)
- **数据存储**: Localforage (IndexedDB) + Firebase
- **音频处理**: Native HTML5 Audio API
- **构建工具**: Vite + Cloudflare Pages Functions

## 🚀 部署指南

### 方式一：Cloudflare Pages (推荐)

利用 Cloudflare 强大的边缘网络解决 API 跨域与限流问题。

1. **Fork 本仓库**：[![Fork](https://img.shields.io/github/forks/voici5986/SonicFlow?style=social)](https://github.com/voici5986/SonicFlow/fork)
2. **部署到 Cloudflare Pages**：[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-orange?logo=cloudflare)](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages)
3. **配置构建设置**：
   - 构建命令: `npm run build`
   - 构建输出目录: `build`
   - 根目录: `/`
4. **环境变量配置**：在 Cloudflare Pages 设置中添加所需的环境变量

> 💡 **提示**: 详细部署步骤请参考 [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md)

### 方式二：Docker 部署

```bash
# 使用官方镜像
docker run -d -p 80:80 --name sonicflow --restart always ghcr.io/voici5986/sonicflow:latest

# 或从源码构建
docker build -t sonicflow .
docker run -d -p 80:80 --name sonicflow --restart always sonicflow
```

### 方式三：传统服务器部署

1. 构建生产版本：`npm run build`
2. 将 `build` 目录部署到你的 Web 服务器（Nginx、Apache 等）
3. 配置服务器重写规则（参考 [conf/nginx.conf](conf/nginx.conf)）

## 🛠️ 本地开发

### 环境要求

- Node.js 20.0.0+ (推荐使用 24.13.0)
- npm 或 yarn 包管理器
- 现代浏览器支持 (Chrome 90+, Firefox 88+, Safari 14+)

### 开发步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/voici5986/SonicFlow.git
   cd SonicFlow
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env.local
   # 编辑 .env.local 文件，根据需要配置 API 和 Firebase
   ```

4. **启动开发服务器**
   ```bash
   npm start
   ```
   访问 [http://localhost:3000](http://localhost:3000) 即可开始开发。

### 生产构建

```
# 预览生产构建
npm run serve
```

1. 构建生产版本：`npm run build`
2. 将 `dist` 目录部署到你的 Web 服务器（Nginx、Apache 等）
3. 配置服务器重写规则（参考 [conf/nginx.conf](conf/nginx.conf)）

## ⚙️ 环境变量配置

无论是本地开发还是生产环境部署，你都可以通过环境变量配置 API。请参考 [.env.example](.env.example) 进行配置：

| 变量名 | 描述 | 默认值/示例 | 是否必需 |
| :--- | :--- | :--- | :--- |
| `REACT_APP_API_BASE` | 后端 API 地址 | `/api-v1` (开发环境代理至生产 API) | ✅ 必需 |

| `FIREBASE_API_KEY` | Firebase API Key | 参见 [FIREBASE_SETUP.md](FIREBASE_SETUP.md) | ❌ 可选 |
| `FIREBASE_AUTH_DOMAIN` | Firebase 认证域名 | your-project.firebaseapp.com | ❌ 可选 |
| `FIREBASE_PROJECT_ID` | Firebase 项目 ID | your-project-id | ❌ 可选 |
| `FIREBASE_STORAGE_BUCKET` | Firebase 存储桶 | your-project.appspot.com | ❌ 可选 |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase 消息发送者 ID | 123456789 | ❌ 可选 |
| `FIREBASE_APP_ID` | Firebase 应用 ID | 1:123456789:web:abcdef | ❌ 可选 |

> 🔧 **配置说明**: 
> - 必需配置 `REACT_APP_API_BASE` 以确保应用正常运行
> - 如需使用云端同步功能，请配置所有 Firebase 相关变量
> 

## 📦 技术栈

| 类别 | 技术选型 |
| :--- | :--- |
| **前端框架** | React 19, Vite 7, React Router |
| **UI 组件库** | React Bootstrap, React Icons, React Toastify |
| **状态管理** | React Context API, 自定义 Hooks |
| **数据存储** | Localforage (IndexedDB), Firebase Realtime Database |
| **音频处理** | Native HTML5 Audio API, React Player |
| **构建工具** | Vite, Cloudflare Pages Functions |
| **部署平台** | Cloudflare Pages, Docker, Nginx |
| **开发工具** | ESLint, Prettier, GitHub Actions |

## 📁 项目结构

```text
SonicFlow/
├── src/                    # 源代码目录
│   ├── components/         # UI 组件 (播放器、导航、按钮等)
│   ├── contexts/           # 全局状态管理 (认证、播放器、同步等)
│   ├── pages/              # 页面组件 (收藏、历史、用户页面)
│   ├── services/           # 服务层 (API、Firebase、音频管理)
│   ├── hooks/              # 自定义 React Hooks
│   ├── utils/              # 工具函数 (Logger、Service Worker 注册、设备检测等)
│   ├── styles/             # CSS 样式文件
│   ├── constants/          # 常量定义
│   └── App.js              # 主应用组件
├── functions/              # Cloudflare Pages Functions (API 代理)
│   └── api-v1/             # API 路由处理
├── public/                 # 静态资源
│   ├── manifest.json       # PWA 配置
│   └── offline.html        # 离线页面
├── conf/                   # 服务器配置
│   └── nginx.conf          # Nginx 配置模板
├── .github/                # GitHub 配置
│   └── workflows/          # CI/CD 工作流
└── docs/                   # 文档文件
    ├── CLOUDFLARE_DEPLOY.md # Cloudflare 部署指南
    └── FIREBASE_SETUP.md    # Firebase 配置指南
```

## 🤝 贡献指南

我们欢迎任何形式的贡献！请参考以下步骤：

1. **Fork 项目**并克隆到本地
2. 创建特性分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'feat: 添加新功能'`
4. 推送到分支：`git push origin feature/AmazingFeature`
5. 提交 Pull Request

### 提交信息规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 鸣谢

- 本项目基于 [cl-music](https://github.com/lovebai/cl-music) 重构
- 感谢 [GD-Studio](https://music-api.gdstudio.xyz/api.php) 提供音乐 API
- 感谢所有贡献者和用户的支持

## 📞 支持与反馈

如果你遇到任何问题或有建议，请：

1. 查看 [Issues](https://github.com/voici5986/SonicFlow/issues) 是否已有相关讨论
2. 提交新的 Issue 并详细描述问题
3. 或通过 GitHub Discussions 进行讨论

---

⭐ 如果这个项目对你有帮助，请给它一个 Star！你的支持是我们持续改进的动力。
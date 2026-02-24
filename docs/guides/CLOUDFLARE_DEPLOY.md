# 部署到 Cloudflare Pages 指南

既然你已经将代码上传到了 GitHub，接下来部署到 Cloudflare Pages 非常简单。这一步是免费的，且通常只需要几分钟。

## 1. 准备工作

- 确保你的 GitHub 仓库中包含最新的代码（特别是 `functions/api-v1` 目录，这是我们解决 API 跨域和 403 问题的关键）。
- 拥有一个 Cloudflare 账号。

## 2. 开始部署

1.  登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  在左侧菜单点击 **"Workers & Pages"**。
3.  点击页面右上角的蓝色按钮 **"Create application"** (创建应用)。
4.  切换到 **"Pages"** 标签页。
5.  点击 **"Connect to Git"** (连接到 Git)。
6.  选择 **GitHub**，如果你是第一次使用，可能需要授权 Cloudflare 访问你的 GitHub 仓库。
    7.17. 在列表中选择你上传好的 **OTONEI** (或你的仓库名) 项目，点击 **"Begin setup"** (开始设置)。

## 3. 配置构建设置 (关键步骤)

在 "Set up builds and deployments" 页面，请按照以下参数填写：

- **Project name**: 随便起，比如 `otonei-music`。
- **Production branch**: 通常是 `main` 或 `master`。
- **Framework preset** (框架预设): 选择 **"Create React App"** (或者手动配置下面的选项)。
- **Build command** (构建命令): `npm run build`
- **Build output directory** (构建输出目录): `build`
- **Deploy command** (部署命令): **留空 (不要填!)**
- **Non-production...** (非生产...): **留空 (不要填!)**

### 环境变量设置 (非常重要)

点击 **"Environment variables (advanced)"** 展开设置：

1.  添加 `NODE_VERSION`:
    - **Variable name**: `NODE_VERSION`
    - **Value**: `24.13.0`
    - _(这确保 Cloudflare 使用我们指定的最新 Node 版本构建)_

2.  (可选) 添加 `REACT_APP_IPINFO_TOKEN`:
    - **Variable name**: `REACT_APP_IPINFO_TOKEN`
    - **Value**: _粘贴你的 Token_
    - _(如果不填，系统会默认使用“完整模式”，搜索功能依然可用)_

## 4. 完成部署

1.  点击 **"Save and Deploy"**。
2.  Cloudflare 会开始克隆代码、安装依赖、构建项目。
3.  等待几分钟，当看到 **"Success!"** 提示时，点击页面顶部的 URL (例如 `https://sonicflow-music.pages.dev`)。

## 5. 验证

打开网站后：

- 尝试搜索一首歌，检查是否能正常出结果（验证 API 代理是否生效）。
- 如果能正常播放和显示歌词，恭喜你，部署成功！

---

### 常见问题

- **如果构建失败**：请检查日志，确认 `NODE_VERSION` 是否正确设置为 `24.13.0`。
- **如果搜索报错**：请按 F12 打开控制台，看 Network 面板中 `/api-v1` 开头的请求是否返回 200。如果是 404，说明 `functions` 目录没上传成功；如果是 403，请联系我进一步排查。

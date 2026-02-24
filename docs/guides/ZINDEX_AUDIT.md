# OTONEI Z-Index 层级审计文档 (Z-Index Audit)

本文档记录了项目中 `z-index` 的层级关系及其对应的 CSS 变量。目前所有魔法数字已成功替换为变量系统。

## 1. 层级变量定义 (theme.css)

| 变量名                      | 数值    | 涉及组件 / 场景                      | 描述                   |
| :-------------------------- | :------ | :----------------------------------- | :--------------------- |
| `--z-index-negative`        | `-1`    | `.tab-bar-container::after`          | 底部装饰、背景伪元素   |
| `--z-index-base`            | `1`     | `.tab-item.active`, 桌面信息流       | 基础层、激活态标识     |
| `--z-index-above`           | `10`    | `.album-cover`, 歌词行               | 基础交互元素           |
| `--z-index-interaction`     | `100`   | 播放按钮, 进度条手柄                 | 确保交互反馈在最上层   |
| `--z-index-player-base`     | `1000`  | `.audio-player` (Base)               | 播放器基础容器         |
| `--z-index-navbar`          | `1020`  | `.desktop-navbar`                    | 桌面端顶部导航栏       |
| `--z-index-bootstrap-fixed` | `1030`  | `.navbar-fixed-top`, `.fixed-bottom` | Bootstrap 标准固定层   |
| `--z-index-backdrop`        | `1040`  | `.modal-backdrop`                    | 弹窗背景遮罩           |
| `--z-index-mobile-nav`      | `1050`  | `.mobile-tab-bar`                    | 移动端底部导航栏       |
| `--z-index-toast`           | `1070`  | `ToastContainer` (PWA)               | 系统级通知、安装提示   |
| `--z-index-player-backdrop` | `9000`  | `.player-backdrop`                   | 全屏模糊背景           |
| `--z-index-player-expanded` | `9500`  | `.player-expanded-view`              | 移动端全屏播放器视图   |
| `--z-index-overlay`         | `9999`  | `OrientationPrompt`, `Debugger`      | 屏幕旋转提示、调试工具 |
| `--z-index-player-force`    | `10000` | `.audio-player.expanded`             | 展开态容器 (强制覆盖)  |
| `--z-index-notification`    | `11000` | `.global-notification`, 旋转锁       | 全局最高优先级通知     |

### 移动端全屏专有层级 (20000 系列)

用于确保在全屏播放模式下，内部组件不受外部框架影响。

| 变量名                              | 数值    | 涉及组件                   | 描述                    |
| :---------------------------------- | :------ | :------------------------- | :---------------------- |
| `--z-index-mobile-expanded-base`    | `20000` | `.player-inner` (Expanded) | 展开后的核心容器基准    |
| `--z-index-mobile-expanded-content` | `20001` | 控制面板容器               | 确保控制按钮在内容之上  |
| `--z-index-mobile-expanded-info`    | `20003` | 歌曲详情信息               | 歌曲名、艺术家名        |
| `--z-index-mobile-expanded-top`     | `20005` | `FaChevronDown`            | 顶层收起按钮 (绝对顶点) |

---

## 2. 实施状态

- [x] **定义变量**：已在 `src/styles/theme.css` 中定义全套变量。
- [x] **JS 替换**：`MobileMiniPlayer.js`, `InstallPWA.js`, `OrientationPrompt.js`, `DeviceDebugger.js` 中的内联样式已改为 `var()` 引用。
- [x] **CSS 替换**：`AudioPlayer.mobile.css`, `AudioPlayer.desktop.css`, `index.css`, `App.css`, `AudioPlayer.animations.css` 已全部完成变量替换。
- [x] **例外保留**：`index.html` 中的首屏 Loading (9999) 保持硬编码，以确保在 CSS 变量加载前生效。

## 3. 维护规范

1.  **禁止硬编码**：新开发的组件禁止使用 `zIndex: 123`，必须从 `theme.css` 中选择合适的变量。
2.  **新增层级**：如需新增层级，请先更新 `theme.css` 和本文档。
3.  **语义化优先**：选择变量时优先考虑其语义（如 `toast`, `navbar`），而非仅仅看数值大小。

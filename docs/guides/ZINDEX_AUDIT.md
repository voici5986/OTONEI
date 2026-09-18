# OTONEI Z-Index 层级审计文档 (Z-Index Audit)

本文档记录了项目中 `z-index` 的层级关系及其对应的 CSS 变量。核心层级已集中到变量系统，但当前仍存在少量历史兼容值和内联弹窗层级，不能将其视为“所有魔法数字已替换”。

> 最近复核：2026-09-18。本文档中的选择器按当前实现校正；底部导航负层级和动效仍是独立的 UI 议题。图标控件的触控尺寸已统一到 `src/styles/primitives.css`，但这不代表层级风险已经消除。

触控尺寸与按钮原语的维护规则见 [UI 样式系统](./UI_STYLE_SYSTEM.md)。

## 1. 层级变量定义 (theme.css)

| 变量名                      | 数值    | 涉及组件 / 场景                       | 描述                   |
| :-------------------------- | :------ | :------------------------------------ | :--------------------- |
| `--z-index-negative`        | `-1`    | `.mobile-tab-item::after`             | 底部装饰、背景伪元素   |
| `--z-index-base`            | `1`     | `.mobile-tab-item.active`, 桌面信息流 | 基础层、激活态标识     |
| `--z-index-above`           | `10`    | `.album-cover`, 歌词行                | 基础交互元素           |
| `--z-index-interaction`     | `100`   | 播放按钮, 进度条手柄                  | 确保交互反馈在最上层   |
| `--z-index-player-base`     | `1000`  | `.audio-player` (Base)                | 播放器基础容器         |
| `--z-index-navbar`          | `1020`  | `.desktop-navbar`                     | 桌面端顶部导航栏       |
| `--z-index-bootstrap-fixed` | `1030`  | `.navbar-fixed-top`, `.fixed-bottom`  | Bootstrap 标准固定层   |
| `--z-index-backdrop`        | `1040`  | `.modal-backdrop`                     | 弹窗背景遮罩           |
| `--z-index-mobile-nav`      | `1050`  | `.mobile-tab-bar`                     | 移动端底部导航栏       |
| `--z-index-toast`           | `1070`  | `ToastContainer` (PWA)                | 系统级通知、安装提示   |
| `--z-index-player-backdrop` | `9000`  | `.player-backdrop`                    | 全屏模糊背景           |
| `--z-index-player-expanded` | `9500`  | `.player-expanded-view`               | 移动端全屏播放器视图   |
| `--z-index-overlay`         | `9999`  | `OrientationPrompt`, `Debugger`       | 屏幕旋转提示、调试工具 |
| `--z-index-player-force`    | `10000` | `.audio-player.expanded`              | 展开态容器 (强制覆盖)  |
| `--z-index-notification`    | `11000` | `.global-notification`, 旋转锁        | 全局最高优先级通知     |

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
- [x] **主要 JS/CSS 层级**：播放器、导航、通知、PWA 提示和调试工具已使用语义化变量。
- [ ] **清理剩余硬编码**：当前仍有 `Header.desktop.css`/`Header.mobile.css` 的 `1000/1100`、`ClearDataButton.jsx` 的 `10000/10001`、`UserProfile.jsx` 的 `2000`、`index.html` 首屏 Loading 的 `9999`，以及少量 CSS 历史兼容值。
- [x] **首屏例外说明**：`index.html` 中的首屏 Loading 保留硬编码，以确保 CSS 变量加载前生效。

## 3. 维护规范

1.  **禁止新增硬编码**：新开发的组件禁止使用新的 `zIndex: 123`，必须从 `theme.css` 中选择合适的变量。
2.  **新增层级**：如需新增层级，请先更新 `theme.css` 和本文档。
3.  **语义化优先**：选择变量时优先考虑其语义（如 `toast`, `navbar`），而非仅仅看数值大小。

## 4. 当前复核边界

- 当前实现仍保留 Header、弹窗、用户中心和首屏 Loading 的少量硬编码层级；这些值仍由上方“清理剩余硬编码”清单跟踪。
- `.mobile-tab-item::after` 仍使用 `--z-index-negative`。它是已知的底部激活态层级风险，不能因为选择器已更新就视为风险已消除。
- 本文档只描述层级事实，不替代键盘可访问性、响应式断点或动效偏好审查。

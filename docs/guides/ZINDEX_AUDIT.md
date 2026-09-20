# OTONEI Z-Index 层级审计

最近复核：2026-09-19。

组件层的 `z-index` 已全部改为 `theme.css` 中的语义令牌。唯一保留的硬编码是 `index.html` 首屏 Loading 的 `9999`：它执行在 CSS 变量加载之前，属于启动阶段例外。

## 1. 令牌表

| 变量名                      |    数值 | 主要引用                       | 用途               |
| :-------------------------- | ------: | :----------------------------- | :----------------- |
| `--z-index-negative`        |    `-1` | `Navigation.mobile.css`        | 底部导航装饰伪元素 |
| `--z-index-base`            |     `1` | 移动导航、播放器、账号输入图标 | 基础叠层           |
| `--z-index-above`           |    `10` | 播放器控件、进度条、迷你播放器 | 基础交互元素       |
| `--z-index-interaction`     |   `100` | 播放器关闭歌词按钮             | 组件内交互反馈     |
| `--z-index-sidebar`         |   `100` | `App.css` 侧边栏               | 桌面侧边栏         |
| `--z-index-player-base`     |  `1000` | 播放器基础容器                 | 播放器收起态       |
| `--z-index-navbar`          |  `1020` | 桌面导航、两套 Header          | 顶部导航           |
| `--z-index-fixed-bottom`    |  `1030` | `index.css` `.fixed-bottom`    | 固定底部元素兼容层 |
| `--z-index-suggestions`     |  `1100` | 桌面 / 移动搜索联想框          | 搜索浮层           |
| `--z-index-mobile-nav`      |  `1050` | 移动底部导航                   | 移动导航           |
| `--z-index-player-backdrop` |  `9000` | 播放器背景                     | 全屏播放遮罩       |
| `--z-index-player-expanded` |  `9500` | 播放器展开视图                 | 展开态容器         |
| `--z-index-overlay`         |  `9999` | 旋转提示、开发调试层           | 通用覆盖层         |
| `--z-index-player-force`    | `10000` | 展开播放器强制层               | 播放器最高层       |
| `--z-index-modal`           | `10010` | 模态遮罩                       | 高于播放器的模态层 |
| `--z-index-modal-content`   | `10011` | 模态内容                       | 遮罩上方一层       |
| `--z-index-notification`    | `11000` | 更新通知、安装提示             | 全局通知           |

移动端全屏播放器使用 `20000` 系列令牌：`--z-index-mobile-expanded-base`、`--z-index-mobile-expanded-content`、`--z-index-mobile-expanded-info`、`--z-index-mobile-expanded-top`。它们只负责展开播放器内部的固定层级。

## 2. 清理结果

- [x] 播放器、导航、通知、PWA 提示和调试工具使用语义令牌。
- [x] 模态遮罩与两个调用方的内联覆盖统一到 `--z-index-modal` / `--z-index-modal-content`。
- [x] Header 顶栏使用 `--z-index-navbar`；桌面与移动搜索联想框使用 `--z-index-suggestions`。
- [x] 侧边栏使用 `--z-index-sidebar`，播放器关闭按钮使用 `--z-index-interaction`，账号输入图标使用 `--z-index-base`。
- [x] `src/` 下硬编码层级为 0 处；`index.html` 首屏 Loading 的 1 处例外已记录。

## 3. 维护规则

1. 新组件禁止直接写 `z-index: <number>` 或 JSX 内联数字；先在 `theme.css` 增加语义令牌，再在本文登记。
2. 选择令牌按语义和叠层关系，不只看数字大小。
3. 如果需要 `99999` 才能覆盖另一个元素，应先检查父级 stacking context，而不是继续抬高数值。
4. `.mobile-tab-item::after` 的负层级仍是设计选择：它是激活态背景装饰，不承担内容交互。

## 4. 复核口径

统计 `src/` 下全部 CSS、JSX、TSX 的 CSS 声明和 JSX 内联 `zIndex`；使用 `var(--z-index-*)` 的声明不计入。`index.html` 首屏内联样式单独作为启动阶段例外。

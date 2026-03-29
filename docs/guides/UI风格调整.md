# Notion 风格 UI 迁移实施计划 (方案 A)

本计划旨在根据《补充UI设计规范》，将现有项目样式重构为极简的 Notion 视觉风格。核心操作是「减法」：移除所有冗余的边框、渐变、阴影和非必要的缩放动画。

| 用途               | font-weight             |
| ------------------ | ----------------------- |
| 正文 / placeholder | 400                     |
| 次级按钮 / 标签    | 500                     |
| **主按钮（CTA）**  | **600**                 |
| 页面标题           | 600 / 700（取决于字号） |

Primary Button（继续）
属性 数值
height 40px
width 100%
max-width 320px
font-size 14px
font-weight 600
border-radius 8px
background Notion Blue
letter-spacing 0（没加 tracking）

## 核心原则

- **克制**：靠背景色差而非线条分区。
- **安静**：移除所有强烈的阴影和渐变，Hover 仅产生微小的亮度变化。
- **平整**：采用方案 A（平整高亮单色）处理业务状态色块。

## 分步实施步骤

### 第一步：全局变量与基础规范 (theme.css & index.css)

1.  **颜色 Token 归正**：
    - 在 `theme.css` 中确保 `--color-background` 为 `#FFFFFF`，`--color-background-alt` 为 `#F7F7F5`。
    - 弃用 `--gradient-primary` 变量，确保主背景纯净。
2.  **剥离全局动效与投影**：
    - 修改 `index.css`，移除 `.btn` 上的 `box-shadow` 和 `transform: scale(1.03)`（缩放效果）。
    - 移除 `.btn-primary` 的渐变背景，直接改为单色 `#2F3437` 或 `#1F1F1F`。
    - 停用 `ripple` (波纹) 动画。

### 第二步：业务状态色块重构 (UserProfile.css)

1.  **单色化处理 (方案 A)**：
    - 将「应用模式」图标背景（绿、黄、红、灰）从 `linear-gradient(45deg, ...)` 改为对应的 **平整单色** 背景。
    - 将「同步状态」背景从渐变改为单色。
2.  **减法操作**：
    - 移除 `.profile-card`、`.stats-card` 等卡片的所有 `box-shadow`。
    - 移除 Hover 时的 `translateY(-5px)` 悬浮效果。

### 第三步：列表与输入框精修

1.  **去边框化**：
    - 检查并移除 `.form-control` 及其它输入组件的默认灰色边框，改为背景色填充（Notion 风格输入框）。
    - 移除搜索列表项之间的分割线。
2.  **Hover 统一**：
    - 确保所有列表项 Hover 时的背景色统一为 `#EFEFEE`。

---

## 验证计划

- **视觉对比**：使用「自检清单」核对：关掉 Hover 后，页面是否几乎全白？截图后是否看不到明显的线条？
- **一致性检查**：确保所有按钮和状态标签的交互逻辑（仅限亮度变化，无缩放，无投影）保持一致。

# Music Start 桌面端 UI 重构详细方案 (Notion Style)

## 1. 核心设计理念

本重构方案旨在将移动端的 **Notion 极简美学** 迁移至桌面端，同时充分利用大屏优势提升操作效率。

- **视觉风格**：极简、中性、高对比度。
- **布局逻辑**：从传统的“居中容器”转向“两栏式现代架构”。
- **色彩策略**：黑、白、灰为主，辅以唯一的点缀色 `#D15C5C`。

---

## 2. 视觉规范 (Visual Specs)

### 2.1 调色盘

严格执行 [theme.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/theme.css) 定义：

- **主背景**：`--color-background` (`#FAFAF9`)
- **侧边栏/辅助背景**：`--color-background-alt` (`#F7F6F4`)
- **边框**：`--color-border` (`#E9E9E9`)，厚度统一为 `1px`。
- **主文字**：`--color-text-primary` (`#1F1F1F`)
- **点缀色**：`--color-accent` (`#D15C5C`)，仅用于“喜欢”和播放状态。

### 2.2 间距与圆角

- **卡片圆角**：`12px`
- **小组件圆角**：`6px`
- **页面内边距**：`32px` 或 `48px`（增加呼吸感）。

---

## 3. 结构重构 (Structural Redesign)

### 3.1 两栏式架构

取消目前的顶部导航，改为：

- **左侧 Sidebar (240px)**：
  - 固定定位。
  - 包含：Logo、发现（Home）、收藏、历史、用户设置。
  - 背景色：`--color-background-alt`。
- **右侧 Main View**：
  - 滚动内容区。
  - 背景色：`--color-background`。

### 3.2 播放器交互升级

- **收起模式 (Mini Player)**：
  - 悬浮在底部，宽度 100%，毛玻璃效果 (`backdrop-filter: blur(20px)`)。
  - 左侧展示封面图、歌曲信息；中间控制进度；右侧音量及“展开”入口。
- **展开模式 (Full-screen Overlay)**：
  - 参考移动端 [MobileExpandedView.js](file:///c:/Users/voici/Desktop/music%20start/src/components/MobileExpandedView.js)。
  - 采用 Overlay 形式全屏覆盖，左侧为大封面图（带呼吸动画），右侧为滚动歌词。

---

## 4. 业务逻辑对齐 (Business Logic)

### 4.1 搜索体验 (Search-First)

由于 [musicApiService.js](file:///c:/Users/voici/Desktop/music%20start/src/services/musicApiService.js) 目前不提供推荐接口，首页设计如下：

- **Hero 搜索态**：首页正中展示一个极简搜索框，背景保持纯净。
- **结果展示**：搜索后，结果以网格 (Grid) 形式在 Main View 中展现，支持响应式列数调整。

### 4.2 卡片交互

- **Music Card**：
  - 默认无阴影，仅有极细边框。
  - Hover 时：封面图向上微移 `4px`，出现轻微的灰色投影，显示快速播放按钮。

---

## 5. 分阶段执行步骤 (Phased Implementation)

### 阶段 1：全局布局与基础设施 (Foundation)

**目标**：搭建两栏骨架，确保桌面端与移动端逻辑隔离。

- **CSS 变量更新**：在 [theme.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/theme.css) 中添加桌面端变量（如 `--sidebar-width: 240px`）。
- **App.js 结构调整**：在 `desktop` 模式下，将页面包裹在 `layout-container` 中，实现侧边栏与内容区的分栏布局。
- **路由适配**：确保内容区能根据路由正确渲染 `Home`、`Favorites` 等页面，而侧边栏保持不动。

### 阶段 2：侧边栏与导航系统 (Sidebar & Navigation)

**目标**：完成 Notion 风格的左侧导航。

- **Sidebar 组件实现**：重构 [DesktopNavbar.js](file:///c:/Users/voici/Desktop/music%20start/src/components/DesktopNavbar.js)，将其从顶部栏改为固定左侧的垂直导航。
- **视觉打磨**：应用 `#F7F6F4` 背景、扁平化图标（如 `react-icons` 或 SVG），并实现极简的 `active` 状态效果。
- **集成用户中心**：将登录/用户信息集成到侧边栏底部。

### 阶段 3：首页搜索与结果网格 (Search & Grid)

**目标**：实现“搜索即首页”的逻辑，优化展示效率。

- **Hero 视图开发**：在 [Home.js](file:///c:/Users/voici/Desktop/music%20start/src/pages/Home.js) 中，当 `query` 为空时展示居中的大搜索框。
- **响应式网格**：利用 CSS Grid 实现搜索结果的动态列数排列（4-6 列），替代目前的双列布局。
- **卡片样式更新**：同步移动端的 Notion 风格到 [SearchResultItem.js](file:///c:/Users/voici/Desktop/music%20start/src/components/SearchResultItem.js)，移除多余彩色。

### 阶段 4：桌面端播放器系统 (Player System)

**目标**：实现精致的底部播放栏与沉浸式展开页。

- **Mini Player 优化**：在 [AudioPlayer.desktop.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/AudioPlayer.desktop.css) 中实现毛玻璃效果和精致的进度条样式。
- **桌面端 Overlay 模式**：为桌面端适配全屏播放视图，支持大封面展示与歌词滚动。
- **交互联动**：确保点击封面或控制按钮时，播放器能在收起/展开状态间平滑切换。

### 阶段 5：细节优化与清理 (Polish & Cleanup)

**目标**：确保视觉一致性与代码质量。

- **微动效集成**：添加卡片 Hover 位移、页面切换淡入等 Notion 风格微动效。
- **兼容性测试**：在不同分辨率下检查侧边栏与内容区的自适应表现。
- **代码清理**：移除旧版桌面端不再使用的冗余样式文件。

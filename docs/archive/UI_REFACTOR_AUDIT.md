# OTONEI UI 样式审计与改进建议 (Notion 化)

根据最新制定的 [OTONEI_UI_SPEC.md](file:///c:/Users/voici/Desktop/music%20start/OTONEI_UI_SPEC.md)，以下是现有代码中需要更新或修改的样式列表。

## 1. 全局变量与核心逻辑 (`theme.css`)

| 现状 (Current)                 | 规范建议 (Proposed)                    | 理由                                                 |
| :----------------------------- | :------------------------------------- | :--------------------------------------------------- |
| `---color-primary: #1F1F1F`    | 保持不变，但限制其在大面积背景的使用。 | 符合 L1 强调逻辑。                                   |
| `---color-background: #FAFAF9` | 保持不变。                             | 标准 Notion 页面背景。                               |
| `---border-radius-lg: 10px`    | 建议统一为 `12px` 用于大卡片。         | 增强容器的现代感和温润感。                           |
| `---shadow-md` 等阴影          | **建议大幅弱化或去掉**。               | Notion 风格倾向于扁平化，仅靠 `1px` 细边框区分层级。 |

---

## 2. 按钮系统 (`App.css`, `UserProfile.css` 等)

### 2.1 主要按钮 (`.btn-primary-custom`)

- **现状**: 纯黑背景，带位移。
- **修改建议**:
  - 初始背景改为 `L2 (#2F3437)`。
  - 去掉任何可能的外阴影。
  - 悬停时背景变为 `L1 (#1F1F1F)`。

### 2.2 轻量按钮 (`.minimal-action-btn`)

- **现状**: 已具备 Notion 雏形。
- **修改建议**:
  - 初始边框色固定为 `L5 (#E9E9E9)`。
  - 悬停背景固定为 `L5 变体 (#F5F4F2)`。
  - 去掉 `box-shadow: none !important` 之外的所有阴影声明。

---

## 3. 搜索与交互组件 (`Header.css`)

### 3.1 搜索输入框 (`.header-search-input-group`)

- **现状**: 圆角 `8px`，聚焦时有阴影。
- **修改建议**:
  - 圆角改为 `6px`（符合规范 5.1）。
  - 聚焦时**去掉 `box-shadow`**，仅加深 `border-color` 至 `L2 (#2F3437)`。
  - 背景色在非聚焦时可更淡一些。

### 3.2 搜索建议面板 (`.header-search-suggestions`)

- **现状**: 圆角 `12px`，有 `shadow-md`。
- **修改建议**:
  - 阴影改为极淡的 `0 4px 12px rgba(0, 0, 0, 0.05)`。
  - 边框使用 `L5 (#E9E9E9)`。

---

## 4. 音乐卡片 (`App.css`)

### 4.1 卡片容器 (`.music-card`)

- **现状**: 圆角 `LG` (10px)，聚焦/悬停有阴影。
- **修改建议**:
  - 圆角提升至 `12px`。
  - 悬停时的 `translateY(-5px)` 建议减弱至 `-2px`，Notion 的交互更偏向静止或极小位移。
  - 悬停阴影应改为更细腻的扩散，而非厚重阴影。

---

## 5. 用户资料与模式切换 (`UserProfile.css`)

### 5.1 模式卡片 (`.app-mode-card`)

- **现状**: 使用了较重的渐变色图标背景。
- **修改建议**:
  - 图标背景建议改用低饱和度的浅色背景（如浅绿、浅橙、浅红），文字颜色加深。
  - 示例：`background: rgba(40, 167, 69, 0.1); color: #28a745;`。这更符合 Notion 的彩色标签 (Select/Multi-select) 审美。

### 5.2 统计卡片 (`.stats-card`)

- **现状**: 有 `shadow-md`。
- **修改建议**:
  - 去掉阴影，仅保留 `1px` 细边框。
  - 悬停时仅改变背景色为 `F5F4F2`。

---

## 6. 改进实施路线图 (Implementation Roadmap)

本路线图将重构分为四个阶段，确保 UI 演进过程中的稳定性。

### **阶段 1：基础设施对齐 (Foundation) - [已完成]**

- **更新 `theme.css` 变量**：将 L1-L5 颜色代码写入 CSS 变量，并微调 `border-radius` 基准值。
- **清理全局阴影**：将 `--shadow-md` 等变量的值大幅降低透明度，或直接设为极简边框样式。

### **阶段 2：交互组件统一 (Core Components) - [已完成]**

- **重构按钮系统**：在 `App.css` 中统一 `.btn-primary-custom` 和 `.minimal-action-btn` 的交互逻辑。
- **输入框标准化**：统一搜索框与表单项的聚焦边框色与圆角。

### **阶段 3：复杂容器重构 (Layout & Cards) - [已完成]**

- **音乐卡片 Notion 化**：移除 `.music-card` 冗余的边框与阴影，实现“透明默认 + 悬停显色”的列表交互。
- **侧边栏重构**：桌面端侧边栏转为垂直布局，移除过渡动画，使用 L1-L5 色值对齐。
- **移动端 Tab 栏优化**：纯图标设计，引入正方形圆角选中背景块与增强型毛玻璃效果。

### **阶段 4：细节打磨与移动端交互增强 (Mobile UX & Polishing) - [部分完成]**

此阶段旨在将 Notion 的“顺滑感”带入移动端，并针对已有的组件进行深度打磨。

#### **4.1 移动端弹出层重构 (Modals & BottomSheets) - [已完成]**

- **BottomSheet 引入**：重构移动端的 `AuthModal` 和 `UserProfile` 中的“导入收藏”Modal。在移动端不再使用居中弹窗，而是改为从底部滑出的面板 (Bottom Sheet)，并带有 `16px` 的顶部圆角。
- **遮罩层 (Backdrop)**：统一全站遮罩层为 `rgba(0, 0, 0, 0.4)`，并增加 `backdrop-filter: blur(4px)`。
- **交互手势优化**：为底部弹出面板增加 `16px` 的顶部圆角（Notion 风格标准）。

#### **4.2 搜索与列表交互精细化 (Interaction Design) - [部分完成]**

- **搜索建议面板动画**：在 `Header.css` 中为 `.header-search-suggestions` 引入 `cubic-bezier(0.4, 0, 0.2, 1)` 的淡入位移效果。 - **[已完成]**
- **列表加载状态**：为搜索结果和收藏列表引入极简的骨架屏（Skeleton）或更优雅的淡入加载效果。 - **[根据反馈跳过]**

#### **4.3 Notion 风格功能卡片 (Feature Cards) - [已完成并深度重构]**

- **去卡片化布局**：参考 [SONICFLOW_UI_SPEC.md](file:///c:/Users/voici/Desktop/music%20start/SONICFLOW_UI_SPEC.md) 规范，将 `UserProfile.js` 原有的网格卡片布局彻底重构为 **Notion 列表风格**。
- **图标重构**：根据最新反馈，**移除图标背景色**，统一采用无背景的极简风格；优化下拉菜单图标对齐，确保主次层级视觉一致。
- **排版对齐**：用户信息头部改为左对齐大标题（32px），去掉了冗余的边框和阴影，仅通过留白和字号区分层级。
- **交互反馈**：统一使用 `var(--color-hover-notion)` (#F5F4F2) 作为悬停反馈，**移除所有位移和滑入动画**（包括数据管理下拉动画），保持 Notion 的静谧、干脆交互感。

#### **4.4 播放器与底部导航 (Player & TabBar) - [待处理]**

- **进度条平滑化**：优化 `ProgressBar.js` 的拖拽感，确保滑块（Thumb）在移动端的触摸响应更加灵敏且动画不掉帧。
- **底部 TabBar 打磨**：微调 `MobileBottomNav` 的背景毛玻璃参数，确保在复杂列表滚动背景下依然保持清晰的视觉隔离。

---

## 5. 总结与建议

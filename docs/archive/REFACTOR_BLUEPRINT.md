# OTONEI 架构重构蓝图 (Refactor Blueprint)

## 0. 核心愿景

通过“逻辑抽象、视图分离”的架构，提升代码的可维护性与扩展性，同时**绝对保证**移动端（PWA）已优化的 UI 体验不发生任何退化。

---

## 1. 重构核心原则

| 原则           | 描述                                                | 实现手段                                                   |
| :------------- | :-------------------------------------------------- | :--------------------------------------------------------- |
| **逻辑共用**   | 核心业务逻辑（播放控制、状态管理、认证）全端统一    | 自定义 Hooks (`useAudioPlayer`, `useAuth` 等)              |
| **视图分离**   | 桌面端与移动端的布局、交互模型完全解耦              | 独立的 View 组件 (`MobilePlayerView`, `DesktopPlayerView`) |
| **移动端优先** | 拆分时若有冲突，优先维持移动端现有的 DOM 结构与 CSS | 物理拷贝移动端 JSX，锁定 CSS 类名                          |
| **原子化共用** | 基础按钮、图标等细粒度组件跨端复用                  | Props 驱动的原子组件 (`HeartButton`, `ProgressBar`)        |

---

## 2. 重点模块拆分方案

### 2.1 AudioPlayer (播放器)

- **状态管理**：抽离至 `useAudioPlayer.js`。
- **移动端视图 (`MobilePlayerView.js`)**：
  - **锁定**：Mini Player 布局、Fullscreen 模式、歌词秒切逻辑。
  - **锁定**：下拉收起手势、毛玻璃背景、安全区适配。
- **桌面端视图 (`DesktopPlayerView.js`)**：
  - 维持底栏横向布局，清理掉原本混合在其中的移动端条件渲染代码。

### 2.2 Navigation (导航系统)

- **配置层 (`config/NavConfig.js`)**：统一菜单项（搜索、收藏、历史）。
- **移动端视图 (`MobileTabBar.js`)**：锁定底部固定 Tab 栏。
- **桌面端视图 (`DesktopNavbar.js`)**：锁定顶部 Navbar。

### 2.3 AlbumCover (封面)

- **半共用**：基础渲染逻辑共用。
- **差异化**：通过 `isMobile` 标识位，在移动端开启“呼吸动画”与“大图模式”，桌面端保持列表缩略图风格。

---

## 3. 实施路线图 (Roadmap)

### 第一阶段：逻辑隔离 (Low Risk)

- [ ] 创建 `src/hooks/useAudioPlayer.js`。
- [ ] 将 `AudioPlayer.js` 中的播放状态、歌词同步、事件处理器迁移至 Hook。
- [ ] **验证**：确保两端基本播放功能无误。

### 第二阶段：移动端视图锁定 (Critical)

- [ ] 创建 `src/components/AudioPlayer/MobilePlayerView.js`。
- [ ] 物理拷贝移动端 JSX，确保 `className` 与 [AudioPlayer.mobile.css] 完美匹配。
- [ ] **验证**：PWA 模式下滚动、手势、动画是否 1:1 还原。

### 第三阶段：桌面端清理 (Optimization)

- [ ] 创建 `src/components/AudioPlayer/DesktopPlayerView.js`。
- [ ] 移除所有 `isMobile` 的条件分支，简化 DOM 结构。

### 第四阶段：样式规范化 (Refinement)

- [x] 统一 [theme.css] 中的变量。
- [x] 移除各组件中冗余的 `@media` 查询，归入各自的 `.mobile.css` 或 `.desktop.css`。

---

## 4. 维护守则

1.  **新增功能**：优先在 Hook 中实现逻辑，再分别在两端 View 中添加 UI。
2.  **样式修改**：移动端的样式改动必须在 PWA 模拟器下通过长屏、短屏测试。
3.  **禁止耦合**：不要在 `MobilePlayerView` 中写针对桌面端的 CSS 补丁。

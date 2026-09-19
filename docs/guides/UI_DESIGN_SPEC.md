# OTONEI UI 设计规范

最近复核：2026-09-19
适用范围：`src/` 下所有界面代码（`.css` / `.jsx` / `.tsx`）

本文是 OTONEI 界面视觉与交互的**权威规范**。冲突时以本文为准。

## 0. 文档定位

### 唯一真源

规范的执行载体是代码，不是本文。三层关系：

| 层     | 文件                        | 职责                                                 |
| :----- | :-------------------------- | :--------------------------------------------------- |
| 令牌层 | `src/styles/theme.css`      | 颜色、排版、间距、圆角、阴影、动效、层级的所有具体值 |
| 原语层 | `src/styles/primitives.css` | 按钮、图标按钮、操作组的共享实现                     |
| 规范层 | 本文                        | 令牌的**语义与使用规则**、组件形态要求、禁止事项     |

本文只定义"什么场景用什么令牌"和"什么不允许做"。**具体数值一律以 `theme.css` 为准**，本文不重复维护数值副本，只标注目标值。改数值改令牌，不改本文。

### 取代关系

`docs/archive/` 下的**全部**文档均为历史记录，不作为开发依据，不要引用、不要在其上追加内容。与界面直接相关的包括：

- `docs/archive/OTONEI_UI_SPEC.md`
- `docs/archive/补充UI设计规范.md`
- `docs/archive/notion_shadcn_ui_设计规范（uno_css_radix）.md`
- `docs/archive/UI风格调整.md`
- `docs/archive/UI_REFACTOR_AUDIT.md`
- `docs/archive/DESKTOP_REDESIGN_PLAN.md`
- `docs/archive/SEARCH_UI_COMPONENTS.md`
- `docs/archive/GLOBAL_SEARCH_LAYOUT_PLAN.md`
- `docs/archive/UnoCSS_Migration_Plan.md`
- `docs/archive/Bootstrap_Refactor_Plan.md`
- `docs/archive/REFACTOR_BLUEPRINT.md`

作废原因：这些文档描述的是未落地的迁移目标或已完成的阶段性方案，与当前实现存在系统性冲突（主色、边框策略、字体、圆角、背景色全部不一致）。继续并存会让"以谁为准"永远没有答案。

### 相关文档

- [`UI_STYLE_SYSTEM.md`](./UI_STYLE_SYSTEM.md) —— 原语与交互尺寸的实现细节
- [`ZINDEX_AUDIT.md`](./ZINDEX_AUDIT.md) —— 层级事实清单与硬编码清理状态

---

## 1. 设计原则

五条原则，都可以拿来判断一个具体写法是否合规。

### 1.1 令牌优先，禁止硬编码

颜色、圆角、字号、间距、时长、层级只能来自 `theme.css`。缺令牌就先补令牌，再在组件里引用。

唯一例外：`theme.css` 中 `:root` 块内的 `--*` 变量定义，以及 `index.html` 首屏 Loading 的内联样式（CSS 变量加载前必须生效）。

组件类已于 2026-09-19 从 `theme.css` 迁至 `src/styles/components.css`。所以这个例外现在是**语义豁免**——令牌定义本身就需要字面量色值，而不是"整文件放行"的历史包袱。

### 1.2 能用间距和背景色解决的层级，不加边框和阴影

优先级：**间距 > 背景色 > 阴影 > 边框**。

边界情况允许 `1px` 实线边框（`--color-border`），但仅限两类：容器边界（卡片、输入框、面板）、结构性分隔。禁止用边框做装饰性强调、替代间距、或在 hover 时改边框色来制造反馈。

### 1.3 命中区与视觉尺寸分离

图标画多大是设计问题，命中区多大是无障碍问题。两者由不同变量控制：

- 视觉尺寸：组件自身的 `size` 属性或 `--control-visual-size`
- 命中区：`--control-hit-size`（40px）/ `--control-hit-size-coarse`（44px）

**禁止通过放大图标来满足触控尺寸。**

### 1.4 桌面与移动是两套布局，不是同一布局的缩放

以 `768px` 为分界。桌面用侧边栏 + 顶部导航，移动用底部 Tab + 收起式播放器。同一组件在两端的结构差异应该体现在组件拆分上（如 `DesktopNavbar` / `MobileBottomNav`），而不是靠一堆 `@media` 打补丁。

### 1.5 动效服务于状态变化，不做装饰

动画必须解释一个状态变化（出现、消失、切换、加载）。无状态关联的循环动画、hover 缩放、位移装饰，一律不加。

---

## 2. 颜色

### 2.1 语义令牌

| 令牌                     | 值        | 用途                         | 禁止                     |
| :----------------------- | :-------- | :--------------------------- | :----------------------- |
| `--color-primary`        | `#2383e2` | 主操作、焦点环、链接、选中态 | 大面积背景填充           |
| `--color-primary-light`  | `#3391ee` | 主色 hover（仅按钮）         | 文字色                   |
| `--color-primary-dark`   | `#1f71c2` | 主色 active / hover 加深     | 文字色                   |
| `--color-on-solid`       | `#ffffff` | 实色表面上的前景色           | 用作背景填充             |
| `--color-background`     | `#ffffff` | 页面与容器底色               | **用作文字色**（见 2.4） |
| `--color-background-alt` | `#f7f7f5` | 次级区域、输入框底、hover 底 | 大面积主背景             |
| `--color-hover-notion`   | `#efefee` | 列表项、卡片 hover           | 静态背景                 |
| `--color-text-primary`   | `#2f3437` | 标题、正文、图标默认色       | —                        |
| `--color-text-secondary` | `#6b6f76` | 描述文字、次级按钮文字       | 长段落正文               |
| `--color-text-tertiary`  | `#91918e` | 图标默认色、弱提示           | 关键信息                 |
| `--color-text-muted`     | `#9b9a97` | placeholder、禁用态          | 可读信息                 |
| `--color-border`         | `#e5e5e5` | 容器边界、结构性分隔         | 装饰性强调               |
| `--color-border-active`  | `#2383e2` | 输入框聚焦边框               | —                        |
| `--color-accent`         | `#d15c5c` | 收藏（红心）、强调动作       | 主操作按钮               |
| `--color-danger`         | `#e74c3c` | 危险操作、错误提示           | 普通强调                 |
| `--color-success`        | `#28a745` | 成功状态                     | —                        |
| `--color-warning`        | `#ffc107` | 警告状态                     | —                        |
| `--color-info`           | `#17a2b8` | 信息提示                     | —                        |

### 2.2 文本色层级

四级，从强到弱，按信息重要性选择：

| 令牌                     | 场景                               |
| :----------------------- | :--------------------------------- |
| `--color-text-primary`   | 页面标题、歌曲名、当前选中项、正文 |
| `--color-text-secondary` | 艺术家名、描述、说明文字           |
| `--color-text-tertiary`  | 图标默认色、时间戳、非关键元信息   |
| `--color-text-muted`     | placeholder、禁用态文字            |

不要跳级使用。需要更弱的层级时，说明这个信息可能不该出现。

### 2.3 状态色的用法

`--color-accent` 与 `--color-danger` 都是红色系，语义不同：

- `--color-accent` —— 表达**偏好**，如已收藏的红心。可以常驻显示。
- `--color-danger` —— 表达**风险**，如删除、清空数据。只在危险操作上出现。

不要用 `--color-danger` 表达"已激活"，也不要用 `--color-accent` 表达"危险"。

### 2.4 反例：背景令牌不是文字色

```css
/* ❌ 错误：--color-background 的语义是底色，不是前景色 */
.ui-button--primary {
  color: var(--color-background);
}

/* ✅ 正确：主按钮文字用明确的前景色令牌 */
.ui-button--primary {
  color: var(--color-on-solid);
}
```

2026-09-19 已修正：`theme.css` 新增 `--color-on-solid: #ffffff`，`.ui-button--primary`（原错误写法）、`.search-submit-btn`、`.btn-primary-custom`、`.btn-primary-auth`、`.toast-info-custom`、`.progress-bar-custom`、`.play-pause-button`、`.btn-primary`、`.btn-outline-primary:hover` 都已改为引用它。

**命名说明**：这个令牌一度叫 `--color-on-primary`，但它实际服务的不只是主色表面（还有 accent / danger / info / 深色底），名字会误导，因此改名为 `--color-on-solid`。**不要再为这些表面各加一个同值的 `on-*` 令牌**——那正是 §5 里 `--border-radius-md` / `-lg` 同值的老问题。

---

## 3. 排版

### 3.1 字体族

```
--font-family-base: 'MiSans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'Roboto', sans-serif
```

MiSans 可变字体（`font-weight: 100 900`），单文件 `public/MiSansVF.woff2`，通过 `theme.css` 的 `@font-face` 加载。

**禁止**在组件里另写 `font-family`。数字对齐场景可申请新增等宽字体令牌，不得直接硬编码字体名。

### 3.2 字号梯度

目标为 7 档。现状实际使用了 25 种不同值（含 px 与 rem 混用），需逐步收敛。

口径：统计 `font-size` 属性的字面量值，含 `theme.css`，共 87 处 —— px 11 种 48 处、rem 14 种 39 处；另有 2 处 `font-size: var(--font-size-sm)`。其中 `0.875rem` 只存在于变量定义中，从未在任何属性里被使用。

| 令牌               | 目标值            | 场景                           |
| :----------------- | :---------------- | :----------------------------- |
| `--font-size-2xs`  | `0.75rem` (12px)  | 时间戳、标签、徽标、辅助说明   |
| `--font-size-sm`   | `0.875rem` (14px) | 正文、列表项、按钮文字（主力） |
| `--font-size-base` | `1rem` (16px)     | 强调正文、卡片标题             |
| `--font-size-md`   | `1.125rem` (18px) | 区块标题、空状态标题           |
| `--font-size-lg`   | `1.25rem` (20px)  | 次级页面标题                   |
| `--font-size-xl`   | `1.5rem` (24px)   | 页面标题                       |
| `--font-size-2xl`  | `2rem` (32px)     | 空状态主标题、播放器大标题     |

补充规则：

- 单位统一用 `rem`。历史遗留的 `px` 字号在改动该处样式时顺手转换。
- 14px 是主力字号，占现有使用量的一半以上。新增文本先考虑 14px。
- 超过 32px 的字号（现状有 40px、48px）仅用于插画级元素，如空状态图标、旋转提示，不属于排版层级。

### 3.3 字重

| 令牌                     | 值    | 场景                                     |
| :----------------------- | :---- | :--------------------------------------- |
| `--font-weight-normal`   | `400` | 正文、placeholder、次级文字              |
| `--font-weight-medium`   | `500` | 列表项标题、次级按钮、标签               |
| `--font-weight-semibold` | `600` | 卡片标题、区块标题（**当前缺失，需补**） |
| `--font-weight-bold`     | `700` | 页面标题、弹窗标题                       |

当前 `theme.css` 只有 400 / 500 / 700 三个令牌，而代码中 600 共出现 19 处且全部硬编码：CSS 16 处（`theme.css` 1 处 + 组件层 15 处），JSX 内联 `fontWeight: '600'` 3 处。补 `--font-weight-semibold: 600` 是优先级最高的令牌缺口之一。

### 3.4 行高

| 值     | 场景                         |
| :----- | :--------------------------- |
| `1.25` | 标题类文本（字号 ≥ 18px）    |
| `1.5`  | 正文、描述                   |
| `1`    | 图标按钮、徽标等单行紧凑元素 |

单行文本用 `--line-height-base: 1.5`；需要垂直居中时优先用 flex 对齐，不要靠 `line-height` 凑高度。

---

## 4. 间距

### 4.1 4px 基准网格

所有间距必须是 4 的倍数。现状存在 12 种网格外值（`-1` / `1` / `2` / `3` / `5` / `6` / `10` / `14` / `15` / `18` / `30` / `54px`），改动相关样式时归正。

口径：统计 `padding` / `margin` / `gap` 及其分支属性中的 px 字面量（含 `calc()` 内），范围 `src/` 下全部 CSS 文件，共 61 处。其中 `10px`（22 次）与 `6px`（11 次）是主要来源；`-1px` 仅出现在 `theme.css` 的列表组边框折叠。

### 4.2 间距令牌

| 令牌                | 值               | 典型场景                                   |
| :------------------ | :--------------- | :----------------------------------------- |
| `--spacing-xs`      | `0.25rem` (4px)  | 图标与文字之间、标签内边距                 |
| `--spacing-sm`      | `0.5rem` (8px)   | 同组元素间距、按钮内边距                   |
| `--spacing-compact` | `0.75rem` (12px) | 列表项内边距（**当前缺失，需补**）         |
| `--spacing-md`      | `1rem` (16px)    | 卡片内边距、区块内元素间距                 |
| `--spacing-lg`      | `1.5rem` (24px)  | 区块之间、页面级分隔                       |
| `--spacing-xl`      | `2rem` (32px)    | 页面大区块分隔                             |
| `--spacing-2xl`     | `3rem` (48px)    | 桌面端内容区左右留白（**当前缺失，需补**） |

12px 和 48px 是当前高频使用但无令牌的两个值（列表项 padding、桌面内容区 padding），补齐后覆盖率可达九成以上。

### 4.3 使用规则

1. 优先用 `gap` 而非子元素的 `margin`。现状大量使用 `margin-bottom` 做纵向间距，改动时应迁移到父容器的 `gap`。
2. 容器内边距（`padding`）和元素间距（`gap`）不要重复计算同一段空白。
3. 禁止用 `!important` 覆盖间距。需要覆盖说明选择器结构有问题。

---

## 5. 圆角

已完成四档圆角重排。组件层不再使用 10px、14px、16px、20px、24px 等视觉档位；`0`、`50%`、`inherit` 只作为结构性例外保留。

| 令牌            | 目标值  | 场景                           |
| :-------------- | :------ | :----------------------------- |
| `--radius-xs`   | `4px`   | 标签、徽标、小色块、歌词高亮   |
| `--radius-sm`   | `8px`   | 控件：按钮、输入框、图标按钮   |
| `--radius-md`   | `12px`  | 容器：卡片、弹窗、面板、空状态 |
| `--radius-full` | `999px` | 胶囊：状态标签、头像           |

收敛说明：

- `theme.css` 现在定义 `--radius-xs` / `--radius-sm` / `--radius-md` / `--radius-full` 四档；旧的 `--border-radius-*` 仅作为兼容别名保留。
- 控件统一 8px，容器统一 12px；按钮、输入框、图标按钮与卡片、弹窗、面板已经分别迁移到对应令牌。
- 嵌套容器不要叠加圆角，内层圆角 = 外层圆角 − 内边距。
- 新组件直接使用 `--radius-*`；已有旧令牌暂不删除，避免外部样式或未迁移页面出现未定义值。

---

## 6. 阴影

### 6.1 默认无阴影

卡片、列表项、平面容器**不使用投影**。这是刻意设计，不是遗漏。（原先用一个 `--card-shadow: none` 令牌表达这条规则，但它零引用、约束不了任何东西，已于 2026-09-19 删除。）

区分层级靠背景色和间距（见原则 1.2）。

### 6.2 允许阴影的场景

| 令牌          | 值                               | 场景                               |
| :------------ | :------------------------------- | :--------------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.04)`  | 弱边界：浮起的条状容器、空状态卡片 |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.04)` | 浮层：下拉菜单、Toast、弹出面板    |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.08)` | 强浮层：模态框、展开态播放器       |

判断标准：元素是否**脱离了文档流**。是，可以加阴影；不是，不加。

### 6.3 禁止

- 卡片 hover 时加阴影
- 卡片 hover 时加 `translateY` 位移
- 用 `filter: drop-shadow` 替代 `box-shadow`
- 自定义阴影值（必须走令牌）

现状 `App.css` 中 `.music-card:hover` 已正确设置为 `box-shadow: none; transform: none`，这是目标状态，新增组件照此办理。

---

## 7. 动效

### 7.1 时长

| 令牌              | 值      | 场景                       |
| :---------------- | :------ | :------------------------- |
| `--duration-fast` | `0.12s` | hover、颜色变化、微反馈    |
| `--duration-base` | `0.2s`  | 状态切换、淡入淡出         |
| `--duration-slow` | `0.3s`  | 进出场、布局变化、页面切换 |

现状使用了 12 种时长，交互反馈收敛到上述 3 档：

- 交互反馈 7 种：0.1 / 0.12 / 0.15 / 0.2 / 0.3 / 0.4 / 0.5s
- 加载与装饰动画 5 种：0.6 / 0.8 / 1.5 / 2 / 4s（spinner、shimmer、呼吸动画）

口径：统计 `transition` / `animation` / `animation-duration` / `animation-delay` 中出现的时间值，范围 `src/` 下全部 CSS 文件，共 94 处，无 ms 单位写法。

超过 0.3s 的交互反馈会让人感觉迟钝。加载类动画（spinner、骨架屏 shimmer）不受此限。

### 7.2 缓动曲线

| 令牌                | 值                             | 场景                 |
| :------------------ | :----------------------------- | :------------------- |
| `--ease-standard`   | `ease-out`                     | 大多数状态变化       |
| `--ease-emphasized` | `cubic-bezier(0.4, 0, 0.2, 1)` | 布局变化、大元素进出 |

现状有 3 条自定义 `ease-*` 曲线（`--ease-in-out` / `--ease-out-back` / `--ease-out-circ`）。保留上述两条，其余在改动相关样式时归并。（原为 5 条，其中 `--ease-in-back` / `--ease-in-circ` 零引用，已于 2026-09-19 删除。）

### 7.3 禁止

- **hover 缩放**：`transform: scale(1.1)` 一类的反馈。现状 `index.css` 的 `.control-button:hover` 就是这个反模式，需清理。
- **装饰性无限动画**：无加载语义的循环动画。
- **布局属性动画**：不要对 `width` / `height` / `top` / `left` 做过渡，用 `transform` 和 `opacity`。

### 7.4 必须响应动效偏好

2026-09-19 已补齐：兜底加在 `index.css` 末尾，使用更高特异性覆盖组件层的 `transition: ... !important`，并覆盖元素与伪元素的动画延时、过渡延时。

```css
@media (prefers-reduced-motion: reduce) {
  html:root *,
  html:root *::before,
  html:root *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
}
```

用 `0.01ms` 而不是 `0`，是为了让 `transitionend` / `animationend` 仍然触发。播放器的展开动画、歌词滚动、呼吸动画同样受此约束。

---

## 8. 层级

完整的 `z-index` 变量表、涉及组件和清理状态见 [`ZINDEX_AUDIT.md`](./ZINDEX_AUDIT.md)。

本节只强调规则：

1. **禁止新增硬编码 `z-index`**。所有层级必须引用 `theme.css` 中的 `--z-index-*` 变量。
2. 新增层级时，先更新 `theme.css` 和 `ZINDEX_AUDIT.md`，再使用。
3. 选择变量看语义（例如 `--z-index-notification`），不看数值大小。
4. 需要 `z-index: 99999` 才能盖住的元素，说明层级结构设计错了，不是数值不够大。

---

## 9. 响应式

### 9.1 断点

目标为 3 个。现状的媒体查询里出现了 7 种断点数值。

口径：统计全部 `@media` 中 `max-width` / `min-width` 的数值（含 `theme.css`），共 23 条媒体查询、25 个数值出现。占比最高的是 `max-width: 768px`（15 次）。

| 范围             | 设备 | 布局                                                     |
| :--------------- | :--- | :------------------------------------------------------- |
| `< 768px`        | 移动 | 底部 Tab 导航 + 收起式播放器，内容区单列                 |
| `768px – 1023px` | 平板 | 沿用移动布局，命中区已放大至 44px                        |
| `>= 1024px`      | 桌面 | 左侧固定侧边栏（240px）+ 顶部导航，内容区居中最大 1400px |

`768px` 与 `1024px` 同时是 `src/utils/deviceDetector` 中的设备判定阈值，CSS 断点必须与之保持一致。

其余值（`480` / `767` / `769` / `991.98` / `992`）属于历史遗留：`767` 与 `769` 是 `768` 的互补写法，`991.98` 来自 Bootstrap 的 `lg` 断点且与 `992` 重复。改动相关样式时归并到上述 3 档。

方向查询（`orientation: landscape`）只用于旋转提示与播放器横屏适配，不构成独立断点。

### 9.2 布局尺寸

| 令牌                        | 值                        | 说明                              |
| :-------------------------- | :------------------------ | :-------------------------------- |
| `--navbar-height-desktop`   | `64px`                    | 桌面顶部导航（2026-09-19 令牌化） |
| `--navbar-height-mobile`    | `56px`                    | 移动顶部导航（2026-09-19 令牌化） |
| `--sidebar-width`           | `240px`                   | 桌面侧边栏                        |
| `--mobile-tab-bar-height`   | `8vh`                     | 移动底部导航                      |
| `--player-height-collapsed` | `85px`                    | 播放器收起态                      |
| 内容区最大宽度              | `1400px`                  | 桌面内容区                        |
| 内容区留白                  | 桌面 `48px` / 移动 `16px` | 左右内边距                        |

### 9.3 安全区

使用 `env(safe-area-inset-*)` 适配刘海屏与底部横条。

`index.html` 的 viewport 已包含 `viewport-fit=cover`（2026-09-19 补齐）。缺少它会导致 iOS 上 `env(safe-area-inset-top/bottom)` 恒为 0、安全区失效。当前 `theme.css` 同时提供 `--safe-area-top` 与 `--safe-area-bottom`，移动 Header 和底部导航分别消费它们：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### 9.4 触控与指针

```css
@media (pointer: coarse), (max-width: 768px) {
  :root {
    --control-hit-size: var(--control-hit-size-coarse);
  }
}
```

粗指针或窄屏时命中区自动从 40px 提升到 44px。不要在每个组件里重复写这个媒体查询。

---

## 10. 组件规范

> 阅读方式：本节各表描述**目标形态**（合规写法）。与当前代码不一致的条目在"现状"列标注；未标注"现状"即代码已符合目标，照抄即可。

### 10.1 按钮

四类，全部由 `primitives.css` 提供，**不要在组件内重写**。

| 类                                | 用途                     | 形态（目标）                           | 现状                                 |
| :-------------------------------- | :----------------------- | :------------------------------------- | :----------------------------------- |
| `.ui-button.ui-button--primary`   | 页面主操作，每屏最多一个 | 高 40px，圆角 8px，主色底              | 高 40px ✓，圆角 8px（`--radius-sm`） |
| `.ui-button.ui-button--secondary` | 次级操作                 | 高 40px，1px 边框，透明底              | 高 40px ✓，圆角 8px（`--radius-sm`） |
| `.ui-icon-button`                 | 无文字图标操作           | 命中区 40/44px，图标 20px，圆角 8px    | 一致 ✓（`--control-radius`）         |
| `.ui-icon-button--play`           | 播放器主播放键           | 命中区 56px，图标 48px                 | 一致 ✓                               |
| `.ui-text-button`                 | 轻量文字操作（如"清空"） | 命中区 40/44px（`--control-hit-size`） | 一致 ✓                               |

规则：

- 图标按钮必须带 `aria-label`。
- 禁用态、过渡由原语提供；**焦点环由全局策略提供**（`index.css`，见 §12.4），原语、组件、页面都不再各自声明焦点环。
- **禁止新增** ad-hoc 按钮类。以下为存量类，仅用于兼容现有页面，触及相关组件时应迁移到原语：`minimal-action-btn`、`control-button`、`btn-primary-custom`、`btn btn-primary`。
- 主操作按钮的文字色使用 `--color-on-solid`，不用 `--color-background`。

### 10.2 输入框

- 高 40px，圆角 8px，`1px solid var(--color-border)`
- 默认背景 `--color-background`
- 聚焦：边框变 `--color-border-active`，叠加 `0 0 0 1px` 同色（形成 2px 视觉厚度）
- placeholder 用 `--color-text-muted`
- 禁用：背景 `--color-background-alt`，`opacity: 0.6`

实现位于 `src/styles/components.css` 的 `.form-control-custom` / `.form-select-custom`（2026-09-19 从 `theme.css` 迁出）。背景与边框已改用令牌；原先那条 `:focus` + 硬编码 `#2383e2` 的聚焦边框已于同日移除——输入框的聚焦提示现在统一由 §12.4 的全局策略承担。

### 10.3 列表项与卡片

搜索结果、收藏、历史使用统一的 `.music-card`：

| 属性     | 目标                                                    | 现状                                            |
| :------- | :------------------------------------------------------ | :---------------------------------------------- |
| 背景     | `--card-background`                                     | 一致 ✓                                          |
| 边框     | `1px solid var(--color-border)`                         | 一致 ✓                                          |
| 圆角     | 12px（容器档）                                          | **10px**（`--border-radius-lg`）                |
| 阴影     | 无                                                      | 一致 ✓                                          |
| 最小高度 | `60px`                                                  | 一致 ✓                                          |
| 内边距   | `var(--spacing-compact) var(--spacing-md)`（12px 16px） | **`10px 16px`**，其中 `10px` 是网格外值（§4.1） |
| hover    | 背景变 `--color-hover-notion`，无位移、无阴影           | 一致 ✓                                          |
| 激活态   | 背景变 `--color-hover-notion`                           | 一致 ✓                                          |

标题 14px / 600 / `--color-text-primary`；副标题 14px / 400 / `--color-text-secondary`。超长文本用 `text-overflow: ellipsis` 截断，不用换行撑高。

### 10.4 导航

- 桌面：侧边栏固定 240px，背景 `--color-background-alt`，右边框 1px
- 移动：底部 Tab，高度 `8vh`，含安全区
- 激活态：文字色变 `--color-text-primary`，不使用背景色块（除移动 Tab 的装饰层）

### 10.5 播放器

- 收起态：固定底部，高度 `--player-height-collapsed`，背景 `--color-background`
- 展开态：覆盖式全屏视图，背景 `--color-background`
- 进度条：默认 6px，hover 8px，圆角 10px，填充色 `--progress-fill`
- 图标按钮无边框，hover 才显示背景灰

**现状偏离**：

- 收起高度 `85px` 由令牌定义，代码中不存在覆盖值，实测一致 ✓。（`AudioPlayer.mobile.css` 里的 `56px` 是 `.mobile-expanded-play-button` 的按钮尺寸，不是容器高度。）
- 进度条高度已于 2026-09-19 收敛，现在全部由令牌驱动：

| 场景                                             | 令牌                      | 值  |
| :----------------------------------------------- | :------------------------ | :-- |
| 收起态播放器（`.progress-control-container`）    | `--progress-height`       | 3px |
| 悬停 / 拖动 / 触摸                               | `--progress-height-hover` | 6px |
| 移动端迷你播放器（`.mobile-progress-container`） | `--progress-height-mini`  | 4px |

改动前的实际状态比原描述更乱：高度逻辑写在 `ProgressBar.jsx` 的**内联样式**里（3px ↔ 6px，随 React 状态切换），而 `index.css` 与两个播放器样式表又各写了 `height !important` 去压它，共 4 处规则在互相覆盖——内联值实际上**从未生效**（桌面上内联给 6px，计算值仍是 3px）。现在高度只由 `ProgressBar.jsx` 引用令牌给出，`index.css` 不再声明 `height`，4 处覆盖规则删掉 3 处。

`.mobile-progress-container .progress` 仍保留 `!important`（且是刻意的）：迷你播放器的条固定 4px、不随交互变粗，必须压过内联值。桌面端悬停原为 7px，与移动端的 6px 是同一件事的两个值，已统一为 6px。

### 10.6 浮层

| 组件     | 圆角（目标 / 现状） | 阴影（目标 / 现状）                                      | 遮罩                               |
| :------- | :------------------ | :------------------------------------------------------- | :--------------------------------- |
| 下拉菜单 | 12px / **10px**     | `--shadow-md` / 一致 ✓                                   | 无                                 |
| Toast    | 12px / **10px**     | `--shadow-md` / **`0 4px 12px rgba(0,0,0,0.15)` 硬编码** | 无                                 |
| 模态框   | 12px / **10px**     | `--shadow-lg` / **`0 10px 30px rgba(0,0,0,0.2)` 硬编码** | `rgba(0, 0, 0, 0.4)` + `blur(4px)` |

实现位于 `src/styles/components.css` 的 `*-custom` 类（2026-09-19 从 `theme.css` 迁出）。

模态框关闭按钮必须有 `aria-label`；目标命中区 40px（现状用 `--control-hit-size`，40/44px ✓），目标圆角 8px（现状未声明圆角，为 0）。

### 10.7 空状态

- 居中布局，主标题 32px / 600 / `--color-text-primary`
- 描述 14px / `--color-text-tertiary`
- 容器背景 `--card-background`，圆角 12px，内边距 `24px 28px`
- 可选标签：12px，胶囊圆角，背景 `--color-background-alt`

### 10.8 标签与徽标

- 高度自适应，内边距 `4px 10px`
- 圆角 4px（方标签）或 999px（胶囊标签）
- 字号 12px，字重 500
- 背景 `--color-background-alt`，文字 `--color-text-secondary` 或 `--color-text-tertiary`

### 10.9 骨架屏

- 使用 `--color-background-alt` 与 `--card-background` 的线性渐变 + `shimmer` 动画
- 动画周期 1.5s
- 圆角与目标元素一致
- 骨架屏属于加载语义，不受动效禁止条款约束

---

## 11. 图标

使用 `react-icons`。图标尺寸由 `size` 属性控制，**不用 `font-size`**。

现状 `App.css` 中的 `.music-card-actions svg { font-size: 1.2rem; }` 是反模式，应改为在组件上显式传 `size`。

### 11.1 尺寸梯度

| 尺寸 | 场景                                                        |
| :--- | :---------------------------------------------------------- |
| `16` | 内联小图标（标签内、紧凑行内）                              |
| `18` | 次级操作图标                                                |
| `20` | 默认图标尺寸，图标按钮内统一使用（`--control-visual-size`） |
| `24` | 强调操作图标                                                |
| `32` | 移动端播放器上/下一曲                                       |
| `48` | 播放器主播放键                                              |
| `60` | 空状态、提示类插画级图标                                    |

现状使用了 14 / 16 / 18 / 20 / 22 / 24 / 28 / 32 / 48 / 60 共 10 种尺寸，收敛到上表 7 档（去掉 14、22、28）。

口径：统计 `src/` 下 `.jsx` / `.js` / `.tsx` 中 react-icons 的 `size={N}` 字面量（`22` 只出现在 `.tsx` 中，只看 `.jsx` 会漏计）。`HeartButton` / `DesktopAlbumCover` 的 `size` 是自定义组件 prop，不计入。

### 11.2 规则

1. 图标默认色为 `--color-text-tertiary`，hover 时变 `--color-text-primary`。
2. 收藏等偏好类图标用 `--color-accent`。
3. 图标按钮的命中区由 `--control-hit-size` 决定，与图标尺寸解耦。
4. 纯装饰图标加 `aria-hidden="true"`。

---

## 12. 可访问性

### 12.1 硬性要求

| 项           | 要求                                             | 当前状态                  |
| :----------- | :----------------------------------------------- | :------------------------ |
| 命中区       | 桌面 ≥ 40px，触控 ≥ 44px                         | 已达标                    |
| 焦点可见     | 键盘导航必须可见；指针操作不显示（机制见 §12.4） | 已达标                    |
| 图标按钮命名 | 必须有 `aria-label`                              | 已达标（32 处）           |
| 键盘可达     | 所有交互元素可 Tab 到达并操作                    | 需逐组件确认              |
| 动效偏好     | 响应 `prefers-reduced-motion`                    | 已达标                    |
| 对比度       | 正文 ≥ 4.5:1，大字号 ≥ 3:1                       | **主色不达标**（见 12.3） |

### 12.2 禁止

- `outline: none` 且不提供替代焦点样式
- 用 `div` / `span` 加 `onClick` 代替 `button`
- 仅靠颜色传达状态（如只用红/绿区分成功失败）
- 移除、覆盖或局部新增焦点环样式（统一策略见 §12.4）

### 12.3 对比度实测

以 `#ffffff` 为背景的实测值（WCAG 2.1 相对亮度算法）：

| 令牌                     | 值        | 对比度  | 判定        |
| :----------------------- | :-------- | :------ | :---------- |
| `--color-text-primary`   | `#2f3437` | 12.60:1 | 通过        |
| `--color-text-secondary` | `#6b6f76` | 5.05:1  | 通过        |
| `--color-primary`        | `#2383e2` | 3.88:1  | 仅大字/图形 |
| `--color-accent`         | `#d15c5c` | 3.89:1  | 仅大字/图形 |
| `--color-danger`         | `#e74c3c` | 3.82:1  | 仅大字/图形 |
| `--color-text-tertiary`  | `#91918e` | 3.16:1  | 仅大字/图形 |
| `--color-text-muted`     | `#9b9a97` | 2.81:1  | 不达标      |

由此得出三条硬约束：

1. **只有 `--color-text-primary` 和 `--color-text-secondary` 可以承载需要阅读的正文。**
2. `--color-text-tertiary`（3.16:1）和 `--color-text-muted`（2.81:1）只能用于非关键元信息：时间戳、纯装饰图标、placeholder。不要用它们写说明文字。
3. **`--color-primary` 只有 3.88:1，是当前最需要处理的对比度问题。** 它同时影响两个高频场景：
   - 主色链接文字：14px 常规字重下不满足 AA。需要加下划线、加粗，或改用更深的色值。
   - 主按钮（主色底 + 白字）：同样是 3.88:1。若按钮文字为 14px / 500，不满足 AA。

   可选处理方向：把 `--color-primary` 加深到约 `#1a6dc0` 一带（可达 4.5:1），或为主按钮单独定义一个通过对比度的底色令牌。这是产品可见的视觉变化，需要单独决策，不在本规范的自动收敛范围内。

### 12.4 焦点环策略

焦点环只在**键盘导航**时出现；指针操作（鼠标 / 触摸）一律不显示。

**为什么不能只用 `:focus-visible`**：浏览器把文本输入框和 `<select>` 视为"必须给出焦点提示"的元素，**鼠标点击时同样匹配 `:focus-visible`**。实测（Chromium）：

| 元素                    | 鼠标点击后是否匹配 `:focus-visible` |
| :---------------------- | :---------------------------------- |
| `<button>`              | 否                                  |
| `<input type="search">` | **是**                              |
| `<select>`              | **是**                              |

所以"鼠标不显示焦点环"这件事无法只靠 CSS 完成，必须额外记录最后一次交互方式。

**机制**（单一真源在 `src/index.css`）：

- `src/utils/inputModality.js` 在 `<html>` 上维护 `data-nav="pointer" | "keyboard"`
  - 只有 **Tab** 会切到 `keyboard`。方向键、回车不算——它们在指针发起的操作里也会出现（点开 select 后用方向键选项、点进搜索框后用方向键选联想词），那时焦点并没有移动，不该突然冒出焦点环
  - `pointerdown` 一律切回 `pointer`
- `html[data-nav='pointer']` → 任何元素都不显示焦点环
- `html[data-nav='keyboard']` → 所有元素使用同一焦点环

**令牌**：`--focus-ring-width` / `--focus-ring-color` / `--focus-ring-offset`（定义在 `theme.css`）。改粗细或颜色只改这几个值，全局规则引用它们。

**两处刻意例外**：

| 位置           | 做法                                                                               | 原因                                                                                                                                                |
| :------------- | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| 搜索框         | 焦点环由外层 `.header-search-field-wrapper` 用 `border-color` 承担，不用 `outline` | 图标和清除按钮是输入框的**兄弟节点**，挂在输入框上的 `outline` 包不住它们；且容器在聚焦时要把底部圆角抹平与联想面板合体，`outline` 的矩形会横切面板 |
| 移动端底部 Tab | `outline-offset: var(--focus-ring-offset-inset)`（内缩）                           | 贴屏幕下沿，外扩的环会被裁切                                                                                                                        |

**实现约束**：

- 组件、原语、页面都**不应再声明焦点环样式**。全局规则带 `!important`，组件级声明不会生效，只会留下"看起来生效其实被覆盖"的困惑。
- `!important` 是冲着 Bootstrap 去的：它的 `.nav-link:focus-visible { outline: 0; box-shadow: rgba(13, 110, 253, 0.25) … }` 会覆盖焦点环并叠加自己的蓝色光晕。Bootstrap 移除后（§15.3 第 2 条）可以摘掉 `!important`。
- 焦点环必须**即时出现**：组件里的 `transition: all` 会把 `outline-color` / `outline-offset` 也纳入过渡，导致环从 `currentColor` 淡入（先灰后蓝），且各元素速度不一致。全局策略因此附带一条等价的 `transition-property: none`。

---

## 13. 禁止事项

按严重程度排序。

### 13.1 阻断级（code review 必须打回）

1. **硬编码颜色**。任何 `#rrggbb` / `rgb()` / `rgba()` / `hsl()` / `hsla()`，以及 `white` / `black` 等命名色，直接写在组件 CSS 中。豁免范围见 §1.1。存量分布见 §15.2。
2. **新增 `z-index` 魔法数字**。必须用 `--z-index-*` 变量。
3. **新增 ad-hoc 按钮类**。必须用 `primitives.css` 的原语。
4. **在组件内重写焦点环、禁用态、过渡规则**。禁用态与过渡是原语的契约；焦点环已经上收到全局策略，见 §12.4。
5. **用背景令牌当文字色**。

### 13.2 警告级（应改，但不阻断）

6. 硬编码圆角、字号、间距（必须用令牌）。
7. 用 `!important` 覆盖样式。当前存量 390 处，主要用于对抗 Bootstrap，根因是 Bootstrap 依赖未移除（见 §15.2）。
8. 用 `margin` 做纵向间距（应用父容器 `gap`）。
9. 用 `font-size` 控制图标大小。
10. 网格外的间距值（非 4 的倍数）。

### 13.3 设计级

11. hover 缩放或位移反馈。
12. 装饰性无限动画。
13. 卡片使用投影。
14. 用边框做装饰性强调。
15. 新增字号、圆角、间距的"一次性数值"——缺令牌先补令牌。

---

## 14. 落地

### 14.1 新增令牌的流程

1. 确认现有令牌确实不满足（不是"感觉 10px 比 8px 好看"）。
2. 在 `theme.css` 中按语义命名添加，附一行注释说明用途。
3. 在本文对应章节的表格中登记。
4. 在组件中引用。

### 14.2 Code Review 检查点

- 有没有新增硬编码颜色（含 `rgba()`）/ 圆角 / 字号？
- 有没有新增 `z-index` 数字？
- 有没有新增组件级的焦点环声明（应交给 §12.4 的全局策略）？
- 交互元素的命中区是否 ≥ 40px（触控 ≥ 44px）？
- 图标按钮是否有 `aria-label`？
- hover 是否只改背景色（无缩放、无位移、无阴影）？
- 新增的文本是否用了梯度内的字号和字重？
- 移动端是否验证过（不只是看桌面截图）？

### 14.3 自动化门禁（Stylelint）

Oxlint 不检查 CSS，Oxfmt 只管格式，样式层面的约束由 Stylelint 承担。配置在仓库根目录的 `stylelint.config.mjs`——**本文不复制配置内容**，避免两处漂移。

策略是先收敛存量，再以零告警门禁防止回归：

- 只拦 §13.1 的**阻断级**两项：硬编码颜色（含 `rgb()` / `rgba()` / `hsl()`——`color-no-hex` 管不住这些，必须另配 `declaration-property-value-disallowed-list`）与 `z-index` 魔法数字。
  §13.2 的圆角 / 字号存量上百处，纳入只会淹没阻断级信号，属于 §15.2 的收敛工程，暂不启用。
- 规则统一为 `warning` 严重度；`package.json` 中的 `pnpm run lint:css` 固定使用 `--max-warnings=0`，拒绝任何存量或新增告警。
- 当前基线 **0**。颜色字面量已迁移到 `theme.css` 语义令牌；后续新增违规必须在合并前修复。
- `theme.css` 整文件放开，但这是**语义豁免**：它现在只有令牌定义，而令牌定义本身就需要字面量色值。组件类已迁到 `src/styles/components.css`，与其余组件层一样受检。

历史记录：上一轮基线为 62；随后删除两个未引用样式文件、清理旧组件选择器并完成圆角/层级迁移后，基线降至 41。本轮完成组件颜色令牌迁移，Stylelint 实测为 **0 条 warning**。

已接进 `verify:release`，所以 CI（`.github/workflows/ci.yml`）与 `release.ps1` 都会执行。**在这条门禁建立之前，规范只能靠人工遵守，这正是它此前失效的原因。**

### 14.4 当前可用令牌

组件只能引用已在 `theme.css` 定义的令牌；下表列出当前可用令牌与仍待补齐的规范目标。

| 类别   | 当前可引用                                                                                                                                            | 待新增（见 §15.1）                                       |
| :----- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| 颜色   | `--color-*`（§2.1 全部）                                                                                                                              | —                                                        |
| 字号   | `--font-size-sm` / `--font-size-base` / `--font-size-lg`                                                                                              | `--font-size-2xs` / `-md` / `-xl` / `-2xl`               |
| 字重   | `--font-weight-normal` / `-medium` / `-bold`                                                                                                          | `--font-weight-semibold`                                 |
| 间距   | `--spacing-xs` / `-sm` / `-md` / `-lg` / `-xl`                                                                                                        | `--spacing-compact` / `--spacing-2xl`                    |
| 圆角   | `--radius-xs` / `--radius-sm` / `--radius-md` / `--radius-full`（旧 `--border-radius-*` 为兼容别名）                                                  | —                                                        |
| 动效   | `--transition-fast` / `-normal`，`--ease-*`（3 条）                                                                                                   | `--duration-*` / `--ease-standard` / `--ease-emphasized` |
| 阴影   | `--shadow-sm` / `-md` / `-lg`                                                                                                                         | —                                                        |
| 层级   | `--z-index-*`（全表见 `ZINDEX_AUDIT.md`）                                                                                                             | —                                                        |
| 控件   | `--control-hit-size` / `--control-hit-size-coarse` / `--control-visual-size` / `--button-min-height` / `--focus-ring` / `--focus-ring-offset`         | —                                                        |
| 布局   | `--sidebar-width` / `--navbar-height-desktop` / `--navbar-height-mobile` / `--mobile-tab-bar-height` / `--player-height-collapsed`                    | —                                                        |
| 进度条 | `--progress-height` / `--progress-height-hover` / `--progress-height-mini` / `--progress-border-radius` / `--progress-background` / `--progress-fill` | —                                                        |

---

## 15. 现状偏离清单

诚实记录规范与代码的差距。这份清单是收敛工作的待办来源，不是"已解决"的说明。

### 15.1 令牌缺口

| 缺口                                                                             | 影响                  | 优先级 |
| :------------------------------------------------------------------------------- | :-------------------- | :----- |
| `--font-weight-semibold` (600) 缺失                                              | 19 处硬编码           | 高     |
| `--spacing-compact` (12px) 缺失                                                  | 列表项 padding 硬编码 | 中     |
| `--spacing-2xl` (48px) 缺失                                                      | 桌面内容区留白硬编码  | 中     |
| `--font-size-2xs` / `--font-size-md` / `--font-size-xl` / `--font-size-2xl` 缺失 | 字号梯度不完整        | 中     |
| `--duration-*` / `--ease-standard` 缺失                                          | 时长与曲线硬编码      | 中     |

### 15.2 存量偏离

统计口径：`src/` 下全部 CSS 文件（`.jsx` / `.tsx` 内联样式单独标注）。颜色一项单列组件层，因为 `theme.css` 变量定义区内的色值是合法的。每行的详细口径见对应章节。

| 项                             | 现状                                   | 目标      | 口径                                              |
| :----------------------------- | :------------------------------------- | :-------- | :------------------------------------------------ |
| 硬编码颜色（hex，组件层）      | **0 处**                               | 0         | 排除 `theme.css`，按声明统计                      |
| 硬编码颜色（含 `rgba()`）      | **0 处**                               | 0         | 同上，注释中的示例不计入                          |
| 硬编码颜色（`components.css`） | **0 处**                               | 0         | Stylelint 口径                                    |
| `!important`                   | **390 处**                             | 逐步归零  | 声明级计数                                        |
| 硬编码 `z-index`               | **0 处**（CSS/JS）                     | 0         | `index.html` 首屏 Loading 的 1 处为变量加载前例外 |
| 字号取值                       | 25 种                                  | 7 档      | 含 `theme.css`，共 87 处                          |
| 圆角取值                       | 4 档令牌                               | 4 档      | `0` / `50%` / `inherit` 为结构性例外              |
| 断点取值                       | 7 种                                   | 3 档      | `@media` 的 width 数值，共 23 条                  |
| 动效时长                       | 12 种（交互 7 / 加载 5）               | 交互 3 档 | 含 `animation-duration` / `-delay`                |
| 缓动曲线                       | 3 条自定义 `--ease-*`                  | 2 条      | `theme.css` 变量定义；原记 5 条系误记             |
| 图标尺寸                       | 10 种                                  | 7 档      | react-icons `size={N}`，含 `.tsx`                 |
| 间距网格外值                   | 12 种                                  | 0         | 含 `calc()` 内 px，共 61 处                       |
| `font-weight: 600`             | 19 处                                  | 1 个令牌  | CSS 16 + JSX 内联 3                               |
| `aria-label`                   | 32 处                                  | 保持      | 严格匹配，不含 `aria-labelledby`                  |
| `prefers-reduced-motion`       | 已补齐（`index.css` 末尾高特异性兜底） | 保持      | 见 §7.4                                           |
| Stylelint 阻断级存量           | **0 处**                               | 0         | 门禁已接入，见 §14.3；`--max-warnings=0`          |
| 令牌零采用                     | 9 个                                   | 0         | 见下方说明；目标是改为引用它们，不是删除          |

死样式文件 `UserProfile.css`、`FirebaseStatus.css` 已删除；旧组件选择器也已按运行时引用清理。颜色存量数字应以 Stylelint 实际输出为准。

`!important` 的文件分布：`App.css` 84、`AudioPlayer.desktop.css` 78、`Navigation.desktop.css` 67、`AudioPlayer.base.css` 42、`AudioPlayer.animations.css` 27，其余分散在各文件。

焦点环已于 2026-09-19 收敛（见 §12.4）：原先 **18 个选择器**各自声明焦点环，其中 8 处硬编码色值、offset 有 `var(--focus-ring-offset)` / `2px` / `3px` / `4px` / `-3px` 五种写法；还有 3 处输入类元素用 `:focus` + 蓝色边框。现在统一由 `index.css` 的全局策略提供，组件层不再保留任何焦点环声明，只留上述两处刻意例外。

历史上门禁口径与手工统计有差异（例如 hex 曾为手工 24 处、Stylelint 20 处），原因是 Stylelint 只解析 CSS 声明值，不计注释与 data URI。当前上表已按迁移后的零基线更新；**后续以 `pnpm run lint:css` 的数字为准**，旧手工统计仅作历史记录。

**令牌零采用（9 个）**：`--font-size-base`、`--font-size-lg`、`--font-weight-normal`、`--font-weight-bold`、`--line-height-base`、`--spacing-lg`、`--spacing-xl`（含移动端媒体查询里的覆盖）、`--shadow-lg`、`--control-visual-size`。

这 9 个**不是死令牌，不能删**——它们是规范明确要求使用、而代码在这些位置写了字面量的令牌。例如 §11.1 说图标按钮统一用 `--control-visual-size`、§3.4 说单行文本用 `--line-height-base`、§6.2 说强浮层用 `--shadow-lg`，但实际全部零引用。它们比"死令牌"更能说明收敛工作的真正难点：**令牌早就备好了，缺的是采用。**

2026-09-19 已清理 **30 个**真正零引用的遗留令牌；这 9 个必须保留并推广使用。

### 15.3 已知冲突

1. **旧圆角别名仍存在**，用于兼容历史调用方；新代码必须使用 `--radius-*` 四档令牌。
2. **Bootstrap 依赖未移除**，导致大量 `!important` 对抗性写法（390 处）。它同时干扰焦点环：`.nav-link:focus-visible { outline: 0; box-shadow: rgba(13, 110, 253, 0.25) … }` 会覆盖焦点环并叠加 Bootstrap 自己的蓝色光晕。§12.4 的全局策略因此必须带 `!important`，移除 Bootstrap 后可以摘掉。移除 Bootstrap 是解决 `!important` 泛滥的根因，应作为独立重构任务。
3. **移动端顶部安全区已纳入布局**：`viewport-fit=cover` 下，移动端 Header 使用 `--safe-area-top`，主内容从同一组 `--navbar-height-mobile + --safe-area-top` 计算留白，原先 54px 的 2px 差异已消除。
4. **进度条高度已收敛**（2026-09-19）：改动前的实际状态比原先记录的更乱——高度逻辑写在 `ProgressBar.jsx` 的**内联样式**里，又被 4 处 `!important` 规则覆盖，**内联值从未生效**。现在高度只由 `ProgressBar.jsx` 引用 `--progress-height` / `--progress-height-hover` 给出，`index.css` 不再声明 `height`。唯一视觉变化是桌面悬停由 7px 收敛为 6px。详见 §10.5。
5. **硬编码 `z-index` 已清零**（2026-09-19）：侧边栏、播放器关闭按钮、两套 Header、两套搜索联想框和输入图标均已改为语义令牌；`index.html` 首屏 Loading 保留 1 处变量加载前例外。
6. **模态层级已与播放器错开**：`--z-index-modal` / `--z-index-modal-content` 调整为 10010 / 10011，高于播放器强制展开层，不再依赖样式表顺序。

---

## 16. 自检清单

提交界面改动前逐条确认：

- [ ] 所有颜色来自令牌，没有硬编码色值（含 `rgba()` 与命名色）
- [ ] 圆角、字号、间距、时长都在梯度内
- [ ] 没有新增 `z-index` 数字
- [ ] 图标按钮有 `aria-label`，命中区 ≥ 40px
- [ ] hover 只改背景色，无缩放、无位移、无阴影
- [ ] 键盘可以 Tab 到并操作所有交互元素
- [ ] 没有新增组件级焦点环声明；Tab 时焦点环可见、鼠标点击时不出现
- [ ] 移动端（< 768px）实际验证过
- [ ] 新增令牌已登记到本文对应表格
- [ ] 没有引入新的 `!important`

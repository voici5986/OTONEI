# Notion × shadcn UI 设计规范（UnoCSS + Radix）

> **目标**：构建一种“安静、克制、长期不审美疲劳”的界面系统。
>
> **定位**：Notion 的信息密度哲学 × shadcn/ui 的工程化审美 × UnoCSS 的可控原子化 × Radix 的交互一致性

---

## 0. 总体设计哲学

### 0.1 核心原则

- **默认状态应当“什么都没发生”**
- UI 只在“需要被理解”时才显现
- 一切样式必须能被长期维护，而不是短期好看

判断标准：

> 如果一个界面截图一眼就能被认出“这是某种设计风格”，那它已经过度设计了。

---

## 1. 颜色系统（Color System）

### 1.1 设计目标

- 颜色只承担**功能语义**，不承担情绪表达
- 层级主要通过**亮度差异**而非色相建立
- 默认界面几乎是“无色”的

---

### 1.2 中性色系统（Neutral Scale）

> 中性色是整个系统的骨架，**必须整体存在，不允许裁剪**。

```css
:root {
  --neutral-0: #ffffff; /* 页面 / 卡片主背景 */
  --neutral-25: #fafaf9; /* 次级背景 */
  --neutral-50: #f5f5f4; /* 弱背景 */
  --neutral-100: #efefee; /* Hover / Selected */
  --neutral-200: #e4e4e2; /* 分割线 */
  --neutral-300: #d4d4d2; /* 强边界 */
  --neutral-400: #a3a3a0; /* Disabled / Placeholder */
  --neutral-500: #737373; /* 次级文字 */
  --neutral-700: #404040; /* 正文文字 */
  --neutral-900: #171717; /* 标题 / 强调 */
}
```

---

### 1.3 中性色使用矩阵（强制）

| 场景             | 使用 Token             |
| ---------------- | ---------------------- |
| 页面背景         | neutral-0 / neutral-25 |
| Card 背景        | neutral-0              |
| Hover / Selected | neutral-100            |
| 分割线           | neutral-200            |
| 表格边框         | neutral-300            |
| 正文文字         | neutral-700            |
| 次级文字         | neutral-500            |
| 禁用 / 占位      | neutral-400            |
| 标题文字         | neutral-900            |

> **组件只能引用 Token，不允许直接使用 Hex。**

---

### 1.4 语义色系统（Semantic Colors）

> 语义色用于“表达状态”，**永远不能用于结构或层级**。

```css
:root {
  --blue: 221 83% 53%;
  --blue-muted: 221 83% 53% / 0.08;

  --red: 0 72% 51%;
  --red-muted: 0 72% 51% / 0.08;

  --green: 142 71% 45%;
  --green-muted: 142 71% 45% / 0.08;

  --yellow: 38 92% 50%;
  --yellow-muted: 38 92% 50% / 0.08;
}
```

#### 使用矩阵

| 场景          | 使用方式           | 禁止项     |
| ------------- | ------------------ | ---------- |
| 主操作 / 链接 | blue text / icon   | 大面积背景 |
| 危险操作      | red text / thin bg | 强对比     |
| 错误提示      | red icon + text    | 改变布局   |
| 成功状态      | green icon / text  | 动画强调   |
| 警告提示      | yellow icon        | 高频出现   |

---

## 2. 边框系统（Border First）

### 原则

> **结构优先使用 border，而不是 shadow。**

```css
border: 1px solid var(--neutral-200);
```

| 场景         | 规则                 |
| ------------ | -------------------- |
| Card / Panel | 必须有 border        |
| 页面分区     | border-t / border-b  |
| 列表         | divide-y             |
| Sticky 区域  | border + 可选 shadow |

---

## 3. 阴影系统（Shadow）

> 阴影不是层级工具，只是“浮起感”的补充。

```css
.shadow-sm {
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
```

| 组件           | 是否允许 |
| -------------- | -------- |
| Card           | ❌       |
| Button         | ❌       |
| Menu / Popover | ✅       |
| Dialog         | ✅       |
| Sticky         | ⚠️ 极弱  |

---

## 4. 圆角系统（Radius）

```css
:root {
  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 8px;
}
```

| 元素           | 圆角 |
| -------------- | ---- |
| Button / Input | 6px  |
| Card / Panel   | 8px  |
| Menu / Dialog  | 8px  |

禁止在同一组件中混用圆角级别。

---

## 5. Focus 与可访问性（Radix）

```css
:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 1px var(--neutral-0),
    0 0 0 2px rgb(0 0 0 / 0.15);
}
```

规则：

- 仅 `:focus-visible`
- 鼠标点击不显示
- 不作为视觉装饰

---

## 6. Hover / Active 状态

```css
.hover-muted:hover {
  background: var(--neutral-100);
}
```

- 仅亮度变化
- 禁止 scale / shadow / 渐变

---

## 7. 列表与导航（Notion 核心）

```css
.nav-item[data-active='true'] {
  background: var(--neutral-100);
  border-radius: var(--radius);
}
```

- 不使用语义色
- 不加粗
- 不增强对比

---

## 8. 动画与过渡（Motion）

```css
transition:
  background-color 120ms ease-out,
  border-color 120ms ease-out;
```

禁止：spring / scale / opacity fade

---

## 9. UI 使用矩阵（最终裁决）

| 组件    | 设计态度           |
| ------- | ------------------ |
| Button  | 系统控件，而非 CTA |
| Card    | 信息分组           |
| Dialog  | 短暂存在           |
| Sidebar | 纸张感             |

---

## 10. 最终裁判规则

> **如果三年后由另一个工程师维护，它会不会越改越丑？**

如果答案是“不会”，那这套 UI 是合格的。

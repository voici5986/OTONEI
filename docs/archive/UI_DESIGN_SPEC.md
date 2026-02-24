# ESS 项目 UI 设计规范 (Notion 风格)

本文件详细记录了 Employee Salary System (ESS) 项目的 UI 设计参数，旨在确保后续开发中视觉风格的高度一致性。

## 1. 核心颜色层级 (Color Hierarchy)

遵循 L1-L5 逻辑，确保信息密度与视觉重心的平衡。

| 层级   | 颜色代码  | 逻辑定义                | 使用场景                                             |
| :----- | :-------- | :---------------------- | :--------------------------------------------------- |
| **L1** | `#1F1F1F` | **强调 / 当前选中**     | 选中 Tab 文字、选中下拉项、核心按钮文字、页面标题    |
| **L2** | `#2F3437` | **正常内容**            | 表格正文文字、主要段落文本、标准按钮文字             |
| **L3** | `#6B6F76` | **次要但可交互**        | 未选中 Tab 文字、顶部动作栏 Label/单位、面包屑       |
| **L4** | `#9B9A97` | **未选中 / 非当前焦点** | 搜索框占位符 (Placeholder)、下拉列表未选项、辅助说明 |
| **L5** | `#D3D1CB` | **分割 / 禁用 / 弱化**  | 边框分割线、禁用状态、**全勤奖无资格小圆点**         |

---

## 2. 背景与边框规范 (Background & Borders)

- **Background (背景)**:
  - 页面背景 (App Background): `#FAFAF9` (Notion Page Background)
  - 容器背景 (Card/Table/Input): `#FFFFFF` (Pure White)
  - 表头背景 (Header Background): `#F7F6F4` (Notion Sidebar/Header)
- **Border (边框)**:
  - 默认边框: `#E9E9E9` (Notion Divider)
  - 激活/焦点边框: `#2F3437`

---

## 3. 特殊视觉元素 (Special Elements)

### 3.1 全勤奖状态点 (Attendance Bonus Dots)

- **有资格 (Eligible)**:
  - 颜色: `#16A34A` (绿色)
  - 尺寸: `8px * 8px` 圆点
- **无资格 (Ineligible)**:
  - 颜色: `#D3D1CB` (**L5 弱化色**)
  - 尺寸: `4px * 4px` 小圆点 (视觉上进一步弱化)

---

## 4. 字体规范 (Typography)

### 4.1 字体族 (Font Family)

项目已内置核心字体以确保 Windows 平台渲染一致性。

- **资源位置**: `wwwroot/fonts/`
- **字体定义**:
  - **泰语文本**: 必须使用 `'Tahoma'`，不设置回退。
  - **中英文本**: 默认使用 `'MiSans VF Regular'` (内置可变字重)，回退至 `'Microsoft YaHei'`。
  - **纯数字**: 默认使用 `'Maple Mono NF CN'` (内置等宽字体)，回退至 `'Consolas'`。

### 4.2 字体加载策略

- **格式**: `.ttf` (TrueType)
- **渲染优化**: `font-display: swap` (防止白屏)，`-webkit-font-smoothing: antialiased`。
- **内置字体声明 (app.css)**:
  ```css
  @font-face {
    font-family: 'MiSans VF Regular';
    src: url('fonts/MiSansVF.ttf') format('truetype');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Maple Mono NF CN';
    src: url('fonts/MapleMonoNFCN.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }
  ```

### 4.3 级别定义 (锁死参数)

| 层级                | 字号 (Font Size) | 字重 (Font Weight) | 颜色层级                   | 字体类型     |
| :------------------ | :--------------- | :----------------- | :------------------------- | :----------- |
| **页面大标题**      | `24px`           | `600 (Bold)`       | `L1`                       | 文本字体     |
| **动作栏交互项**    | `16px`           | `500 (Medium)`     | `L1` (选中) / `L3` (Label) | 文本字体     |
| **表格表头**        | `16px`           | `600 (Semi-Bold)`  | `L1`                       | 文本字体     |
| **表格正文**        | `14px`           | `400 (Regular)`    | `L2`                       | 文本字体     |
| **表格数字列**      | `14px`           | `400 (Regular)`    | `L2`                       | **数字字体** |
| **下拉项 (Picker)** | `16px`           | `500 (Medium)`     | `L1` (选中) / `L4` (未选)  | 文本字体     |

---

## 5. 圆角与间距 (Radius & Spacing)

### 5.1 圆角规范

- **交互组件 (Button, Tab, Chip, Search)**: `4px`
- **容器面板 (Panel, Card, Popover)**: `8px`
- **搜索框 (Search Bar)**: `999px` (胶囊形)

### 5.2 布局高度

- **顶部动作栏 (Top Bar)**: `42px`
- **标准按钮/Tab**: `30px`
- **表格行高 (Row Height)**: `35px`

---

## 6. 组件状态规范 (States)

- **Hover (悬停)**:
  - 背景: `#F5F4F2`
- **Selected (选中)**:
  - 背景: `#EFEDEA`
- **Active (激活/点击)**:
  - 背景: `#E8E6E1`

---

## 7. CSS 变量同步 (app.css)

```css
:root {
  /* 背景颜色 */
  --nt-bg-page: #fafaf9;
  --nt-bg-main: #ffffff;
  --nt-bg-header: #f7f6f4;

  /* 状态颜色 */
  --nt-bg-hover: #f5f4f2;
  --nt-bg-selected: #efedea;

  /* 边框 */
  --nt-border-light: #e9e9e9;
}
```

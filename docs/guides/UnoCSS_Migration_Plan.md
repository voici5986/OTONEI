# UnoCSS 迁移方案 (OTONEI 项目)

本方案旨在将项目从全量加载的 Bootstrap CSS 迁移至高性能的原子化 CSS 引擎 **UnoCSS**，以实现按需生成样式、减小打包体积并提升开发体验。

---

## **一、 方案概述**

通过 UnoCSS 的 `presetBootstrap` 预设，我们可以在**不修改现有 HTML 类名**（如 `d-flex`, `mt-3`）的前提下，实现样式的按需生成。最终目标是移除 `bootstrap.min.css` 的引入，由 UnoCSS 扫描代码并生成仅包含已使用类名的极小 CSS 文件。

---

## **二、 迁移阶段步骤**

### **阶段 1：环境搭建与插件集成**

1.  **安装核心依赖**：
    安装 `unocss` 以及对应的 Bootstrap 预设包。

2.  **配置 Vite 插件**：
    在 `vite.config.js` 中引入 UnoCSS 插件。
    _注意：需将 `UnoCSS()` 插件放置在 `react()` 插件之后。_

3.  **入口文件调整**：
    在 `src/index.js` 中引入 `virtual:uno.css`。
    _此时先不要移除旧的 bootstrap.min.css，确保样式不丢失。_

### **阶段 2：配置 UnoCSS 预设**

1.  **创建配置文件**：
    在根目录新建 `uno.config.js`。

2.  **激活 Bootstrap 兼容模式**：
    使用 `presetBootstrap()` 预设。这会让 UnoCSS 识别项目现有的所有 Bootstrap 工具类。

3.  **集成自定义主题变量**：
    将 `theme.css` 中的颜色变量（如 `--color-primary`）映射到 UnoCSS 的 `theme` 配置中，实现原子类与自定义主题的联动。

### **阶段 3：渐进式替换与验证**

1.  **样式冲突检测**：
    启动开发服务器，观察 UnoCSS 生成的类名是否与原 Bootstrap 样式冲突。

2.  **移除全量 CSS 引入**：
    注释掉 `src/index.js` 中的 `import 'bootstrap/dist/css/bootstrap.min.css'`。

3.  **修复布局偏差**：
    重点检查 `row` 和 `col` 布局。若发现间距异常，可在 `uno.config.js` 中针对 Grid 系统进行微调。

### **阶段 4：深度清理与优化**

1.  **依赖清理**：
    从 `package.json` 中彻底移除 `bootstrap` 和 `react-bootstrap`。

2.  **样式重构（可选）**：
    利用 UnoCSS 的 **Attributify Mode**（属性模式）重写部分复杂的类名长串，提升代码可读性。

---

## **三、 注意事项与风险防控**

### **1. Grid 系统补偿**

Bootstrap 的 Grid 依赖特定的负 Margin 抵消。如果 `presetBootstrap` 的表现不符合预期，建议在 `uno.config.js` 的 `shortcuts` 中手动定义一套符合项目习惯的 `row` 样式。

### **2. 响应式断点对齐**

确保 UnoCSS 的断点配置（sm, md, lg）与 Bootstrap 5 的标准完全一致：

- `md`: 768px
- `lg`: 992px
- `xl`: 1200px

### **3. 动态类名识别**

UnoCSS 采用静态扫描。如果代码中有 `className={`text-${color}`}` 这种动态拼接，UnoCSS 无法识别。

- **解决方法**：使用 `safelist` 配置项或改用完整的类名三元表达式。

### **4. CSS 变量优先**

项目中已存在大量 `--color-xxx` 变量。在编写原子类时，优先使用 `text-[var(--color-primary)]` 这种语法，保持 UI 的动态主题切换能力。

# Bootstrap 重构方案文档 (Refactor Plan)

## 1. 核心原则

- **保留**：Bootstrap 的原子工具类 (Grid, Flex, Spacing, Utilities)。
- **弃用**：`react-bootstrap` 提供的所有风格化组件 (Button, Card, Modal, Form, Navbar, etc.)。
- **目标**：实现极简 Notion 风格，减少样式覆盖冲突，提升性能。
- **架构逻辑**：采用“从原子到页面”的重构路径，先保证基础交互稳定，最后调整页面骨架。

## 2. 待处理组件统计与替换方案

| 组件分类     | 涉及组件                                    | 优先级      | 替换方案                                                                                                                                            |
| :----------- | :------------------------------------------ | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **基础原子** | `Button`, `Spinner`, `Badge`                | P0 (已完成) | 使用原生 `button/span` + [theme.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/theme.css) 定义的 `.btn-primary-custom` 等样式。       |
| **表单原子** | `Form`, `InputGroup`, `Form.Control`        | P2 (已完成) | 使用原生 `form`, `input`, `label`；在 [theme.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/theme.css) 中定义 Notion 风格输入框样式。 |
| **展示组件** | `Card`, `Alert`, `ProgressBar`, `ListGroup` | P3 (已完成) | 使用原生 `div`, `ul/li` + 自定义类名（如 `.music-card`, `.list-group-custom`）实现。                                                                |
| **布局骨架** | `Container`, `Row`, `Col`                   | P4 (已完成) | 移除 `react-bootstrap` 导入，改用原生 `div` + Bootstrap Grid 类名（`row`, `col-*`）。                                                               |
| **复杂交互** | `Modal`, `Dropdown`, `Toast`                | P5 (已完成) | 使用原生 `Overlay` + `Portal` 逻辑（当前为内联 Overlay）手写模态框和下拉菜单。                                                                      |

## 3. 详细实施阶段 (Phased Roadmap)

### **第一阶段：样式基建与基础原子 (已完成)**

- [x] 在 [theme.css](file:///c:/Users/voici/Desktop/music%20start/src/styles/theme.css) 中定义基础变量（颜色、圆角、阴影）。
- [x] 替换所有 `Button`, `Spinner`, `Badge` 为原生实现。
- [x] 清理相关文件中的 `react-bootstrap` 简单组件导入。

### **第二阶段：表单交互重构 (已完成)**

- [x] **[Home.js](file:///c:/Users/voici/Desktop/music%20start/src/pages/Home.js)**: 替换搜索框、选择器。
- [x] **[LoginForm.js](file:///c:/Users/voici/Desktop/music%20start/src/components/LoginForm.js)** / **[RegisterForm.js](file:///c:/Users/voici/Desktop/music%20start/src/components/RegisterForm.js)**: 替换所有输入框和表单容器。
- [x] **[Favorites.js](file:///c:/Users/voici/Desktop/music%20start/src/pages/Favorites.js)**: 替换搜索输入框。

### **第三阶段：展示组件替换 (已完成)**

- [x] **[App.js](file:///c:/Users/voici/Desktop/music%20start/src/App.js)**: 替换音乐卡片包装。
- [x] **[User.js](file:///c:/Users/voici/Desktop/music%20start/src/pages/User.js)**: 替换用户信息卡片。
- [x] **[CacheManager.js](file:///c:/Users/voici/Desktop/music%20start/src/components/CacheManager.js)**: 替换 ListGroup。

### **第四阶段：布局骨架清理 (已完成)**

- [x] 统一所有页面的 `Container` 为原生 `div.container` 或 `div.page-content-wrapper`。
- [x] 将所有 `Row`, `Col` 替换为原生 `div`（保留 `className="row"` 等工具类）。
- [x] **[DesktopNavbar.js](file:///c:/Users/voici/Desktop/music%20start/src/components/DesktopNavbar.js)**: 移除 `Navbar`, `Nav` 等强风格布局组件。

### **第五阶段：复杂交互组件 (已完成)**

- [x] 重构 **[CacheManager.js](file:///c:/Users/voici/Desktop/music%20start/src/components/CacheManager.js)** 中的 `Modal`。
- [x] 重构 **[ClearDataButton.js](file:///c:/Users/voici/Desktop/music%20start/src/components/ClearDataButton.js)** 中的确认弹窗。
- [x] 重构收藏夹中的 **[Dropdown](file:///c:/Users/voici/Desktop/music%20start/src/pages/Favorites.js)** 菜单和导入 `Modal`。
- [x] 重构 **[AuthModal.js](file:///c:/Users/voici/Desktop/music%20start/src/components/AuthModal.js)**。
- [x] 替换 **[UpdateNotification.js](file:///c:/Users/voici/Desktop/music%20start/src/components/UpdateNotification.js)** 中的 `Toast` 为自定义样式。

---

_注：本文档由 AI 自动生成并根据用户建议调整顺序。_

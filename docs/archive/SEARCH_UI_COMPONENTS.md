# 搜索 UI 组件汇总 (Notion 风格)

本项目中的搜索框和悬浮卡片（搜索建议）完全基于 **React + 原生 CSS** 开发，未引用任何第三方 UI 组件库。其设计严格遵循 Notion 的极简主义美学。

---

## 1. 核心渲染逻辑 (React - Header.js)

### 桌面端结构

桌面端搜索框位于顶部 Header 中，使用了一个 `header-search-container` 容器，内部包含输入框组和绝对定位的建议面板。

```javascript
<div className="header-search-container">
  <form onSubmit={onSearchSubmit} className="w-100">
    <div className="input-group-custom header-search-input-group">
      <span className="input-group-text-custom">
        <FaSearch size={14} />
      </span>
      <input
        type="search"
        placeholder="搜索歌曲、歌手、专辑..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onFocus={onSearchFocus}
        onBlur={onSearchBlur}
        onKeyDown={onKeyDown}
        className="form-control-custom"
      />
      {searchQuery && (
        <button type="button" className="search-clear-btn" onClick={handleClear}>
          <FaTimesCircle size={14} />
        </button>
      )}
    </div>
  </form>
  {/* 渲染搜索建议卡片 */}
  {renderSuggestions('desktop-search-suggestions')}
</div>
```

### 移动端结构

移动端采用全宽设计，点击时通过 `focus-within` 触发阴影和背景变化。

```javascript
<div className="app-header-mobile d-lg-none">
  <form onSubmit={onSearchSubmit} className="w-100">
    <div className="mobile-search-wrapper">
      <FaSearch className="mobile-search-icon" />
      <input
        type="search"
        placeholder="搜索歌曲..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onFocus={onSearchFocus}
        onBlur={onSearchBlur}
        onKeyDown={onKeyDown}
        className="mobile-search-input"
      />
      {searchQuery && (
        <button type="button" className="mobile-search-clear-btn" onClick={handleClear}>
          <FaTimesCircle size={16} />
        </button>
      )}
    </div>
  </form>
  {/* 渲染搜索建议卡片 */}
  {renderSuggestions('mobile-search-suggestions')}
</div>
```

### 悬浮卡片 (Suggestions)

渲染逻辑统一封装在 `renderSuggestions` 函数中，根据 `hasQuery` 状态展示“最近搜索”或“匹配结果”。

```javascript
const renderSuggestions = (extraClass) => {
  if (!suggestionsOpen) return null;
  return (
    <div className={`header-search-suggestions ${extraClass}`}>
      {/* 匹配逻辑：收藏中、历史记录、加载状态等 */}
      <div className="suggestion-section">
        <div className="suggestion-section-title">收藏中</div>
        {/* 循环渲染 suggestion-item */}
      </div>
      <div className="suggestion-footer">按回车搜索全部歌曲</div>
    </div>
  );
};
```

---

## 2. 样式定义 (CSS - Header.css)

### 桌面端搜索框 (一体化阴影效果)

通过 `:focus-within` 实现输入框与下方卡片的“无缝衔接”感。

```css
.header-search-input-group {
  background-color: #ffffff;
  border-radius: 10px;
  border: 1px solid rgba(15, 15, 15, 0.1);
  height: 40px;
  box-shadow: 0 1px 2px rgba(15, 15, 15, 0.05);
}

/* 激活时去掉底部圆角，与建议面板融合 */
.header-search-container:focus-within .header-search-input-group {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  box-shadow: 0 15px 35px -5px rgba(15, 15, 15, 0.15);
}
```

### 悬浮卡片动画

使用位移淡入动画，模拟 Notion 的平滑弹出。

```css
.header-search-suggestions {
  position: absolute;
  top: 100%;
  background-color: #ffffff;
  border: 1px solid rgba(15, 15, 15, 0.1);
  border-top: none;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  box-shadow: 0 20px 35px -5px rgba(15, 15, 15, 0.15);
  animation: suggestionFadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes suggestionFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 列表项 (Notion 风格悬停)

使用极浅的背景色变化。

```css
.suggestion-item {
  border-radius: 6px;
  transition: background 0.1s ease;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background-color: var(--color-hover-notion); /* 通常是 #f1f1ef */
}
```

### 移动端适配

在移动端，建议面板变为固定定位并撑满宽度。

```css
@media (max-width: 991.98px) {
  .mobile-search-suggestions {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    max-height: calc(100vh - 120px);
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
  }
}
```

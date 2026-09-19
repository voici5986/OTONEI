/**
 * 输入方式追踪（焦点环可见性）
 *
 * 为什么需要它：浏览器对 :focus-visible 的启发式规则会把文本输入框和 select
 * 视为"必须给出焦点提示"的元素，鼠标点击时同样匹配 :focus-visible。
 * 因此"指针操作不显示焦点环"这件事无法只靠 CSS 完成，需要记录最后一次交互方式。
 *
 * 做法：在 <html> 上维护 data-nav="pointer" | "keyboard"，
 * 由 index.css 中的全局焦点环规则消费：
 *   - data-nav="pointer"  任何元素都不显示焦点环
 *   - data-nav="keyboard" 使用统一的 --focus-ring
 *
 * 只把 Tab 视为"切换到键盘导航"。方向键 / 回车不触发，因为它们在指针发起的
 * 操作里也会出现（例如点开 select 后用方向键选项、点进搜索框后用方向键选联想词），
 * 那种情况下焦点并没有移动，不应该突然冒出焦点环。
 */

/** 唯一被视为"切换到键盘导航"的按键。 */
const KEYBOARD_NAVIGATION_KEYS = new Set(['Tab']);

/** 写入 data-nav 的属性名，与 index.css 中的选择器保持一致。 */
const MODALITY_ATTRIBUTE = 'nav';

/**
 * 启动交互方式追踪。应在应用挂载前调用一次。
 * @returns {() => void} 解除监听的清理函数
 */
export const initInputModality = () => {
  const root = document.documentElement;

  const setModality = (modality) => {
    if (root.dataset[MODALITY_ATTRIBUTE] !== modality) {
      root.dataset[MODALITY_ATTRIBUTE] = modality;
    }
  };

  // 初始按指针处理：只有真正按下 Tab 才显示焦点环。
  setModality('pointer');

  const handlePointerDown = () => setModality('pointer');
  const handleKeyDown = (event) => {
    if (KEYBOARD_NAVIGATION_KEYS.has(event.key)) {
      setModality('keyboard');
    }
  };

  // 捕获阶段监听，确保在组件自身的处理函数之前更新状态。
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  };
};

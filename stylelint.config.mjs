/**
 * 样式门禁（Stylelint）
 *
 * 目的不是一次清零，而是"只减不增"：现有存量以 warning 形式统计，
 * `pnpm run lint:css` 用 --max-warnings 卡住上限，新增违规会让命令失败。
 * 取到上限后应下调，不要上调。存量清单见 docs/guides/UI_DESIGN_SPEC.md §15.2。
 *
 * 规则说明：
 * - 只拦 UI_DESIGN_SPEC §13.1 的**阻断级**项：硬编码颜色与 z-index 魔法数字。
 *   §13.2 的圆角 / 字号（§15.2 的收敛工程，存量上百处）暂不纳入，
 *   否则海量告警会淹没真正阻断级的问题。
 * - color-no-hex 只覆盖 hex；rgb() / rgba() / hsl() 需要靠
 *   declaration-property-value-disallowed-list 兜住，否则会漏掉最多的一类。
 * - 令牌名按当前实现写（--z-index-*），不要写尚未落地的名字。
 * - theme.css 整文件放开，但理由已经变了：它现在只放令牌定义，而令牌定义本身就是
 *   "字面量色值"的唯一合法出处。这是**语义豁免，不是历史包袱**。
 *   组件样式已迁到 components.css，与其余组件层一样受检。
 */
export default {
  defaultSeverity: 'warning',
  rules: {
    // 组件样式中禁止颜色字面量
    'color-no-hex': true,
    'declaration-property-value-disallowed-list': {
      '/^(color|background|background-color|border|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|outline|outline-color|box-shadow|fill|stroke)$/':
        [/rgb\(/, /rgba\(/, /hsl\(/, /hsla\(/],
    },
    // 层级只允许令牌或结构性取值
    'declaration-property-value-allowed-list': {
      'z-index': ['/^var\\(--z-index-/', 'auto', '0'],
    },
  },
  overrides: [
    {
      // 令牌层是字面量色值的唯一合法出处
      // （组件类已于 2026-09-19 迁至 src/styles/components.css）
      files: ['src/styles/theme.css'],
      rules: {
        'color-no-hex': null,
        'declaration-property-value-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
};

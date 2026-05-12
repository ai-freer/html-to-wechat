// HTML → 公众号富文本 · default plan
//
// "1A 是纯函数 transform(html, plan)" — plan 来源有两条：
//   - 网页入口：用本文件导出的 DEFAULT_PLAN（无 LLM，零依赖）
//   - skill 入口：由 1C（agent）看截图 + 源码后生成 plan.json
//
// 本文件定义 plan schema 的全部全局字段。节点级 directives 由 1C 生成；
// default plan 提供空 directives，行为等同于纯 1A 兜底转换。
//
// 见 docs/01-html-to-wechat-html.md §3 plan.json schema。

export const DEFAULT_PLAN = Object.freeze({
  // === 正文抽取 ===
  extractMain: true,
  extractMainMinChars: 200,

  // === 标签清理 ===
  bannedTags: ['script', 'iframe', 'form', 'input', 'link', 'meta', 'noscript'],
  removeIds: true,

  // === 页面骨架剥离（无 article/main 时启发式）===
  chromeSelectors: [
    'nav',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[role="search"]',
  ],

  // === 多列 flex/grid → table ===
  // maxKids 提到 6 以覆盖 metric strip / KPI 卡（"6 列指标网格"是常见结构）。
  // grid 路径会按 grid-template-columns 显式列数走，所以 maxKids 是绝对上限不是
  // 强制值。flex 6 列 chip 排理论上也可能误转，但实务上极少见。
  multiColConversion: {
    enabled: true,
    minKids: 2,
    maxKids: 6,
    assumedDocWidth: 700, // px → 百分比折算用
  },

  // === 表格列宽估算 ===
  tableColumnSizing: {
    enabled: true,
    textCellMaxLen: 40,
    minColPctRatio: 0.4, // 最小不低于均分的 N%
  },

  // === 同结构表合并 ===
  tableMerging: {
    enabled: true,
    minRows: 3,
  },

  // === <dl><div><dt><dd> → <table> ===
  // 公众号会把 dt/dd 当 list item 加 bullet，必须重写。
  // 单独走一条路径，不混进 multiColConversion（child 结构特殊）。
  dlToTable: {
    enabled: true,
    minKids: 2,
    maxKids: 6, // metrics 卡片网格常见 4-5 列
  },

  // === 公众号不认的 CSS 属性预先剥除 ===
  // 公众号对 inline style "一条 declaration 不认就整条丢"。
  // 这里把无副作用的 layout/effect 属性预先剥掉，避免连带砍掉
  // background-color / color 等关键属性。
  stripUnknownCssProps: {
    enabled: true,
    blacklist: [
      'min-height', 'max-height', 'min-width', 'max-width',
      'overflow', 'overflow-x', 'overflow-y',
      'backdrop-filter', '-webkit-backdrop-filter',
      'object-fit', 'object-position',
      'aspect-ratio',
      'inset', 'inset-block', 'inset-inline',
      'will-change', 'transform-origin', 'transform-style',
      'filter', '-webkit-filter',
    ],
  },

  // === CSS 函数展平（公众号不支持 clamp/min/max，整条 declaration 会丢）===
  cssFunctionFlatten: {
    enabled: true,
    // clamp(min, ideal, max) → ideal（之后再被 viewportUnits 换算）
    // min(a, b) → 取第一个（"max-width: min(760px, 100%)" 这种语义）
    // max(a, b) → 取第一个
  },

  // === Viewport 单位换算 ===
  // 公众号视宽实际 375-414px，但 HTML Artifact 多按 750px 设计，取中间偏理想值。
  viewportUnits: {
    enabled: true,
    docWidth: 750,
    docHeight: 900,
  },

  // === Gradient / var() 背景展平 ===
  // 公众号不支持 linear-gradient / radial-gradient / var(--foo)，整条 background
  // 会被丢，导致父链断 → 下游 alpha-blend 全错。
  // 把 gradient 第一个颜色 stop 提取为 background-color；var 用 fallback。
  // **必须在 flattenAlphaBackgrounds 之前跑**——否则父背景已丢失，alpha-blend
  // 沿父链找不到正确 opaque ancestor。
  flattenBackgrounds: {
    enabled: true,
  },

  // === 半透明背景压平到不透明等效色 ===
  // 公众号渲染不可靠 + 父链一断下游 alpha 全乱，必须预先 alpha-blend 到父背景上。
  flattenAlphaBackgrounds: {
    enabled: true,
    defaultPageBg: '#ffffff', // 找不到不透明父背景的兜底
  },

  // === 图片策略 ===
  imageStrategy: 'manual', // 'manual' | 'placeholder' | 'inline-base64'

  // === 节点级 directives（LLM 产出 / default 为空数组）===
  // 见 docs/01 §3。directives 在 transform 管线第 ④ 步应用。
  directives: [],
});

/**
 * 把用户传入的 partial plan 与 DEFAULT_PLAN 合并。
 * 深合并第一层（multiColConversion / tableColumnSizing / tableMerging 等子对象）。
 * directives 直接覆盖（不合并），传 [] 等于清空 default 的 directives。
 */
export function mergePlan(partial = {}) {
  const out = { ...DEFAULT_PLAN, ...partial };
  const nested = [
    'multiColConversion', 'tableColumnSizing', 'tableMerging',
    'dlToTable', 'stripUnknownCssProps', 'cssFunctionFlatten',
    'viewportUnits', 'flattenBackgrounds', 'flattenAlphaBackgrounds',
  ];
  for (const key of nested) {
    if (partial[key]) out[key] = { ...DEFAULT_PLAN[key], ...partial[key] };
  }
  // directives：partial 优先，default 为兜底空数组
  out.directives = partial.directives ?? DEFAULT_PLAN.directives;
  return out;
}

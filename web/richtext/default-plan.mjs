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
  multiColConversion: {
    enabled: true,
    minKids: 2,
    maxKids: 3,
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
  for (const key of ['multiColConversion', 'tableColumnSizing', 'tableMerging']) {
    if (partial[key]) out[key] = { ...DEFAULT_PLAN[key], ...partial[key] };
  }
  // directives：partial 优先，default 为兜底空数组
  out.directives = partial.directives ?? DEFAULT_PLAN.directives;
  return out;
}

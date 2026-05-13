// Mode 4 · default plan
//
// 跨模式范式 X-A/X-C：default plan 是"无 LLM、零视觉理解"的兜底。
//   - skill 入口（带视觉理解）：4C agent 看截图 + 源码后生成 plan.json，覆盖本文件
//   - 兜底入口（v0.1 早期）：直接用 DEFAULT_PLAN，纯标签级映射
//
// v0.1 兜底行为：
//   - 所有 <div>/<section>/<article> 容器都"穿透"——递归 children 但自己不产生 block
//   - grid / callout / whiteboard 不识别（HTML 没有标准标签命名 → 必须靠视觉理解判定）
//   - 远程 URL <img> 直接转 DocxXML <img href>，本地/base64 占位
//   - 头标签 h1-h6 / 列表 / 表格 / 代码块 / blockquote / hr 等按 §4.1/4.2 直转
//
// 见 docs/04-html-to-feishu.md §3 (DocxXML 数据模型) + §4 (映射表) + §6.2 (视觉理解强制约束)。

export const DEFAULT_PLAN = Object.freeze({
  // === 视觉理解决策（v0.1 兜底为空）===
  // 由 4C agent 填充。结构：boundaryAnnotations[selector] = "grid" | "column" | "callout" | "whiteboard-mermaid"
  boundaryAnnotations: {},

  // === 容器宽度比例（grid 列 ratio）===
  // 默认所有 grid 平均分。视觉理解可覆盖：columnRatios[selector] = [0.4, 0.6]
  columnRatios: {},

  // === 画板 DSL 源（whiteboard 块要的内容）===
  // 视觉理解阶段把 mermaid/plantuml 代码块解析出来：whiteboardDsls[selector] = { type, dsl }
  whiteboardDsls: {},

  // === 图片尺寸兜底 ===
  // HTML 源没标 width/height 时的默认值（DocxXML img 必须显式尺寸，否则放大失真）
  imageDefaultWidth: 800,
  imageDefaultHeight: 600,

  // === 标签清理 ===
  bannedTags: [
    'script', 'style', 'link', 'meta', 'iframe', 'form', 'input', 'noscript',
    'nav', 'aside', 'header', 'footer',  // 页面骨架装饰
    'svg',  // v0.1 不处理 inline SVG，v0.2 才 rasterize
  ],

  // === DocxXML title 来源 ===
  // 'auto' = 优先 <title>，没有则第一个 <h1>，再没有则用"Untitled"
  titleStrategy: 'auto',

  // === Emoji 兜底（坑 A）===
  // 探针证实 ⚠️ 等会被静默 fallback 为 💡。v0.1 统一用 💡
  defaultCalloutEmoji: '💡',

  // === v0.5a Emoji 白名单（实证）===
  // probe 05a (W6Y6dEImAo5cUFxbFlRcb0hBnvf) 实测 33 个 callout emoji，
  // 4 个被静默 fallback 为 💡（带 U+FE0F variation selector 的多偏向失败）。
  // 规则：emit 时遇到已知 fallback emoji，**自动替换**为推荐替代 + 记 warning。
  // 这样 v0.5 之后默认 plan 行为里再无静默 fallback。
  emojiFallbackSubstitutes: {
    '⚠️': '❗',  // warning → exclamation（同语义、不 fallback）
    'ℹ️': '💡',  // info → light-bulb（飞书 default 也是它，至少明确）
    '⚙️': '🔧',  // gear → wrench（工具语义近）
    '🛠': '🔧',   // tools → wrench（同上）
    '🛠️': '🔧',  // tools-vs16 → wrench
  },
  // 完整白名单（实证保留）——agent 写 plan 时优先选这些
  safeCalloutEmojis: [
    '💡', '📌', '✅', '❌',
    '📝', '📋', '📄', '📑',
    '❗', '🔔', '🚨', '🛑',
    '🔍', '🔧',
    '📊', '📈', '📉', '📅', '🕐',
    '⭐', '🎯', '🔥', '🚀', '🎉', '🆕',
    '🌟', '🤔', '💬', '💼', '📷',
  ],

  // === Callout 颜色兜底 ===
  defaultCalloutBackgroundColor: 'light-yellow',

  // === 警告级别 ===
  // 'strict' = 转换器遇到无法映射的标签时报错；'lenient' = 警告并跳过
  unknownTagStrategy: 'lenient',
});

/**
 * 浅合并用户 plan 到 default plan。
 * 字段级覆盖，不做深度递归（boundaryAnnotations 等子对象需用户自己合并）。
 */
export function mergePlan(userPlan = {}) {
  return Object.freeze({
    ...DEFAULT_PLAN,
    ...userPlan,
    boundaryAnnotations: { ...DEFAULT_PLAN.boundaryAnnotations, ...(userPlan.boundaryAnnotations || {}) },
    columnRatios: { ...DEFAULT_PLAN.columnRatios, ...(userPlan.columnRatios || {}) },
    whiteboardDsls: { ...DEFAULT_PLAN.whiteboardDsls, ...(userPlan.whiteboardDsls || {}) },
  });
}

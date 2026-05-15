// Mode 4 · HTML → DocxXML 转换器（4A，纯函数）
//
// 输入：HTML 字符串 + plan（视觉理解决策；缺省走 DEFAULT_PLAN）
// 输出：DocxXML 字符串（可直接喂给 lark-cli docs +create --content）
//
// 见 docs/04-html-to-feishu.md §3 (DocxXML 数据模型) + §4 (映射表) + §6.3 (转换器实现)
//
// v0.1 范围（与 ROADMAP 阶段 3 对齐）：
//   - ✅ 文本类：h1-h6 / p / ul / ol / table / blockquote / hr / code 行内/块
//   - ✅ 内联：strong/b / em/i / a / code / del / u / span / br
//   - ✅ 远程 URL <img>（直传 DocxXML href，服务端拉取）
//   - ✅ 标签清理（剥 script/style/nav/aside/...）
//   - ⏸ grid / callout / whiteboard（依赖视觉理解 plan，default plan 不识别）
//   - ⏸ 本地/base64 图（v0.2 走 +media-insert）
//   - ⏸ 行内样式严格嵌套顺序重排（先保留原顺序，实测有问题再加）

import * as cheerio from 'cheerio';
import { DEFAULT_PLAN, mergePlan } from './default-plan.mjs';

// ===== 标签级直接映射（同名或简单重命名）=====
const DIRECT_MAP = new Set([
  'p', 'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
  'b', 'em', 'u', 'del', 'a', 'code', 'span', 'br',
]);

// HTML → DocxXML 标签重命名（小写空间）
const RENAME_MAP = {
  'strong': 'b',
  'i': 'em',
  's': 'del',
  'strike': 'del',
};

// 默认黑名单（与 default-plan.bannedTags 取并集）
const ALWAYS_DROP = new Set(['script', 'style', 'link', 'meta', 'noscript']);

// 仅穿透（自身不产 block，children 继续）的容器
const PASS_THROUGH = new Set([
  'html', 'body', 'main', 'article', 'section', 'div',
  'header', 'footer', 'nav', 'aside',  // 这些通常 plan 里 banned，但万一漏网走穿透
  'figure', 'figcaption',
  'details', 'summary',
  'dl',  // 定义列表容器：dt/dd 自己处理（见 emit() 中 dt/dd 特例）
  // inline 文本格式（DocxXML 不支持但语义可丢，children 继续）
  'small', 'sub', 'sup', 'mark', 'abbr', 'kbd', 'samp', 'var', 'cite',
]);

/**
 * 主入口：HTML 字符串 + plan → DocxXML 字符串。
 *
 * @param {string} rawHtml
 * @param {Partial<typeof DEFAULT_PLAN>} planArg
 * @returns {{ docxxml: string, title: string, warnings: string[], stats: object }}
 */
export function transform(rawHtml, planArg = {}, opts = {}) {
  if (!rawHtml || !rawHtml.trim()) {
    return { docxxml: '', title: 'Untitled', warnings: ['empty input'], stats: {} };
  }

  const plan = mergePlan(planArg);
  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  const warnings = [];
  const stats = { tagCounts: {}, droppedTags: {}, imgRemote: 0, imgPlaceholder: 0, imgLocal: 0, imgBase64: 0 };
  const mediaTasks = [];  // v0.2c: local/base64 imgs 边信道，后置 +media-insert

  // v0.5e: puppeteer 实测的 <img> 渲染宽度 → 注入 data-render-width/height 属性，
  // 让 pickImgDimensions 优先采用（而不是兜底 800×600）。索引按 DOM 树深度优先序对齐。
  if (Array.isArray(opts.renderedWidths) && opts.renderedWidths.length > 0) {
    const imgs = $('img').toArray();
    let matched = 0;
    imgs.forEach((el, i) => {
      const m = opts.renderedWidths[i];
      if (!m) return;
      const elSrc = (el.attribs?.src || '').slice(0, 80);
      // 校验：srcPrefix 一致才注入（防止 cheerio 与 chrome DOM 顺序不一致导致错配）
      if (elSrc === m.srcPrefix && m.width > 0) {
        el.attribs['data-render-width'] = String(m.width);
        el.attribs['data-render-height'] = String(m.height);
        matched++;
      }
    });
    stats.renderedWidthsMatched = matched;
    stats.renderedWidthsTotal = imgs.length;
    if (matched < imgs.length) {
      warnings.push(`renderedWidths: ${matched}/${imgs.length} imgs matched by srcPrefix（其余走 fallback：HTML width attr / plan default）`);
    }
  }

  // === 1. 决定文档标题 ===
  const title = pickTitle($, plan) || 'Untitled';

  // === 1.5 应用 plan.boundaryAnnotations（v0.2：视觉理解 plan 驱动容器映射）===
  // 必须在黑名单剥除之前——否则 `<aside class="margin-note">` 这种"在 banned 容器里
  // 但被 agent 视觉理解为 callout" 的节点会被先剥掉、找不到。
  //
  // 实现见后面（先 hoist 一份 reference）。这里只标记顺序意图。
  applyBoundaryAnnotations($, plan, warnings, stats);

  // === 2. 剥掉黑名单标签（但保留有 data-mode4-as 标注的节点 + 其子树）===
  const banned = new Set([...ALWAYS_DROP, ...plan.bannedTags]);
  $('*').each((_, el) => {
    if (!banned.has(el.tagName?.toLowerCase())) return;
    // 自己有 mode4 标注 → 保留
    if ($(el).attr('data-mode4-as')) return;
    // 子树里有 mode4 标注 → 也保留（agent 可能标注了内层节点）
    if ($(el).find('[data-mode4-as]').length > 0) return;
    stats.droppedTags[el.tagName.toLowerCase()] = (stats.droppedTags[el.tagName.toLowerCase()] || 0) + 1;
    $(el).remove();
  });

  // === 3. 取正文容器 ===
  // 优先 <main> > <article> > <body>。bench/full-report 都是 body 直接含内容。
  let root = $('main').first();
  if (root.length === 0) root = $('article').first();
  if (root.length === 0) root = $('body').first();
  if (root.length === 0) root = $.root();

  // === 4. 递归 emit ===
  const ctx = { $, plan, warnings, stats, mediaTasks };
  const body = emitChildren(root[0], ctx);

  // === 5. 拼最终 DocxXML（含 <title>）===
  const docxxml = `<title>${escapeText(title)}</title>\n${body}`;

  // === 6. v0.5d 触发条件预警：DocxXML 体积接近服务端解析上限 ===
  // 飞书 docs +create 服务端经验阈值：~200KB DocxXML 解析稳定，500KB+ 可能卡。
  // 真碰到 400 错误时记下 sample，触发 v0.5d 全自建 IR + batch_create fallback 实现。
  const sizeLimit = plan.v05dWarnAtBytes || 200_000;
  if (docxxml.length > sizeLimit) {
    warnings.push(
      `DocxXML 体积 ${(docxxml.length / 1024).toFixed(1)}KB 超过 ${(sizeLimit / 1024).toFixed(0)}KB 阈值 — ` +
      `若 +create 失败需考虑 v0.5d 全自建 IR + batch_create fallback（ROADMAP §v0.5d）`
    );
    stats.dx_size_warning = true;
  }

  return { docxxml, title, warnings, stats, mediaTasks };
}

// ===========================================================================
// plan.boundaryAnnotations 应用 — 在黑名单剥除前做
// ===========================================================================

/**
 * 把 plan.boundaryAnnotations 里的 CSS selector 命中节点，附加 data-mode4-as 等属性。
 *
 * schema: { [cssSelector]: { type: 'grid'|'column'|'callout'|'whiteboard-mermaid', ...attrs } }
 * attrs（按 type 解释）：
 *   callout: emoji / backgroundColor / borderColor
 *   column:  ratio
 *   whiteboard-mermaid: dsl
 *   grid:    无（子项 column 各自带 ratio）
 */
function applyBoundaryAnnotations($, plan, warnings, stats) {
  let annotationCount = 0;
  for (const [selector, ann] of Object.entries(plan.boundaryAnnotations || {})) {
    try {
      $(selector).each((_, el) => {
        const $el = $(el);
        $el.attr('data-mode4-as', ann.type);
        if (ann.emoji) $el.attr('data-mode4-emoji', ann.emoji);
        if (ann.backgroundColor) $el.attr('data-mode4-bgcolor', ann.backgroundColor);
        if (ann.borderColor) $el.attr('data-mode4-bordercolor', ann.borderColor);
        if (ann.ratio != null) $el.attr('data-mode4-ratio', String(ann.ratio));
        if (ann.dsl) $el.attr('data-mode4-dsl', ann.dsl);
        // v0.3a: joinWith — callout 内多 inline 兄弟节点用可见分隔符串联（飞书吃掉 inline 间空白）
        if (ann.joinWith) $el.attr('data-mode4-joinwith', ann.joinWith);
        // v0.5c: snapshot-fallback 需要记原 selector，index.mjs 据此区块截图
        if (ann.type === 'snapshot-fallback') {
          $el.attr('data-mode4-selector', selector);
          if (ann.alt) $el.attr('data-mode4-alt', ann.alt);
        }
        annotationCount++;
      });
    } catch (e) {
      warnings.push(`boundaryAnnotations selector failed: ${selector} (${e.message})`);
    }
  }
  stats.annotationsApplied = annotationCount;
}

// ===========================================================================
// 内部：节点 emit
// ===========================================================================

function emit(node, ctx) {
  if (!node) return '';

  // 文本节点：转义。HTML 源的格式化空白（连续空格 + 换行）丢弃；只有"有内容的"文本节点才保留。
  if (node.type === 'text') {
    const raw = node.data || '';
    // 纯空白（含换行）→ 缩成一个空格保留语境，但不输出 <br/>
    if (/^\s*$/.test(raw)) return ' ';
    return escapeText(raw);
  }

  // 注释 / 指令：忽略
  if (node.type === 'comment' || node.type === 'directive') return '';

  // 元素节点
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') {
    return emitChildren(node, ctx);
  }

  const tag = (node.tagName || node.name || '').toLowerCase();
  if (!tag) return emitChildren(node, ctx);

  ctx.stats.tagCounts[tag] = (ctx.stats.tagCounts[tag] || 0) + 1;

  // === 黑名单（双重保险，但 plan 标注 escape）===
  // 如果是 banned tag 但子树里含 data-mode4-as 标注，穿透 children；不输出自己的 tag。
  // 否则真丢。
  if (ALWAYS_DROP.has(tag) || ctx.plan.bannedTags.includes(tag)) {
    const hasAnnotation = ctx.$(node).find('[data-mode4-as]').length > 0;
    if (hasAnnotation) return emitChildren(node, ctx);
    return '';
  }

  // === v0.2: data-mode4-as 视觉理解标注覆盖 ===
  // plan.boundaryAnnotations 阶段已把 selector 命中的节点加了 data-mode4-as
  const mode4As = node.attribs?.['data-mode4-as'];
  if (mode4As) {
    return emitAnnotated(node, mode4As, ctx);
  }

  // === 容器穿透 ===
  if (PASS_THROUGH.has(tag)) {
    return emitChildren(node, ctx);
  }

  // === <img> 特殊处理 ===
  if (tag === 'img') {
    return emitImg(node, ctx);
  }

  // === <pre><code> 代码块特殊处理 ===
  if (tag === 'pre') {
    return emitPre(node, ctx);
  }

  // === <dl> 定义列表 (dt + dd 对) ===
  // dl 本身已经走 PASS_THROUGH（穿透）。这里处理 dt / dd 单独 emit：
  //   dt → <p><b>term</b></p>      term 加粗成段
  //   dd → <p>definition</p>       definition 普通段
  // 在 callout 内被 joinWith 串联时也工作（每段独立 emit，joinWith 插入分隔符）。
  if (tag === 'dt') {
    const children = emitChildren(node, ctx);
    return `<p><b>${children}</b></p>`;
  }
  if (tag === 'dd') {
    const children = emitChildren(node, ctx);
    return `<p>${children}</p>`;
  }

  // === 标签重命名 ===
  const targetTag = RENAME_MAP[tag] || tag;

  // === 直接映射 ===
  if (DIRECT_MAP.has(targetTag)) {
    return wrapTag(targetTag, node, ctx);
  }

  // === 未知标签 ===
  if (ctx.plan.unknownTagStrategy === 'strict') {
    ctx.warnings.push(`unknown tag <${tag}>: stopped (strict mode)`);
    return `[unknown:${tag}]`;
  } else {
    // lenient：丢标签留 children
    ctx.warnings.push(`unknown tag <${tag}>: passed through children`);
    return emitChildren(node, ctx);
  }
}

function emitChildren(node, ctx) {
  if (!node || !node.children) return '';
  return node.children.map(c => emit(c, ctx)).join('');
}

/**
 * v0.3a: 用可见分隔符串联子元素 emit 结果。
 *
 * 解决 callout 内多 inline 兄弟节点（如 `.card-lvl` 内 6 个 <span class="lab">）
 * 被飞书吃掉空白后粘连成 "CurrentC2-C3PotentialC4EvidenceA" 的问题。
 *
 * 行为：
 * - 只对 tag 类型子节点（element）插入分隔，跳过 text/comment
 * - 每个 tag 子节点 emit 后，如果下一个非空白兄弟也是 tag，则插入分隔符
 */
function emitChildrenJoined(node, ctx, sep) {
  if (!node || !node.children) return '';
  const parts = [];
  const tagChildren = node.children.filter(c => c.type === 'tag');
  for (let i = 0; i < tagChildren.length; i++) {
    parts.push(emit(tagChildren[i], ctx));
  }
  return parts.join(escapeText(sep));
}

/**
 * v0.2: 处理 plan.boundaryAnnotations 覆盖的节点。
 * 节点的 data-mode4-as 属性指示要变成什么 DocxXML 容器。
 */
function emitAnnotated(node, mode4As, ctx) {
  const a = node.attribs || {};
  const joinWith = a['data-mode4-joinwith'];  // v0.3a: 节点级分隔符（callout/grid 等容器内用）
  const children = joinWith
    ? emitChildrenJoined(node, ctx, joinWith)
    : emitChildren(node, ctx);

  switch (mode4As) {
    case 'callout': {
      const rawEmoji = a['data-mode4-emoji'] || ctx.plan.defaultCalloutEmoji;
      // v0.5a：自动替换已知 fallback emoji（探针 W6Y6dEImAo5cUFxbFlRcb0hBnvf 实证）
      const substitutes = ctx.plan.emojiFallbackSubstitutes || {};
      const emoji = substitutes[rawEmoji] || rawEmoji;
      if (emoji !== rawEmoji) {
        ctx.warnings.push(`emoji "${rawEmoji}" 已知被服务端 fallback 为 💡，自动替换为 "${emoji}"（plan.emojiFallbackSubstitutes 覆盖）`);
      }
      const bg = a['data-mode4-bgcolor'] || ctx.plan.defaultCalloutBackgroundColor;
      const border = a['data-mode4-bordercolor'];
      const attrs = [['emoji', emoji], ['background-color', bg]];
      if (border) attrs.push(['border-color', border]);
      return `<callout ${attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}>${children}</callout>`;
    }
    case 'grid': {
      return `<grid>${children}</grid>`;
    }
    case 'column': {
      const ratio = a['data-mode4-ratio'] || '0.5';
      return `<column width-ratio="${escapeAttr(ratio)}">${children}</column>`;
    }
    case 'whiteboard-mermaid':
    case 'whiteboard-plantuml': {
      const type = mode4As === 'whiteboard-mermaid' ? 'mermaid' : 'plantuml';
      // DSL 来源优先级：data-mode4-dsl > 子节点纯文本（pre/code 的内容）
      const dsl = a['data-mode4-dsl'] || cheerioTextOf(node).trim();
      // **保留换行**：mermaid/plantuml DSL 节点边界靠 \n 切分；
      // escapeText 会把换行 collapse 成空格（适用于 paragraph 内文本），
      // 这里必须用保留换行的版本。
      return `<whiteboard type="${type}">${escapeXmlPreserveLines(dsl)}</whiteboard>`;
    }
    case 'drop': {
      // 显式丢弃（agent 标记"这块装饰丢就行"）
      return '';
    }
    case 'snapshot-fallback': {
      // v0.5c: emit placeholder + 排个 type=snapshot 的 mediaTask；
      // index.mjs 在 +create 之前/之后调 snapshotRegion 把 selector 区块截成 PNG，
      // 然后 upload-media.mjs 走和 v0.2c 本地 PNG 同样的 +media-insert 路径。
      const selector = a['data-mode4-selector'] || '';
      const alt = a['data-mode4-alt'] || '装饰区块（截图兜底）';
      const id = (ctx.mediaTasks.length + 1).toString().padStart(3, '0');
      const marker = `「IMG_PLACEHOLDER_${id}」`;
      const placeholderText = `${marker} [图片：${alt}]`;
      ctx.mediaTasks.push({
        id,
        marker,
        placeholderText,
        type: 'snapshot',
        selector,
        alt,
      });
      ctx.stats.snapshotFallbacks = (ctx.stats.snapshotFallbacks || 0) + 1;
      return `<p>${escapeText(placeholderText)}</p>`;
    }
    default: {
      ctx.warnings.push(`unknown data-mode4-as value "${mode4As}", treated as pass-through`);
      return children;
    }
  }
}

function wrapTag(tag, node, ctx) {
  const children = emitChildren(node, ctx);
  const attrs = pickAttrs(tag, node, ctx);

  // 自闭合：<br/> / <hr/> / <col/>
  if (tag === 'br' || tag === 'hr' || tag === 'col') {
    return `<${tag}${attrs}/>`;
  }
  return `<${tag}${attrs}>${children}</${tag}>`;
}

/**
 * 按目标 DocxXML tag 决定保留哪些属性。
 * DocxXML 不接受任意 HTML class/style 属性，只接受 §3.1 列出的扩展属性。
 */
function pickAttrs(tag, node, ctx) {
  const attribs = node.attribs || {};
  const keep = [];

  // <a>: href / target
  if (tag === 'a' && attribs.href) {
    keep.push(['href', attribs.href]);
  }

  // <li seq="auto"> 在 <ol> 内
  if (tag === 'li') {
    const parentTag = node.parent?.tagName?.toLowerCase();
    if (parentTag === 'ol') keep.push(['seq', 'auto']);
  }

  // <td colspan/rowspan>
  if ((tag === 'td' || tag === 'th') && attribs.colspan) {
    keep.push(['colspan', attribs.colspan]);
  }
  if ((tag === 'td' || tag === 'th') && attribs.rowspan) {
    keep.push(['rowspan', attribs.rowspan]);
  }

  // <col span/width>
  if (tag === 'col') {
    if (attribs.span) keep.push(['span', attribs.span]);
    if (attribs.width) keep.push(['width', attribs.width]);
  }

  // v0.5b: <span> 解析 style 的 color / background-color
  // DocxXML §3.2 接受命名色 (red/blue/...) / light-X / medium-X / rgb(r,g,b)
  if (tag === 'span') {
    const style = attribs.style || '';
    const textColor = pickStyleColor(style, 'color');
    const bgColor = pickStyleColor(style, 'background-color');
    if (textColor) {
      keep.push(['text-color', textColor]);
      ctx.stats.spansColored = (ctx.stats.spansColored || 0) + 1;
    }
    if (bgColor) {
      keep.push(['background-color', bgColor]);
      ctx.stats.spansBgColored = (ctx.stats.spansBgColored || 0) + 1;
    }
  }

  return keep.length === 0 ? '' : ' ' + keep.map(([k, v]) => `${k}="${escapeAttr(String(v))}"`).join(' ');
}

/**
 * v0.5b: 从 inline style 抽取颜色值，归一化为 DocxXML 接受的格式。
 *
 * DocxXML §3.2 接受三种 color 写法：
 *   - 命名色：red / orange / yellow / green / blue / purple / gray
 *     + 派生：light-red / medium-blue / 等
 *   - rgb(r, g, b) 三元组
 *
 * HTML 源里常见：#hex / rgb()/rgba() / 命名色 / var()/hsl()/oklch()。
 * 简化策略：
 *   - 命名色（CSS 标准颜色名）→ 优先映射到 DocxXML 命名色集合，找不到映射时回退 rgb()
 *   - #hex（3/6 位）→ 解析为 rgb(r, g, b)
 *   - rgb()/rgba() → 重新格式化（去 alpha；DocxXML 不支持透明）
 *   - 其他（var/hsl/oklch/calc）→ 返回 null 跳过
 */
function pickStyleColor(style, prop) {
  if (!style) return null;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(style);
  if (!m) return null;
  const v = m[1].trim();
  if (!v || v === 'inherit' || v === 'initial' || v === 'unset' || v === 'transparent' || v === 'currentColor') return null;
  // #hex
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
    const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
    const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // rgb() / rgba()
  const rgb = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,\/]\s*[\d.]+%?)?\s*\)$/i.exec(v);
  if (rgb) {
    return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
  }
  // 命名色
  const named = /^[a-z]+$/i.exec(v);
  if (named) {
    const lower = v.toLowerCase();
    const docxxmlNamed = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray', 'black', 'white']);
    if (docxxmlNamed.has(lower)) return lower;
    // CSS 标准命名色 → 近似 rgb 兜底（只覆盖最常见几个）
    const fallback = { darkred: 'rgb(139, 0, 0)', darkblue: 'rgb(0, 0, 139)', darkgreen: 'rgb(0, 100, 0)', crimson: 'rgb(220, 20, 60)' };
    return fallback[lower] || null;
  }
  // var() / hsl() / oklch() / 其他 → 跳过
  return null;
}

// ===========================================================================
// <img> 处理
// ===========================================================================

function emitImg(node, ctx) {
  const src = node.attribs?.src || '';
  if (!src) {
    ctx.warnings.push('img without src: skipped');
    return '';
  }

  // 远程 URL：直接转 DocxXML <img href>（服务端拉取）
  if (/^https?:\/\//i.test(src)) {
    ctx.stats.imgRemote += 1;
    const { width, height } = pickImgDimensions(node, ctx);
    const alt = node.attribs?.alt || '';
    const attrs = [
      ['href', src],
      ['width', String(width)],
      ['height', String(height)],
    ];
    if (alt) attrs.push(['caption', alt]);
    return `<img ${attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}/>`;
  }

  // base64 / 本地路径：v0.2c 走 +media-insert 后置处理
  // 这里 emit 一个**唯一编号 placeholder** paragraph，后续 index.mjs 通过
  // selection-with-ellipsis 匹配 marker 完成插图 + 删占位两步。
  const alt = node.attribs?.alt || '图片';
  const { width, height } = pickImgDimensions(node, ctx);
  // v0.5e: 标记 width 是否来自 puppeteer 实测，让 upload-media 知道是否信任此值做 resize
  const widthIsRendered = !!node.attribs?.['data-render-width'];
  const id = (ctx.mediaTasks.length + 1).toString().padStart(3, '0');
  // marker 设计：用窄宽字符 + ID 唯一；后跟可读描述方便 lark-cli 抓 full block 文本删除
  const marker = `「IMG_PLACEHOLDER_${id}」`;
  const placeholderText = `${marker} [图片：${alt}]`;

  // src 分类：data: URI vs 本地路径
  const isBase64 = /^data:image\//i.test(src);
  if (isBase64) ctx.stats.imgBase64 += 1; else ctx.stats.imgLocal += 1;

  ctx.mediaTasks.push({
    id,
    marker,
    placeholderText,
    src,
    alt,
    width,
    height,
    widthIsRendered,
    type: isBase64 ? 'base64' : 'local',
  });

  // p 块：上层 phase 4（index.mjs）会 +media-insert --before --selection-with-ellipsis marker，
  // 然后 +update --mode delete_range --selection-with-ellipsis placeholderText 删此 paragraph
  return `<p>${escapeText(placeholderText)}</p>`;
}

function pickImgDimensions(node, ctx) {
  const { imageDefaultWidth, imageDefaultHeight } = ctx.plan;

  // 0. v0.5e: puppeteer 实测的 layout 渲染宽度（最高优先级）
  const renderW = parseInt(node.attribs?.['data-render-width'], 10);
  const renderH = parseInt(node.attribs?.['data-render-height'], 10);
  if (renderW > 0 && renderH > 0) return { width: renderW, height: renderH };

  // 1. 显式 width/height 属性
  const w = parseInt(node.attribs?.width, 10);
  const h = parseInt(node.attribs?.height, 10);
  if (w > 0 && h > 0) return { width: w, height: h };
  if (w > 0) return { width: w, height: Math.round((w * imageDefaultHeight) / imageDefaultWidth) };
  if (h > 0) return { width: Math.round((h * imageDefaultWidth) / imageDefaultHeight), height: h };

  // 2. CSS style 里的 width/height（粗解析）
  const style = node.attribs?.style || '';
  const styleW = style.match(/(?:^|;)\s*width\s*:\s*(\d+)\s*px/i)?.[1];
  const styleH = style.match(/(?:^|;)\s*height\s*:\s*(\d+)\s*px/i)?.[1];
  if (styleW && styleH) return { width: parseInt(styleW, 10), height: parseInt(styleH, 10) };

  // 3. 兜底
  return { width: imageDefaultWidth, height: imageDefaultHeight };
}

// ===========================================================================
// <pre><code> 处理
// ===========================================================================

function emitPre(node, ctx) {
  // 找第一个 <code> 子节点
  const codeChild = (node.children || []).find(c => c.tagName?.toLowerCase() === 'code');
  if (!codeChild) {
    // <pre> 直接含文本（非标准但常见）
    const text = emitChildren(node, ctx);
    return `<pre><code>${text}</code></pre>`;
  }

  // 从 class="language-xxx" 提取 lang
  const codeClass = codeChild.attribs?.class || '';
  const langMatch = codeClass.match(/language-(\w+)/);
  const lang = langMatch ? langMatch[1] : '';

  // 提取代码内容（不递归 emit——保留原始文本，只转义；代码块里换行必须保留为 <br/>）
  const codeText = cheerioTextOf(codeChild);
  const escaped = escapeCodeText(codeText);

  const langAttr = lang ? ` lang="${escapeAttr(lang)}"` : '';
  return `<pre${langAttr}><code>${escaped}</code></pre>`;
}

function cheerioTextOf(node) {
  let out = '';
  function walk(n) {
    if (n.type === 'text') out += n.data || '';
    else if (n.children) n.children.forEach(walk);
  }
  walk(node);
  return out;
}

// ===========================================================================
// 标题选取
// ===========================================================================

function pickTitle($, plan) {
  if (plan.titleStrategy !== 'auto') return null;
  const t = $('title').first().text().trim();
  if (t) return t;
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;
  return null;
}

// ===========================================================================
// 转义（§3.5）
// ===========================================================================

/**
 * 常规文本节点转义：把所有连续空白（含换行）压缩为单空格。
 * 原因：HTML 文本节点的换行通常是源代码格式化产生的，不是用户语义换行。
 * 用户的真正换行用 <br> 标签——那由 emitChildren → emit(br tag) 处理。
 */
function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\s\n\r]+/g, ' ');  // 关键：连续空白 → 单空格，不输出 <br/>
}

/**
 * XML 转义但保留换行 — 给 whiteboard mermaid/plantuml DSL 用，
 * DSL 节点边界靠 \n 切分，不能 collapse。
 */
function escapeXmlPreserveLines(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 代码块文本转义：保留换行为 <br/>（飞书代码块按行渲染）。
 */
function escapeCodeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br/>');
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

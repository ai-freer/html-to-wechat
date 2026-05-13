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
]);

/**
 * 主入口：HTML 字符串 + plan → DocxXML 字符串。
 *
 * @param {string} rawHtml
 * @param {Partial<typeof DEFAULT_PLAN>} planArg
 * @returns {{ docxxml: string, title: string, warnings: string[], stats: object }}
 */
export function transform(rawHtml, planArg = {}) {
  if (!rawHtml || !rawHtml.trim()) {
    return { docxxml: '', title: 'Untitled', warnings: ['empty input'], stats: {} };
  }

  const plan = mergePlan(planArg);
  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  const warnings = [];
  const stats = { tagCounts: {}, droppedTags: {}, imgRemote: 0, imgPlaceholder: 0 };

  // === 1. 决定文档标题 ===
  const title = pickTitle($, plan) || 'Untitled';

  // === 2. 剥掉黑名单标签 ===
  const banned = new Set([...ALWAYS_DROP, ...plan.bannedTags]);
  $('*').each((_, el) => {
    if (banned.has(el.tagName?.toLowerCase())) {
      stats.droppedTags[el.tagName.toLowerCase()] = (stats.droppedTags[el.tagName.toLowerCase()] || 0) + 1;
      $(el).remove();
    }
  });

  // === 3. 取正文容器 ===
  // 优先 <main> > <article> > <body>。bench/full-report 都是 body 直接含内容。
  let root = $('main').first();
  if (root.length === 0) root = $('article').first();
  if (root.length === 0) root = $('body').first();
  if (root.length === 0) root = $.root();

  // === 4. 递归 emit ===
  const ctx = { $, plan, warnings, stats };
  const body = emitChildren(root[0], ctx);

  // === 5. 拼最终 DocxXML（含 <title>）===
  const docxxml = `<title>${escapeText(title)}</title>\n${body}`;

  return { docxxml, title, warnings, stats };
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

  // === 黑名单（双重保险）===
  if (ALWAYS_DROP.has(tag) || ctx.plan.bannedTags.includes(tag)) {
    return '';
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

  // <span> 不带任何属性时 v0.5 才支持 text-color / background-color，v0.1 跳过
  // 如果 HTML 源用 <span style="..."> 表达颜色，v0.1 阶段全部丢失（这是计划内）

  return keep.length === 0 ? '' : ' ' + keep.map(([k, v]) => `${k}="${escapeAttr(String(v))}"`).join(' ');
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

  // base64 / 本地路径 / 其他：v0.1 占位（v0.2 走 +media-insert）
  ctx.stats.imgPlaceholder += 1;
  const alt = node.attribs?.alt || '图片';
  ctx.warnings.push(`local/base64 img placeholder: ${alt}`);
  return `<p>[图片：${escapeText(alt)}]</p>`;
}

function pickImgDimensions(node, ctx) {
  const { imageDefaultWidth, imageDefaultHeight } = ctx.plan;

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

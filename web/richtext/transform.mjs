// HTML → 公众号富文本 · 1A 引擎（pure function）
//
// 范式 X-A/X-C 的执行层：transform(html, plan) → { html, text, stats, warnings }
//
// "1A 是纯函数" — 无 IO、无 LLM、无 UI 副作用。所有"长尾"决策都被 plan 吸收。
// 两个入口共享同一份代码：
//   - web/richtext/app.js（网页 UI）调用 transform(rendered, DEFAULT_PLAN)
//   - skills/html-to-wechat/scripts/runner.mjs（skill 路径）调用 transform(html, llmPlan)
//
// 见 docs/01-html-to-wechat-html.md §2 / §4。

import juice from 'https://esm.sh/juice@10';
// 注意：?v= cache buster — 同步 index.html / app.js 的版本号
import { DEFAULT_PLAN, mergePlan } from './default-plan.mjs?v=19';

/**
 * 主管线：HTML 字符串 + plan → 公众号兼容富文本 + 元数据
 *
 * 纯函数 — 不依赖 DOM 之外的全局状态、不发起网络请求、不操作 clipboard。
 * 在浏览器和 Node + jsdom 下行为应一致（Node 端运行需注入 DOMParser polyfill）。
 *
 * @param {string} rawHtml — 输入 HTML
 * @param {Partial<typeof DEFAULT_PLAN>} planArg — 可选 plan；缺省字段从 DEFAULT_PLAN 合并
 * @returns {{ html: string, text: string, stats: object|null, warnings: Array, error?: string }}
 */
export function transform(rawHtml, planArg = {}) {
  if (!rawHtml || !rawHtml.trim()) {
    return { html: '', text: '', stats: null, warnings: [] };
  }
  const plan = mergePlan(planArg);

  // 1. CSS 内联（juice）
  let inlinedHtml;
  try {
    inlinedHtml = juice(rawHtml, {
      removeStyleTags: true,
      preserveImportant: true,
      applyAttributesTableElements: true,
      applyStyleTags: true,
    });
  } catch (e) {
    return { html: '', text: '', stats: null, error: 'CSS 内联失败：' + e.message, warnings: [] };
  }

  // 2. 解析为 DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(inlinedHtml, 'text/html');

  const counters = {
    scripts: 0,
    iframes: 0,
    forms: 0,
    inputs: 0,
    links: 0,
    ids: 0,
    images: 0,
    svgImages: 0,
    metas: 0,
    chromeStripped: 0,
    extractedFrom: null,
    layoutNormalized: 0,
    flexToTable: 0,
    tablesMerged: 0,
    tablesSized: 0,
    directivesApplied: 0,
    directivesMissed: 0,
    // CSS 修复层（v0.2 引入）
    unknownPropsStripped: 0,
    cssFunctionsFlattened: 0,
    viewportUnitsConverted: 0,
    backgroundsFlattened: 0,
    alphaBackgroundsFlattened: 0,
    dlsConverted: 0,
  };

  // 2.5 CSS 修复层（公众号兼容性）
  //     这一组必须在所有 DOM 操作之前做，因为它修的是 inline style 字符串本身。
  //     顺序：剥不认的属性 → 展平 CSS 函数 → 换算 vw/vh → alpha-blend 半透明背景
  //
  //     为什么提前：公众号对 inline style 是"一条 declaration 不认就整条丢"，
  //     如果 style="background:#0d1416; min-height:92vh; overflow:hidden" 里
  //     min-height/overflow 被整条丢规则连带，background 也会一起没。
  //     所以先把"不认的"剥干净，给 background/color/font-size 这些关键属性留活路。
  if (plan.stripUnknownCssProps.enabled) {
    stripUnknownCssProps(doc, plan.stripUnknownCssProps, counters);
  }
  if (plan.cssFunctionFlatten.enabled) {
    flattenCssFunctions(doc, counters);
  }
  if (plan.viewportUnits.enabled) {
    convertViewportUnits(doc, plan.viewportUnits, counters);
  }
  // ★ flattenBackgrounds 必须在 flattenAlphaBackgrounds 之前：
  //   gradient / var 不展平 → background 整条丢 → alpha-blend 父链断 → 文字消失
  if (plan.flattenBackgrounds.enabled) {
    flattenBackgrounds(doc, plan.flattenBackgrounds, counters);
  }
  if (plan.flattenAlphaBackgrounds.enabled) {
    flattenAlphaBackgrounds(doc, plan.flattenAlphaBackgrounds, counters);
  }

  // 3. 删除完全不允许的标签（plan.bannedTags）
  const bannedCounters = {
    script: 'scripts', iframe: 'iframes', form: 'forms',
    input: 'inputs', link: 'links', meta: 'metas',
  };
  plan.bannedTags.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => {
      const k = bannedCounters[tag];
      if (k) counters[k]++;
      el.remove();
    });
  });

  // 3b. 删除残留 <style>（juice removeStyleTags 已处理大部分）
  doc.querySelectorAll('style').forEach(el => el.remove());

  // 4. 应用节点级 directives（LLM 决策落地入口）
  //    default plan 的 directives 为 []，这一步是 no-op；
  //    skill 路径传入的 plan 在此处把"对比关系翻译成文字层"等指令落地。
  if (Array.isArray(plan.directives) && plan.directives.length) {
    plan.directives.forEach((d, idx) => {
      try {
        const targets = doc.querySelectorAll(d.selector);
        if (targets.length === 0) {
          counters.directivesMissed++;
          return;
        }
        targets.forEach((el, nodeIdx) => {
          applyDirective(doc, el, d, nodeIdx);
          counters.directivesApplied++;
        });
      } catch (e) {
        counters.directivesMissed++;
        // 不抛错，记 warning 不让一条坏 directive 毁掉整次转换
      }
    });
  }

  // 5. 提取正文 / 剥离页面骨架（plan.extractMain）
  if (plan.extractMain && doc.body) {
    let extracted = null;
    const articles = [...doc.querySelectorAll('article')];
    if (articles.length) {
      const best = articles.reduce((a, b) =>
        b.textContent.length > a.textContent.length ? b : a
      );
      if (best.textContent.trim().length > plan.extractMainMinChars) extracted = best;
    }
    if (!extracted) {
      const m = doc.querySelector('main, [role="main"]');
      if (m && m.textContent.trim().length > plan.extractMainMinChars) extracted = m;
    }
    if (extracted) {
      const wrap = doc.createElement('body');
      wrap.appendChild(extracted.cloneNode(true));
      doc.body.replaceWith(wrap);
      counters.extractedFrom = extracted.tagName.toLowerCase();
    } else {
      plan.chromeSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => {
          el.remove();
          counters.chromeStripped++;
        });
      });
      if (doc.body) {
        [...doc.body.children].forEach(el => {
          const tag = el.tagName.toLowerCase();
          if (tag === 'header' || tag === 'footer') {
            el.remove();
            counters.chromeStripped++;
          }
        });
      }
    }
  }

  // 6. 多列 flex/grid → <table>（plan.multiColConversion）
  if (plan.multiColConversion.enabled) {
    convertMultiColToTable(doc, plan.multiColConversion, counters);
  }

  // 6b. <dl><div><dt><dd> → <table>（plan.dlToTable）
  //     公众号会把 dt/dd 当 list item 加 ▪ bullet，必须重写。
  if (plan.dlToTable.enabled) {
    convertDlToTable(doc, plan.dlToTable, counters);
  }

  // 7. 同结构表合并（plan.tableMerging）
  if (plan.tableMerging.enabled) {
    mergeUniformTables(doc, plan.tableMerging, counters);
  }

  // 8. 剩余 flex/grid → block；position absolute/fixed/sticky 删除时
  //    同步删 top/right/bottom/left（孤儿 offset 无意义）。
  //    inset 由 stripUnknownCssProps 在 2.5 步统一删。
  doc.querySelectorAll('[style]').forEach(el => {
    const before = el.getAttribute('style') || '';
    let after = before;
    after = after.replace(
      /display\s*:\s*(inline-)?(flex|grid)\s*(!important)?\s*;?/gi,
      (_m, inline) => {
        counters.layoutNormalized++;
        return `display: ${inline ? 'inline-block' : 'block'};`;
      }
    );
    // position absolute/fixed/sticky 删除时连带删 top/right/bottom/left
    const hasAbsPos = /position\s*:\s*(absolute|fixed|sticky)/i.test(after);
    after = after.replace(
      /position\s*:\s*(absolute|fixed|sticky)\s*(!important)?\s*;?/gi,
      () => {
        counters.layoutNormalized++;
        return '';
      }
    );
    if (hasAbsPos) {
      after = after.replace(/\b(top|right|bottom|left)\s*:[^;]+;?/gi, () => {
        counters.layoutNormalized++;
        return '';
      });
    }
    if (after !== before) {
      const trimmed = after.replace(/;\s*;/g, ';').trim();
      if (trimmed) el.setAttribute('style', trimmed);
      else el.removeAttribute('style');
    }
  });

  // 9. 表格列宽估算（plan.tableColumnSizing）
  if (plan.tableColumnSizing.enabled) {
    sizeAllTables(doc, plan.tableColumnSizing, counters);
  }

  // 10. 删除所有元素的 id 属性（plan.removeIds）
  if (plan.removeIds) {
    doc.querySelectorAll('[id]').forEach(el => {
      counters.ids++;
      el.removeAttribute('id');
    });
  }

  // 11. 统计图片
  doc.querySelectorAll('img').forEach(() => counters.images++);
  doc.querySelectorAll('svg image').forEach(() => counters.svgImages++);

  // 12. 提取 body 内容
  const bodyHtml = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
  const cleanedBody = bodyHtml.trim();

  // 13. 纯文本 fallback（用于 text/plain MIME）
  const textVersion = doc.body
    ? doc.body.textContent.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : '';

  // 14. 警告（按级别排序：ok 在前，warn 在后；隐藏 0 计数）
  const warnings = buildWarnings(counters);

  return {
    html: cleanedBody,
    text: textVersion,
    stats: {
      bytes: typeof Blob !== 'undefined' ? new Blob([cleanedBody]).size : cleanedBody.length,
      chars: cleanedBody.length,
      counters,
    },
    warnings,
  };
}

// ============================================================
//                  Directive application
// ============================================================

/**
 * 单条 directive 作用在单个目标节点上。
 * action 集合见 docs/01 §3。
 * 注意：本函数没有副作用之外的返回值；错误由调用方捕获。
 */
function applyDirective(doc, el, d, nodeIdx) {
  switch (d.action) {
    case 'unwrap': {
      // 删除元素自身，保留子节点
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      break;
    }
    case 'remove': {
      el.remove();
      break;
    }
    case 'prepend-text': {
      const text = interpolate(d.content || '', el, nodeIdx);
      const node = wrapText(doc, text, d.format || 'p');
      el.insertBefore(node, el.firstChild);
      break;
    }
    case 'append-text': {
      const text = interpolate(d.content || '', el, nodeIdx);
      const node = wrapText(doc, text, d.format || 'p');
      el.appendChild(node);
      break;
    }
    case 'wrap-section': {
      // 在元素前插入 heading（按 headingTemplate 模板）
      const text = interpolate(d.headingTemplate || 'Section {{index}}', el, nodeIdx);
      const h = doc.createElement(d.headingLevel || 'h3');
      h.textContent = text;
      el.parentNode.insertBefore(h, el);
      break;
    }
    case 'lighten-bg': {
      const style = el.getAttribute('style') || '';
      const next = style
        .replace(/background(-color)?\s*:[^;]+;?/gi, '')
        .replace(/color\s*:[^;]+;?/gi, '');
      el.setAttribute('style', (next + ';background-color:#fff;color:#1c1917').replace(/^;+/, ''));
      break;
    }
    case 'darken-bg': {
      const style = el.getAttribute('style') || '';
      const next = style.replace(/background(-color)?\s*:[^;]+;?/gi, '');
      el.setAttribute('style', (next + ';background-color:#1c1917;color:#fafaf9').replace(/^;+/, ''));
      break;
    }
    case 'flatten': {
      // 把单子级嵌套盒拍平
      while (el.children.length === 1 && el.firstElementChild.tagName === 'DIV') {
        const inner = el.firstElementChild;
        while (inner.firstChild) el.insertBefore(inner.firstChild, inner);
        inner.remove();
      }
      break;
    }
    default:
      // 未知 action 不报错，但不应用（让上层 directivesMissed 自然累加是另一回事）
      break;
  }
}

/** {{data-foo}} → el.dataset.foo；{{index}} → nodeIdx + 1；{{title}} → el.textContent 首段 */
function interpolate(tpl, el, nodeIdx) {
  return tpl
    .replace(/\{\{index\}\}/g, String(nodeIdx + 1))
    .replace(/\{\{data-([\w-]+)\}\}/g, (_, k) => {
      const camel = k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      return (el.dataset && el.dataset[camel]) || '';
    })
    .replace(/\{\{title\}\}/g, () => {
      const t = el.querySelector('h1,h2,h3,h4,h5,h6,strong,b');
      return (t && t.textContent.trim()) || el.textContent.trim().slice(0, 30);
    });
}

function wrapText(doc, text, format) {
  const tag = /^h[1-6]$/i.test(format) ? format.toLowerCase() : (format === 'strong' ? 'strong' : 'p');
  const n = doc.createElement(tag);
  n.textContent = text;
  return n;
}

// ============================================================
//          Multi-col flex/grid → <table> conversion
// ============================================================

function convertMultiColToTable(doc, cfg, counters) {
  const detectMultiCol = (style, kidCount) => {
    if (kidCount < cfg.minKids || kidCount > cfg.maxKids) return null;
    if (/display\s*:\s*flex(?!\w)/i.test(style)) {
      if (/flex-direction\s*:\s*column/i.test(style)) return null;
      if (/flex-wrap\s*:\s*wrap/i.test(style)) return null;
      return { kind: 'flex', widths: [] };
    }
    if (/display\s*:\s*grid(?!\w)/i.test(style)) {
      const m = /grid-template-columns\s*:\s*([^;]+)/i.exec(style);
      if (!m) return null;
      const ctc = m[1].trim();
      // case A: repeat(N, ...) — 显式 N 列。child 数应等于 N 才转。
      //         列宽信息（minmax/fr/...）公众号都不认，统一均分。
      const repeatM = /repeat\s*\(\s*(\d+)\s*,/i.exec(ctc);
      if (repeatM) {
        const n = parseInt(repeatM[1], 10);
        if (n !== kidCount) return null;
        return { kind: 'grid', widths: null };  // null = 均分
      }
      // case B: 显式列定义（"100px 1fr 2fr" / "1fr 1fr"），depth-aware split
      //         避免 minmax(0, 1fr) 内部空格被错切
      const tokens = [];
      let depth = 0, buf = '';
      for (const ch of ctc) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (/\s/.test(ch) && depth === 0) {
          if (buf) { tokens.push(buf); buf = ''; }
        } else buf += ch;
      }
      if (buf) tokens.push(buf);
      if (tokens.length !== kidCount) return null;
      return { kind: 'grid', widths: tokens };
    }
    return null;
  };

  const resolveCols = (cols) => {
    const ASSUMED = cfg.assumedDocWidth;
    const parsed = cols.map(c => {
      let m;
      if ((m = /^([\d.]+)px$/i.exec(c))) return { kind: 'px', v: parseFloat(m[1]) };
      if ((m = /^([\d.]+)fr$/i.exec(c))) return { kind: 'fr', v: parseFloat(m[1]) };
      if ((m = /^([\d.]+)%$/i.exec(c))) return { kind: 'pct', v: parseFloat(m[1]) };
      return { kind: 'auto' };
    });
    const totalFr = parsed.reduce((s, p) => s + (p.kind === 'fr' ? p.v : 0), 0);
    const usedPct = parsed.reduce((s, p) => {
      if (p.kind === 'pct') return s + p.v;
      if (p.kind === 'px') return s + (p.v / ASSUMED) * 100;
      return s;
    }, 0);
    const remaining = Math.max(0, 100 - usedPct);
    return parsed.map(p => {
      if (p.kind === 'px') return Math.round((p.v / ASSUMED) * 1000) / 10;
      if (p.kind === 'pct') return p.v;
      if (p.kind === 'fr' && totalFr > 0) return Math.round((p.v / totalFr) * remaining * 10) / 10;
      return null;
    });
  };

  const stripLayoutCss = (s) => s
    .replace(/display\s*:\s*(inline-)?(flex|grid)\s*(!important)?\s*;?/gi, '')
    .replace(/flex-(?:direction|wrap|grow|shrink|basis|flow)\s*:[^;]+;?/gi, '')
    .replace(/grid-[\w-]+\s*:[^;]+;?/gi, '')
    .replace(/(?:align|justify)-(?:items|content|self)\s*:[^;]+;?/gi, '')
    .replace(/gap\s*:[^;]+;?/gi, '')
    // 原容器 width 转到 table 后会覆盖 width:100% 导致溢出
    // （cssFunctionFlatten 把 min(760px, 100%) 变成 760px 后尤其明显）
    .replace(/(?<![\w-])(width|min-width|max-width)\s*:[^;]+;?/gi, '')
    .replace(/;\s*;+/g, ';').trim();

  const candidates = [...doc.querySelectorAll('[style]')].filter(el => {
    const s = el.getAttribute('style') || '';
    return /display\s*:\s*(inline-)?(flex|grid)/i.test(s);
  });

  candidates.forEach(el => {
    if (!el.isConnected) return;
    const style = el.getAttribute('style') || '';
    const kids = [...el.children];
    const info = detectMultiCol(style, kids.length);
    if (!info) return;

    // widths=null（repeat 路径）→ 均分；否则按显式列宽计算
    const colPcts = info.kind === 'grid' && info.widths
      ? resolveCols(info.widths)
      : kids.map(() => null);
    const verticalAlign = /align-items\s*:\s*center/i.test(style) ? 'middle' : 'top';

    const tbl = doc.createElement('table');
    tbl.setAttribute('width', '100%');
    tbl.setAttribute('cellpadding', '0');
    tbl.setAttribute('cellspacing', '0');
    tbl.setAttribute('border', '0');
    tbl.setAttribute(
      'style',
      ('width:100%;border-collapse:collapse;table-layout:fixed;' + stripLayoutCss(style)).replace(/;\s*;+/g, ';')
    );

    const hasAnyWidth = colPcts.some(p => p != null);
    if (hasAnyWidth) {
      const cg = doc.createElement('colgroup');
      colPcts.forEach(pct => {
        const col = doc.createElement('col');
        if (pct != null) {
          col.setAttribute('width', pct + '%');
          col.setAttribute('style', `width:${pct}%;`);
        }
        cg.appendChild(col);
      });
      tbl.appendChild(cg);
    }

    const tr = doc.createElement('tr');
    tbl.appendChild(tr);
    kids.forEach((child, i) => {
      const td = doc.createElement('td');
      const pct = colPcts[i];
      let tdStyle = `vertical-align:${verticalAlign};`;
      if (pct != null) {
        tdStyle += `width:${pct}%;`;
        td.setAttribute('width', pct + '%');
      }
      td.setAttribute('style', tdStyle);
      td.appendChild(child);
      tr.appendChild(td);
    });

    let replacement = tbl;
    if (el.tagName.toLowerCase() === 'a' && el.getAttribute('href')) {
      const a = doc.createElement('a');
      a.setAttribute('href', el.getAttribute('href'));
      a.setAttribute('style', 'text-decoration:none;color:inherit;display:block;');
      a.appendChild(tbl);
      replacement = a;
    }
    el.replaceWith(replacement);
    counters.flexToTable++;
  });
}

function mergeUniformTables(doc, cfg, counters) {
  const tablesInAnchor = [...doc.querySelectorAll('a > table')];
  const parentsToTry = new Set();
  tablesInAnchor.forEach(t => parentsToTry.add(t.parentElement.parentElement));
  parentsToTry.forEach(parent => {
    if (!parent || !parent.isConnected) return;
    const kids = [...parent.children];
    if (kids.length < cfg.minRows) return;
    const sigs = kids.map(k => {
      if (k.tagName.toLowerCase() !== 'a' || k.children.length !== 1) return null;
      const t = k.children[0];
      if (t.tagName.toLowerCase() !== 'table') return null;
      const tr = t.querySelector('tr');
      if (!tr) return null;
      return { table: t, rows: [tr], cellCount: tr.children.length };
    });
    if (!sigs.every(s => s)) return;
    const cellCount = sigs[0].cellCount;
    if (!sigs.every(s => s.cellCount === cellCount)) return;

    const merged = doc.createElement('table');
    merged.setAttribute('width', '100%');
    merged.setAttribute('cellpadding', '0');
    merged.setAttribute('cellspacing', '0');
    merged.setAttribute('border', '0');
    merged.setAttribute('style', sigs[0].table.getAttribute('style') || 'width:100%;border-collapse:collapse;table-layout:fixed;');
    const firstCg = sigs[0].table.querySelector('colgroup');
    if (firstCg) merged.appendChild(firstCg.cloneNode(true));

    sigs.forEach(s => {
      const tr = s.rows[0].cloneNode(true);
      merged.appendChild(tr);
    });

    kids.slice(1).forEach(k => k.remove());
    kids[0].replaceWith(merged);
    counters.tablesMerged += sigs.length;
  });
}

function sizeAllTables(doc, cfg, counters) {
  doc.querySelectorAll('table').forEach(tbl => {
    const trs = [...tbl.querySelectorAll('tr')].filter(tr => tr.closest('table') === tbl);
    if (trs.length === 0) return;
    const cellCounts = trs.map(tr => tr.children.length);
    const cellCount = Math.max(...cellCounts);
    if (cellCount < 2) return;
    const hasSpan = trs.some(tr => [...tr.children].some(c => c.hasAttribute('colspan') || c.hasAttribute('rowspan')));
    if (hasSpan) return;
    const cg = tbl.querySelector('colgroup');
    if (cg && [...cg.children].every(c => c.hasAttribute('width') || /width\s*:/i.test(c.getAttribute('style') || ''))) return;

    const colLens = new Array(cellCount).fill(0);
    trs.forEach(tr => {
      [...tr.children].forEach((cell, i) => {
        if (i >= cellCount) return;
        const len = (cell.textContent || '').trim().length || 1;
        if (len > colLens[i]) colLens[i] = len;
      });
    });
    const cappedLens = colLens.map(L => Math.min(L, cfg.textCellMaxLen));
    const totalCapped = cappedLens.reduce((a, b) => a + b, 0);
    const MIN_PCT = Math.floor(100 / cellCount * cfg.minColPctRatio);
    let pcts = cappedLens.map(L => Math.max(MIN_PCT, Math.round((L / totalCapped) * 100)));
    const sum = pcts.reduce((a, b) => a + b, 0);
    pcts = pcts.map(p => Math.round((p / sum) * 1000) / 10);

    let cgEl = cg;
    if (!cgEl) {
      cgEl = doc.createElement('colgroup');
      tbl.insertBefore(cgEl, tbl.firstChild);
    } else {
      cgEl.innerHTML = '';
    }
    pcts.forEach(pct => {
      const col = doc.createElement('col');
      col.setAttribute('width', pct + '%');
      col.setAttribute('style', `width:${pct}%;`);
      cgEl.appendChild(col);
    });

    if (!tbl.hasAttribute('width')) tbl.setAttribute('width', '100%');
    const tblStyle = tbl.getAttribute('style') || '';
    let newTblStyle = tblStyle;
    if (!/width\s*:/i.test(newTblStyle)) newTblStyle += ';width:100%';
    if (!/table-layout/i.test(newTblStyle)) newTblStyle += ';table-layout:fixed';
    if (!/border-collapse/i.test(newTblStyle)) newTblStyle += ';border-collapse:collapse';
    tbl.setAttribute('style', newTblStyle.replace(/^;+/, '').replace(/;\s*;+/g, ';'));

    const firstTr = trs[0];
    [...firstTr.children].forEach((cell, i) => {
      const pct = pcts[i];
      if (pct == null) return;
      if (!cell.hasAttribute('width')) cell.setAttribute('width', pct + '%');
      const cs = cell.getAttribute('style') || '';
      if (!/width\s*:/i.test(cs)) cell.setAttribute('style', (cs + ';width:' + pct + '%').replace(/^;+/, ''));
    });

    counters.tablesSized++;
  });
}

// ============================================================
//        CSS 修复层（公众号兼容性，v0.2 引入）
// ============================================================

/**
 * 把不认的 CSS 属性预先剥掉，避免连带砍掉 background/color 等关键属性。
 *
 * 公众号对 inline style 是"一条 declaration 不认就整条丢"——
 * style="background:#0d1416; min-height:92vh; overflow:hidden" 里
 * 任意一条不认就可能整条 style 一起没。所以先把"不认的"清干净。
 */
function stripUnknownCssProps(doc, cfg, counters) {
  // 不吃尾 `;`：global regex 的 lastIndex 是相对原字符串的，如果第一次匹配把
  // 结尾分号一起吃了，下一条要删的属性就失去前导 `;`，匹配不上。
  // 用 (^|;) 捕获前导分隔符，替换时回填这个分隔符。
  const propsRe = new RegExp(
    '(^|;)\\s*(' + cfg.blacklist.map(p => p.replace(/-/g, '\\-')).join('|') + ')\\s*:[^;]*',
    'gi'
  );
  doc.querySelectorAll('[style]').forEach(el => {
    const before = el.getAttribute('style') || '';
    let after = before.replace(propsRe, (_full, prefix) => prefix);
    after = after.replace(/;\s*;+/g, ';').replace(/^;+/, '').trim();
    if (after !== before) {
      counters.unknownPropsStripped++;
      if (after) el.setAttribute('style', after);
      else el.removeAttribute('style');
    }
  });
}

/**
 * clamp(min, ideal, max) → ideal     公众号窄屏下 ideal 通常是最贴近实际显示的
 * min(a, b)              → a         典型场景 "max-width: min(760px, 100%)" 取 760px
 * max(a, b)              → a
 *
 * 展平后的值如果含 vw/vh，会被下一步 convertViewportUnits 继续换算。
 */
function flattenCssFunctions(doc, counters) {
  // clamp(min, ideal, max) — 取中间项
  const clampRe = /clamp\(\s*([^,()]+)\s*,\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/gi;
  // min(a, b[, c...]) / max(a, b[, c...]) — 取第一项
  // \b 防误吃 minmax(0, 1fr) 这种 grid 函数 — 它内部的 max(0, 1fr) 子串
  // 不该被识别成 max 函数（否则 minmax → min0）。
  const minMaxRe = /\b(min|max)\(\s*([^,()]+?)(?:\s*,\s*[^()]+?)+\s*\)/gi;

  doc.querySelectorAll('[style]').forEach(el => {
    const before = el.getAttribute('style') || '';
    let after = before;

    after = after.replace(clampRe, (_full, _min, ideal) => {
      counters.cssFunctionsFlattened++;
      return ideal.trim();
    });

    after = after.replace(minMaxRe, (_full, _fn, first) => {
      counters.cssFunctionsFlattened++;
      return first.trim();
    });

    if (after !== before) el.setAttribute('style', after);
  });
}

/**
 * vw/vh → px 换算。
 *
 * 公众号实际视宽 ~375-414px，但 HTML Artifact 多按 750px 设计。
 * 取 docWidth=750 / docHeight=900 在视觉上最接近原设计意图。
 */
function convertViewportUnits(doc, cfg, counters) {
  doc.querySelectorAll('[style]').forEach(el => {
    const before = el.getAttribute('style') || '';
    let after = before;

    after = after.replace(/([\d.]+)vw\b/gi, (_m, n) => {
      counters.viewportUnitsConverted++;
      return Math.round(parseFloat(n) * cfg.docWidth / 100) + 'px';
    });
    after = after.replace(/([\d.]+)vh\b/gi, (_m, n) => {
      counters.viewportUnitsConverted++;
      return Math.round(parseFloat(n) * cfg.docHeight / 100) + 'px';
    });

    if (after !== before) el.setAttribute('style', after);
  });
}

/**
 * 把 background 上的 linear-gradient / radial-gradient / var(--xxx) 展平成
 * 不透明 background-color。
 *
 * 为什么必须做：公众号编辑器不支持 gradient 函数和 CSS variable，整条 background
 * declaration 会被丢弃。后果：
 *   1. 该元素自己的背景消失 → 视觉失败
 *   2. **更严重**：作为 ancestor 的元素丢了 background，下游 flattenAlphaBackgrounds
 *      沿父链找不到正确的 opaque 底色，半透明子元素被错误地 blend 到默认页面色上，
 *      导致级联视觉失败（典型案例：dark-band section + judgement-grid article
 *      的"白文字消失"）。
 *
 * 处理策略：
 *   - linear-gradient(...) / radial-gradient(...) → 取第一个 color stop 作为兜底色
 *   - var(--foo, fallback) → 取 fallback；无 fallback 则删 declaration
 *   - background-image / multi-layer background → 提取最底层不透明色
 *
 * 必须在 flattenAlphaBackgrounds **之前**跑。
 */
function flattenBackgrounds(doc, cfg, counters) {
  const colorRe = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|transparent|black|white|currentcolor)/i;
  const angleOrDirRe = /^(-?[\d.]+(?:deg|rad|grad|turn)|to\s+\w+(?:\s+\w+)?|from\s+|at\s+)/i;

  // 从 gradient 内容里提取第一个 color
  const firstColorFromGradient = (gradContent) => {
    // gradient 内容形如：
    //   "135deg, rgba(13,20,22,0.96), rgba(21,30,34,0.98)"
    //   "to right, #fff 0%, #000 100%"
    // 但内部有嵌套 rgba(...)，简单 split(',') 会切坏。先按顶层逗号分割。
    const parts = [];
    let depth = 0;
    let buf = '';
    for (const ch of gradContent) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());
    for (const p of parts) {
      if (angleOrDirRe.test(p)) continue;  // 跳过 angle / 方向
      const m = colorRe.exec(p);
      if (m) return m[1];
    }
    return null;
  };

  // 提取 var(--foo, fallback) 的 fallback
  const fallbackFromVar = (val) => {
    // var(--foo, ...rest)，rest 可能是 color、可能是 var(...) 嵌套
    const m = /var\s*\(\s*--[\w-]+\s*,\s*([^)]+(?:\([^)]*\))?[^)]*)\)/i.exec(val);
    if (!m) return null;
    const inner = m[1].trim();
    const cm = colorRe.exec(inner);
    return cm ? cm[1] : null;
  };

  doc.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style') || '';
    if (!/(linear-gradient|radial-gradient|var\s*\()/i.test(style)) return;
    // 按 ; 顶层切（注意 declaration 值里可能有 (...) 括号）
    const decls = [];
    let depth = 0;
    let buf = '';
    for (const ch of style) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { decls.push(buf.trim()); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) decls.push(buf.trim());

    let changed = false;
    const newDecls = decls.map(d => {
      const m = /^(background|background-image|background-color)\s*:\s*([\s\S]+)$/i.exec(d);
      if (!m) return d;
      const prop = m[1].toLowerCase();
      const val = m[2].trim();

      // 不含 gradient / var → 不动
      if (!/(linear-gradient|radial-gradient|var\s*\()/i.test(val)) return d;

      // 1. linear-gradient / radial-gradient
      const gm = /(?:linear|radial)-gradient\s*\(([\s\S]+?)\)(?=\s*[,\s]|$)/i.exec(val);
      if (gm) {
        const fb = firstColorFromGradient(gm[1]);
        if (fb) {
          counters.backgroundsFlattened++;
          changed = true;
          return `background-color: ${fb}`;
        }
      }

      // 2. multi-layer background：linear-gradient(...), <color>
      //    取 color 部分
      const layerMatch = colorRe.exec(val);
      if (layerMatch) {
        counters.backgroundsFlattened++;
        changed = true;
        return `background-color: ${layerMatch[1]}`;
      }

      // 3. var(--foo, fallback)
      const vfb = fallbackFromVar(val);
      if (vfb) {
        counters.backgroundsFlattened++;
        changed = true;
        return `background-color: ${vfb}`;
      }

      // 4. 无法解析 → 删 declaration（避免公众号整条 style 一锅端）
      counters.backgroundsFlattened++;
      changed = true;
      return '';
    }).filter(Boolean);

    if (changed) {
      const newStyle = newDecls.join('; ').replace(/;\s*;+/g, ';').replace(/^;+/, '').trim();
      if (newStyle) el.setAttribute('style', newStyle);
      else el.removeAttribute('style');
    }
  });
}

/**
 * 沿 DOM 父链找第一个不透明 background-color，把当前元素的 rgba 半透明背景
 * alpha-blend 到该底色上，写回为不透明颜色。
 *
 * 公众号渲染半透明色不可靠 + 父链一断下游 alpha 全乱。预先压平后所有
 * background-color 都是不透明的，渲染就稳了。
 *
 * 自顶向下处理：保证父先变成不透明，子再查父时拿到的是合成后的值。
 */
function flattenAlphaBackgrounds(doc, cfg, counters) {
  const NAMED = {
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    white: { r: 255, g: 255, b: 255, a: 1 },
    black: { r: 0, g: 0, b: 0, a: 1 },
  };
  const parseHex = (h) => {
    if (h.length === 3) return { r: hex2(h[0]+h[0]), g: hex2(h[1]+h[1]), b: hex2(h[2]+h[2]), a: 1 };
    if (h.length === 6) return { r: hex2(h.slice(0,2)), g: hex2(h.slice(2,4)), b: hex2(h.slice(4,6)), a: 1 };
    if (h.length === 8) return { r: hex2(h.slice(0,2)), g: hex2(h.slice(2,4)), b: hex2(h.slice(4,6)), a: hex2(h.slice(6,8))/255 };
    return null;
  };
  const hex2 = (s) => parseInt(s, 16);
  const parseColor = (raw) => {
    if (!raw) return null;
    const s = raw.trim().toLowerCase();
    if (NAMED[s]) return NAMED[s];
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) return parseHex(m[1]);
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
    return null;
  };
  const getBg = (el) => {
    const s = el.getAttribute('style') || '';
    const m = /background(?:-color)?\s*:\s*([^;]+)/i.exec(s);
    if (!m) return null;
    return parseColor(m[1]);
  };
  const fallback = parseColor(cfg.defaultPageBg) || NAMED.white;
  const findOpaqueAncestorBg = (el) => {
    let cur = el.parentElement;
    while (cur) {
      const bg = getBg(cur);
      if (bg && bg.a === 1) return bg;
      cur = cur.parentElement;
    }
    return fallback;
  };
  const blend = (fg, bg) => {
    const a = fg.a;
    return {
      r: Math.round(fg.r * a + bg.r * (1 - a)),
      g: Math.round(fg.g * a + bg.g * (1 - a)),
      b: Math.round(fg.b * a + bg.b * (1 - a)),
      a: 1,
    };
  };
  const toHex = (c) =>
    '#' + [c.r, c.g, c.b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');

  // 自顶向下 DFS：父先于子被处理
  const walk = (node) => {
    if (node.nodeType !== 1) return;
    const bg = getBg(node);
    if (bg && bg.a < 1 && bg.a > 0) {
      const opaque = findOpaqueAncestorBg(node);
      const result = blend(bg, opaque);
      const style = node.getAttribute('style') || '';
      // 删原 background / background-color，写回压平后的 background-color
      const next = style
        .replace(/background(?:-color)?\s*:[^;]+;?/gi, '')
        .replace(/;\s*;+/g, ';')
        .replace(/^;+/, '')
        .trim();
      const sep = next && !next.endsWith(';') ? ';' : '';
      node.setAttribute('style', next + sep + 'background-color:' + toHex(result));
      counters.alphaBackgroundsFlattened++;
    }
    for (const child of node.children) walk(child);
  };
  if (doc.body) walk(doc.body);
}

/**
 * <dl><div><dt><dd></div>...</dl> → <table><tr><td>...</td></tr></table>
 *
 * 公众号会把 dt/dd 当 list item 自动加 ▪ bullet，无法关闭。必须重写。
 * dt/dd 内部分别变成 <p>（保留 inline style 但失去 list 语义）。
 */
function convertDlToTable(doc, cfg, counters) {
  const dls = [...doc.querySelectorAll('dl')];
  dls.forEach(dl => {
    if (!dl.isConnected) return;
    const divs = [...dl.children].filter(c => c.tagName === 'DIV');
    if (divs.length < cfg.minKids || divs.length > cfg.maxKids) return;
    const allHaveDtDd = divs.every(d => d.querySelector('dt') && d.querySelector('dd'));
    if (!allHaveDtDd) return;

    // 剥掉 dl 原 inline style 里的"容器尺寸 + 布局"属性：
    //   - width / min-width / max-width 会覆盖 table 自己设的 width:100% 导致溢出
    //     （hero-metrics 的 `width: min(760px, 100%)` 被 cssFunctionFlatten 展平
    //      成 760px，原样带过来就把 table 撑到 760px 溢出 432px 容器）
    //   - display / grid-* / gap / align-* / justify-* 在 table 上无意义
    //   - background / border / border-radius / padding / margin 保留（视觉属性）
    const dlStyle = (dl.getAttribute('style') || '')
      .replace(
        /(^|;)\s*(?:display|grid|grid-[\w-]+|gap|align-items|align-content|justify-items|justify-content|justify-self|align-self|width|min-width|max-width)\s*:[^;]*/gi,
        '$1'
      )
      .replace(/;\s*;+/g, ';').replace(/^;+/, '').trim();
    const tbl = doc.createElement('table');
    tbl.setAttribute('width', '100%');
    tbl.setAttribute('cellpadding', '0');
    tbl.setAttribute('cellspacing', '0');
    tbl.setAttribute('border', '0');
    tbl.setAttribute(
      'style',
      ('width:100%;border-collapse:collapse;table-layout:fixed;' + (dlStyle ? dlStyle : '')).replace(/;\s*;+/g, ';')
    );

    const pct = Math.round(1000 / divs.length) / 10;
    const cg = doc.createElement('colgroup');
    divs.forEach(() => {
      const col = doc.createElement('col');
      col.setAttribute('width', pct + '%');
      col.setAttribute('style', `width:${pct}%;`);
      cg.appendChild(col);
    });
    tbl.appendChild(cg);

    const tr = doc.createElement('tr');
    divs.forEach(d => {
      const td = doc.createElement('td');
      const dStyle = d.getAttribute('style') || '';
      td.setAttribute('style', `vertical-align:top;width:${pct}%;` + dStyle);
      td.setAttribute('width', pct + '%');

      const dt = d.querySelector('dt');
      const dd = d.querySelector('dd');
      if (dt) {
        const p = doc.createElement('p');
        if (dt.getAttribute('style')) p.setAttribute('style', dt.getAttribute('style'));
        while (dt.firstChild) p.appendChild(dt.firstChild);
        td.appendChild(p);
      }
      if (dd) {
        const p = doc.createElement('p');
        if (dd.getAttribute('style')) p.setAttribute('style', dd.getAttribute('style'));
        while (dd.firstChild) p.appendChild(dd.firstChild);
        td.appendChild(p);
      }
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
    dl.replaceWith(tbl);
    counters.dlsConverted++;
  });
}

// ============================================================
//                    Warnings aggregation
// ============================================================

function buildWarnings(counters) {
  const oks = [];
  const warns = [];

  if (counters.extractedFrom) {
    oks.push(`已提取 <${counters.extractedFrom}> 正文`);
  }
  if (counters.chromeStripped > 0) {
    oks.push(`已剥离 ${counters.chromeStripped} 个导航/页脚/侧栏`);
  }
  const cleaned = [];
  if (counters.scripts > 0) cleaned.push(`${counters.scripts} script`);
  if (counters.iframes > 0) cleaned.push(`${counters.iframes} iframe`);
  if (counters.forms > 0) cleaned.push(`${counters.forms} form`);
  if (cleaned.length) oks.push(`已清理 ${cleaned.join(' / ')}`);

  if (counters.directivesApplied > 0) {
    oks.push(`已应用 ${counters.directivesApplied} 条 LLM directives`);
  }
  if (counters.unknownPropsStripped > 0) {
    oks.push(`已剥 ${counters.unknownPropsStripped} 处不兼容 CSS 属性（min-height / overflow / inset 等）`);
  }
  if (counters.cssFunctionsFlattened > 0) {
    oks.push(`已展平 ${counters.cssFunctionsFlattened} 处 clamp/min/max`);
  }
  if (counters.viewportUnitsConverted > 0) {
    oks.push(`已换算 ${counters.viewportUnitsConverted} 处 vw/vh → px`);
  }
  if (counters.backgroundsFlattened > 0) {
    oks.push(`已展平 ${counters.backgroundsFlattened} 处 gradient/var 背景（提取兜底色）`);
  }
  if (counters.alphaBackgroundsFlattened > 0) {
    oks.push(`已压平 ${counters.alphaBackgroundsFlattened} 处半透明背景（alpha → 不透明等效色）`);
  }
  if (counters.dlsConverted > 0) {
    oks.push(`${counters.dlsConverted} 个 <dl> 卡片网格转 <table>（避免 bullet）`);
  }
  if (counters.flexToTable > 0) {
    oks.push(`${counters.flexToTable} 处多列卡片转 <table>（公众号兼容）`);
  }
  if (counters.tablesMerged > 0) {
    oks.push(`${counters.tablesMerged} 行合并到 1 张表（拖列宽改全部）`);
  }
  if (counters.tablesSized > 0) {
    oks.push(`已为 ${counters.tablesSized} 张表估算列宽`);
  }
  if (counters.layoutNormalized > 0) {
    oks.push(`已规范化 ${counters.layoutNormalized} 处布局（flex/grid/绝对定位 → block）`);
  }

  if (counters.directivesMissed > 0) {
    warns.push(`${counters.directivesMissed} 条 directives 未命中目标（selector 失配）`);
  }
  if (counters.images > 0) {
    warns.push(`${counters.images} 张 <img> 需手动换素材库链接`);
  }
  if (counters.svgImages > 0) {
    warns.push(`${counters.svgImages} 个 SVG <image> 需手动换素材库链接`);
  }

  return [
    ...oks.map(t => ({ level: 'ok', text: t })),
    ...warns.map(t => ({ level: 'warn', text: t })),
  ];
}

// 让 default plan 可在使用方拿到（透传，免去再 import 一次）
export { DEFAULT_PLAN, mergePlan };

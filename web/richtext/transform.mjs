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
import { DEFAULT_PLAN, mergePlan } from './default-plan.mjs';

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
  };

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

  // 7. 同结构表合并（plan.tableMerging）
  if (plan.tableMerging.enabled) {
    mergeUniformTables(doc, plan.tableMerging, counters);
  }

  // 8. 剩余 flex/grid → block；绝对定位移除
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
    after = after.replace(
      /position\s*:\s*(absolute|fixed|sticky)\s*(!important)?\s*;?/gi,
      () => {
        counters.layoutNormalized++;
        return '';
      }
    );
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
      const cols = m[1].trim().split(/\s+/);
      if (cols.length !== kidCount) return null;
      return { kind: 'grid', widths: cols };
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

    const colPcts = info.kind === 'grid' ? resolveCols(info.widths) : kids.map(() => null);
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

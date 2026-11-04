// Shared pre-conversion step: decide which hidden content enters conversion.
//
//   collapsed  reachable through normal interaction  -> revealed
//   hidden     no way to reach it                    -> removed
//   uncertain  a script may reveal it                -> left as it was, reported
//
// A page with nothing to change is returned as the original string, so plain
// pages reach the converters untouched. The caller passes cheerio's `load`
// because lib/ cannot resolve each mode's node_modules.

const SKIP = new Set(['html', 'head', 'body', 'script', 'style', 'template', 'noscript', 'title', 'meta', 'link', 'base']);
const INTERACTIVE_NAME = /(?:^|[-_])(tabs?|panels?|panes?|accordions?|collaps\w*|fold\w*|expand\w*|toggle\w*|modals?|dialogs?|drawers?|dropdowns?|steps?|slides?|carousels?)(?:$|[-_])/i;
const STATE_PSEUDO = /:(?:hover|focus|active|checked|target|visited|disabled|before|after)|::/i;

const declarations = text => {
  const out = {};
  for (const part of String(text || '').split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const raw = part.slice(at + 1).trim().toLowerCase();
    if (name) out[name] = { value: raw.replace(/\s*!important$/, ''), important: /!important$/.test(raw) };
  }
  return out;
};

const specificity = selector => {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length;
  const tags = (selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + classes * 100 + tags;
};

// Top-level rules only. At-rule blocks are skipped: a print or narrow-screen
// rule does not describe what a reader sees on normal load.
function parseRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rules = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('{', at);
    if (open < 0) break;
    const prelude = text.slice(at, open).trim();
    let depth = 1, end = open + 1;
    while (end < text.length && depth) {
      if (text[end] === '{') depth++;
      else if (text[end] === '}') depth--;
      end++;
    }
    if (!prelude.startsWith('@')) {
      const decls = declarations(text.slice(open + 1, end - 1));
      for (const selector of prelude.split(',')) rules.push({ selector: selector.trim(), decls });
    }
    at = end;
  }
  return rules;
}

function computeStyles($) {
  const computed = new Map();
  let order = 0;
  $('style').each((_, style) => {
    for (const rule of parseRules($(style).text())) {
      order++;
      if (!rule.selector || STATE_PSEUDO.test(rule.selector)) continue;
      let matched;
      try { matched = $(rule.selector); } catch { continue; }
      const weight = specificity(rule.selector);
      matched.each((_, el) => {
        const styles = computed.get(el) || {};
        for (const [name, decl] of Object.entries(rule.decls)) {
          const rank = [decl.important ? 1 : 0, weight, order];
          const current = styles[name];
          const wins = !current || rank[0] > current.rank[0] || (rank[0] === current.rank[0] && (rank[1] > current.rank[1] || (rank[1] === current.rank[1] && rank[2] > current.rank[2])));
          if (wins) styles[name] = { value: decl.value, rank };
        }
        computed.set(el, styles);
      });
    }
  });
  return computed;
}

function hiddenReason($, el, computed) {
  const node = $(el);
  const inline = declarations(node.attr('style'));
  const fromRules = computed.get(el) || {};
  const value = name => {
    const rule = fromRules[name];
    if (rule?.rank[0] && !inline[name]?.important) return rule.value;
    return inline[name]?.value ?? rule?.value;
  };
  if (value('display') === 'none') return 'display';
  if (node.attr('hidden') !== undefined && !value('display')) return 'hidden';
  if (value('visibility') === 'hidden') return 'visibility';
  if (/^0(?:\.0+)?(?:px|em|rem|%)?$/.test(value('max-height') || '') && /hidden|clip/.test(value('overflow') || '')) return 'clip';
  return null;
}

const hasContent = ($, el) => Boolean($(el).text().trim()) || $(el).find('img,svg,video,table').length > 0;
const snippet = ($, el) => $(el).text().replace(/\s+/g, ' ').trim().slice(0, 40);

function selectorFor($, el) {
  const id = $(el).attr('id');
  if (id) return `#${id}`;
  const classes = ($(el).attr('class') || '').trim().split(/\s+/).filter(Boolean);
  return el.tagName + classes.map(name => `.${name}`).join('');
}

function classify($, el, { rules, pageScript, external, triggers }) {
  const node = $(el);
  const id = node.attr('id');
  if (node.attr('role') === 'tabpanel' || (id && triggers.has(id))) return 'collapsed';
  const classes = (node.attr('class') || '').split(/\s+/).filter(Boolean);
  const names = [...classes, ...(id ? [id] : [])];
  if (external) return 'uncertain';
  if (names.some(name => INTERACTIVE_NAME.test(name))) return 'uncertain';
  const mentioned = name => new RegExp(`(^|[^\\w-])${name.replace(/[^\w-]/g, '\\$&')}($|[^\\w-])`).test(pageScript);
  if (names.some(mentioned)) return 'uncertain';
  const shownByRule = rules.some(rule => classes.some(name => rule.selector.includes(`.${name}`))
    && rule.decls.display && rule.decls.display.value !== 'none');
  if (shownByRule) return 'uncertain';
  return 'hidden';
}

function collectTriggers($) {
  const ids = new Set();
  $('[aria-controls],[data-target],[data-bs-target],[data-tab],[data-toggle-target]').each((_, el) => {
    for (const name of ['aria-controls', 'data-target', 'data-bs-target', 'data-tab', 'data-toggle-target']) {
      for (const value of ($(el).attr(name) || '').split(/\s+/)) if (value) ids.add(value.replace(/^#/, ''));
    }
  });
  $('a[href^="#"]').each((_, el) => { ids.add($(el).attr('href').slice(1)); });
  $('[onclick]').each((_, el) => {
    for (const match of $(el).attr('onclick').matchAll(/['"`]#?([\w-]+)['"`]/g)) ids.add(match[1]);
  });
  return ids;
}

function reveal($, el, reason) {
  const node = $(el);
  node.removeAttr('hidden');
  if (node.attr('aria-hidden') === 'true') node.removeAttr('aria-hidden');
  const kept = (node.attr('style') || '').replace(/(?:^|;)\s*(?:display|visibility|max-height|overflow)\s*:[^;]*/gi, '').replace(/^\s*;/, '').trim();
  const add = { display: 'display:block', hidden: '', visibility: 'visibility:visible', clip: 'max-height:none;overflow:visible' }[reason];
  const style = [kept.replace(/;\s*$/, ''), add].filter(Boolean).join(';');
  if (style) node.attr('style', style); else node.removeAttr('style');
}

function matchesAny($, el, selectors) {
  return (selectors || []).some(selector => {
    try { return $(selector).toArray().includes(el); } catch { return false; }
  });
}

export function triageVisibility(html, load, { plan = {} } = {}) {
  const report = { collapsed: [], hidden: [], uncertain: [], removedImages: 0, removedComments: 0 };
  const isDocument = /<!doctype|<html[\s>]/i.test(html);
  const $ = load(html, null, isDocument);
  const scripts = $('script');
  const context = {
    rules: $('style').toArray().flatMap(style => parseRules($(style).text())),
    pageScript: scripts.toArray().map(script => $(script).text()).join('\n'),
    external: scripts.toArray().some(script => $(script).attr('src')),
    triggers: collectTriggers($),
  };
  const computed = computeStyles($);
  let changed = false;

  const record = (bucket, el) => report[bucket].push({ selector: selectorFor($, el), text: snippet($, el) });
  const remove = (el, label) => {
    report.removedImages += $(el).is('img') ? 1 : $(el).find('img').length;
    record('hidden', el);
    if (label) report.hidden[report.hidden.length - 1].kind = label;
    $(el).remove();
    changed = true;
  };

  const root = $(isDocument ? 'body' : ':root').length ? $(isDocument ? 'body' : ':root') : $.root();
  root.find('template').addBack('template').toArray().forEach(el => { if (hasContent($, el) || $(el).html()?.trim()) remove(el, 'template'); else { $(el).remove(); changed = true; } });

  const elements = root.find('*').addBack().toArray().filter(el => !SKIP.has(el.tagName));
  for (const el of elements) {
    if (!$.contains($.root()[0], el)) continue;
    const reason = hiddenReason($, el, computed);
    if (!reason || !hasContent($, el)) continue;
    const bucket = matchesAny($, el, plan.reveal) ? 'collapsed'
      : matchesAny($, el, plan.remove) ? 'hidden'
        : classify($, el, context);
    if (bucket === 'collapsed') { record('collapsed', el); reveal($, el, reason); changed = true; }
    else if (bucket === 'hidden') remove(el);
    else record('uncertain', el);
  }

  const dropComments = nodes => nodes.each((_, node) => {
    if (node.type === 'comment') { $(node).remove(); report.removedComments++; changed = true; }
    else if (node.type === 'tag') dropComments($(node).contents());
  });
  dropComments(root.contents());

  const warnings = [];
  if (report.collapsed.length) warnings.push(`[visibility] 已展开 ${report.collapsed.length} 处折叠内容：${report.collapsed.map(item => item.selector).join('、')}`);
  if (report.hidden.length) warnings.push(`[visibility] 已移除 ${report.hidden.length} 处无入口的隐藏内容：${report.hidden.map(item => `${item.selector}「${item.text}」`).join('、')}`);
  if (report.removedComments) warnings.push(`[visibility] 已移除 ${report.removedComments} 条 HTML 注释`);
  if (report.uncertain.length) warnings.push(`[visibility] ${report.uncertain.length} 处隐藏内容可能由脚本打开，已按原样保留，需判断后用 --visibility-plan 决定展开或移除：${report.uncertain.map(item => `${item.selector}「${item.text}」`).join('、')}`);
  return { html: changed ? $.html() : html, changed, report, warnings };
}

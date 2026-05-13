// Mode 3 · HTML → 口播稿（markdown）转换（X-A 执行层）
//
// 范式：HTML → cheerio 清洗 → turndown 转 markdown → analyze.mjs 统计。
// 1A 是纯函数：transform(html, plan) → { md, stats, warnings }
//
// 见 docs/03-html-to-script.md（如有）+ ROADMAP 阶段 2b

import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { analyze } from './analyze.mjs';

export const DEFAULT_PLAN = Object.freeze({
  // 抽正文
  extractMain: true,
  // 黑名单（不进口播稿）
  bannedTags: ['script', 'style', 'noscript', 'iframe', 'form', 'input', 'nav', 'aside', 'header', 'footer', 'svg'],
  // 是否保留图片占位（口播稿一般不要图）
  keepImages: false,
  // markdown 风格
  turndownOptions: {
    headingStyle: 'atx',          // # H1
    codeBlockStyle: 'fenced',     // ```
    bulletListMarker: '-',
    emDelimiter: '*',
  },
});

/**
 * HTML → 口播稿 markdown 纯函数。
 *
 * @param {string} rawHtml
 * @param {Partial<typeof DEFAULT_PLAN>} planArg
 * @returns {{ md: string, stats: object, warnings: string[] }}
 */
export function transform(rawHtml, planArg = {}) {
  if (!rawHtml || !rawHtml.trim()) {
    return { md: '', stats: null, warnings: ['empty input'] };
  }
  const plan = { ...DEFAULT_PLAN, ...planArg, turndownOptions: { ...DEFAULT_PLAN.turndownOptions, ...(planArg.turndownOptions || {}) } };

  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  const warnings = [];

  // 1. 剥黑名单
  plan.bannedTags.forEach(tag => $(tag).remove());

  // 2. 抽正文
  let root = null;
  if (plan.extractMain) {
    const article = $('article').toArray().sort((a, b) => $(b).text().length - $(a).text().length)[0];
    const main = $('main, [role="main"]').first()[0];
    root = article || main || $('body')[0] || null;
  } else {
    root = $('body')[0] || null;
  }
  if (!root) {
    warnings.push('未找到正文容器（无 <article>/<main>/<body>）');
    return { md: '', stats: null, warnings };
  }

  // 3. 可选剥图片
  if (!plan.keepImages) {
    $(root).find('img').remove();
  }

  // 4. turndown
  const td = new TurndownService(plan.turndownOptions);
  // 跳过 svg 残留（保险）+ 表格不转（口播稿不要表）
  td.addRule('skipSvg', { filter: 'svg', replacement: () => '' });
  td.addRule('skipTable', { filter: 'table', replacement: () => '\n[（此处原文是一张表格，口播时跳过或用 1-2 句话总结）]\n' });
  const md = td.turndown($.html(root)).trim();

  // 5. 分析
  const stats = analyze(md);

  return { md, stats, warnings: warnings.concat(stats.warnings || []) };
}

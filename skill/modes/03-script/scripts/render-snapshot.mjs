// Mode 3 · 视觉理解前置 — puppeteer 截图（可选）
//
// **本 mode X-C 通常退化为不需要**：mode 3 plan 只有 4 个布尔/数组选项
// （extractMain / bannedTags / keepImages / turndownOptions），文本结构信息
// 读 HTML 就够。真要用 X-C 的场景：多 article 报告 + 装饰性页面 chrome
// 干扰严重时，agent 看图后产 plan 比手填准。
//
// **同步来源**：本文件主体逻辑与 skill/modes/04-feishu/scripts/render-snapshot.mjs
// 等价（4 个 mode 共用）；第三次出现时（mode 1/3/4）应该正式抽到 lib/。
//
// 见 docs/03-html-to-script.md §「X-C/X-A 范式」

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

/**
 * 把 HTML 渲染成整页 PNG。
 *
 * @param {string} inputHtmlPath - HTML 文件绝对路径
 * @param {string} outputPngPath - PNG 输出路径
 * @param {object} opts
 * @param {number} opts.viewportWidth - 默认 1280
 * @param {number} opts.viewportHeight - 默认 800
 * @param {number} opts.deviceScaleFactor - 默认 2（高清，否则文字模糊）
 * @returns {Promise<{ pngPath: string, fullHeight: number }>}
 */
export async function renderSnapshot(inputHtmlPath, outputPngPath, opts = {}) {
  const { default: puppeteer } = await import('puppeteer');
  const viewportWidth = opts.viewportWidth || 1280;
  const viewportHeight = opts.viewportHeight || 800;
  const deviceScaleFactor = opts.deviceScaleFactor || 2;

  const absInput = resolve(inputHtmlPath);
  await stat(absInput);  // throw if not exists

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],  // VPS 上常见需要
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor });
    await page.goto(`file://${absInput}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.screenshot({ path: outputPngPath, fullPage: true });
    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    return { pngPath: outputPngPath, fullHeight };
  } finally {
    await browser.close();
  }
}

/**
 * v0.5c: 截取一个 selector 命中元素的 bounding box 区域。
 *
 * 给"嵌套 div 套娃 / 复杂渐变背景"这类 DocxXML 表达不了的装饰块兜底用。
 *
 * @param {string} inputHtmlPath
 * @param {string} selector - 必须命中至少一个元素；命中多个时取第一个
 * @param {string} outputPngPath
 * @param {object} opts - 同 renderSnapshot 的 viewport / scale
 * @returns {Promise<{ pngPath: string, width: number, height: number }>}
 */
export async function snapshotRegion(inputHtmlPath, selector, outputPngPath, opts = {}) {
  const { default: puppeteer } = await import('puppeteer');
  const viewportWidth = opts.viewportWidth || 1280;
  const viewportHeight = opts.viewportHeight || 800;
  const deviceScaleFactor = opts.deviceScaleFactor || 2;

  const absInput = resolve(inputHtmlPath);
  await stat(absInput);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor });
    await page.goto(`file://${absInput}`, { waitUntil: 'networkidle0', timeout: 60000 });
    const el = await page.$(selector);
    if (!el) throw new Error(`selector "${selector}" matched 0 elements`);
    const box = await el.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      throw new Error(`selector "${selector}" has 0-size bounding box (display:none?)`);
    }
    await el.screenshot({ path: outputPngPath });
    return { pngPath: outputPngPath, width: Math.round(box.width), height: Math.round(box.height) };
  } finally {
    await browser.close();
  }
}

// CLI 入口：node render-snapshot.mjs <input.html> <output.png> [selector]
//   省略 selector → 整页 / 给 selector → 区块截图
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inputHtml, outputPng, selector] = process.argv;
  if (!inputHtml || !outputPng) {
    console.error('Usage: node render-snapshot.mjs <input.html> <output.png> [selector]');
    process.exit(1);
  }
  const job = selector
    ? snapshotRegion(inputHtml, selector, outputPng)
    : renderSnapshot(inputHtml, outputPng);
  job.then(
    (r) => console.log(JSON.stringify(r)),
    (err) => { console.error('render-snapshot failed:', err.message); process.exit(1); },
  );
}

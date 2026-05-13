// Mode 4 · 视觉理解前置 — puppeteer 截图
//
// 给 4C agent（multimodal LLM）看，让它判定哪些 div 是 grid/callout/whiteboard。
// v0.1 暂不消费输出（DOM 直转，无视觉决策）；v0.2+ 上线视觉理解 plan 时启用。
//
// 见 docs/04-html-to-feishu.md §6.2（视觉理解强制约束）

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

// CLI 入口：node render-snapshot.mjs <input.html> <output.png>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inputHtml, outputPng] = process.argv;
  if (!inputHtml || !outputPng) {
    console.error('Usage: node render-snapshot.mjs <input.html> <output.png>');
    process.exit(1);
  }
  renderSnapshot(inputHtml, outputPng).then(
    (r) => console.log(JSON.stringify(r)),
    (err) => { console.error('render-snapshot failed:', err.message); process.exit(1); },
  );
}

// 跨 mode 共享 · puppeteer 视觉理解工具集
//
// 三个 API：
//   - renderSnapshot(htmlPath, outputPng, opts)        整页 PNG（mode 4 X-C / mode 1 1C）
//   - snapshotRegion(htmlPath, selector, outputPng)    selector 区块截图（mode 4 v0.5c 装饰兜底）
//   - measureImageWidths(htmlPath, opts)               每张 <img> layout 实测（mode 4 v0.5e / mode 1）
//
// 各 mode 的 scripts/render-snapshot.mjs 是本文件的薄 re-export 包装（保留各自 import 路径稳定）。
//
// 见：
//   - docs/04-html-to-feishu.md §6.2（视觉理解强制约束）
//   - ROADMAP §「lib/ 共享层抽离」

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
  // 优先使用调用方注入的 loader（mode shim 提供，能访问 mode 自己的 node_modules）
  // 兜底直接 import（lib 自己也安装 puppeteer 的场景；当前不推荐）
  const puppeteer = opts.loadPuppeteer ? await opts.loadPuppeteer() : (await import('puppeteer')).default;
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
 * v0.5e: 用 puppeteer 渲染原 HTML，测量每个 <img> 的实际**显示宽度**。
 *
 * 解决的痛点：原 HTML 里的图（手机 mockup / 架构图 / 装饰小图）通过 CSS
 * （max-width / grid 布局 / flex 比例 / `<img class="..." width:100%`）
 * 被压缩成"该显示的宽度"，但 DOM 树本身没有这个宽度信息——cheerio 看到的
 * img 没有 layout 维度。puppeteer 跑一次 layout 就拿到真实 px 宽度，
 * 据此 resize 实际文件再上传到飞书，让飞书文档里的图自动跟原文档同款宽度。
 *
 * 返回数组顺序与 document.querySelectorAll('img') 一致（DOM 树深度优先序），
 * cheerio 在 transform.mjs 中以同样顺序枚举 imgs → 用 index 对齐 + srcPrefix
 * 校验防止漏对。
 *
 * @param {string} inputHtmlPath HTML 文件绝对路径
 * @param {object} opts viewportWidth/viewportHeight/deviceScaleFactor，同 renderSnapshot
 * @returns {Promise<Array<{ width: number, height: number, srcPrefix: string, naturalWidth: number, naturalHeight: number }>>}
 */
export async function measureImageWidths(inputHtmlPath, opts = {}) {
  // 优先使用调用方注入的 loader（mode shim 提供，能访问 mode 自己的 node_modules）
  // 兜底直接 import（lib 自己也安装 puppeteer 的场景；当前不推荐）
  const puppeteer = opts.loadPuppeteer ? await opts.loadPuppeteer() : (await import('puppeteer')).default;
  const viewportWidth = opts.viewportWidth || 1280;
  const viewportHeight = opts.viewportHeight || 800;
  const deviceScaleFactor = opts.deviceScaleFactor || 1;  // measurement 不需要 retina

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

    // 测量每个 <img> 的 layout 宽度 + 自然分辨率 + src 前缀（安全校验）
    const measurements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => {
        const rect = img.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          srcPrefix: (img.src || '').slice(0, 80),
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
        };
      });
    });
    return measurements;
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
  // 优先使用调用方注入的 loader（mode shim 提供，能访问 mode 自己的 node_modules）
  // 兜底直接 import（lib 自己也安装 puppeteer 的场景；当前不推荐）
  const puppeteer = opts.loadPuppeteer ? await opts.loadPuppeteer() : (await import('puppeteer')).default;
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

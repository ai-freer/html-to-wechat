// Mode 04 · 注入 puppeteer loader 后 re-export 共享 lib
// 不能直接 re-export：lib/ 在 repo 根，dynamic import('puppeteer') 解析不到
// 各 mode 的 node_modules。这里用 lazy loader 让 import 从 mode 自己的目录解析。
// 见 ROADMAP §「lib/ 共享层抽离」
import * as _lib from '../../../lib/render-snapshot.mjs';

const loadPuppeteer = async () => (await import('puppeteer')).default;

export const renderSnapshot = (htmlPath, output, opts = {}) =>
  _lib.renderSnapshot(htmlPath, output, { ...opts, loadPuppeteer });

export const snapshotRegion = (htmlPath, selector, output, opts = {}) =>
  _lib.snapshotRegion(htmlPath, selector, output, { ...opts, loadPuppeteer });

export const measureImageWidths = (htmlPath, opts = {}) =>
  _lib.measureImageWidths(htmlPath, { ...opts, loadPuppeteer });

// Run through the mode entrypoint too; exports alone silently did nothing as a CLI.
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  _lib.runSnapshotCLI(process.argv.slice(2), { loadPuppeteer }).then(
    r => console.log(JSON.stringify(r)),
    err => { console.error('render-snapshot failed:', err.message); process.exitCode = 1; },
  );
}

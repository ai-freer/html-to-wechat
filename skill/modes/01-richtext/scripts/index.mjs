#!/usr/bin/env node
// Mode 1 · CLI 入口（X-A 执行层）
//
// 用法：
//   node index.mjs --input path/to/input.html [--plan path/to/plan.json] [--output out.html]
//   cat input.html | node index.mjs --stdin --output out.html
//
// 输入：HTML 文件路径或 stdin
// plan：可选 plan.json（由 1C agent 看截图后产出，包含节点级 directives）；缺省用 DEFAULT_PLAN（行为等同浏览器版零依赖兜底）
// 输出（成功）：公众号兼容 HTML（stdout） + 统计与警告（stderr）；--output 指定则同时落盘
//
// 退出码：0 成功 / 1 失败

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { transform } from './transform.mjs';
import { measureImageWidths } from './render-snapshot.mjs';

const argv = parseArgs(process.argv.slice(2));

if (argv.help || (!argv.input && !argv.stdin)) {
  console.error(`Usage:
  node index.mjs --input <html-path> [--plan <json>] [--output <html>] [--output-text <txt>] [--dry-run]
  cat input.html | node index.mjs --stdin [--plan <json>] [--output <html>]

Options:
  --input <path>        HTML file to convert
  --stdin               Read HTML from stdin
  --plan <path>         Optional plan.json (1C agent output; default: built-in DEFAULT_PLAN)
  --output <path>       Write converted HTML to file (also written to stdout)
  --output-text <path>  Write plain text version to file (for "text/plain" clipboard fallback)
  --dry-run             Conversion only; do NOT write any output file (stats to stderr)
  --help                Show this help

Notes:
  - 1A 是纯函数：本 CLI = readFile(input) + transform(html, plan) + writeFile(output)
  - 不调任何外部服务（juice / jsdom 全本地，无 LLM、无 IO 副作用）
  - 1C 路径：由 agent 在外部用 render-snapshot.mjs 截图 + 看图后产 plan.json，再喂给本 CLI
`);
  process.exit(argv.help ? 0 : 1);
}

try {
  // === 1. 读 HTML ===
  let rawHtml;
  let inputAbsPath = null;  // v0.5e: 用于 puppeteer 实测 layout 宽度
  if (argv.stdin) {
    rawHtml = await readStdin();
  } else {
    const abs = resolve(argv.input);
    rawHtml = await readFile(abs, 'utf8');
    inputAbsPath = abs;
  }

  // === 2. 读可选 plan ===
  let plan = {};
  if (argv.plan) {
    plan = JSON.parse(await readFile(resolve(argv.plan), 'utf8'));
    console.error(`[mode-1] loaded plan: ${argv.plan} (directives=${(plan.directives || []).length})`);
  } else {
    console.error('[mode-1] using DEFAULT_PLAN (no LLM, browser-version parity)');
  }

  // === 2.5 v0.5e (mode 1): puppeteer 实测每个 <img> 的渲染宽度 ===
  // 给 transform 注入到 <img width/height> 属性，让公众号编辑器粘贴后按原 layout 显示，
  // 而不是按图自身分辨率渲染。--stdin / --no-measure / puppeteer 缺失时优雅降级。
  let renderedWidths = [];
  if (inputAbsPath && !argv['no-measure']) {
    try {
      console.error('[mode-1] measuring image widths via puppeteer...');
      renderedWidths = await measureImageWidths(inputAbsPath);
      const nonZero = renderedWidths.filter(m => m.width > 0).length;
      console.error(`[mode-1] measured ${nonZero}/${renderedWidths.length} imgs`);
    } catch (e) {
      console.error(`[mode-1] measure-widths skipped: ${e.message}（fallback：保留 img 原 layout 由公众号渲染）`);
    }
  }

  // === 3. 转换（纯函数）===
  const result = transform(rawHtml, plan, { renderedWidths });

  if (result.error) {
    console.error('[mode-1] transform error:', result.error);
    process.exit(1);
  }
  if (!result.html) {
    console.error('[mode-1] empty html output. Input may be empty.');
    process.exit(1);
  }

  // === 4. 落盘 ===
  if (!argv['dry-run']) {
    if (argv.output) {
      await writeFile(resolve(argv.output), result.html, 'utf8');
      console.error(`[mode-1] wrote html: ${argv.output} (${result.html.length} chars)`);
    }
    if (argv['output-text']) {
      await writeFile(resolve(argv['output-text']), result.text, 'utf8');
      console.error(`[mode-1] wrote text: ${argv['output-text']} (${result.text.length} chars)`);
    }
  }

  // === 5. 摘要到 stderr ===
  const summary = {
    chars: result.stats?.chars,
    bytes: result.stats?.bytes,
    counters: result.stats?.counters,
    warningCount: result.warnings.length,
  };
  console.error('[mode-1] conversion summary:', JSON.stringify(summary, null, 2));
  if (result.warnings.length > 0) {
    console.error('[mode-1] warnings:');
    result.warnings.forEach(w => console.error(`  [${w.level}] ${w.text}`));
  }

  // === 6. HTML 到 stdout（便于管道）===
  if (!argv['dry-run']) {
    process.stdout.write(result.html);
  }

  process.exit(0);

} catch (err) {
  console.error('[mode-1] FAILED:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

// ===========================================================================
// 辅助
// ===========================================================================

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { data += d; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

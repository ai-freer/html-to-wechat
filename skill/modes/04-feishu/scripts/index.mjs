#!/usr/bin/env node
// Mode 4 · CLI 入口
//
// 用法：
//   node index.mjs --input path/to/input.html
//   node index.mjs --input path/to/input.html --dry-run
//   node index.mjs --input path/to/input.html --output-xml out.docxxml
//   cat input.html | node index.mjs --stdin
//
// 输出（成功）：飞书文档 URL（stdout 最后一行）+ JSON 摘要（stderr）
// 退出码：0 成功 / 1 失败

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { transform } from './html-to-docxxml.mjs';
import { createDoc } from './create-doc.mjs';

const argv = parseArgs(process.argv.slice(2));

if (argv.help || (!argv.input && !argv.stdin)) {
  console.error(`Usage:
  node index.mjs --input <html-path> [--dry-run] [--output-xml <path>] [--parent-token <token>]
  cat input.html | node index.mjs --stdin [--dry-run] [--output-xml <path>]

Options:
  --input <path>       HTML file to convert
  --stdin              Read HTML from stdin
  --dry-run            Run conversion + lark-cli dry-run, do NOT create real doc
  --output-xml <path>  Write generated DocxXML to file (always done if specified)
  --parent-token <t>   Parent folder/wiki token (default: user space root)
  --plan <path>        Optional plan.json (4C agent output; default: built-in fallback)
`);
  process.exit(argv.help ? 0 : 1);
}

try {
  // === 1. 读 HTML ===
  let rawHtml;
  if (argv.stdin) {
    rawHtml = await readStdin();
  } else {
    rawHtml = await readFile(resolve(argv.input), 'utf8');
  }

  // === 2. 读可选 plan ===
  let plan = {};
  if (argv.plan) {
    plan = JSON.parse(await readFile(resolve(argv.plan), 'utf8'));
  }

  // === 3. 转换 ===
  const result = transform(rawHtml, plan);
  if (!result.docxxml) {
    console.error('[mode-4] empty docxxml output. Input may be empty.');
    process.exit(1);
  }

  // === 4. 可选写出 DocxXML ===
  if (argv['output-xml']) {
    await writeFile(resolve(argv['output-xml']), result.docxxml, 'utf8');
    console.error(`[mode-4] wrote DocxXML: ${argv['output-xml']} (${result.docxxml.length} bytes)`);
  }

  // === 5. 摘要到 stderr ===
  const summary = {
    title: result.title,
    docxxmlLength: result.docxxml.length,
    warningCount: result.warnings.length,
    stats: result.stats,
  };
  console.error('[mode-4] conversion summary:', JSON.stringify(summary, null, 2));
  if (result.warnings.length > 0 && result.warnings.length <= 10) {
    console.error('[mode-4] warnings:');
    result.warnings.forEach(w => console.error('  -', w));
  } else if (result.warnings.length > 10) {
    console.error(`[mode-4] ${result.warnings.length} warnings (showing first 5):`);
    result.warnings.slice(0, 5).forEach(w => console.error('  -', w));
  }

  // === 6. 调 lark-cli 创建文档 ===
  console.error(`[mode-4] calling lark-cli docs +create${argv['dry-run'] ? ' (dry-run)' : ''}...`);
  const created = await createDoc(result.docxxml, {
    dryRun: !!argv['dry-run'],
    parentToken: argv['parent-token'],
  });

  if (created.dryRun) {
    console.error('[mode-4] dry-run OK. Request body inspected:');
    console.error(JSON.stringify(created.raw, null, 2).slice(0, 2000));
    process.exit(0);
  }

  // === 7. 输出 URL ===
  console.error(`[mode-4] created: document_id=${created.documentId}, new_blocks=${created.newBlocks.length}`);
  console.log(created.url);
  process.exit(0);

} catch (err) {
  console.error('[mode-4] FAILED:', err.message);
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

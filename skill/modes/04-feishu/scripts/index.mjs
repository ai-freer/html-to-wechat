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
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { transform } from './html-to-docxxml.mjs';
import { createDoc } from './create-doc.mjs';
import { uploadMedia } from './upload-media.mjs';
import { snapshotRegion, measureImageWidths } from './render-snapshot.mjs';

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
  let inputDir = process.cwd();  // 默认；v0.2c 本地图片相对路径基准
  let inputAbsPath = null;  // v0.5c: snapshot 兜底要原文件路径喂 puppeteer
  if (argv.stdin) {
    rawHtml = await readStdin();
  } else {
    const abs = resolve(argv.input);
    rawHtml = await readFile(abs, 'utf8');
    inputDir = dirname(abs);
    inputAbsPath = abs;
  }

  // === 2. 读可选 plan ===
  let plan = {};
  if (argv.plan) {
    plan = JSON.parse(await readFile(resolve(argv.plan), 'utf8'));
  }

  // === 2.5 v0.5e: puppeteer 实测每个 <img> 的渲染宽度（用 file 路径才能跑）
  // 让 transform 用真实 layout 宽度，避免飞书按图自身分辨率撑满文档全宽。
  // --stdin / --no-measure / puppeteer 缺失时优雅降级。
  let renderedWidths = [];
  if (inputAbsPath && !argv['no-measure']) {
    try {
      console.error('[mode-4] measuring image widths via puppeteer...');
      renderedWidths = await measureImageWidths(inputAbsPath);
      const nonZero = renderedWidths.filter(m => m.width > 0).length;
      console.error(`[mode-4] measured ${nonZero}/${renderedWidths.length} imgs`);
    } catch (e) {
      console.error(`[mode-4] measure-widths skipped: ${e.message}（fallback to default sizes）`);
    }
  }

  // === 3. 转换 ===
  const result = transform(rawHtml, plan, { renderedWidths });
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
    mediaTaskCount: result.mediaTasks?.length || 0,
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
    if (result.mediaTasks?.length) {
      console.error(`[mode-4] (dry-run) ${result.mediaTasks.length} media task(s) would be uploaded:`);
      result.mediaTasks.forEach(t => {
        const where = t.type === 'snapshot' ? `selector="${t.selector}"` : `src=${(t.src || '').slice(0, 60)}...`;
        console.error(`  - id=${t.id} type=${t.type} alt=${t.alt} ${where}`);
      });
    }
    process.exit(0);
  }

  // === 7a. v0.5c: snapshot 兜底渲染（必须在 uploadMedia 前实化为 local PNG）===
  const snapshotTasks = (result.mediaTasks || []).filter(t => t.type === 'snapshot');
  if (snapshotTasks.length > 0) {
    if (!inputAbsPath) {
      console.error(`[mode-4] WARNING: ${snapshotTasks.length} snapshot task(s) skipped — --stdin mode 没有 HTML 文件路径喂 puppeteer。请用 --input <file>。`);
      // 把 snapshot 任务从 mediaTasks 移除，避免 uploadMedia 后续误判
      result.mediaTasks = result.mediaTasks.filter(t => t.type !== 'snapshot');
    } else {
      console.error(`[mode-4] rendering ${snapshotTasks.length} snapshot region(s) via puppeteer...`);
      for (const task of snapshotTasks) {
        const pngPath = `${tmpdir()}/mode4-snapshot-${task.id}-${Date.now()}.png`;
        try {
          const { width, height } = await snapshotRegion(inputAbsPath, task.selector, pngPath);
          task.type = 'local';
          task.src = pngPath;
          task.width = width;
          task.height = height;
          console.error(`  - id=${task.id} selector="${task.selector}" → ${width}×${height}px`);
        } catch (e) {
          console.error(`  - id=${task.id} selector="${task.selector}" FAILED: ${e.message} (留 placeholder)`);
          // 标记成失败，从 mediaTasks 移除，避免 uploadMedia 报"找不到文件"
          task._snapshotFailed = true;
        }
      }
      result.mediaTasks = result.mediaTasks.filter(t => !t._snapshotFailed);
    }
  }

  // === 7. v0.2c: 本地/base64 图后置上传 ===
  if (result.mediaTasks && result.mediaTasks.length > 0) {
    console.error(`[mode-4] uploading ${result.mediaTasks.length} local/base64 image(s) via +media-insert...`);
    const mediaRes = await uploadMedia(result.mediaTasks, {
      documentId: created.documentId,
      inputDir,
      dryRun: false,
    });
    console.error(`[mode-4] media phase: uploaded=${mediaRes.uploaded} failed=${mediaRes.failed}`);
    if (mediaRes.failed > 0) {
      console.error('[mode-4] media failures (placeholder text left in document):');
      mediaRes.results.filter(r => r.status === 'fail').forEach(r =>
        console.error(`  - id=${r.id}: ${r.error?.slice(0, 200)}`));
    }
  }

  // === 8. 输出 URL ===
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

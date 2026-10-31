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

import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { transform } from './html-to-docxxml.mjs';
import { createDoc } from './create-doc.mjs';
import { prepareMedia } from './upload-media.mjs';
import { prepareHtmlBlock } from './html-block.mjs';
import { normalizeNativeXml } from './native-xml.mjs';
import { measureImageWidths } from './render-snapshot.mjs';
import { splitDocxXML, chunkedCreateDoc } from './chunk-doc.mjs';

const argv = parseArgs(process.argv.slice(2));

if (argv.help || (!argv.input && !argv.stdin)) {
  console.error(`Usage:
  node index.mjs --input <html-path> [--dry-run] [--output-xml <path>] [--parent-token <token>]
  cat input.html | node index.mjs --stdin [--dry-run] [--output-xml <path>]

Options:
  --input <path>       HTML file to convert
  --stdin              Read HTML from stdin
  --dry-run            Prepare resources + CLI dry-run; no cloud writes
  --export-only        Export local XML/resources, no CLI call (requires --output-xml)
  --target <mode>      native (default) | html-block (explicit alternative)
  --height-mode <mode> HTML block: auto (default) | viewport
  --profile <name>     Explicit Lark account profile (or LARK_CLI_PROFILE)
  --no-measure         Skip optional browser image-width measurement
  --output-xml <path>  Write generated DocxXML to file (always done if specified)
  --parent-token <t>   Parent folder/wiki token (default: user space root)
  --plan <path>        Optional plan.json (4C agent output; default: built-in fallback)
  --chunk-bytes <N>    v0.5d 实现层：DocxXML > N 字节时分块（首块走 +create，后续走 +update append）
                       默认不分块；典型触发值 200000 / 500000；分块边界在顶层 block
`);
  process.exit(argv.help ? 0 : 1);
}

let temporaryDir;
try {
  if (argv['export-only'] && !argv['output-xml']) throw new Error('--export-only requires --output-xml');
  const target = argv.target || 'native';
  if (!['native', 'html-block'].includes(target)) throw new Error('--target must be native or html-block');
  if (argv['height-mode'] && !['auto', 'viewport'].includes(argv['height-mode'])) throw new Error('--height-mode must be auto or viewport');
  const inputPath = argv.input ? resolve(argv.input) : null;
  const inputDir = inputPath ? dirname(inputPath) : process.cwd();
  const html = argv.stdin ? await readStdin() : await readFile(inputPath, 'utf8');
  const plan = argv.plan ? JSON.parse(await readFile(resolve(argv.plan), 'utf8')) : {};
  const outputPath = argv['output-xml'] ? resolve(argv['output-xml']) : null;
  const cwd = outputPath ? dirname(outputPath) : await mkdtemp(join(tmpdir(), 'html-to-feishu-'));
  if (!outputPath) temporaryDir = cwd;
  const resourceName = outputPath ? basename(outputPath) + '.assets' : 'assets';
  const resourceDir = join(cwd, resourceName);
  await mkdir(cwd, { recursive: true });
  let result;
  if (target === 'html-block') {
    result = await prepareHtmlBlock(html, { title: plan.title,
      resourceDir, resourceRef: `./${resourceName}/artifact.html`, heightMode: argv['height-mode'] || 'auto' });
  } else {
    let renderedWidths = [];
    if (inputPath && !argv['no-measure'] && /<img[\s>]/i.test(html)) {
      try { renderedWidths = await measureImageWidths(inputPath); }
      catch (e) { console.error(`[mode-4] image measurement skipped: ${e.message}`); }
    }
    const converted = transform(html, plan, { renderedWidths });
    if (!converted.docxxml) throw new Error('empty conversion output');
    const media = await prepareMedia(converted.docxxml, converted.mediaTasks, { resourceDir, cwd, inputDir, inputPath });
    const normalized = normalizeNativeXml(media.docxxml);
    result = { ...converted, docxxml: normalized.docxxml, files: media.files,
      warnings: [...converted.warnings, ...normalized.warnings] };
  }
  if (outputPath) { await writeFile(outputPath, result.docxxml); console.error(`[mode-4] exported XML and ${result.files.length} local resource(s)`); }
  for (const warning of result.warnings || []) console.error(`[mode-4] warning: ${warning}`);
  console.error('[mode-4] prepared:', JSON.stringify({ target, bytes: Buffer.byteLength(result.docxxml), resources: result.files.length, warnings: result.warnings?.length || 0 }));
  if (!argv['export-only']) {
    const opts = { cwd, profile: argv.profile, dryRun: !!argv['dry-run'], parentToken: argv['parent-token'] };
    const chunkBytes = Number(argv['chunk-bytes']);
    if (argv['chunk-bytes'] && (!Number.isInteger(chunkBytes) || chunkBytes <= 0)) throw new Error('--chunk-bytes must be a positive integer');
    const chunks = chunkBytes ? splitDocxXML(result.docxxml, chunkBytes) : [result.docxxml];
    if (chunks.length > 1 && argv['dry-run']) {
      for (const chunk of chunks) await createDoc(chunk, { ...opts, dryRun: true });
      console.error(`[mode-4] chunk dry-run: ${chunks.length} XML parts; append contract tested separately`);
    } else {
      const created = chunks.length > 1 ? await chunkedCreateDoc(chunks, opts) : await createDoc(result.docxxml, opts);
      for (const warning of created.warnings || []) console.error('[mode-4] service warning:', warning);
      if (created.tips) console.error('[mode-4] service tips:', created.tips);
      if (!opts.dryRun) console.log(created.url);
    }
    if (argv['dry-run']) console.error('[mode-4] CLI dry-run passed; no document created, cloud rendering not verified');
  }
} catch (err) {
  console.error('[mode-4] FAILED:', err.message);
  process.exitCode = 1;
} finally {
  if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true });
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

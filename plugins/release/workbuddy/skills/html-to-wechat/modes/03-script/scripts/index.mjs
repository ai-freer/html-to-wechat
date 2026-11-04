#!/usr/bin/env node
// Mode 3 · CLI 入口（HTML → 口播稿）
//
// 用法：
//   node index.mjs --input <html> [--plan plan.json] [--output spoken.md]
//   cat in.html | node index.mjs --stdin --output spoken.md
//
// 输出：markdown 到 stdout（便于管道）+ stats/warnings 到 stderr

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { transform } from './html-to-script.mjs';

const argv = parseArgs(process.argv.slice(2));
if (argv.help || (!argv.input && !argv.stdin)) {
  console.error(`Usage:
  node index.mjs --input <html> [--plan <json>] [--output <md>] [--dry-run]
  cat in.html | node index.mjs --stdin [--plan <json>] [--output <md>]

Options:
  --input <path>   HTML file to convert
  --stdin          Read HTML from stdin
  --plan <path>    Optional plan.json (overrides DEFAULT_PLAN: extractMain / bannedTags / keepImages / turndownOptions)
  --output <path>  Write markdown to file (also written to stdout)
  --dry-run        Conversion only; no file write
  --help           Show this help
`);
  process.exit(argv.help ? 0 : 1);
}

try {
  let html;
  if (argv.stdin) html = await readStdin();
  else html = await readFile(resolve(argv.input), 'utf8');

  let plan = {};
  if (argv.plan) plan = JSON.parse(await readFile(resolve(argv.plan), 'utf8'));

  const { md, stats, warnings } = transform(html, plan);
  if (!md) {
    console.error('[mode-3] empty output. warnings:', warnings.join(' / '));
    process.exit(1);
  }

  if (!argv['dry-run'] && argv.output) {
    await writeFile(resolve(argv.output), md, 'utf8');
    console.error(`[mode-3] wrote: ${argv.output} (${md.length} chars)`);
  }

  console.error('[mode-3] stats:', JSON.stringify({
    chars: stats?.chars,
    durationSec: stats?.durationSec,
    sentenceCount: stats?.sentenceCount,
    avgSentenceChars: stats?.avgSentenceChars,
    sectionCount: stats?.sections?.length,
  }, null, 2));
  if (warnings.length) {
    console.error('[mode-3] warnings:');
    warnings.forEach(w => console.error('  -', w));
  }
  if (stats?.sections?.length) {
    console.error('[mode-3] sections:');
    stats.sections.forEach((s, i) => {
      const dur = s.durationHint != null ? `(hint ${s.durationHint}s)` : `(est ${s.computedDurationSec}s)`;
      console.error(`  ${i + 1}. ${s.title} · ${s.chars} 字 ${dur}`);
    });
  }

  if (!argv['dry-run']) process.stdout.write(md);
  process.exit(0);

} catch (err) {
  console.error('[mode-3] FAILED:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const n = args[i + 1];
      if (n === undefined || n.startsWith('--')) out[k] = true;
      else { out[k] = n; i++; }
    }
  }
  return out;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => data += d);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

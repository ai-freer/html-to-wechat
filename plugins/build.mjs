#!/usr/bin/env node
import { mkdtemp, mkdir, cp, writeFile, lstat, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') {
  console.error('Usage: node plugins/build.mjs --out <new-output-directory>'); process.exit(1);
}
const out = resolve(args[1]);
let temp;
try {
  try { await lstat(out); throw new Error('Output already exists; choose a new directory'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(dirname(out), { recursive: true });
  temp = await mkdtemp(join(dirname(out), '.h2w-plugins-'));
  const build = spawnSync(process.execPath, [join(repo, 'scripts/build-skills.mjs'), '--out', join(temp, '_skills')], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`Skill build failed: ${build.stderr || build.stdout}`);
  const suite = join(temp, '_skills/html-to-wechat');
  for (const target of ['codex', 'claude', 'workbuddy', 'deepseek']) {
    const root = join(temp, target);
    await mkdir(join(root, 'skills'), { recursive: true });
    await cp(suite, join(root, 'skills/html-to-wechat'), { recursive: true });
    await cp(join(repo, 'plugins', target), root, { recursive: true });
    console.log(`[plugin build] ${target}`);
  }
  await rm(join(temp, '_skills'), { recursive: true });
  await rename(temp, out); temp = undefined;
  console.log(`[plugin build] output: ${out}`);
} catch (e) { console.error('[plugin build]', e.message); process.exitCode = 1; }
finally { if (temp) await rm(temp, { recursive: true, force: true }); }

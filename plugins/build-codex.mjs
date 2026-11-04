#!/usr/bin/env node
// Build a complete Codex plugin in a new directory; never overwrite existing output.
import { cp, mkdir, mkdtemp, rename, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') { console.error('Usage: node plugins/build-codex.mjs --out <new-directory>'); process.exit(1); }
const out = resolve(args[1]); let tmp;
try {
  try { await lstat(out); throw new Error('Output exists; choose a new directory'); } catch(e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(dirname(out), {recursive:true});
  tmp = await mkdtemp(join(dirname(out), '.h2w-codex-build-'));
  const build = spawnSync(process.execPath, [join(repo, 'scripts/build-skills.mjs'), '--out', join(tmp, 'packages')], {encoding:'utf8'});
  if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Skill build failed');
  const plugin = join(tmp, 'plugin'); await mkdir(join(plugin, 'skills'), {recursive:true});
  await cp(join(tmp, 'packages/html-to-wechat'), join(plugin, 'skills/html-to-wechat'), {recursive:true});
  await cp(join(repo, 'plugins/codex/plugin.json'), join(plugin, 'plugin.json'));
  await rename(plugin, out);
  console.log(`[codex plugin] built ${out}`);
} catch(e) { console.error('[codex plugin]',e.message); process.exitCode=1; }
finally { if(tmp) await rm(tmp,{recursive:true,force:true}); }

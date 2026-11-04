#!/usr/bin/env node
// Refresh or check the committed plugins that the marketplaces install.
//   node plugins/release.mjs           rebuild plugins/release/{claude,codex,workbuddy,deepseek}
//   node plugins/release.mjs --check   fail if they differ from a fresh build
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileList } from '../scripts/package-utils.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['claude', 'codex', 'workbuddy', 'deepseek'];
const args = process.argv.slice(2);
const check = args[0] === '--check';
if (args.length > 1 || (args.length === 1 && !check)) {
  console.error('Usage: node plugins/release.mjs [--check]'); process.exit(1);
}
// iCloud and similar sync tools can leave ignored copies such as "app 2.css" here.
const list = root => fileList(root).then(files => files.filter(f => !/ \d+(\.[^/]*)?$/.test(f))).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
const temp = await mkdtemp(join(tmpdir(), 'h2w-release-'));
try {
  const out = join(temp, 'plugins');
  const build = spawnSync(process.execPath, [join(repo, 'plugins/build.mjs'), '--out', out], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(build.stderr || build.stdout);
  const version = JSON.parse(await readFile(join(out, 'claude/skills/html-to-wechat/.skill-package.json'), 'utf8')).version;
  for (const [target, manifest] of [['claude', '.claude-plugin/plugin.json'], ['codex', 'plugin.json'], ['workbuddy', '.workbuddy-plugin/plugin.json'], ['deepseek', 'package.json']]) {
    const found = JSON.parse(await readFile(join(out, target, manifest), 'utf8')).version;
    if (found !== version) throw new Error(`${target} manifest version ${found} differs from skill package ${version}`);
  }
  for (const target of targets) {
    const fresh = join(out, target), release = join(repo, 'plugins/release', target);
    if (check) {
      const [a, b] = [await list(fresh), await list(release)];
      const diff = [...a.filter(f => !b.includes(f)), ...b.filter(f => !a.includes(f))];
      for (const f of a.filter(f => b.includes(f))) {
        if (!(await readFile(join(fresh, f))).equals(await readFile(join(release, f)))) diff.push(f);
      }
      if (diff.length) throw new Error(`plugins/release/${target} is out of date; run node plugins/release.mjs\n${diff.join('\n')}`);
      console.log(`[plugin release] ${target} up to date`);
    } else {
      await rm(release, { recursive: true, force: true });
      await cp(fresh, release, { recursive: true });
      console.log(`[plugin release] refreshed ${release}`);
    }
  }
} catch (e) { console.error('[plugin release]', e.message); process.exitCode = 1; }
finally { await rm(temp, { recursive: true, force: true }); }

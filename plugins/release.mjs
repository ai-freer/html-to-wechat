#!/usr/bin/env node
// Refresh or check the committed Claude plugin that the marketplace installs.
//   node plugins/release.mjs           rebuild plugins/release/claude
//   node plugins/release.mjs --check   fail if it differs from a fresh build
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileList } from '../scripts/package-utils.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(repo, 'plugins/release/claude');
const args = process.argv.slice(2);
const check = args[0] === '--check';
if (args.length > 1 || (args.length === 1 && !check)) {
  console.error('Usage: node plugins/release.mjs [--check]'); process.exit(1);
}
const list = root => fileList(root).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
const temp = await mkdtemp(join(tmpdir(), 'h2w-release-'));
try {
  const out = join(temp, 'plugins');
  const build = spawnSync(process.execPath, [join(repo, 'plugins/build.mjs'), '--out', out], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(build.stderr || build.stdout);
  const fresh = join(out, 'claude');
  if (check) {
    const [a, b] = [await list(fresh), await list(release)];
    const diff = [...a.filter(f => !b.includes(f)), ...b.filter(f => !a.includes(f))];
    for (const f of a.filter(f => b.includes(f))) {
      if (!(await readFile(join(fresh, f))).equals(await readFile(join(release, f)))) diff.push(f);
    }
    if (diff.length) throw new Error(`plugins/release/claude is out of date; run node plugins/release.mjs\n${diff.join('\n')}`);
    console.log('[plugin release] up to date');
  } else {
    await rm(release, { recursive: true, force: true });
    await cp(fresh, release, { recursive: true });
    console.log(`[plugin release] refreshed ${release}`);
  }
} catch (e) { console.error('[plugin release]', e.message); process.exitCode = 1; }
finally { await rm(temp, { recursive: true, force: true }); }

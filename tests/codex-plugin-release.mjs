// Verify the checked-in release and exercise Codex installation in an isolated home.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileList, verifyPackage } from '../scripts/package-utils.mjs';
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = await mkdtemp(join(tmpdir(), 'h2w-codex-release-'));
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, {cwd: repo, env, encoding:'utf8', timeout:30000});
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message); return result.stdout;
};
try {
  const fresh = join(work, 'fresh'), release = join(repo, 'plugins/release/codex');
  run(process.execPath, [join(repo, 'plugins/build-codex.mjs'), '--out', fresh]);
  const a = await fileList(fresh), b = await fileList(release);
  assert.deepEqual(a, b, 'release file list differs from a fresh build');
  for (const file of a) assert.ok((await readFile(join(fresh,file))).equals(await readFile(join(release,file))), `stale release file: ${file}`);
  await verifyPackage(join(release, 'skills/html-to-wechat'));
  const market = JSON.parse(await readFile(join(repo,'.agents/plugins/marketplace.json'),'utf8'));
  assert.equal(market.plugins[0].source.path, './plugins/release/codex');
  const codexHome=join(work,'home/.codex'); await mkdir(codexHome,{recursive:true});
  const env={...process.env, HOME:join(work,'home'), CODEX_HOME:codexHome};
  run('codex',['plugin','marketplace','add',repo,'--json'],env);
  const result=JSON.parse(run('codex',['plugin','add','html-to-wechat@html-to-wechat','--json'],env));
  await verifyPackage(join(result.installedPath,'skills/html-to-wechat'));
  const list=JSON.parse(run('codex',['plugin','list','--marketplace','html-to-wechat','--json'],env));
  assert.ok(list.installed.some(plugin=>plugin.name==='html-to-wechat' && plugin.enabled));
  console.log('Codex release matches source; isolated marketplace registration and installation passed');
} finally { await rm(work,{recursive:true,force:true}); }

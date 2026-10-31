import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const mode of ['01-richtext','02-images','03-script','04-feishu']) {
  const file=new URL(`../skill/modes/${mode}/scripts/render-snapshot.mjs`,import.meta.url);
  const {fileURLToPath}=await import('node:url');
  const r=spawnSync(process.execPath,[fileURLToPath(file)],{encoding:'utf8'});
  assert.equal(r.status,1,`${mode} must fail on missing CLI arguments`);
  assert.match(r.stderr,/Usage: node render-snapshot/);
}
console.log('four snapshot CLI entrypoint checks passed (rendering requires puppeteer)');

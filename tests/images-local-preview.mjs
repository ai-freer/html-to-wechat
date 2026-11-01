import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));

const dir = await mkdtemp(join(tmpdir(), 'h2w-images-preview-'));
const image = Buffer.from('local-image-fixture');
let child;
try {
  await writeFile(join(dir, 'card.png'), image);
  await writeFile(join(dir, 'payload.json'), JSON.stringify({title:'本地测试',captionText:'文案',images:[{src:'card.png',alt:'封面'}]}));
  const script = process.argv[2] || resolve(root, 'skill/modes/02-images/scripts/preview-local.mjs');
  child = spawn(process.execPath, [script, join(dir, 'payload.json')], {stdio:['ignore','pipe','pipe']});
  const [chunk] = await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => {throw new Error(`server exited: ${code}`);})]);
  const url = new URL(chunk.toString().trim());
  assert.equal(url.hostname, '127.0.0.1');
  const payload = JSON.parse(Buffer.from(url.hash.slice(5), 'base64url'));
  assert.equal(payload.title, '本地测试');
  assert.equal((await fetch(url.origin + url.pathname)).status, 200);
  const response = await fetch(payload.images[0].src);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.equal((await fetch(url.origin + '/missing')).status, 404);
  assert.equal((await fetch(url.origin + '/images/jszip.min.js')).status, 200);
  assert.match(await readFile(resolve(root, 'skill/modes/02-images/preview/images/JSZIP-LICENSE.md'),'utf8'), /JSZip/i);
  console.log('Local image preview: payload, loopback, bundled page and ZIP library, image bytes, and whitelist passed');
} finally { if (child) child.kill(); await rm(dir, {recursive:true,force:true}); }

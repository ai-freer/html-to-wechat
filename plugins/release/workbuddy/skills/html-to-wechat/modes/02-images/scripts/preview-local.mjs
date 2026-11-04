#!/usr/bin/env node
// Serve only the bundled preview and explicitly listed local image files on loopback.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePayload } from './payload.mjs';

const [, , input] = process.argv;
if (!input) { console.error('Usage: node preview-local.mjs <payload.json>'); process.exit(1); }
const payloadPath = resolve(input);
const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
if (!Array.isArray(payload.images) || !payload.images.length) throw new Error('images 必须是非空数组');
const images = await Promise.all(payload.images.map(async (image, i) => {
  if (!image || typeof image.src !== 'string' || /^(?:[a-z]+:|\/\/)/i.test(image.src)) throw new Error(`第 ${i + 1} 张必须是本地文件路径`);
  const path = await realpath(resolve(dirname(payloadPath), image.src));
  const type = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}[extname(path).toLowerCase()];
  if (!type) throw new Error(`第 ${i + 1} 张格式不受支持`);
  await readFile(path);
  return { path, type };
}));
const preview = resolve(dirname(fileURLToPath(import.meta.url)), '../preview');
const staticFiles = new Map([['/landing.css','landing.css'], ['/images/','images/index.html'], ['/images/index.html','images/index.html'], ['/images/jszip.min.js','images/jszip.min.js'], ['/images/app.css','images/app.css'], ['/images/app.mjs','images/app.mjs'], ['/images/payload.mjs','images/payload.mjs']]);
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) { res.writeHead(403).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    const match = /^\/image\/(\d+)$/.exec(path);
    let file, type;
    if (match && images[Number(match[1])]) ({path:file, type} = images[Number(match[1])]);
    else if (staticFiles.has(path)) { file = join(preview, staticFiles.get(path)); type = path.endsWith('.css') ? 'text/css; charset=utf-8' : (path.endsWith('.mjs') || path.endsWith('.js')) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'; }
    else { res.writeHead(404).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'}).end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500).end(); }
});
server.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const value = {...payload, images:payload.images.map((image, i) => ({...image, src:`${base}/image/${i}`}))};
  console.log(`${base}/images/#app=${encodePayload(value)}`);
  console.error('本地预览运行中；按 Ctrl+C 停止。请勿公开分享含文案和提示词的链接。');
});

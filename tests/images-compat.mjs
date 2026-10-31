import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePayload, encodePayload } from '../web/images/payload.mjs';
const payload = normalizePayload({ title:'中文图集', captionTags:['#测试','#图集'], images:[{src:'https://example.com/1.png',alt:'01 / 封面',prompt:'完整提示'}] });
assert.equal(payload.images[0].alt, '封面');
assert.deepEqual(JSON.parse(Buffer.from(encodePayload(payload), 'base64url').toString()), payload);
assert.throws(()=>normalizePayload({ images:[{src:'javascript:alert(1)'}] }), /不受支持/);
assert.throws(()=>normalizePayload({ images:[] }), /非空/);
assert.deepEqual(normalizePayload({...payload,captionTags:'#甲 #乙'}).captionTags, ['#甲','#乙']);
assert.equal(await readFile(new URL('../web/images/payload.mjs', import.meta.url), 'utf8'), await readFile(new URL('../skill/modes/02-images/scripts/payload.mjs', import.meta.url), 'utf8'));
console.log('images payload/schema checks passed');

// Run the real app in an isolated DOM; no browser/system state is touched.
const { JSDOM } = await import('jsdom');
const html = await readFile(new URL('../web/images/index.html', import.meta.url),'utf8');
const app = (await readFile(new URL('../web/images/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const initial = {...payload,images:[{src:'https://example.com/1.png',alt:'封面',prompt:'一'},{src:'https://example.com/2.png',alt:'内页',prompt:'二'}]};
function mount(url) {
  const dom = new JSDOM(html,{url,runScripts:'outside-only'});
  Object.assign(dom.window,{JSZip:class {}, normalizePayload,encodePayload});
  dom.window.eval(app);
  return dom;
}
const dom=mount('http://localhost/images/#app='+encodePayload(initial));
const {window:w}=dom; const nodes=w.document.querySelectorAll('.gallery-item');
nodes[0].dispatchEvent(new w.Event('dragstart'));
nodes[1].dispatchEvent(new w.MouseEvent('dragover',{clientX:100}));
nodes[0].dispatchEvent(new w.Event('dragend'));
assert.equal(w.document.querySelector('.gallery img').alt,'内页');
const saved=JSON.parse(Buffer.from(w.location.hash.slice(5),'base64url').toString());
assert.equal(saved.images[0].alt,'内页');
assert.equal(w.document.querySelector('.caption-tags').textContent,'#测试 #图集');
const reload=mount(w.location.href);
assert.equal(reload.window.document.querySelector('.gallery img').alt,'内页');
dom.window.close();reload.window.close();
console.log('images app drag → fragment → reload checks passed');

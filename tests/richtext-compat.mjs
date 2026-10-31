import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Override for isolated dependency installation, e.g. WECHAT_TRANSFORM=/tmp/.../transform.mjs.
const moduleUrl = process.env.WECHAT_TRANSFORM
  ? pathToFileURL(process.env.WECHAT_TRANSFORM).href
  : new URL('../skill/modes/01-richtext/scripts/transform.mjs', import.meta.url).href;
const { transform } = await import(moduleUrl);
const noExtract = { extractMain: false };
const simple = '<table border="1" style="background-color:#d6f3df;border:2px solid #c65040;border-radius:18px"><tr><td>左</td><td>右</td></tr></table>';
let r = transform(simple, noExtract);
assert.equal(r.stats.counters.roundedTables, 1);
assert.match(r.html, /border-collapse:\s*separate/i);
assert.match(r.html, /border-radius:\s*18px 0 0 18px/i);
assert.match(r.html, /border-radius:\s*0 18px 18px 0/i);
assert.doesNotMatch(r.html, /<table[^>]*\sborder="1"/i);
r = transform('<table width="100%" border="1" style="background-color:#d6f3df;border:2px solid #c65040;border-radius:18px"><tr><td>单格</td></tr></table>', noExtract);
assert.equal(r.stats.counters.roundedTables, 1);
assert.match(r.html, /<section[^>]*border-radius:\s*18px/i);
assert.doesNotMatch(r.html, /<table/i);
assert.match(r.html, /单格/);
for (const html of [
  '<table width="400" style="border:2px solid red;border-radius:18px"><tr><td>A</td></tr></table>',
  '<table width="100%" style="border:2px solid red;border-radius:18px"><tr><td style="text-align:right">A</td></tr></table>',
  '<table style="border:2px solid red;border-radius:18px"><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>',
  '<table style="border:2px solid red;border-radius:18px"><tr><td colspan="2">A</td><td>B</td></tr></table>',
  '<table style="border:2px solid red;border-radius:18px"><tr><td style="background-color:blue">A</td><td>B</td></tr></table>',
  '<table style="border:2px solid red;border-radius:18px;border-collapse:separate"><tr><td>A</td><td>B</td></tr></table>'
]) assert.equal(transform(html, noExtract).stats.counters.roundedTables, 0);

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="tip"></marker></defs><path d="M0 0L5 5" marker-end="url(#tip)"/><circle><animate attributeName="opacity" values="0;1" dur="2s"/></circle></svg>';
r = transform(svg, noExtract);
assert.equal(r.stats.svgFidelity.changedAnimations, 0);
assert.deepEqual(r.stats.svgFidelity.lost, []);
assert.deepEqual(r.stats.svgFidelity.brokenRefs, []);
r = transform(svg, { ...noExtract, directives: [{selector:'animate', action:'remove'}] });
assert.equal(r.stats.svgFidelity.changedAnimations, 1);
assert.ok(r.stats.svgFidelity.lost.some(x => x.startsWith('animate ')));
r = transform(svg, { ...noExtract, directives: [{selector:'marker', action:'remove'}] });
assert.deepEqual(r.stats.svgFidelity.brokenRefs, ['tip']);
r = transform(svg, { ...noExtract, directives: [{selector:'path', action:'remove'}] });
assert.deepEqual(r.stats.svgFidelity.lostRefs, ['tip']);
for (const file of ['probe-motion.html', 'probe-v2.html']) {
 const html = await readFile(new URL('../samples/probe/wechat-compat/' + file, import.meta.url), 'utf8');
 const result = transform(html);
 assert.deepEqual(result.stats.svgFidelity.lost, [], file);
 assert.equal(result.stats.svgFidelity.changedAnimations, 0, file);
 assert.deepEqual(result.stats.svgFidelity.brokenRefs, [], file);
}
console.log('PASS: rounded table boundaries, excluded cases, SVG change detection and motion fixtures');

const hiddenProse = '<main><div style="display:none"><h2>隐藏章节标题</h2><p>此处有足够长的正文需要判断是否展开。</p></div></main>';
r = transform(hiddenProse, noExtract);
assert.equal(r.stats.counters.hiddenTextBlocks, 1);
assert.ok(r.warnings.some(w => w.level === 'warn' && w.text.includes('隐藏或完全透明')));
r = transform(hiddenProse, { ...noExtract, directives: [{selector:'div',action:'unwrap'}] });
assert.equal(r.stats.counters.hiddenTextBlocks, 0);

// SVG style sheets can contain stateful selectors that must not be inlined.
const dynamicSvg = `<html><head><style>p{color:red}</style></head><body><p>正文</p><svg xmlns="http://www.w3.org/2000/svg"><style>.screen{display:none}.screen:target{display:inline}</style><g id="home"></g><a href="#panel"><rect width="30" height="30"/></a><g id="panel" class="screen"><text>面板</text><a href="#home"><text>返回</text></a></g></svg></body></html>`;
r = transform(dynamicSvg, noExtract);
assert.match(r.html, /<p[^>]*style="[^"]*color:\s*red/i);
assert.match(r.html, /<svg[\s\S]*<style>\.screen\{display:none\}\.screen:target\{display:inline\}<\/style>/);
assert.match(r.html, /href="#panel"/);
assert.match(r.html, /href="#home"/);
assert.doesNotMatch(r.html, /class="screen"\s+style="[^"]*display:\s*none/i);
assert.equal(r.stats.svgFidelity.changedStyles, 0);
assert.deepEqual(r.stats.svgFidelity.brokenRefs, []);
assert.ok(r.warnings.some(w => w.level === 'warn' && w.text.includes('SVG 内含样式规则')));
const removedStyle = transform(dynamicSvg, { ...noExtract, directives: [{selector:'svg style',action:'remove'}] });
assert.equal(removedStyle.stats.svgFidelity.changedStyles, 1);
assert.ok(removedStyle.warnings.some(w => w.text.includes('样式块丢失或变化')));
console.log('PASS: SVG dynamic CSS and fragment links retained; style loss detected');
assert.ok(r.warnings.some(w => w.text.includes(':target 片段状态') && w.text.includes('保存后失效')));
const fallbackInput = '<svg xmlns="http://www.w3.org/2000/svg"><style>.route:target{opacity:1;pointer-events:auto}</style><rect fill="green"/><g id="panel" class="route" opacity="0" pointer-events="none"><rect fill="blue"/></g></svg>';
const fallbackResult = transform(fallbackInput, { ...noExtract, directives: [{selector:'svg style',action:'remove'}] });
assert.match(fallbackResult.html, /<g[^>]*opacity="0"[^>]*pointer-events="none"/);
assert.equal(fallbackResult.stats.svgFidelity.changedStyles, 1);
console.log('PASS: static fallback attributes survive SVG style removal');


const layoutResult = transform(`<div style="position:relative"><p>说明正文</p><span style="position:absolute;top:50%;right:24px;transform:translateY(-50%)">8–12%</span></div><div style="width:12%;height:28px;display:flex;background:#5080ef">300亿</div><p style="transform:rotate(2deg)">正常流文字</p>`, noExtract);
assert.doesNotMatch(layoutResult.html, /translateY/i);
assert.match(layoutResult.html, /white-space:\s*nowrap/i);
assert.match(layoutResult.html, /width:\s*12%/i);
assert.match(layoutResult.html, /rotate\(2deg\)/i);
assert.match(layoutResult.text, /8–12%/);
assert.match(layoutResult.text, /300亿/);
const proseLayout = transform('<div style="display:flex;width:20%;height:28px">这是一段超过二十个字符的正文，包含数字2026，不应强制不换行。</div>', noExtract);
assert.doesNotMatch(proseLayout.html, /white-space:\s*nowrap/i);
console.log('PASS: positioned text rejoins flow; short percentage-bar labels stay on one line; normal prose unchanged');

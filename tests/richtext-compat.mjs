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

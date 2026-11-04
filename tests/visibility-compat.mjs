// Pre-conversion visibility: collapsed content is revealed, unreachable content
// is removed, and uncertain content stays as it was and is reported.
import assert from 'node:assert/strict';
import { triage } from '../skill/modes/03-script/scripts/visibility.mjs';

const page = `<!doctype html><html><head><style>.tab{display:none}.tab.on{display:block}.acc{max-height:0;overflow:hidden}.gone{display:none}.vis{visibility:hidden}.panel-x{display:none}</style></head><body><main>
<h1>标题</h1><p>可见正文</p>
<details><summary>折叠标题</summary><p>折叠A</p></details>
<button onclick="show('t2')">切换</button><div id="t1" class="tab on">折叠B</div><div id="t2" class="tab">折叠C</div>
<button onclick="open1('a1')">展开</button><div class="acc" id="a1"><p>折叠D</p></div>
<div role="tabpanel" hidden>折叠K</div>
<p class="gone">隐藏E</p><p style="display:none">隐藏F</p><p hidden>隐藏G</p><p class="vis">隐藏H</p>
<!-- 隐藏I --><template><p>隐藏J</p></template>
<div class="panel-x">待判断L</div>
<script>function show(i){}</script></main></body></html>`;

const { html, report, warnings, changed } = await triage(page);
assert.equal(changed, true);
const plain = html.replace(/<style[\s\S]*?<\/style>/g, '');
for (const text of ['可见正文', '折叠A', '折叠B', '折叠C', '折叠D', '折叠K', '待判断L']) assert.ok(plain.includes(text), text);
for (const text of ['隐藏E', '隐藏F', '隐藏G', '隐藏H', '隐藏I', '隐藏J']) assert.ok(!plain.includes(text), text);
assert.match(plain, /id="t2"[^>]*style="display:block"/);
assert.match(plain, /id="a1"[^>]*max-height:none;overflow:visible/);
assert.deepEqual(report.uncertain.map(item => item.selector), ['div.panel-x']);
assert.ok(warnings.some(text => text.includes('--visibility-plan')));

const resolved = await triage(page, new URL('./fixtures/visibility-plan.json', import.meta.url).pathname);
assert.ok(!resolved.html.includes('待判断L'));

const untouched = '<!doctype html>\n<html><body><main><h1 class="a">标题 &amp; 内容</h1>  <p>正文</p></main></body></html>\n';
const same = await triage(untouched);
assert.equal(same.changed, false);
assert.equal(same.html, untouched);
for (const [name, source] of [
  ['opacity animation', '<!doctype html><html><head><style>.fade{opacity:0}</style></head><body><p class="fade">保留</p></body></html>'],
  ['print-only rule', '<!doctype html><html><head><style>@media print{.x{display:none}}</style></head><body><p class="x">保留</p></body></html>'],
  ['hover rule', '<!doctype html><html><head><style>.x:hover{display:none}</style></head><body><p class="x">保留</p></body></html>'],
]) assert.equal((await triage(source)).html, source, name);
const external = await triage('<!doctype html><html><head><script src="a.js"></script></head><body><p hidden>外部脚本</p></body></html>');
assert.equal(external.report.uncertain.length, 1);
console.log('visibility triage: collapsed, hidden, uncertain and untouched pages passed');

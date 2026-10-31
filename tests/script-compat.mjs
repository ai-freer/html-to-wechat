import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { transform } from '../skill/modes/03-script/scripts/html-to-script.mjs';
import { analyze, mdToPlain } from '../web/script/analyze.mjs';
import { sanitizePreview } from '../web/script/preview.mjs';

const input = '<main><h1>报告</h1><article><p>第一章较长正文。</p></article><article><p>第二章。</p></article><p>结尾。</p></main>';
const result = transform(input);
assert.match(result.md, /第一章/);
assert.match(result.md, /第二章/);
assert.match(result.md, /结尾/);
assert.ok(result.warnings.some(w => w.includes('2 个 article')));
assert.ok(result.warnings.some(w => w.includes('提取稿')));
assert.equal(mdToPlain('## 第一段\n第一句。\n\n第二句。'), '第一段\n第一句。\n\n第二句。');
assert.equal(analyze('字'.repeat(250)).durationSec, 60);
assert.equal(await readFile(new URL('../web/script/analyze.mjs', import.meta.url), 'utf8'),
  await readFile(new URL('../skill/modes/03-script/scripts/analyze.mjs', import.meta.url), 'utf8'));

// A title and section label must not be glued to the first spoken sentence.
const titled = '# ' + '长标题'.repeat(10) + '\n\n## 第一章\n这是一句简短的旁白。';
assert.equal(analyze(titled).sentenceCount, 1);
assert.equal(analyze(titled).avgSentenceChars, '这是一句简短的旁白。'.length);
assert.deepEqual(analyze(titled).warnings, []);
assert.equal(analyze(titled).chars, mdToPlain(titled).replace(/\s/g, '').length);
assert.ok(analyze('## 标题\n' + '字'.repeat(51) + '。').warnings.includes('1 句超 50 字'));
assert.deepEqual(analyze('## 标题\n' + '短 '.repeat(30) + '。').warnings, []);

const dom = new JSDOM('', { url: 'http://localhost/' });
const frag = sanitizePreview('<script>bad()</script><svg onload="bad()"></svg><img src="data:image/png;base64,AA==" onerror="bad()"><a href="java&#x73;cript:bad()">链接</a><iframe srcdoc="bad"></iframe><h2 data-section-meta="12 字">标题</h2>', dom.window.document);
const wrapper = dom.window.document.createElement('div');
wrapper.append(frag);
assert.equal(wrapper.querySelector('script,svg,iframe,[onerror],[onload],[srcdoc]'), null);
assert.equal(wrapper.querySelector('a').hasAttribute('href'), false);
assert.equal(wrapper.querySelector('h2').dataset.sectionMeta, '12 字');
assert.ok(wrapper.querySelector('img').src.startsWith('data:image/png;'));
console.log('script compatibility checks passed');

// Exercise same-document Agent result delivery through the real app event handler.
const pageHtml = await readFile(new URL('../web/script/index.html', import.meta.url), 'utf8');
const pageScript = (await readFile(new URL('../web/script/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const delivery = new JSDOM(pageHtml, { url: 'http://localhost/script/', runScripts: 'outside-only' });
Object.assign(delivery.window, { analyze, mdToPlain, sanitizePreview,
  marked: { setOptions() {}, parse(md) { return '<p>' + md + '</p>'; } } });
delivery.window.eval(pageScript);
for (const content of ['## 第一章\n这是第一份稿。', '## 第二章\n这是新稿，保留中文。']) {
  delivery.window.history.replaceState(null, '', '#payload=' + encodeURIComponent(Buffer.from(content).toString('base64')));
  delivery.window.dispatchEvent(new delivery.window.HashChangeEvent('hashchange'));
  assert.equal(delivery.window.document.querySelector('#src').value, content);
  assert.equal(delivery.window.document.querySelector('#m-chars').textContent, String(analyze(content).chars));
}
// Ordinary anchors must not erase an existing draft.
delivery.window.history.replaceState(null, '', '#other');
delivery.window.dispatchEvent(new delivery.window.HashChangeEvent('hashchange'));
assert.match(delivery.window.document.querySelector('#src').value, /这是新稿/);
delivery.window.close();
console.log('script same-page Agent payload delivery passed');

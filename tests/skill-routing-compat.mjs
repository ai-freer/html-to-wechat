import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform as richtext } from '../skill/modes/01-richtext/scripts/transform.mjs';
import { transform as feishu } from '../skill/modes/04-feishu/scripts/html-to-docxxml.mjs';
const example = async path => {
  const md = await readFile(new URL(path, import.meta.url), 'utf8');
  return JSON.parse(md.match(/```json\n([\s\S]*?)\n```/)[1]);
};
// Execute the actual plans shown to an Agent, catching unsupported or mixed schemas.
const w = await example('../skill/modes/01-richtext/SKILL.md');
const input = '<main><div class="toolbar"><button>REMOVE_UI</button></div><div class="tab-panel" style="display:none"><h2>RETAIN_TITLE</h2><p>RETAIN_BODY</p></div><div class="notice">RETAIN_NOTICE</div></main>';
const wr = richtext(input, w);
assert(!wr.html.includes('REMOVE_UI'));
assert(wr.html.includes('RETAIN_TITLE'));
assert(wr.html.includes('RETAIN_BODY'));
assert(!wr.html.includes('display:none'));
const f = await example('../skill/modes/04-feishu/SKILL.md');
const fr = feishu(input, f);
assert(!fr.docxxml.includes('REMOVE_UI'));
assert(fr.docxxml.includes('RETAIN_TITLE'));
assert(fr.docxxml.includes('RETAIN_BODY'));
assert(fr.docxxml.includes('<callout'));
assert(fr.docxxml.includes('RETAIN_NOTICE'));
console.log('Published Skill plan examples execute and preserve hidden body content');

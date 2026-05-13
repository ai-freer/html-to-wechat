#!/usr/bin/env node
// Mode 4 · update-doc.mjs 端到端 demo
//
// 用法：
//   node demo-update.mjs <docId>
//
// 跑完后该文档应包含 8 处实际可见的精修轨迹（每个 helper 一次）。
// 用 Chrome MCP 视觉质检。
//
// 注意：会修改你给的文档！先用一个 throwaway doc 跑（如新创建的 bench v0.3a 那种）。

import {
  appendToDoc,
  replaceSection,
  replaceByText,
  insertAfterSection,
  insertBeforeSection,
  insertAfterText,
  deleteByText,
  deleteSection,
} from './update-doc.mjs';

const docId = process.argv[2];
if (!docId) {
  console.error('Usage: node demo-update.mjs <docId>');
  process.exit(1);
}

const log = (label, res) => {
  const tag = res.ok ? '✓' : '✗';
  console.error(`[demo-update] ${tag} ${label}: mode=${res.mode}`);
};

try {
  // 1) append — 追加一条 footer
  let res = await appendToDoc(docId, `
## v0.4 demo-append

本节由 v0.4 demo-update.mjs 在文档末尾追加。helper: \`appendToDoc()\`
`);
  log('appendToDoc', res);

  // 2) insertAfterSection — 在追加的章节后插
  res = await insertAfterSection(docId, '## v0.4 demo-append', `
## v0.4 demo-insertAfterSection

helper: \`insertAfterSection('## v0.4 demo-append', ...)\`
`);
  log('insertAfterSection', res);

  // 3) insertBeforeSection — 在 v0.4 demo-insertAfter 之前插
  res = await insertBeforeSection(docId, '## v0.4 demo-insertAfterSection', `
## v0.4 demo-insertBeforeSection

helper: \`insertBeforeSection('## v0.4 demo-insertAfterSection', ...)\`
`);
  log('insertBeforeSection', res);

  // 4) replaceSection — 整段替换 demo-append
  res = await replaceSection(docId, '## v0.4 demo-append', `
## v0.4 demo-replaceSection

原 demo-append 段已被 \`replaceSection('## v0.4 demo-append', ...)\` 整体替换。
能看到此句就说明 mode=replace_range + selection-by-title 生效。
`);
  log('replaceSection', res);

  // 5) insertAfterText — 用 'start...end' 选 v0.4 demo-replaceSection 后插
  res = await insertAfterText(docId, '原 demo-append 段...mode=replace_range + selection-by-title 生效。', `

> helper: \`insertAfterText('start...end', ...)\` —— 在文本片段后插入引用块。
`);
  log('insertAfterText', res);

  // 6) replaceByText — 直接替换某段文本（这里再加一段 demo-block 然后改它）
  await appendToDoc(docId, `
## v0.4 demo-block-to-replace

原始内容（待 replaceByText 替换）。
`);
  res = await replaceByText(docId, '原始内容（待 replaceByText 替换）。', `
**[已替换]** 这段由 \`replaceByText('原始内容...', ...)\` 整段替换。
`);
  log('replaceByText', res);

  // 7) deleteByText — 删除某个 paragraph
  await appendToDoc(docId, `
## v0.4 demo-to-delete

这一节就是用来被 deleteSection 删掉的。看不到就说明删除生效。
`);
  res = await deleteByText(docId, '这一节就是用来被 deleteSection 删掉的。看不到就说明删除生效。');
  log('deleteByText', res);

  // 8) deleteSection — 删除 ## H2
  res = await deleteSection(docId, '## v0.4 demo-to-delete');
  log('deleteSection', res);

  console.error(`[demo-update] all 8 helpers exercised. Open the document to verify.`);
} catch (err) {
  console.error('[demo-update] FAILED:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

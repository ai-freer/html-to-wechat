#!/usr/bin/env node
// Syntax/contract demo only. Never modifies a real document.
import { appendToDoc, overwriteDoc, replaceSection, replaceByText, insertAfterSection,
  insertBeforeSection, insertAfterText, deleteByText, deleteSection } from './update-doc.mjs';
const id = process.argv[2] || 'audit_synthetic_not_real';
const opts = { dryRun: true, blockId: 'audit_fresh_block', previousBlockId: '0' };
const cases = [
  ['append', () => appendToDoc(id, '合成追加', opts)],
  ['overwrite', () => overwriteDoc(id, '合成全文', opts)],
  ['replaceSection', () => replaceSection(id, '## 合成章节', '合成替换', opts)],
  ['replaceByText', () => replaceByText(id, '旧文字', '新文字', { dryRun: true })],
  ['insertAfterSection', () => insertAfterSection(id, '## 合成章节', '合成插入', opts)],
  ['insertBeforeSection', () => insertBeforeSection(id, '## 合成章节', '合成插入', opts)],
  ['insertAfterText', () => insertAfterText(id, '合成锚点', '合成插入', opts)],
  ['deleteByText', () => deleteByText(id, '合成锚点', opts)],
  ['deleteSection', () => deleteSection(id, '## 合成章节', opts)],
];
for (const [name, run] of cases) {
  try { await run(); console.log(`${name}: CLI dry-run passed`); }
  catch(e) { console.error(`${name}: ${e.message}`); process.exitCode = 1; }
}

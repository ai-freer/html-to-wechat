// CLI v2: content format is explicit; resources/ranges use fresh block IDs.
import { runLark } from './cli.mjs';

export async function updateDoc(docId, command, content, opts = {}) {
  if (!docId) throw new Error('docId required');
  const args = ['docs', '+update', '--doc', docId, '--command', command, '--doc-format', opts.format || 'markdown'];
  for (const [key, flag] of [['blockId', '--block-id'], ['startBlockId', '--start-block-id'], ['endBlockId', '--end-block-id'], ['pattern', '--pattern']]) {
    if (opts[key] != null) args.push(flag, String(opts[key]));
  }
  if (content != null) args.push('--content', '-');
  if (opts.dryRun) args.push('--dry-run');
  const raw = await runLark(args, content, opts);
  return { ok: true, mode: command, raw, warnings: raw.data?.warnings || [], tips: raw.data?.tips || '' };
}
function requireAnchor(opts) {
  if (!opts.blockId && !(opts.startBlockId && opts.endBlockId)) throw new Error('先用 docs +fetch --detail full 获取最新 block ID；传入 blockId 或 startBlockId/endBlockId，不再使用旧版标题/省略号定位。');
}
export const appendToDoc = (id, md, opts = {}) => updateDoc(id, 'append', md, opts);
export const overwriteDoc = (id, md, opts = {}) => updateDoc(id, 'overwrite', md, opts);
export function replaceSection(id, heading, md, opts = {}) {
  requireAnchor(opts); return updateDoc(id, 'block_replace', md, opts);
}
export function replaceByText(id, pattern, md, opts = {}) {
  if (opts.blockId || opts.startBlockId) return updateDoc(id, 'block_replace', md, opts);
  if (/\.\.\.|…|\n/.test(pattern)) throw new Error('跨块/省略号替换须传最新 block ID；str_replace 仅用于简单行内文本。');
  return updateDoc(id, 'str_replace', md, { ...opts, pattern });
}
export function insertAfterSection(id, heading, md, opts = {}) {
  if (!opts.blockId) throw new Error('插入须传最新锚点 blockId');
  return updateDoc(id, 'block_insert_after', md, opts);
}
export function insertBeforeSection(id, heading, md, opts = {}) {
  if (opts.previousBlockId == null) throw new Error('插入前方须传 previousBlockId；文首用 0。');
  return updateDoc(id, 'block_insert_after', md, { ...opts, blockId: opts.previousBlockId });
}
export const insertAfterText = insertAfterSection;
export function deleteByText(id, text, opts = {}) {
  requireAnchor(opts); return updateDoc(id, 'block_delete', null, opts);
}
export const deleteSection = deleteByText;

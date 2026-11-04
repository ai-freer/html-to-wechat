import { runLark } from './cli.mjs';

export async function createDoc(docxxml, opts = {}) {
  const args = ['docs', '+create', '--doc-format', 'xml', '--content', '-'];
  if (opts.dryRun) args.push('--dry-run');
  if (opts.parentToken) args.push('--parent-token', opts.parentToken);
  const json = await runLark(args, docxxml, opts);
  const doc = json.data?.document || {};
  if (!opts.dryRun && (!doc.url || !doc.document_id)) throw new Error('Creation returned no document URL/id; inspect CLI result before retrying');
  return { url: doc.url || '', documentId: doc.document_id || '', newBlocks: doc.new_blocks || [],
    warnings: json.data?.warnings || [], tips: json.data?.tips || '', raw: json, dryRun: !!opts.dryRun };
}

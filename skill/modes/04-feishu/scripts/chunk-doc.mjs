// Mode 4 · v0.5d 实现层 — DocxXML 分块创建 + 增量 append
//
// 触发场景：DocxXML 体积超过飞书 +create 的解析上限（经验阈值 ~200-500KB，
// 真实失败样本现在没有）。手动触发用 `--chunk-bytes <N>`；未来加自动错误
// 检测（捕获 +create 4xx + length-related stderr）。
//
// 策略：把 DocxXML 在**顶层 block 边界**切分成 N 块（每块 ≤ N bytes）：
//   - chunk[0]: <title>...</title>\n + 前 K 个顶层块
//   - chunk[1..]: 续余顶层块（无 <title>）
// 然后：
//   - chunk[0] 走 lark-cli docs +create --api-version v2 --content -
//   - chunk[1..] 走 lark-cli docs +update --api-version v2 --command append
//                          --doc <id> --content - --doc-format xml
//
// 见 ROADMAP §「Mode 4 v0.5d」

import { spawn } from 'node:child_process';
import { createDoc } from './create-doc.mjs';

const LARK_CLI = process.env.LARK_CLI_BIN || 'lark-cli';

/**
 * 把 DocxXML 切成 ≤ maxBytes 的若干 chunk，**按顶层 block 边界**。
 *
 * 顶层 block = `<title>` + 顶层 `<p|h1-9|ul|ol|table|callout|grid|whiteboard|...>`。
 * 不切容器内部（不分裂 `<grid>` 的 children），不破坏 mermaid `\n`。
 *
 * 算法：用 SAX-lite 扫一遍，记录 depth=1 关闭点的位置 → 候选切割点。
 * 然后贪心：从 0 开始，累积到接近 maxBytes 时在最近的切割点切。
 *
 * @param {string} docxxml — 完整 DocxXML 字符串（含 `<title>...</title>` 开头）
 * @param {number} maxBytes — 每块上限字节数（建议 ≥ 50KB；太小会切碎降低性能）
 * @returns {Array<string>} chunks
 */
export function splitDocxXML(docxxml, maxBytes) {
  if (!docxxml || docxxml.length <= maxBytes) return [docxxml];

  // 找所有顶层 block 关闭点（depth 从 1 回到 0 的位置）
  const cuts = findTopLevelCutPoints(docxxml);
  if (cuts.length === 0) return [docxxml];  // 没有边界可切

  // 提取 <title>...</title> 单独保留给 chunk[0]
  const titleMatch = docxxml.match(/^\s*<title>[\s\S]*?<\/title>\s*\n?/);
  const titlePrefix = titleMatch ? titleMatch[0] : '';
  const titleEnd = titleMatch ? titleMatch[0].length : 0;

  const chunks = [];
  let start = titleEnd;
  while (start < docxxml.length) {
    const target = start + maxBytes - (chunks.length === 0 ? titlePrefix.length : 0);
    let end = pickNextCut(cuts, start, target);
    // 没有合适的切割点（剩余内容无顶层 block 边界）→ 取到末尾
    if (end === -1 || end <= start) end = docxxml.length;
    const body = docxxml.slice(start, end).trim();
    if (body.length === 0) break;  // 防御：避免空块导致死循环
    chunks.push(chunks.length === 0 ? titlePrefix + body : body);
    start = end;
  }
  return chunks.filter(c => c && c.length > 0);
}

function findTopLevelCutPoints(s) {
  // 顶层 block 列表（DocxXML 已知的块级 tag）
  const BLOCK = /^(p|h[1-9]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|hr|img|callout|grid|column|whiteboard|figure|checkbox)$/i;
  const cuts = [];
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '<') { i++; continue; }
    // self-closing? </tag>?
    const closeMatch = s.slice(i).match(/^<\/([a-zA-Z][\w-]*)>/);
    const openMatch = !closeMatch && s.slice(i).match(/^<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/);
    if (closeMatch) {
      const tag = closeMatch[1];
      if (BLOCK.test(tag)) depth--;
      i += closeMatch[0].length;
      if (depth === 0) cuts.push(i);  // 顶层 block 结束
    } else if (openMatch) {
      const tag = openMatch[1];
      const selfClose = openMatch[3] === '/' || ['img', 'br', 'hr', 'col'].includes(tag.toLowerCase());
      if (BLOCK.test(tag) && !selfClose) depth++;
      i += openMatch[0].length;
      if (selfClose && depth === 0 && BLOCK.test(tag)) cuts.push(i);
    } else {
      i++;
    }
  }
  return cuts;
}

function pickNextCut(cuts, start, target) {
  // 返回 > start 的最佳切割点：优先 ≤ target 的最大；没有则取 > start 的最近
  let best = -1;
  for (const c of cuts) {
    if (c <= start) continue;
    if (c <= target) {
      best = c;  // 在 target 内继续找更大的
    } else {
      if (best === -1) best = c;  // 没有 ≤ target 的，取首个超过 target 的
      return best;
    }
  }
  return best;  // 可能 -1（无 > start 的 cut）；caller 负责处理
}

/**
 * 分块创建文档：chunk[0] 走 +create，chunk[1..] 走 +update --command append。
 *
 * @param {Array<string>} chunks — splitDocxXML 输出
 * @param {object} opts — 同 createDoc：dryRun / parentToken
 * @returns {Promise<{ url, documentId, newBlocks, chunks: number, dryRun? }>}
 */
export async function chunkedCreateDoc(chunks, opts = {}) {
  if (chunks.length === 0) throw new Error('chunkedCreateDoc: empty chunks');
  // 1) 创建首块
  const created = await createDoc(chunks[0], opts);
  if (opts.dryRun) {
    return { url: '', documentId: '', newBlocks: [], chunks: chunks.length, dryRun: true };
  }

  // 2) 追加后续块
  for (let i = 1; i < chunks.length; i++) {
    await appendDocxXML(created.documentId, chunks[i], opts);
  }

  return {
    url: created.url,
    documentId: created.documentId,
    newBlocks: created.newBlocks,
    chunks: chunks.length,
  };
}

/**
 * 追加一段 DocxXML 到现有文档末尾。
 * 用 lark-cli docs +update --api-version v2 --command append --doc-format xml。
 */
async function appendDocxXML(documentId, docxxml, opts = {}) {
  const args = [
    'docs', '+update',
    '--api-version', 'v2',
    '--doc', documentId,
    '--command', 'append',
    '--doc-format', 'xml',
    '--content', '-',
  ];
  if (opts.dryRun) args.push('--dry-run');

  const stdout = await spawnLark(args, docxxml);
  let json;
  try { json = JSON.parse(stdout); } catch { json = { ok: 'unknown', raw: stdout.slice(0, 200) }; }
  if (json.ok === false) {
    throw new Error(`append failed: ${JSON.stringify(json)}`);
  }
  return json;
}

function spawnLark(args, stdinData) {
  return new Promise((resolve, reject) => {
    const proc = spawn(LARK_CLI, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => reject(new Error(`lark-cli spawn failed: ${err.message}`)));
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`lark-cli exited ${code}\nstderr: ${stderr.slice(0, 500)}\nstdout: ${stdout.slice(0, 200)}`));
      } else {
        resolve(stdout);
      }
    });
    if (stdinData != null) {
      proc.stdin.write(stdinData, 'utf8');
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}

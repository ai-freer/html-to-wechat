// Mode 4 · 局部精修 helper（v0.4）
//
// v0.1 是「一次 create 灌满」。但实际工作流里常见：
//   - 创建文档骨架后，把某个 callout 改成不同 emoji + 文字
//   - 在特定章节后插入一段引用
//   - 删除某个过时的 paragraph
//   - 在文档结尾 append 新内容
//
// `lark-cli docs +update` 提供 7 种 mode + 2 种 selector：
//   modes:    append / overwrite / replace_range / replace_all
//             / insert_before / insert_after / delete_range
//   selectors: --selection-by-title '## H2' | --selection-with-ellipsis 'start...end'
//   content:   --markdown <Lark-flavored markdown>（支持 @file / stdin '-'）
//
// 本文件把它们封装成意图清晰的 JS 函数；mode 4 的高层流程或 agent 直接调用，
// 不必每次组装 lark-cli 命令行。
//
// 重要：所有 helper 接受 Lark-flavored Markdown 作为 content（**不是** DocxXML），
// 因为 +update 走 markdown 协议。若调用方手里只有 DocxXML 片段，先用 docxxmlToMd()
// 转一下；常见场景里 agent 直接产 markdown 更简洁。

import { spawn } from 'node:child_process';

const LARK_CLI = process.env.LARK_CLI_BIN || 'lark-cli';

// ===========================================================================
// 7 种 mode 的 helper
// ===========================================================================

/**
 * Append: 把 markdown 追加到文档结尾。
 * 最简单也最常用——补充 footer、续写章节、灌入新批次内容。
 */
export async function appendToDoc(docId, markdown, opts = {}) {
  return runUpdate(docId, { mode: 'append', markdown, dryRun: opts.dryRun });
}

/**
 * Overwrite: 整文重写（保留 title + permissions，覆盖正文）。
 * 用于「v0.1 灌完后，agent 评估后整体重写」这种粗粒度场景。
 */
export async function overwriteDoc(docId, markdown, opts = {}) {
  return runUpdate(docId, { mode: 'overwrite', markdown, dryRun: opts.dryRun });
}

/**
 * Replace section identified by `## Heading`: 替换 H1-H6 块及其内容到下一个同级 heading 之前。
 * 最适合 mode 4 场景：用户「把 §3 那段 callout 改了」。
 */
export async function replaceSection(docId, headingSelector, markdown, opts = {}) {
  return runUpdate(docId, {
    mode: 'replace_range',
    selectionByTitle: headingSelector,
    markdown,
    dryRun: opts.dryRun,
  });
}

/**
 * Replace by text fragment: selection-with-ellipsis 'start...end' 匹配 block 范围替换。
 * 适合「我知道要改的文本前后几个词，但不在某个章节起点」场景。
 */
export async function replaceByText(docId, startEndEllipsis, markdown, opts = {}) {
  return runUpdate(docId, {
    mode: 'replace_range',
    selectionWithEllipsis: startEndEllipsis,
    markdown,
    dryRun: opts.dryRun,
  });
}

/**
 * Insert after section: 在 `## Heading` 块之后插入新内容（不改原 heading 那段）。
 * 适合「在 §3 之后追加一节新观点」。
 */
export async function insertAfterSection(docId, headingSelector, markdown, opts = {}) {
  return runUpdate(docId, {
    mode: 'insert_after',
    selectionByTitle: headingSelector,
    markdown,
    dryRun: opts.dryRun,
  });
}

/**
 * Insert before section: 在 `## Heading` 块之前插入新内容。
 * 适合「在 §3 之前补一段过渡引言」。
 */
export async function insertBeforeSection(docId, headingSelector, markdown, opts = {}) {
  return runUpdate(docId, {
    mode: 'insert_before',
    selectionByTitle: headingSelector,
    markdown,
    dryRun: opts.dryRun,
  });
}

/**
 * Insert after text fragment: 在 'start...end' 块之后插入。
 */
export async function insertAfterText(docId, startEndEllipsis, markdown, opts = {}) {
  return runUpdate(docId, {
    mode: 'insert_after',
    selectionWithEllipsis: startEndEllipsis,
    markdown,
    dryRun: opts.dryRun,
  });
}

/**
 * Delete by text: 删除 'start...end' 匹配的 block 范围。
 * 已被 v0.2c upload-media.mjs 间接使用（删 IMG_PLACEHOLDER paragraph）。
 */
export async function deleteByText(docId, startEndEllipsis, opts = {}) {
  return runUpdate(docId, {
    mode: 'delete_range',
    selectionWithEllipsis: startEndEllipsis,
    dryRun: opts.dryRun,
  });
}

/**
 * Delete section by `## Heading`.
 */
export async function deleteSection(docId, headingSelector, opts = {}) {
  return runUpdate(docId, {
    mode: 'delete_range',
    selectionByTitle: headingSelector,
    dryRun: opts.dryRun,
  });
}

// ===========================================================================
// 底层 spawn（其他 helper 都通过这里走）
// ===========================================================================

async function runUpdate(docId, opts) {
  if (!docId) throw new Error('docId required');
  if (!opts.mode) throw new Error('mode required');

  const args = ['docs', '+update', '--doc', docId, '--mode', opts.mode];
  if (opts.selectionByTitle) args.push('--selection-by-title', opts.selectionByTitle);
  if (opts.selectionWithEllipsis) args.push('--selection-with-ellipsis', opts.selectionWithEllipsis);
  if (opts.markdown != null) {
    // 走 stdin 避免命令行长度限制 + relative-path 约束
    args.push('--markdown', '-');
  }
  if (opts.dryRun) args.push('--dry-run');

  const stdout = await spawnLark(args, opts.markdown ?? null);
  let json;
  try { json = JSON.parse(stdout); }
  catch { return { ok: 'unknown', raw: stdout }; }

  return {
    ok: json.ok !== false,
    mode: opts.mode,
    raw: json,
  };
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
        reject(new Error(`lark-cli exited ${code} (${args.slice(0, 2).join(' ')})\nstderr: ${stderr.slice(0, 500)}`));
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

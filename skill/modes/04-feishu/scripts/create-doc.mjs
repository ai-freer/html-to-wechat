// Mode 4 · 飞书文档创建（spawn lark-cli）
//
// 接受 DocxXML 字符串，调 lark-cli docs +create --api-version v2 创建文档。
// 不处理 token——lark-cli 自己管 keychain。
//
// 见 docs/04-html-to-feishu.md §6.1 (lark-cli 调用约定)

import { spawn } from 'node:child_process';

const LARK_CLI = process.env.LARK_CLI_BIN || 'lark-cli';

/**
 * 创建飞书文档。
 *
 * 实现细节：lark-cli docs +create 的 `--content @path` 要求**当前目录下的相对路径**
 * 不接受绝对路径或父目录引用——这是它的安全约束。
 * 我们改走 stdin：`--content -` 从 stdin 读 DocxXML。
 *
 * @param {string} docxxml — DocxXML 字符串
 * @param {object} opts
 * @param {boolean} opts.dryRun — 不调真实 API，输出请求体
 * @param {string} opts.parentToken — 可选父文件夹/wiki 节点 token
 * @returns {Promise<{ url: string, documentId: string, newBlocks: object[], raw: object }>}
 */
export async function createDoc(docxxml, opts = {}) {
  const args = [
    'docs', '+create',
    '--api-version', 'v2',
    '--content', '-',  // stdin
  ];
  if (opts.dryRun) args.push('--dry-run');
  if (opts.parentToken) args.push('--parent-token', opts.parentToken);

  const stdout = await spawnLark(args, docxxml);
  const json = JSON.parse(stdout);

  if (opts.dryRun) {
    return { url: '', documentId: '', newBlocks: [], raw: json, dryRun: true };
  }

  if (!json.ok) {
    throw new Error(`lark-cli docs +create returned not-ok: ${JSON.stringify(json)}`);
  }

  const doc = json.data?.document || {};
  return {
    url: doc.url || '',
    documentId: doc.document_id || '',
    newBlocks: doc.new_blocks || [],
    raw: json,
  };
}

function spawnLark(args, stdinData = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn(LARK_CLI, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => reject(new Error(`lark-cli spawn failed: ${err.message}`)));
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`lark-cli exited ${code}\nstderr: ${stderr}\nstdout: ${stdout}`));
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

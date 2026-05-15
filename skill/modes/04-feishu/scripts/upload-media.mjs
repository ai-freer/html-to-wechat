// Mode 4 · 本地/base64 图片后置上传（v0.2c）
//
// 工作流（per task）：
//   1. 解析 src（data: URI → 解码到 /tmp/img-${id}.{ext}；本地路径 → 相对 input HTML 目录 resolve）
//   2. lark-cli docs +media-insert --doc <docId> --file <localPath>
//                                  --selection-with-ellipsis <marker>
//                                  --before --caption <alt>
//      → 把图像插入到 placeholder block 之前
//   3. lark-cli docs +update --doc <docId> --mode delete_range
//                            --selection-with-ellipsis <placeholderText>
//      → 删除 placeholder paragraph
//
// 失败容忍：每个 task 独立 try/catch，单图失败不打断其他图；失败 task 留 placeholder，
// 让用户能在文档里直接看到丢失项。
//
// 见 docs/04 §7 / ROADMAP v0.2c

import { spawn } from 'node:child_process';
import { writeFile, unlink, stat } from 'node:fs/promises';
import { resolve as pathResolve, dirname, isAbsolute, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';

const LARK_CLI = process.env.LARK_CLI_BIN || 'lark-cli';

/**
 * 批量处理 mediaTasks。
 *
 * @param {object[]} mediaTasks — html-to-docxxml.mjs 产出的任务清单
 * @param {object} opts
 * @param {string} opts.documentId — docs +create 返回的 document_id
 * @param {string} opts.inputDir — 输入 HTML 文件所在目录（用于 resolve 本地相对路径）
 * @param {boolean} opts.dryRun — 不调真实 API，只打印
 * @returns {Promise<{ uploaded: number, failed: number, results: Array }>}
 */
export async function uploadMedia(mediaTasks, opts) {
  const { documentId, inputDir, dryRun = false } = opts;
  if (!documentId && !dryRun) {
    throw new Error('uploadMedia: documentId required (got empty)');
  }

  const results = [];
  let uploaded = 0;
  let failed = 0;

  for (const task of mediaTasks) {
    try {
      const localPathOriginal = await resolveTaskFile(task, inputDir);
      const cleanupOriginal = task.type === 'base64' ? localPathOriginal : null;

      // **portrait phone-mockup 缩放**：用户痛点 — 高分辨率手机截图（如 853×1844）
      // 在飞书文档里铺满全宽。原 HTML CSS 约束在我们这丢失，飞书按图自身分辨率
      // 渲染。这里检测竖屏 + 大宽度 → resize 到合理显示宽度（默认 400px）。
      // 实际上传用 resized 文件；横屏/正方形 / 小图 / icon 不动。
      const localPath = await maybeResizePortrait(localPathOriginal, task);
      const cleanupResized = localPath !== localPathOriginal ? localPath : null;

      // lark-cli 安全约束："--file must be a relative path within the current directory"
      // 同 +create 的 --content 限制（v0.1 改 stdin 绕开；这里只能改 cwd + basename）
      const fileCwd = dirname(localPath);
      const fileRel = basename(localPath);

      // === Step 1: +media-insert ===
      const insertArgs = [
        'docs', '+media-insert',
        '--doc', documentId,
        '--file', fileRel,
        '--selection-with-ellipsis', task.marker,
        '--before',
        '--type', 'image',
      ];
      if (task.alt) insertArgs.push('--caption', task.alt);
      if (dryRun) insertArgs.push('--dry-run');

      const insertOut = await spawnLark(insertArgs, fileCwd);

      // === Step 2: +update delete_range（删除 placeholder paragraph）===
      const deleteArgs = [
        'docs', '+update',
        '--doc', documentId,
        '--mode', 'delete_range',
        '--selection-with-ellipsis', task.placeholderText,
      ];
      if (dryRun) deleteArgs.push('--dry-run');

      const deleteOut = await spawnLark(deleteArgs);

      // 清理临时 base64 文件 + resize 副本
      if (cleanupOriginal) await unlink(cleanupOriginal).catch(() => {});
      if (cleanupResized) await unlink(cleanupResized).catch(() => {});

      uploaded += 1;
      results.push({
        id: task.id,
        status: 'ok',
        insertSummary: extractInsertSummary(insertOut),
      });
    } catch (err) {
      failed += 1;
      results.push({ id: task.id, status: 'fail', error: err.message });
    }
  }

  return { uploaded, failed, results };
}

// ===========================================================================
// 文件路径解析
// ===========================================================================

/**
 * 检测竖屏 + 高分辨率图片（典型：手机截图 mockup），resize 到合理显示宽度。
 *
 * 阈值（可由 task 字段覆盖，未来加 plan 接管）：
 *   - 触发：aspect ratio (w/h) < 0.75 且原宽 > 600px
 *   - 目标宽度：400px（保持宽高比）
 *
 * 横屏图 / 正方形 / 小图 / 已经 ≤ 600px 的不动。
 *
 * 实现：用 sharp（optionalDependencies，未装则回退原文件 + warn）。
 *
 * @param {string} localPath 原图本地路径
 * @param {object} task mediaTask（含 alt 用于日志）
 * @returns {Promise<string>} 实际要上传的文件路径
 */
async function maybeResizePortrait(localPath, task) {
  const PORTRAIT_RATIO_THRESHOLD = 0.75;  // w/h < 0.75 算 portrait
  const ORIG_WIDTH_TRIGGER = 600;          // 原宽 > 600 才考虑 resize
  const TARGET_WIDTH = 400;                // resize 到的目标宽度

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    // sharp 不可用（optionalDependencies 装失败）→ 原样上传，不致命
    return localPath;
  }

  try {
    const meta = await sharp(localPath).metadata();
    const { width, height, format } = meta;
    if (!width || !height) return localPath;

    const ratio = width / height;
    if (ratio >= PORTRAIT_RATIO_THRESHOLD || width <= ORIG_WIDTH_TRIGGER) {
      return localPath;  // 横屏 / 正方形 / 已经小，不动
    }

    // 触发 resize
    const ext = format === 'jpeg' ? 'jpg' : (format || 'png');
    const out = pathResolve(tmpdir(), `mode4-resized-${task.id}-${Date.now()}.${ext}`);
    const newHeight = Math.round(height * (TARGET_WIDTH / width));
    await sharp(localPath)
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .toFile(out);
    console.error(`  [resize] id=${task.id} portrait ${width}×${height} → ${TARGET_WIDTH}×${newHeight} (${task.alt || ''})`);
    return out;
  } catch (e) {
    // sharp 解码失败（罕见格式 / 损坏）→ 原样上传，加 warning
    console.error(`  [resize-skip] id=${task.id}: ${e.message}`);
    return localPath;
  }
}

async function resolveTaskFile(task, inputDir) {
  if (task.type === 'base64') {
    // data:image/png;base64,iVBOR... → 解码到 /tmp
    const m = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(task.src);
    if (!m) throw new Error(`bad base64 data URI: ${task.src.slice(0, 50)}...`);
    let ext = m[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const buf = Buffer.from(m[2], 'base64');
    const out = pathResolve(tmpdir(), `mode4-img-${task.id}-${Date.now()}.${ext}`);
    await writeFile(out, buf);
    return out;
  }

  // 本地路径：绝对 → 直接用；相对 → 相对 inputDir resolve
  const candidate = isAbsolute(task.src) ? task.src : pathResolve(inputDir, task.src);
  await stat(candidate);  // 不存在抛 ENOENT
  return candidate;
}

// ===========================================================================
// lark-cli spawn（带 stdin 关闭，避免挂起）
// ===========================================================================

function spawnLark(args, cwd = undefined) {
  return new Promise((resolve, reject) => {
    const proc = spawn(LARK_CLI, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd });
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
    proc.stdin.end();
  });
}

function extractInsertSummary(stdout) {
  try {
    const json = JSON.parse(stdout);
    return {
      ok: json.ok,
      uploadedKey: json.data?.uploaded_key || json.data?.file_token,
      block: json.data?.block_id || json.data?.block?.block_id,
    };
  } catch {
    return { ok: 'unknown', raw: stdout.slice(0, 200) };
  }
}

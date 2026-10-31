// CLI v2 accepts local images in XML. Prepare all resources BEFORE creation,
// retaining their original positions and avoiding partial cloud documents.
import { mkdir, copyFile, writeFile, stat, realpath } from 'node:fs/promises';
import { resolve, join, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotRegion } from './render-snapshot.mjs';

export const escapeAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export async function prepareMedia(docxxml, tasks = [], opts = {}) {
  let xml = docxxml;
  const resourceDir = resolve(opts.resourceDir);
  const cwd = resolve(opts.cwd || resourceDir);
  const files = [];
  if (tasks.length) await mkdir(resourceDir, { recursive: true });
  for (const task of tasks) {
    let source, destination, width = task.width, height = task.height;
    if (task.type === 'snapshot') {
      if (!opts.inputPath) throw new Error('截图兜底必须使用 --input 文件，不能使用 stdin');
      destination = join(resourceDir, `snapshot-${task.id}.png`);
      const size = await snapshotRegion(opts.inputPath, task.selector, destination);
      width = size.width; height = size.height;
    } else if (task.type === 'base64') {
      const match = /^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(task.src);
      if (!match) throw new Error(`图片 ${task.id} 不是支持的 base64 PNG/JPEG/GIF/WebP；SVG 请显式选择画板或截图`);
      destination = join(resourceDir, `image-${task.id}.${match[1].toLowerCase()}`);
      await writeFile(destination, Buffer.from(match[2], 'base64'));
    } else {
      source = task.src.startsWith('file:') ? fileURLToPath(task.src) : resolve(opts.inputDir || '.', task.src);
      const sourceRoot = await realpath(resolve(opts.inputDir || '.'));
      source = await realpath(source);
      const within = relative(sourceRoot, source);
      if (within.startsWith('..') || within.startsWith('/')) throw new Error('本地图片越出输入目录；请先将明确授权的资源复制到输入目录内');
      const ext = extname(source).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) throw new Error(`不支持的本地图片类型 ${ext}；请转换为 PNG/JPEG/GIF/WebP`);
      destination = join(resourceDir, `image-${task.id}${ext}`);
      if (resolve(source) !== resolve(destination)) await copyFile(source, destination);
    }
    const info = await stat(destination);
    if (!info.size || info.size > 20 * 1024 * 1024) throw new Error(`图片 ${task.id} 为空或超过 20MiB`);
    const localRef = './' + relative(cwd, destination).split('\\').join('/');
    const attrs = [`path="@${escapeAttr(localRef)}"`, `caption="${escapeAttr(task.alt || basename(destination))}"`];
    if (width > 0) attrs.push(`width="${Math.round(width)}"`);
    if (height > 0) attrs.push(`height="${Math.round(height)}"`);
    const placeholder = `<p>${String(task.placeholderText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+/g, ' ')}</p>`;
    if (!xml.includes(placeholder) || xml.split(placeholder).length !== 2) throw new Error(`图片 ${task.id} 占位不唯一或丢失；未调用云端创建`);
    xml = xml.replace(placeholder, `<img ${attrs.join(' ')}/>`);
    files.push(destination);
  }
  return { docxxml: xml, files };
}

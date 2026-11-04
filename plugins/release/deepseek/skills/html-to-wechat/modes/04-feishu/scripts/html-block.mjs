import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { escapeAttr } from './upload-media.mjs';

// Explicit alternative: preserves an HTML surface, not editable native text.
export async function prepareHtmlBlock(html, opts) {
  if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new Error('HTML 内容块需要包含 head/body 的完整单文件 HTML');
  const localAssets = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(m => m[1]).filter(v => !/^(?:https?:|data:|#|mailto:|tel:)/i.test(v));
  const cssAssets = [...html.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)].map(m => m[1]).filter(v => !/^(?:https?:|data:|#)/i.test(v));
  if (localAssets.length || cssAssets.length || /\bsrcset\s*=/i.test(html)) throw new Error('HTML 内容块包含相对/本地资源，请先制作 standalone 文件；不会自动上传额外文件');
  let content = html.replace(/<meta\b[^>]*\bname\s*=\s*["'](?:use-iframe|html-box-height-mode)["'][^>]*>/gi, '');
  content = content.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="use-iframe" content="true">\n<meta name="html-box-height-mode" content="${opts.heightMode || 'auto'}">`);
  if (Buffer.byteLength(content, 'utf8') > 500_000) throw new Error('HTML 内容块超过 500KB；请先精简或拆分，不自动截断');
  await mkdir(opts.resourceDir, { recursive: true });
  const path = join(opts.resourceDir, 'artifact.html');
  await writeFile(path, content);
  const ref = opts.resourceRef || './artifact.html';
  return { docxxml: `<title>${escapeAttr(opts.title || cheerio.load(html)('title').first().text() || 'HTML Artifact')}</title>\n<html5-block path="@${escapeAttr(ref)}"/>`, files: [path],
    warnings: ['HTML 内容块中的正文不是可协同编辑的原生文字；搜索、评论、交互、高度与移动端仍需云端验收。',
      ...(/(?:src|href)\s*=\s*["']https?:/i.test(html) ? ['HTML 含外部资源，离线显示和飞书加载策略尚待验证。'] : [])] };
}

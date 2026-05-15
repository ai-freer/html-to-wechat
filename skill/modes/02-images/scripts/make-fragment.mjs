#!/usr/bin/env node
// Mode 2 fragment URL 生成器（agent 调用产 app 链接）
//
// **同步来源**：本文件与 web/images/make-fragment.mjs 内容应保持等价。
// 浏览器和 skill 两边都用 base64-utf8 编 payload；schema 由 web/images/app.mjs 顶部注释定义。
// 改本文件时同步改另一处。
//
// 用法：
//   node make-fragment.mjs <payload.json> [base-url]
//
// payload.json 应符合 app.mjs 顶部注释的 schema：
//   { title, captionText, captionTags, images: [{ src, alt, prompt? }] }
//
// 输出：完整 URL（含 #app=base64 hash）到 stdout

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [, , payloadPath, baseUrlArg] = process.argv;

if (!payloadPath) {
  console.error('Usage: node make-fragment.mjs <payload.json> [base-url]');
  console.error('  base-url 默认 https://ai-freer.github.io/html-to-wechat/images/');
  process.exit(1);
}

const baseUrl = baseUrlArg || 'https://ai-freer.github.io/html-to-wechat/images/';
const json = JSON.parse(await readFile(resolve(payloadPath), 'utf8'));
const base64 = Buffer.from(JSON.stringify(json), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log(`${baseUrl}#app=${base64}`);
console.error(`[mode-2] fragment 长度: ${base64.length} chars (payload: ${json.images?.length || 0} 图)`);

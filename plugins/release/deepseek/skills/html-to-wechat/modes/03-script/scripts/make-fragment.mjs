#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
const [file,base='https://ai-freer.github.io/html-to-wechat/script/']=process.argv.slice(2);
if(!file){console.error('Usage: node make-fragment.mjs <spoken.md> [preview-base-url]');process.exit(1);}
try {
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Preview URL must be HTTP(S) without credentials');
 const md=await readFile(file,'utf8');if(!md.trim())throw new Error('Markdown is empty');
 url.hash='payload='+encodeURIComponent(Buffer.from(md,'utf8').toString('base64'));
 console.log(url.href);console.error(`[mode-3] preview payload: ${md.length} characters; fragment is encoded, not encrypted`);
} catch(e){console.error('[mode-3]',e.message);process.exitCode=1;}

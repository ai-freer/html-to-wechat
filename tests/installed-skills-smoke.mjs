// Integration check against already installed artifacts, not source imports.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
const [suiteArg,standaloneArg,browser]=process.argv.slice(2);
if(!suiteArg||!standaloneArg){console.error('Usage: node tests/installed-skills-smoke.mjs <installed-suite-root> <standalone-parent> [existing-chrome-binary]');process.exit(1);}
const suite=resolve(suiteArg),standalone=resolve(standaloneArg);
const work=await mkdtemp(join(tmpdir(),'h2w-installed-smoke-'));
const input=join(work,'input.html');
await writeFile(input,'<!doctype html><html><head><meta charset="utf-8"><title>独立调用测试</title></head><body><main><h1>独立调用测试</h1><article><h2>第一章</h2><p>第一章唯一正文。</p></article><article><h2>第二章</h2><p>第二章唯一正文。</p></article><p>结尾唯一总结。</p></main></body></html>');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=';
const payload=join(work,'payload.json');await writeFile(payload,JSON.stringify({title:'独立图集',captionTags:['#测试'],images:[{src:png,alt:'封面'}]}));
const modes=['01-richtext','02-images','03-script','04-feishu'];const names=['html-to-wechat-richtext','html-to-wechat-images','html-to-wechat-script','html-to-feishu'];
const records=[];
const run=(file,args=[],extra={})=>{const r=spawnSync(process.execPath,[file,...args],{cwd:work,encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_OPTIONS:'',...extra},timeout:60000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r;};
for(const kind of ['suite','standalone'])for(let i=0;i<modes.length;i++){
 const root=kind==='suite'?suite:join(standalone,names[i]);
 const scripts=kind==='suite'?join(root,'modes',modes[i],'scripts'):join(root,'scripts');
 const args=i===0?['--input',input,'--no-measure','--output',join(work,kind+'-wechat.html')]:i===1?[payload,'http://127.0.0.1:8772/web/images/']:i===2?['--input',input,'--output',join(work,kind+'-extracted.md')]:['--input',input,'--no-measure','--export-only','--output-xml',join(work,kind+'-native.xml')];
 const r=run(join(scripts,i===1?'make-fragment.mjs':'index.mjs'),args);
 if(i===1)assert.equal(JSON.parse(Buffer.from(new URL(r.stdout.trim()).hash.slice(5),'base64url').toString()).title,'独立图集');
 else assert.match(r.stdout+await readFile(join(work,kind+(i===0?'-wechat.html':i===2?'-extracted.md':'-native.xml')),'utf8'),/第一章/);
 const pkg=JSON.parse(await readFile(join(scripts,'package.json'),'utf8')); const require=createRequire(join(scripts,'package.json'));
 for(const dep of Object.keys(pkg.dependencies||{}))assert.ok(realpathSync(require.resolve(dep)).startsWith(realpathSync(root)+'/'),`dependency outside installed root: ${dep}`);
 records.push({kind,mode:modes[i],status:'passed'});
 if(i===2){
  const url=run(join(scripts,'make-fragment.mjs'),[join(work,kind+'-extracted.md'),'http://127.0.0.1:8772/web/script/']).stdout.trim();
  assert.match(Buffer.from(decodeURIComponent(new URL(url).hash.slice(9)),'base64').toString(),/第二章/);
 }
}
if(browser){
 const r=run(join(standalone,'html-to-wechat-images/scripts/render-snapshot.mjs'),[input,join(work,'snapshot.png')],{PUPPETEER_EXECUTABLE_PATH:browser});
 assert.equal(JSON.parse(r.stdout).fullHeight>0,true);assert.ok((await readFile(join(work,'snapshot.png'))).length>1000);records.push({kind:'standalone',mode:'screenshot',status:'passed'});
}
await writeFile(join(work,'summary.json'),JSON.stringify({work,records},null,2)+'\n');
console.log(JSON.stringify({work,checks:records.length,status:'passed'}));

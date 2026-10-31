import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=await mkdtemp(join(tmpdir(),'h2w-pair-test-'));
const entry=resolve('skill/scripts/local-pair.mjs');
const run=(args)=>spawnSync(process.execPath,[entry,...args],{cwd:temp,encoding:'utf8'});
try {
 const input=join(temp,'input.html');
 await writeFile(input,'<style>.panel{display:none}</style><main><div class="toolbar">REMOVE_UI</div><div class="panel"><h2>BODY_TITLE</h2><p>KEEP_BODY</p><table><tr><td>KEEP_TABLE</td></tr></table></div></main>');
 await writeFile(join(temp,'w.json'),JSON.stringify({directives:[{selector:'.toolbar',action:'remove'},{selector:'.panel',action:'unwrap'}]}));
 await writeFile(join(temp,'f.json'),JSON.stringify({boundaryAnnotations:{'.toolbar':{type:'drop'}}}));
 let r=run(['--input',input,'--inspect']);assert.equal(r.status,0,r.stderr);
 const inspect=JSON.parse(r.stdout);assert.equal(inspect.headings,1);assert.equal(inspect.tables,1);assert.equal(inspect.hiddenCandidates[0].classes,'panel');
 const args=['--input',input,'--wechat-plan','w.json','--feishu-plan','f.json','--out','result'];
 r=run(args);assert.equal(r.status,0,r.stderr);
 const state=JSON.parse(await readFile(join(temp,'result/run.json'),'utf8'));
 assert.deepEqual(state.targets.map(t=>t.status),['converted','converted']);
 for(const file of ['wechat.html','feishu.xml']) {const text=await readFile(join(temp,'result',file),'utf8');assert(text.includes('KEEP_BODY'));assert(text.includes('KEEP_TABLE'));assert(!text.includes('REMOVE_UI'));}
 r=run(args);assert.equal(r.status,1);assert.match(r.stderr,/EEXIST/);
 // A target failure must be recorded without losing the independently successful target.
 await writeFile(input,'<main><h2>BODY_TITLE</h2><p>KEEP_BODY</p><img src="missing.png"></main>');
 await writeFile(join(temp,'f.json'),'{}');
 r=run([...args.slice(0,-1),'partial']);assert.equal(r.status,1);
 const partial=JSON.parse(await readFile(join(temp,'partial/run.json'),'utf8'));assert.deepEqual(partial.targets.map(t=>t.status),['converted','failed']);
 await writeFile(join(temp,'f.json'),JSON.stringify({boundaryAnnotations:{'.panel':{type:'snapshot-fallback'}}}));
 r=run([...args.slice(0,-1),'rejected']);assert.equal(r.status,1);assert.match(r.stderr,/advanced Feishu/);
 await assert.rejects(stat(join(temp,'rejected')),/ENOENT/);
 console.log('Local pair: inspect, actual dual conversion, no overwrite, independent failure and no screenshot side effects passed');
} finally {await rm(temp,{recursive:true,force:true});}

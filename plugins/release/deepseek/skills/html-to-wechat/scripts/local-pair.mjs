#!/usr/bin/env node
// Local-only orchestration for the existing WeChat / native Feishu converters.
import { readFile, mkdir, writeFile, open, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Map();
const argv = process.argv.slice(2);
const help = `Usage:
  node scripts/local-pair.mjs --input report.html --inspect
  node scripts/local-pair.mjs --input report.html --wechat-plan wechat-plan.json --feishu-plan feishu-plan.json --out output/pair

--inspect prints source structure and hidden-heading ancestor candidates (no browser, no scripts executed).
Execution requires two explicit JSON plan files. --out must not exist; it is created exclusively.
Uses existing converters, disables optional browser measurement, and exports native Feishu XML only.
Does not run lark-cli, log in, create a cloud document, fetch remote assets, or generate plans.
Outputs: wechat.html, wechat.txt, feishu.xml and possible assets, per-target logs, run.json.
run.json records conversion status, not content/visual acceptance. Inspect output and compare with source.
`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  for (let i=0;i<argv.length;i++) {
    const key=argv[i];
    if (!['--input','--inspect','--wechat-plan','--feishu-plan','--out','--help'].includes(key) || flags.has(key)) throw Error(`Unknown or duplicate option: ${key}`);
    if (['--inspect','--help'].includes(key)) flags.set(key,true);
    else { const value=argv[++i]; if(!value || value.startsWith('--')) throw Error(`Missing value: ${key}`); flags.set(key,value); }
  }
  if(flags.has('--help')) { console.log(help); process.exit(0); }
  if(!flags.has('--input')) throw Error(help);
  const input=resolve(flags.get('--input')); const raw=await readFile(input,'utf8');
  if(flags.has('--inspect')) {
    if(['--out','--wechat-plan','--feishu-plan'].some(k=>flags.has(k))) throw Error('--inspect cannot be combined with execution options');
    const require=createRequire(join(root,'modes/01-richtext/scripts/package.json'));
    const {JSDOM}=require('jsdom'); const dom=new JSDOM(raw); const doc=dom.window.document;
    const candidates=new Map(), styles=new Map();
    for(const heading of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      for(let node=heading;node;node=node.parentElement) {
        let style=styles.get(node); if(!style){style=dom.window.getComputedStyle(node);styles.set(node,style);}
        const reasons=[]; if(node.hidden)reasons.push('hidden attribute');if(style.display==='none')reasons.push('display:none');if(style.opacity==='0')reasons.push('opacity:0');if(style.visibility==='hidden')reasons.push('visibility:hidden');
        if(!reasons.length)continue;
        const classes=[...node.classList].join(' '), key=JSON.stringify([node.tagName,classes,reasons]);
        if(!candidates.has(key))candidates.set(key,{tag:node.tagName,classes,reasons,affectedHeadings:0,exampleId:node.id||null,exampleText:Array.from(node.textContent.trim().replace(/\s+/g,' ')).slice(0,140).join('')});
        candidates.get(key).affectedHeadings++;
      }
    }
    const {triage}=await import(pathToFileURL(join(root,'modes/01-richtext/scripts/visibility.mjs')).href);
    const {report}=await triage(raw);
    const visibility={collapsed:report.collapsed,hidden:report.hidden,uncertain:report.uncertain};
    console.log(JSON.stringify({input,visibility,sha256:sha(raw),bytes:Buffer.byteLength(raw),headings:doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,chapters:[...doc.querySelectorAll('h1,h2')].map(n=>n.textContent.trim()),tables:doc.querySelectorAll('table').length,images:doc.querySelectorAll('img').length,svg:doc.querySelectorAll('svg').length,externalStylesheets:doc.querySelectorAll('link[rel="stylesheet"][href]').length,hiddenCandidates:[...candidates.values()],note:'Candidates require content judgment; no remote CSS is loaded. A heading may have multiple hidden ancestors. This is not a screenshot or a plan.'},null,2));
    dom.window.close(); process.exit(0);
  }
  for(const key of ['--wechat-plan','--feishu-plan','--out'])if(!flags.has(key))throw Error(`Missing ${key}`);
  const jobs=[];
  for(const [target,mode,key] of [['wechat','01-richtext','--wechat-plan'],['feishu','04-feishu','--feishu-plan']]) {
    const path=resolve(flags.get(key));const text=await readFile(path,'utf8');const plan=JSON.parse(text);
    if(!plan || typeof plan!=='object' || Array.isArray(plan))throw Error(`${target} plan must be a JSON object`);
    if(target==='feishu' && Object.values(plan.boundaryAnnotations || {}).some(a=>(typeof a==='string'?a:a?.type)==='snapshot-fallback')) throw Error('snapshot-fallback requires the advanced Feishu mode; local-pair does not launch a browser');
    jobs.push({target,mode,plan:{path,sha256:sha(text)},status:'pending'});
  }
  if(raw.includes('snapshot-fallback')) {
    const {JSDOM}=createRequire(join(root,'modes/01-richtext/scripts/package.json'))('jsdom');
    const dom=new JSDOM(raw);const snapshots=dom.window.document.querySelector('[data-mode4-as="snapshot-fallback"]');dom.window.close();
    if(snapshots) throw Error('Source snapshot-fallback annotations require the advanced Feishu mode');
  }
  const out=resolve(flags.get('--out')); await mkdir(dirname(out),{recursive:true}); await mkdir(out); // no overwrite
  const state={schema:1,input:{path:input,sha256:sha(raw)},scope:'local-only',targets:jobs};
  const save=()=>writeFile(join(out,'run.json'),JSON.stringify(state,null,2)+'\n');await save();
  for(const job of jobs) {
    job.status='running'; await save();
    const targetArgs=job.target==='wechat'?['--output',join(out,'wechat.html'),'--output-text',join(out,'wechat.txt')]:['--export-only','--output-xml',join(out,'feishu.xml')];
    const expected=join(out,job.target==='wechat'?'wechat.html':'feishu.xml');
    const stdout=await open(join(out,job.target+'.stdout.log'),'wx');const stderr=await open(join(out,job.target+'.stderr.log'),'wx');
    try {
      job.exitCode=await new Promise((done,fail)=>{const p=spawn(process.execPath,[join(root,'modes',job.mode,'scripts/index.mjs'),'--input',input,'--plan',job.plan.path,'--no-measure',...targetArgs],{cwd:process.cwd(),stdio:['ignore',stdout.fd,stderr.fd]});p.on('error',fail);p.on('close',code=>done(code));});
      job.status=job.exitCode===0 && (await stat(expected)).size>0?'converted':'failed';
      job.output=expected;
    } catch(error) {job.status='failed';job.error=error.message;}
    finally {await stdout.close();await stderr.close();await save();}
  }
  console.log(JSON.stringify(state,null,2));
  if(jobs.some(j=>j.status!=='converted'))process.exitCode=1;
} catch(error) { console.error('[local-pair]',error.message);process.exitCode=1; }

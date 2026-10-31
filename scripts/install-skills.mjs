#!/usr/bin/env node
import { lstat, mkdir, mkdtemp, cp, rename, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { verifyPackage } from './package-utils.mjs';
const argv=process.argv.slice(2); const opts={};
for(let i=0;i<argv.length;i++) {
  if(['--from','--dest'].includes(argv[i])) opts[argv[i].slice(2)]=argv[++i];
  else if(['--no-deps','--with-browser'].includes(argv[i])) opts[argv[i].slice(2)]=true;
  else {console.error('Unknown option:',argv[i]);process.exit(1);}
}
if(!opts.from || !opts.dest) {console.error('Usage: node scripts/install-skills.mjs --from <built-skill-folder> --dest <explicit-skills-directory> [--no-deps] [--with-browser]');process.exit(1);}
let staging;
try {
  const source=resolve(opts.from); const manifest=await verifyPackage(source);
  const destination=resolve(opts.dest); const target=join(destination,manifest.name);
  if(target===source || source.startsWith(target+'/') || target.startsWith(source+'/')) throw new Error('Source and destination overlap');
  const absent=async()=>{try{await lstat(target);throw new Error(`Destination exists; no overwrite: ${target}`);}catch(e){if(e.code!=='ENOENT')throw e;}};
  await absent(); await mkdir(destination,{recursive:true});
  staging=await mkdtemp(join(destination,'.h2w-install-')); const stage=join(staging,manifest.name);
  await cp(source,stage,{recursive:true,errorOnExist:true,force:false,dereference:false});
  await verifyPackage(stage);
  if(!opts['no-deps']) {
    const args=[join(stage,'scripts/setup.mjs')]; if(opts['with-browser'])args.push('--with-browser');
    await new Promise((done,fail)=>{const p=spawn(process.execPath,args,{cwd:stage,stdio:'inherit'});p.on('error',fail);p.on('close',code=>code===0?done():fail(new Error(`Dependency setup failed (${code}); target not installed`)));});
  }
  await absent(); await rename(stage,target);
  console.log(`[install] ${target}`);
  console.log('[install] local files installed; this does not prove host discovery or trigger Hub sync');
} catch(e) {console.error('[install]',e.message);process.exitCode=1;}
finally {if(staging)await rm(staging,{recursive:true,force:true});}

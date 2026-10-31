import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyPackage, fileList } from '../scripts/package-utils.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=await mkdtemp(join(tmpdir(),'h2w-package-test-'));
const run=(script,args=[])=>spawnSync(process.execPath,[join(repo,'scripts',script),...args],{cwd:temp,encoding:'utf8'});
try {
 const out=join(temp,'packages');
 let r=run('build-skills.mjs',['--out',out]);assert.equal(r.status,0,r.stderr);
 const names=JSON.parse(await readFile(join(out,'packages.json'),'utf8')).packages;
 assert.equal(names.length,5);
 for(const name of names){
  const root=join(out,name);const manifest=await verifyPackage(root);
  const files=await fileList(root);
  assert.equal(files.some(f=>/node_modules|\.env|\.npmrc|\.publish-meta|samples\//.test(f)),false);
  for(const file of files.filter(f=>f.endsWith('.mjs'))){
   const text=await readFile(join(root,file),'utf8');
   for(const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)){
    const target=resolve(dirname(join(root,file)),match[2]);
    assert.ok(target.startsWith(root+'/'),`${file} import escapes package`);
    assert.ok((await lstat(target)).isFile(),`${file} import missing: ${match[2]}`);
   }
  }
  assert.ok(manifest.runtimeDirs.every(d=>files.includes(d+'/package-lock.json')));
  if (name === 'html-to-wechat' || name === 'html-to-feishu') {
   const prefix = name === 'html-to-wechat' ? 'modes/04-feishu/' : '';
   assert.ok(files.includes(prefix+'references/cloud-workflow.md'));
   assert.match(await readFile(join(root,prefix+'SKILL.md'),'utf8'), /bins: \[\]/);
  }
  if (name === 'html-to-wechat') {
   assert.ok(files.includes('references/multi-target.md'), 'multi-target route must ship with suite');
   assert.ok(files.includes('scripts/local-pair.mjs'), 'local executor must ship with suite');
   assert.equal(await readFile(join(root,'references/multi-target.md'),'utf8'), await readFile(join(repo,'skill/references/multi-target.md'),'utf8'));
  }
 }
 const source=join(out,'html-to-wechat-images'); const dest=join(temp,'skills');
 r=run('install-skills.mjs',['--from',source,'--dest',dest,'--no-deps']);assert.equal(r.status,0,r.stderr);
 const installed=join(dest,'html-to-wechat-images');await verifyPackage(installed);
 // Entry through macOS /tmp aliases and an explicit symlink must not be an empty success.
 const link=join(temp,'snapshot-link.mjs');await symlink(join(installed,'scripts/render-snapshot.mjs'),link);
 r=spawnSync(process.execPath,[link],{cwd:temp,encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/Usage: node render-snapshot/);
 r=run('install-skills.mjs',['--from',source,'--dest',dest,'--no-deps']);assert.equal(r.status,1);assert.match(r.stderr,/no overwrite/);
 const unchanged=await readFile(join(installed,'SKILL.md'),'utf8');
 await writeFile(join(source,'SKILL.md'),'tampered');
 r=run('install-skills.mjs',['--from',source,'--dest',join(temp,'rejected'),'--no-deps']);assert.equal(r.status,1);assert.match(r.stderr,/checksum mismatch/);
 assert.equal(await readFile(join(installed,'SKILL.md'),'utf8'),unchanged);
 r=run('build-skills.mjs',['--out',out]);assert.equal(r.status,1);assert.match(r.stderr,/no overwrite/);
 console.log('5 package closures, checksums, clean copy, symlink CLI and no-overwrite checks passed');
} finally {await rm(temp,{recursive:true,force:true});}

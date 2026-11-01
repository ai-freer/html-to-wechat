#!/usr/bin/env node
import { readFile, writeFile, mkdir, copyFile, lstat, readdir, rename, rm, mkdtemp, cp } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileList, sha256, verifyPackage } from './package-utils.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modes = ['01-richtext','02-images','03-script','04-feishu'];
const names = ['html-to-wechat-richtext','html-to-wechat-images','html-to-wechat-script','html-to-feishu'];
const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--out') { console.error('Usage: node scripts/build-skills.mjs --out <new-output-directory>'); process.exit(1); }
const output = resolve(argv[1]);
let temp;
try {
  try { await lstat(output); throw new Error('Output already exists; choose a new directory (no overwrite)'); }
  catch(e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(dirname(output), {recursive:true});
  temp=await mkdtemp(join(dirname(output), '.h2w-build-'));
  const setup = await readFile(join(repo, 'scripts/skill-package-setup.mjs'));
  const guide = `# Installed package\n\nRun commands from this package root. Install dependencies with \`node scripts/setup.mjs\`; use \`--with-browser\` only when screenshot/measurement is needed and point PUPPETEER_EXECUTABLE_PATH at an existing browser. Browser binaries and lark-cli are external prerequisites, never bundled.\n\nThis package contains no real articles, generated images, credentials or host settings. Script output is deterministic conversion; Agent judgment/rewrite/image generation is a separate phase. The GitHub Pages site previews or downloads outputs; it does not run an LLM or authenticated Lark CLI. Native Feishu and HTML-block outputs are distinct. Run local export/dry-run before any authorized cloud write.\n`;
  let feishu = await readFile(join(repo,'docs/04-html-to-feishu.md'),'utf8');
  feishu=feishu.replace(/^旧实现及实战记录.*$/m,'').replace(/\[Skill 与 milestone 审计\]\([^)]*\)/g,'仓库中的 milestone 审计');
  for (const packageName of ['html-to-wechat',...names]) {
    const suite = packageName === 'html-to-wechat';
    const index = names.indexOf(packageName);
    const selected = suite ? modes : [modes[index]];
    const root = join(temp,packageName);
    await mkdir(join(root,'scripts'),{recursive:true}); await mkdir(join(root,'lib'),{recursive:true}); await mkdir(join(root,'references'),{recursive:true});
    await writeFile(join(root,'scripts/setup.mjs'),setup);
    await copyFile(join(repo,'lib/render-snapshot.mjs'),join(root,'lib/render-snapshot.mjs'));
    try { await copyFile(join(repo,'LICENSE'),join(root,'LICENSE')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
    await writeFile(join(root,'references/package-guide.md'),guide);
    if (selected.includes('04-feishu')) await writeFile(join(root,'references/feishu-guide.md'),feishu.replaceAll('skill/modes/04-feishu/scripts/', suite ? 'modes/04-feishu/scripts/' : 'scripts/'));
    if (suite) {
      await copyFile(join(repo,'skill/references/multi-target.md'), join(root,'references/multi-target.md'));
      await copyFile(join(repo,'skill/scripts/local-pair.mjs'), join(root,'scripts/local-pair.mjs'));
    }
    const runtimeDirs=[];
    const adapt = (text, mode, nested) => {
      let result = text.replaceAll('从仓库根','从本包根').replaceAll('skill/modes/','modes/');
      if (!suite) result=result.replaceAll(`modes/${mode}/`, '');
      result=result.replaceAll('../../../docs/04-html-to-feishu.md', (nested ? '../../' : '')+'references/feishu-guide.md');
      result=result.replaceAll('../ROADMAP.md','references/package-guide.md').replaceAll('../docs/skill-roadmap-audit-2026-10-31.md','references/package-guide.md');
      result=result.replaceAll('docs/01-html-to-wechat-html.md §3','scripts/default-plan.mjs');
      result=result.replace(/当前仍依赖仓库根 `lib\/`，不能只复制模式目录当独立安装包。/g,'本安装产物带有包内共享 lib，可独立运行。');
      result=result.replace('开发源是本仓库 `skill/`。当前为本地开发包；未构建独立安装产物，未发布到 Skill Hub。不要把有 SKILL.md 当作宿主已安装或可一键独立安装。','此为自包含安装产物；依赖和外部工具约定见 references/package-guide.md。');
      result=result.replace(/^开发源是本仓库 `skill\/`。.*$/m, '此为自包含安装产物；先运行 `node scripts/setup.mjs`，外部工具约定见 references/package-guide.md。');
      result=result.replace('当前为本地开发包','当前为安装包');
      if (suite) result=result.replace(/从本包根执行；按需[^\n]+/, '从本包根执行。先运行 `node scripts/setup.mjs`；共享截图 lib 已包含在本包内，各 mode 的引用在构建时闭合。');
      result=result.replace('当前安装、跨宿主发现、真实生图和飞书云端验证仍未完成。', '安装产物可按 package-guide 执行；跨宿主发现、真实生图和飞书云端验证分别验收。');
      return result;
    };
    for (const mode of selected) {
      const source=join(repo,'skill/modes',mode);
      const dest=suite ? join(root,'modes',mode) : root;
      const scripts=join(dest,'scripts'); await mkdir(scripts,{recursive:true});
      for (const file of await readdir(join(source,'scripts'))) {
        if (!/\.(mjs|json)$/.test(file) || file==='package-lock.json') continue;
        const src=join(source,'scripts',file);
        if (!(await lstat(src)).isFile()) throw new Error(`Source must be a regular file: ${file}`);
        let data=await readFile(src);
        if (file==='package.json') {
          const pkg=JSON.parse(data.toString());
          for (const key of Object.keys(pkg.scripts || {})) if (key.startsWith('test:bench')) delete pkg.scripts[key];
          pkg.scripts={...pkg.scripts,check:'node --check '+(mode==='02-images'?'make-fragment.mjs':'index.mjs')};
          data=Buffer.from(JSON.stringify(pkg,null,2)+'\n');
        }
        if (file==='render-snapshot.mjs') {
          const lib=relative(scripts,join(root,'lib/render-snapshot.mjs')).split('\\').join('/');
          data=Buffer.from(data.toString().replaceAll('../../../../lib/render-snapshot.mjs',lib));
        }
        await writeFile(join(scripts,file),data);
      }
      await copyFile(join(repo,'skill/locks',mode+'.json'),join(scripts,'package-lock.json'));
      await writeFile(join(dest,'SKILL.md'),adapt(await readFile(join(source,'SKILL.md'),'utf8'),mode,suite));
      if (mode === '01-richtext') {
        await mkdir(join(dest,'references'),{recursive:true});
        await copyFile(join(source,'references/svg-wechat.md'),join(dest,'references/svg-wechat.md'));
      }
      if (mode === '04-feishu') {
        await mkdir(join(dest,'references'),{recursive:true});
        await writeFile(join(dest,'references/cloud-workflow.md'),adapt(await readFile(join(source,'references/cloud-workflow.md'),'utf8'),mode,suite));
      }
      if (mode === '02-images') await cp(join(source, 'preview'), join(dest, 'preview'), {recursive:true});
      runtimeDirs.push(relative(root,scripts).split('\\').join('/'));
    }
    if (suite) await writeFile(join(root,'SKILL.md'),adapt(await readFile(join(repo,'skill/SKILL.md'),'utf8'),null,false));
    const files={}; for (const file of await fileList(root)) files[file]=sha256(await readFile(join(root,file)));
    await writeFile(join(root,'.skill-package.json'),JSON.stringify({schema:1,name:packageName,version:'0.2.0-dev',mode:suite?'suite':modes[index],runtimeDirs,files},null,2)+'\n');
    await verifyPackage(root);
    console.log(`[build] verified ${packageName}: ${Object.keys(files).length} files`);
  }
  await writeFile(join(temp,'packages.json'),JSON.stringify({schema:1,packages:['html-to-wechat',...names]},null,2)+'\n');
  await rename(temp,output); temp=null;
  console.log(`[build] output: ${output}`);
} catch(e) { console.error('[build]',e.message); process.exitCode=1; }
finally { if(temp) await rm(temp,{recursive:true,force:true}); }

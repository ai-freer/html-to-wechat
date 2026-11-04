import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileList, verifyPackage } from '../scripts/package-utils.mjs';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'h2w-plugin-test-'));
const run = (cmd, args, cwd = temp) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result;
};
try {
  const out = join(temp, 'plugins');
  run(process.execPath, [join(repo, 'plugins/build.mjs'), '--out', out]);
  const html = join(temp, 'example.html');
  await writeFile(html, '<html><body><main><h1>插件验证</h1><p>保留此正文。</p></main></body></html>');
  for (const target of ['codex', 'claude', 'workbuddy', 'deepseek']) {
    let root = join(out, target);
    if (target === 'deepseek') {
      const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root).stdout)[0];
      for (const file of ['index.js', 'cordis.patch.yml', 'skills/html-to-wechat/.skill-package.json', 'skills/html-to-wechat/modes/04-feishu/scripts/package-lock.json']) assert.ok(packed.files.some(entry => entry.path === file), `npm package missing ${file}`);
      const unpack = join(temp, 'dsh-unpacked'); await mkdir(unpack);
      run('tar', ['-xzf', join(temp, packed.filename), '-C', unpack]);
      root = join(unpack, 'package');
    }
    const suite = join(root, 'skills/html-to-wechat');
    await verifyPackage(suite);
    for (const mode of ['01-richtext', '02-images', '03-script', '04-feishu']) await access(join(suite, 'modes', mode, 'MODE.md'));
    assert.deepEqual((await fileList(suite)).filter(file => file.endsWith('/SKILL.md')), [], 'suite must expose one skill entry');
    const manifestPath = target === 'codex' ? 'plugin.json' : target === 'claude' ? '.claude-plugin/plugin.json' : target === 'workbuddy' ? '.workbuddy-plugin/plugin.json' : 'package.json';
    const manifest = JSON.parse(await readFile(join(root, manifestPath), 'utf8'));
    assert.equal(manifest.name, target === 'deepseek' ? '@local/html-to-wechat' : 'html-to-wechat');
    if (target === 'deepseek') {
      assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
      assert.match(await readFile(join(root, 'cordis.patch.yml'), 'utf8'), /@local\/html-to-wechat/);
      const plugin = await import(pathToFileURL(join(root, 'index.js')).href);
      let provider; plugin.apply({ skills: { registerProvider: factory => { provider = factory({}); } } });
      const [item] = await provider.list();
      assert.equal(item.name, 'html-to-wechat');
      assert.equal(await realpath(item.resourceBase.path), await realpath(suite));
      assert.match((await provider.get(item)).content, /modes\/04-feishu\/MODE\.md/);
      assert.equal(await provider.get({ ...item, locator: '/bad' }), undefined);
    }
    run(process.execPath, [join(suite, 'scripts/setup.mjs')]);
    const rich = join(temp, target + '-rich.html'), script = join(temp, target + '-script.md'), xml = join(temp, target + '.xml');
    run(process.execPath, [join(suite, 'modes/01-richtext/scripts/index.mjs'), '--input', html, '--output', rich, '--no-measure']);
    run(process.execPath, [join(suite, 'modes/03-script/scripts/index.mjs'), '--input', html, '--output', script]);
    run(process.execPath, [join(suite, 'modes/04-feishu/scripts/index.mjs'), '--input', html, '--output-xml', xml, '--export-only', '--no-measure']);
    const payload = join(temp, target + '-payload.json');
    await writeFile(payload, JSON.stringify({ title: '测试', captionTags: [], images: [{ src: 'https://example.com/a.png', alt: '测试' }] }));
    const result = run(process.execPath, [join(suite, 'modes/02-images/scripts/make-fragment.mjs'), payload, 'http://127.0.0.1:8772/web/images/']);
    assert.match(result.stdout, /#app=/);
    for (const file of [rich, script, xml]) assert.match(await readFile(file, 'utf8'), /插件验证/);
    console.log(`${target}: manifest, packaged suite and four local paths passed`);
  }
  // WorkBuddy reads .codebuddy-plugin/marketplace.json only; keep the entry and the
  // committed release package in sync so /plugin install never points at a stale path.
  const marketplace = JSON.parse(await readFile(join(repo, '.codebuddy-plugin/marketplace.json'), 'utf8'));
  const entry = marketplace.plugins.find(plugin => plugin.name === 'html-to-wechat');
  assert.ok(entry, 'WorkBuddy marketplace is missing html-to-wechat');
  assert.equal(typeof entry.source, 'string');
  assert.match(entry.source, /^\.\//, 'marketplace source must be relative to the repository root');
  const wbRoot = join(repo, entry.source);
  const wbManifest = JSON.parse(await readFile(join(wbRoot, '.workbuddy-plugin/plugin.json'), 'utf8'));
  assert.equal(wbManifest.name, entry.name);
  assert.equal(wbManifest.version, entry.version, 'marketplace version must match .workbuddy-plugin/plugin.json');
  const wbSuite = join(wbRoot, 'skills/html-to-wechat');
  await access(join(wbSuite, 'SKILL.md'));
  await verifyPackage(wbSuite);
  const wbPackage = JSON.parse(await readFile(join(wbSuite, '.skill-package.json'), 'utf8'));
  assert.equal(entry.version, wbPackage.version, 'marketplace version must match the packaged skill version');
  console.log('WorkBuddy marketplace entry matches the committed release package');
  const claude = spawnSync('claude', ['plugin', 'validate', join(out, 'claude')], { encoding: 'utf8', timeout: 30000 });
  if (!claude.error) { assert.equal(claude.status, 0, claude.stdout + claude.stderr); console.log('Claude CLI manifest validation passed'); }
  else console.log('Claude CLI unavailable; manifest validation skipped');
} finally { await rm(temp, { recursive: true, force: true }); }

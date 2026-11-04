#!/usr/bin/env node
// Build the DeepSeek Harness plugin market index (format 1) for the committed
// DeepSeek release package. The index pins the exact commit that contains
// plugins/release/deepseek, so it is generated while deploying instead of being
// committed: a committed copy could never name the commit that contains itself.
//   node scripts/build-market-index.mjs --out web/plugins/market.json --commit <sha40> [--timestamp <unix>]
//   node scripts/build-market-index.mjs --check
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = 'plugins/release/deepseek';
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const check = args.includes('--check');
const out = option('--out');
if (check ? out !== undefined : out === undefined) {
  console.error('Usage: node scripts/build-market-index.mjs --out <file> --commit <sha40> [--timestamp <unix>] | --check');
  process.exit(1);
}

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/u;

function fail(message) {
  throw new Error(message);
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    fail('cannot resolve HEAD; pass --commit <sha40>');
  }
}

function gitTimestamp(commit) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%ct', commit], { cwd: repo, encoding: 'utf8' }).trim();
    return Number.parseInt(value, 10);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

function localized(text, fallback) {
  const value = typeof text === 'string' && text.trim() !== '' ? text : fallback;
  if (typeof value !== 'string' || value.trim() === '') fail('a localized value is empty');
  return value;
}

async function readMeta(language) {
  try {
    const parsed = JSON.parse(await readFile(join(repo, packageDir, 'locale', `${language}.json`), 'utf8'));
    return parsed.meta ?? {};
  } catch (error) {
    if (error.code === 'ENOENT') fail(`${packageDir}/locale/${language}.json is missing`);
    throw error;
  }
}

function validate(index, indexUrl) {
  if (index.format !== 1) fail('$.format must be 1');
  if (typeof index.title?.en !== 'string') fail('$.title.en is missing');
  if (!Array.isArray(index.plugins) || index.plugins.length === 0) fail('$.plugins must be a non-empty array');
  const categories = index.metadata?.categories ?? {};
  for (const plugin of index.plugins) {
    if (!PACKAGE_NAME.test(plugin.name) || plugin.name.length > 214) fail(`invalid package name ${plugin.name}`);
    if (plugin.metadata?.category !== undefined && !Object.hasOwn(categories, plugin.metadata.category)) {
      fail(`$.metadata.categories is missing ${plugin.metadata.category}`);
    }
    if (plugin.icon !== undefined) {
      const resolved = new URL(plugin.icon, indexUrl);
      if (resolved.protocol !== 'https:') fail(`icon ${plugin.icon} must resolve to https`);
    }
    if (typeof plugin.repository?.url !== 'string' || !plugin.repository.url.startsWith('https://')) {
      fail(`${plugin.name} repository.url must be https`);
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) fail(`${plugin.name} has no versions`);
    const seen = new Set();
    for (const version of plugin.versions) {
      if (!SEMVER.test(version.version)) fail(`invalid version ${version.version}`);
      if (seen.has(version.version)) fail(`duplicate version ${version.version}`);
      seen.add(version.version);
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) fail('publishTimestamp must be Unix seconds');
      const source = version.source;
      if (source.type !== 'git') fail('source.type must be git for a GitHub release');
      if (!COMMIT.test(source.commit)) fail('source.commit must be a lowercase 40-hex commit');
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || url.href !== source.url) fail('source.url must be a canonical https URL');
      if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') fail('source.url must carry no credentials, query or fragment');
      if (source.path !== undefined && source.path.split('/').some(segment => segment === '' || segment === '.' || segment === '..' || !PATH_SEGMENT.test(segment))) {
        fail('source.path must be a relative directory of safe segments');
      }
      if (version.engines?.dsh !== undefined && (typeof version.engines.dsh !== 'string' || version.engines.dsh.trim() === '')) {
        fail('engines.dsh must be a non-empty SemVer range');
      }
    }
  }
}

const commit = option('--commit') ?? gitCommit();
if (!COMMIT.test(commit)) fail('--commit must be a lowercase 40-hex commit');
const pkg = JSON.parse(await readFile(join(repo, packageDir, 'package.json'), 'utf8'));
if (!SEMVER.test(pkg.version)) fail(`package version ${pkg.version} is not exact SemVer`);
if (typeof pkg.engines?.dsh !== 'string') fail('the DeepSeek package must declare engines.dsh');
const [en, zh] = await Promise.all([readMeta('en'), readMeta('zh')]);
const repositoryUrl = option('--repo') ?? (process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'https://github.com/ai-freer/html-to-wechat');
const homepage = option('--homepage') ?? repositoryUrl;
const timestamp = option('--timestamp') ? Number.parseInt(option('--timestamp'), 10) : gitTimestamp(commit);
if (!Number.isInteger(timestamp) || timestamp < 0) fail('--timestamp must be Unix seconds');

const index = {
  format: 1,
  title: { en: 'AI Freer Plugins', zh: 'AI Freer 插件' },
  metadata: { categories: { content: { title: { en: 'Content', zh: '内容' } } } },
  plugins: [{
    name: pkg.name,
    title: {
      en: localized(en.title, pkg.name),
      zh: localized(zh.title, localized(en.title, pkg.name)),
    },
    description: {
      en: localized(en.description, pkg.description),
      zh: localized(zh.description, localized(en.description, pkg.description)),
    },
    icon: option('--icon') ?? 'icon.png',
    author: 'ai-freer',
    homepage,
    repository: { url: repositoryUrl, directory: packageDir },
    metadata: { category: 'content', keywords: ['wechat', 'xiaohongshu', 'feishu', 'html'] },
    versions: [{
      version: pkg.version,
      publishTimestamp: timestamp,
      source: { type: 'git', url: repositoryUrl, commit, path: packageDir },
      engines: { dsh: pkg.engines.dsh },
    }],
  }],
};
validate(index, 'https://ai-freer.github.io/html-to-wechat/plugins/market.json');

if (check) {
  console.log(`[market index] valid: ${pkg.name}@${pkg.version} at ${commit}`);
} else {
  const target = resolve(out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`[market index] wrote ${target} for ${pkg.name}@${pkg.version}`);
}

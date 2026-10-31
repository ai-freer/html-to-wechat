import { readdir, lstat, readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function fileList(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = await lstat(join(root, rel));
    if (info.isSymbolicLink()) throw new Error(`Package symlink is not allowed: ${rel}`);
    if (info.isDirectory()) result.push(...await fileList(root, rel));
    else if (info.isFile()) result.push(rel);
    else throw new Error(`Unsupported package entry: ${rel}`);
  }
  return result.sort();
}
export function within(root, file) {
  const rel = relative(resolve(root), resolve(root, file));
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error(`Path escapes package: ${file}`);
  return resolve(root, file);
}
export async function verifyPackage(root) {
  const manifest = JSON.parse(await readFile(join(root, '.skill-package.json'), 'utf8'));
  if (manifest.schema !== 1 || !/^[a-z0-9-]+$/.test(manifest.name) || !Array.isArray(manifest.runtimeDirs)) throw new Error('Invalid package manifest');
  const actual = (await fileList(root)).filter(f => f !== '.skill-package.json');
  const expected = Object.keys(manifest.files || {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Package file list differs from its manifest');
  for (const file of expected) {
    if (sha256(await readFile(within(root, file))) !== manifest.files[file]) throw new Error(`Package checksum mismatch: ${file}`);
  }
  for (const dir of manifest.runtimeDirs) {
    const runtime = within(root, dir);
    const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(runtime, 'package-lock.json'), 'utf8'));
    for (const key of ['dependencies', 'optionalDependencies']) {
      if (JSON.stringify(Object.entries(pkg[key] || {}).sort()) !== JSON.stringify(Object.entries(lock.packages?.['']?.[key] || {}).sort())) throw new Error(`Dependency lock mismatch: ${dir}`);
    }
  }
  return manifest;
}

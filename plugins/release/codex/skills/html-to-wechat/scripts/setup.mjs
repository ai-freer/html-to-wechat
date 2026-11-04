#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/setup.mjs [--mode 01-richtext|02-images|03-script|04-feishu] [--with-browser]\nDefault: npm ci from bundled locks, omit optional browser dependency. --with-browser installs Puppeteer with lifecycle scripts disabled; supply an existing browser via PUPPETEER_EXECUTABLE_PATH.');
  process.exit(0);
}
try {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) throw new Error('Node.js 20.19+ required');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') { if (!args[++i]) throw new Error('--mode requires a value'); }
    else if (args[i] !== '--with-browser') throw new Error(`Unknown option: ${args[i]}`);
  }
  const manifest = JSON.parse(await readFile(join(root, '.skill-package.json'), 'utf8'));
  const filter = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : null;
  const dirs = manifest.runtimeDirs.filter(dir => !filter || dir.includes(`/${filter}/`) || manifest.mode === filter);
  if (!dirs.length) throw new Error('Requested mode is not in this package');
  for (const dir of dirs) {
    const cwd = resolve(root, dir);
    if (cwd !== root && !cwd.startsWith(root + '/')) throw new Error('Runtime path escapes package');
    const npmArgs = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
    if (!args.includes('--with-browser')) npmArgs.push('--omit=optional');
    await new Promise((done, fail) => {
      const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, { cwd, stdio: 'inherit' });
      p.on('error', fail); p.on('close', code => code === 0 ? done() : fail(new Error(`npm ci failed (${code}) for ${dir}`)));
    });
    console.log(`[skill setup] installed locked dependencies: ${dir}`);
  }
  console.log('[skill setup] complete; no CLI credentials, browser binary, host discovery, cloud write or Hub sync configured');
} catch (e) { console.error('[skill setup]', e.message); process.exitCode = 1; }

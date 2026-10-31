// Optional local integration check; requires the actual Codex app-server.
// Does not start a model turn, install skills, or change user configuration.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import assert from 'node:assert/strict';

const [cwdArg, ...expected] = process.argv.slice(2);
if (!cwdArg || !expected.length) {
  console.error('Usage: node tests/codex-discovery.mjs <project-directory> <expected-skill-name> [...]');
  process.exit(1);
}
const cwd = realpathSync(resolve(cwdArg));
const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
// Do not persist or echo runtime diagnostics: they may contain unrelated MCP context.
child.stderr.resume();
const pending = new Map();
let nextId = 0;
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error('Codex RPC failed: ' + message.error.code));
  else request.resolve(message.result);
});
const rejectPending = () => {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex app-server stopped')); }
  pending.clear();
};
child.on('error', rejectPending);
child.on('exit', rejectPending);
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Codex RPC timed out')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
try {
  await rpc('initialize', { clientInfo: { name: 'h2w_skill_discovery_test', version: '0.1.0' } });
  child.stdin.write('{"method":"initialized"}\n');
  const result = await rpc('skills/list', { cwds: [cwd], forceReload: true });
  const row = result.data.find(d => realpathSync(d.cwd) === cwd);
  assert(row, 'No result for requested working directory');
  const prefix = cwd + sep;
  const local = row.skills.filter(s => s.path.startsWith(prefix));
  const errors = (row.errors || []).filter(e => e.path.startsWith(prefix));
  assert.equal(errors.length, 0, 'Project skill parse errors');
  for (const name of expected) {
    const matches = local.filter(s => s.name === name && s.enabled && s.scope === 'repo');
    assert.equal(matches.length, 1, `Expected exactly one enabled project skill: ${name}`);
  }
  console.log(JSON.stringify({ cwd, skills: local.map(({ name, path, scope, enabled }) => ({ name, path, scope, enabled })), errors, status: 'passed' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  lines.close(); child.stdin.end(); child.kill();
}

import { spawn } from 'node:child_process';

// One JSON contract; errors never print raw request/auth context.
export function runLark(args, input = null, opts = {}) {
  return new Promise((resolve, reject) => {
    const argv = [...args, '--as', opts.as || 'user'];
    const profile = opts.profile || process.env.LARK_CLI_PROFILE;
    if (profile) argv.push('--profile', profile);
    const proc = spawn(process.env.LARK_CLI_BIN || 'lark-cli', argv, {
      cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('error', reject);
    proc.stdin.on('error', e => { if (e.code !== 'EPIPE') reject(e); });
    proc.on('close', code => {
      let json;
      try { json = JSON.parse(code === 0 ? stdout : stderr); } catch {}
      if (code !== 0 || json?.ok !== true) reject(new Error(`lark-cli ${args[0]} ${args[1]} failed (${code}): ${json?.error?.message || 'invalid JSON response; inspect CLI help'}`));
      else if (json.data?.result && json.data.result !== 'success') reject(new Error(`lark-cli returned ${json.data.result}; inspect document before retrying`));
      else resolve(json);
    });
    proc.stdin.end(input);
  });
}

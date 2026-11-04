import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

export const name = 'html-to-wechat';
export const inject = ['skills'];

// Keep one discoverable entry: the suite itself routes to the four bundled modes.
export function apply(ctx) {
  const directory = fileURLToPath(new URL('./skills/html-to-wechat/', import.meta.url));
  const path = join(directory, 'SKILL.md');
  const parse = raw => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(raw);
    if (!match) throw new Error('html-to-wechat: invalid skill frontmatter');
    const line = /^description:\s*(.+)$/mu.exec(match[1]);
    if (!line) throw new Error('html-to-wechat: missing description');
    return { description: JSON.parse(line[1]), content: match[2] };
  };
  const { description } = parse(readFileSync(path, 'utf8'));
  const candidate = {
    name: 'html-to-wechat', description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'html-to-wechat', source: 'bundled', rank: 600,
    resourceBase: { kind: 'directory', path: directory.split(sep).join('/') }, locator: path,
  };
  ctx.skills.registerProvider(() => ({
    name: 'html-to-wechat',
    list: async () => [candidate],
    async get(item, options = {}) {
      if (item.locator !== path || item.name !== candidate.name) return undefined;
      const { rank, locator, ...summary } = item;
      return { ...summary, content: parse(await readFile(path, { encoding: 'utf8', signal: options.signal })).content };
    },
  }));
}

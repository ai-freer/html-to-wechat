import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

export const name = 'html-to-wechat';
export const inject = ['skills'];

// 600 is the packaged-provider precedence rank the skill registry ships for
// bundled skills: it outranks project and user filesystem skills of the same
// name. It is a literal because a third-party plugin must not install a second
// copy of @deepseek-ai/dsh-skill, whose constant would carry another registry.
const RANK = 600;

function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(raw);
  if (!match) throw new Error('html-to-wechat: invalid skill frontmatter');
  return { head: match[1], body: match[2] };
}

// Accept a JSON-quoted scalar, a single-quoted YAML scalar, or a plain one, so
// editing SKILL.md by hand cannot break bundle activation.
function scalar(head, key) {
  const line = new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(head);
  if (!line) return undefined;
  const value = line[1].trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

// Keep one discoverable entry: the suite itself routes to the four bundled modes.
export function apply(ctx) {
  const directory = fileURLToPath(new URL('./skills/html-to-wechat/', import.meta.url));
  const path = join(directory, 'SKILL.md');
  const description = scalar(splitFrontmatter(readFileSync(path, 'utf8')).head, 'description');
  if (typeof description !== 'string' || description === '') throw new Error('html-to-wechat: missing description');

  const summary = {
    name: 'html-to-wechat',
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'html-to-wechat',
    source: 'plugin',
    rank: RANK,
    resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
    locator: path,
  };

  const provider = {
    name: 'html-to-wechat',
    // The catalog must load without reading the body.
    list: async () => [summary],
    // Every load re-reads the file, so edits reach the next session without a
    // version bump. The registry only calls this with its own candidate.
    async get(_item, options = {}) {
      const raw = await readFile(path, { encoding: 'utf8', signal: options.signal });
      return { ...summary, content: splitFrontmatter(raw).body };
    },
  };

  // ctx.effect returns the registration's disposer, so an HMR reload or uninstall
  // releases the provider instead of failing with "already registered".
  ctx.effect(() => ctx.skills.registerProvider(() => provider));
}

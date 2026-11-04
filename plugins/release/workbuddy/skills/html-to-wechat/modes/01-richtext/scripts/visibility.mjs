// Binds this mode's cheerio to the shared pre-conversion visibility step.
import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { triageVisibility } from '../../../lib/visibility.mjs';

export async function triage(html, planPath) {
  const plan = planPath ? JSON.parse(await readFile(resolve(planPath), 'utf8')) : {};
  return triageVisibility(html, load, { plan });
}

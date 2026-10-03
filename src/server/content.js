import { validateContent } from '../rules/contentValidation.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function loadContent(root) {
  const files = { vehicles: 'vehicles.json', crew: 'crew.json', weapons: 'weapons.json', maneuvers: 'maneuvers.json', scenarios: 'scenarios.json', map: 'map_scrapyard_01.json' };
  const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => [key, JSON.parse(await readFile(new URL(`data/${file}`, root), 'utf8'))]));
  const content = Object.fromEntries(entries);
  validateContent(content);
  content.version = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  return content;
}

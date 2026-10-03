import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateContent } from '../rules/contentValidation.js';

const files = ['vehicles','crew','weapons','maneuvers','scenarios','map_scrapyard_01'];
export async function loadContent(projectRoot) {
  const content = {};
  for (const name of files) content[name] = JSON.parse(await readFile(new URL(`data/${name}.json`, projectRoot), 'utf8'));
  validateContent(content);
  content.version = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return content;
}

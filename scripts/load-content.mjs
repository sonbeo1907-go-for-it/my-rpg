import { readFile } from 'node:fs/promises';
import { assembleContent, COLLECTIONS } from '../src/core/content.js';

export async function loadContent() {
  const collections = await Promise.all(COLLECTIONS.map(async name => [name, JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'))]));
  return assembleContent(Object.fromEntries(collections));
}

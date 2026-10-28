import { loadContent } from './load-content.mjs';

try {
  const content = await loadContent();
  for (const [name, items] of Object.entries(content)) console.log(`${name}: ${Object.keys(items).length} hợp lệ`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

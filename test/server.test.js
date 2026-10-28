import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDevServer, resolvePublicPath } from '../scripts/serve.mjs';

test('server confines access to public assets, source and content', () => {
  assert.ok(resolvePublicPath('/'));
  assert.ok(resolvePublicPath('/data/characters.json'));
  for (const url of ['/package.json', '/.git/config', '/data/%2e%2e%2fpackage.json', '/data/%2e%2e%2f%2e%2e%2fsecret', '/src/%5c..%5cpackage.json', '/%ZZ']) assert.equal(resolvePublicPath(url), null, url);
});

test('dev server serves the actual HTML, module and JSON without external services', async () => {
  const server = createDevServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Northern Prisma/);
    const module = await fetch(`${base}/src/ui/main.js`);
    assert.match(module.headers.get('content-type'), /javascript/);
    const data = await fetch(`${base}/data/characters.json`);
    assert.ok((await data.json()).some(character => character.id === 'aurora'));
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

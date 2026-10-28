import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

export function resolvePublicPath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname); } catch { return null; }
  if (pathname === '/') return path.join(root, 'public', 'index.html');
  if (!/^\/(public|src|data)\//.test(pathname)) return null;
  const resolved = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || pathname.includes('\\') || !/^(public|src|data)[\\/]/.test(relative)) return null;
  return resolved;
}

export function createDevServer() {
  return createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = resolvePublicPath(req.url);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createDevServer();
  server.on('error', error => { console.error(`Không mở được máy chủ: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Northern Prisma: http://127.0.0.1:${port}\nCtrl+C để dừng.`));
}

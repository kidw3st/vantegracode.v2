/**
 * Статический сервер для dist/ — для скриншотов и автотестов (без PHP).
 * Каталоги отдают index.html, неизвестные адреса — 404.html со статусом 404.
 *   node tests/serve.mjs [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = path.join(target, 'index.html');
  if (existsSync(index)) return index;
  return null;
}

export function serve(port = 4329, base = '/') {
  const prefix = base.replace(//$/, '');
  const server = createServer((req, res) => {
    let url = req.url ?? '/';
    if (prefix) {
      if (!url.startsWith(prefix + '/') && url !== prefix) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
      }
      url = url.slice(prefix.length) || '/';
    }
    // как на хостинге: адрес без слеша в конце → редирект на адрес со слешем
    if (!url.split('?')[0].endsWith('/') && !path.extname(url.split('?')[0]) && resolveFile(url + '/')) {
      res.writeHead(301, { Location: url.replace(/(\?|$)/, '/$1') });
      res.end();
      return;
    }
    const file = resolveFile(url);
    const notFound = path.join(ROOT, '404.html');
    const body = file ?? (existsSync(notFound) ? notFound : null);
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    res.writeHead(file ? 200 : 404, { 'Content-Type': TYPES[path.extname(body)] ?? 'application/octet-stream' });
    const stream = createReadStream(body);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] ?? 4329);
  const base = process.argv[3] ?? '/';
  await serve(port, base);
  console.log(`dist/ → http://localhost:${port}${base}`);
}

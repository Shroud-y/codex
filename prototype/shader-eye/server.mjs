/* global process, console, URL */
/**
 * Zero-dependency static server for the shader-eye prototype.
 *
 * Deliberately not Vite: this folder must run with nothing installed and be
 * deletable in one step. Node built-ins only.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 5178);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const path = normalize(join(ROOT, rel));

  // Refuse anything that escapes the prototype folder.
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`shader-eye  ->  http://127.0.0.1:${PORT}/`);
});

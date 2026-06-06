import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const STATIC_DIR = resolve(PLUGIN_ROOT, 'static');
const HTTP_PORT = parseInt(process.env.CESIUM_HTTP_PORT || '9101');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = resolve(STATIC_DIR, pathname.slice(1));

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const content = readFileSync(filePath);
    const ext = filePath.match(/\.[^.]+$/)?.[0] || '';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(HTTP_PORT, () => {
  process.stderr.write(`[cesium-mcp] Viewer: http://localhost:${HTTP_PORT}\n`);
});

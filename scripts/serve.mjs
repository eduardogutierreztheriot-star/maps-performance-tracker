// Minimal static server for local development and the e2e suite.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

export function createServer() {
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
            if (path.split(/[/\\]/).some((p) => p === '..' || p === 'node_modules' || p.startsWith('.'))) { res.writeHead(404).end(); return; }
            let file = join(ROOT, path || 'index.html');
            if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        }
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT) || 5173;
    createServer().listen(port, () => console.log(`MAPS Performance Tracker → http://localhost:${port}`));
}

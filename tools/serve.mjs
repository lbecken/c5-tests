#!/usr/bin/env node
// Tiny static server for local play: `npm start`, then open the printed URL.
// Range requests are supported so the browser can seek within a clip.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'web');
const PORT = Number(process.env.PORT || 8099);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = s ? Number(s) : 0;
      const end = e ? Number(e) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`\n  THE OBSERVATORY MURDER\n  http://localhost:${PORT}\n`);
});

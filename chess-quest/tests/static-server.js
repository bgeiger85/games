/* Minimal static file server for the browser suite.

   The suite used to load the game over file://. That is not how the game ships,
   and it is actively misleading on WebKit: WebKit treats every file:// document
   as an opaque origin, so localStorage throws SecurityError there. The game
   wraps storage in try/catch and degrades to in-session memory, so a file://
   WebKit run would quietly test the *fallback* path on every persistence check
   and report a pass — or fail for a reason no real player can ever hit.

   Serving over http gives every engine the same real origin the deployed game
   has, which is the point: remove the environment as a variable. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

/* Serves rootDir on an ephemeral port. Resolves to { server, port, close }. */
function serve(rootDir) {
  const root = path.resolve(rootDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try {
        rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      } catch {
        res.writeHead(400); return res.end('bad request');
      }
      const file = path.join(root, rel || 'index.html');
      // Refuse anything that escapes the served directory.
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403); return res.end('forbidden');
      }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        close: () => new Promise(done => server.close(done))
      });
    });
  });
}

module.exports = { serve };

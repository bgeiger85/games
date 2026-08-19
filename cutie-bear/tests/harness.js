/* Shared test harness: a static server and an engine-agnostic launcher.

   Two things this fixes about how the suites used to start up.

   1. They hardcoded executablePath: '/opt/pw-browsers/chromium', which exists
      only inside one container. Anywhere else — a laptop, a CI runner — the
      suites could not run at all. Playwright resolves its own browsers; the
      baked-in path is now a fallback, used only if it is really there.

   2. They loaded src/index.html over file://. The app ships to a web host, and
      file:// is not a fair rehearsal of that: WebKit treats a file:// document
      as an opaque origin and refuses localStorage, so every save/restore check
      would exercise the try/catch fallback instead of the real path. Serving
      over http gives every engine the same origin the deployed app has.

   (This duplicates chess-quest/tests/static-server.js on purpose. The two games
   are independent packages with their own package.json; a shared module would
   mean a workspace, which is a lot of machinery for sixty lines.) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

/* Serves rootDir on an ephemeral port. */
function serve(rootDir) {
  const root = path.resolve(rootDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''); }
      catch { res.writeHead(400); return res.end('bad request'); }
      const file = path.join(root, rel || 'index.html');
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
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      port: server.address().port,
      close: () => new Promise(done => server.close(done))
    }));
  });
}

/* ENGINE=chromium|webkit|firefox, defaulting to chromium. */
function engineName() { return process.env.ENGINE || 'chromium'; }

async function launch() {
  const name = engineName();
  const engine = playwright[name];
  if (!engine || typeof engine.launch !== 'function') {
    throw new Error('unknown ENGINE "' + name + '" (expected chromium, webkit or firefox)');
  }
  const baked = '/opt/pw-browsers/chromium';
  const useBaked = name === 'chromium' && fs.existsSync(baked);
  return engine.launch(useBaked ? { executablePath: baked } : {});
}

/* Serves dist/ (what actually ships) and returns { url, close }. */
async function site() {
  const target = process.env.TARGET || 'dist/index.html';
  const s = await serve(path.resolve(__dirname, '..', path.dirname(target)));
  return {
    url: 'http://127.0.0.1:' + s.port + '/' + path.basename(target),
    close: s.close,
    target
  };
}

module.exports = { serve, launch, site, engineName };

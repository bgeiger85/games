#!/usr/bin/env node
/*
 * Tiny static server so you can open the game on an iPad on the same wifi
 * without deploying. Node built-ins only, no dependency.
 *   npm run serve   ->  http://<your-lan-ip>:8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..', 'src');
const port = process.env.PORT || 8081;

http.createServer((req, res) => {
  const file = req.url === '/' || req.url.startsWith('/?') ? 'index.html' : req.url.split('?')[0].slice(1);
  const full = path.join(root, path.normalize(file).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': full.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(port, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log("\nYamal's World Cup is serving src/index.html\n");
  console.log('  local:   http://localhost:' + port);
  ips.forEach(ip => console.log('  network: http://' + ip + ':' + port + '   <- open this on the iPad'));
  console.log('\nCtrl+C to stop.\n');
});

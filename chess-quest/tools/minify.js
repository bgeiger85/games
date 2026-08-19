/*
 * Minifies dist/chess-quest.html into dist/index.html — the file you deploy.
 *
 * Long lines are re-broken at syntactically safe points afterwards. That is not
 * cosmetic: some transports and editors mangle very long lines, and a single
 * altered character in minified JS breaks the app silently.
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

const ROOT = path.dirname(__dirname);
const SRC_HTML = path.join(ROOT, 'dist', 'chess-quest.html');
const OUT_HTML = path.join(ROOT, 'dist', 'index.html');

(async () => {
  if (!fs.existsSync(SRC_HTML)) {
    console.error('dist/chess-quest.html not found — run `npm run build` first.');
    process.exit(1);
  }
  let html = fs.readFileSync(SRC_HTML, 'utf8');

  // Minify each <script> block, preserving ids and order. `toplevel` is left off
  // on purpose: the worker is built from the core script's own text and calls its
  // top-level functions by name, so those names must survive.
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  const parts = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) parts.push({ full: m[0], attrs: m[1], code: m[2] });

  for (const p of parts) {
    const res = await minify(p.code, {
      compress: { passes: 2, drop_console: true },
      mangle: { reserved: ['BUILTIN_PUZZLES'] },
      format: { comments: false, max_line_len: 160 }
    });
    if (res.error) throw res.error;
    html = html.replace(p.full, '<script' + p.attrs + '>' + res.code + '</script>');
  }

  html = html.replace(/<style>([\s\S]*?)<\/style>/, (all, css) =>
    '<style>' + new CleanCSS({ level: 2 }).minify(css).styles + '</style>');

  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/\n\s*\n/g, '\n');

  // Re-break long lines only where whitespace is syntactically irrelevant.
  html = html.replace(/<style>([\s\S]*?)<\/style>/, (a, css) => '<style>' + css.replace(/}/g, '}\n') + '</style>');
  html = html.replace(/(<script id="chess-puzzles">)([\s\S]*?)(<\/script>)/,
    (a, o, body, c) => o + body.replace(/},{/g, '},\n{') + c);

  fs.writeFileSync(OUT_HTML, html);

  const longest = html.split('\n').reduce((n, l) => Math.max(n, l.length), 0);
  console.log('dist/index.html  %d -> %d bytes (longest line %d)',
    fs.statSync(SRC_HTML).size, fs.statSync(OUT_HTML).size, longest);

  // Must run after index.html is written: the cache name is its hash.
  const { makeSw } = require('./make-sw');
  const version = makeSw(require('path').dirname(OUT_HTML), 'wildcat-chess');
  console.log('dist/sw.js       offline cache wildcat-chess-%s', version);
})();

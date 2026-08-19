#!/usr/bin/env node
/*
 * Build = validate, then copy. There is deliberately no bundler.
 * src/index.html IS the game; this script's whole job is to refuse to ship
 * a version that has quietly picked up a dependency or stopped parsing.
 *
 * Same contract as cutie-bear/tools/build.js. The checks in section 3 are the
 * ones specific to this game.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'src', 'index.html');
const distDir = path.join(root, 'dist');
const html = fs.readFileSync(srcPath, 'utf8');

const fail = [];
const warn = [];

/* 1. every script block has to actually parse, and each is checked on its own
   so the error names the offender. */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!blocks.length) fail.push('no <script> block found');
blocks.forEach((b, i) => {
  try { new Function(b[1]); }
  catch (e) { fail.push('script block ' + (i + 1) + ' of ' + blocks.length + ' does not parse: ' + e.message); }
});

/* 2. nothing may be loaded from the network */
const externals = (html.match(/https?:\/\/[^"' )]+/g) || [])
  .filter(u => !u.startsWith('http://www.w3.org/'));   // SVG namespace is not a fetch
if (externals.length) fail.push('external URLs found: ' + [...new Set(externals)].join(', '));

if (/<script[^>]+src=/i.test(html)) fail.push('<script src> found: the game must stay one file');
if (/<link[^>]+rel=["']?stylesheet/i.test(html)) fail.push('<link rel=stylesheet> found: the game must stay one file');
if (/<img[^>]+src=["'](?!data:)/i.test(html)) fail.push('<img> with a non-data src found');

/* 3. things that should always be present */
[
  ['viewport-fit=cover', 'iPad viewport meta'],
  ['apple-mobile-web-app-capable', 'Add to Home Screen meta'],
  /* Not just "an icon" but a PNG one. iOS refuses SVG for apple-touch-icon and
     falls back to a screenshot of the page, so an SVG here means no icon at
     all on the device this game is built for. Regenerate with npm run icon. */
  ['<link rel="apple-touch-icon" href="data:image/png', 'home screen icon as a PNG'],
  ['worldcup.save.v1', 'save key'],
  ['function stageXY', 'stageXY coordinate helper'],
  ['function drawPitch', 'the pitch renderer'],
  ['var ROUNDS', 'the tournament ladder'],
].forEach(([needle, label]) => {
  if (!html.includes(needle)) fail.push('missing ' + label + ' (looked for "' + needle + '")');
});

/* 4. soft checks */
const kb = Math.round(html.length / 1024);
if (kb > 300) warn.push('file is ' + kb + 'KB, which is getting large for a single file');
/* every localStorage call site must sit inside a try, or private browsing throws */
let idx = -1, unguarded = 0;
while ((idx = html.indexOf('localStorage.', idx + 1)) !== -1) {
  if (!/\btry\b/.test(html.slice(Math.max(0, idx - 220), idx))) unguarded++;
}
if (unguarded) warn.push(unguarded + ' localStorage call(s) not wrapped in try/catch (breaks in private browsing)');

if (fail.length) {
  console.error('\nBUILD FAILED\n');
  fail.forEach(f => console.error('  x ' + f));
  console.error('');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'), html);

/* Offline cache. Must run after index.html is written, because the cache name
   is a hash of it. See tools/make-sw.js for why this second file exists. */
const { makeSw } = require('./make-sw');
const swVersion = makeSw(distDir, 'world-cup');

/* zip for netlify.com/drop - sw.js has to be in it or the drop loses offline */
try {
  execSync('rm -f world-cup-site.zip && zip -q world-cup-site.zip index.html sw.js', { cwd: distDir });
} catch (e) {
  warn.push('could not make the zip (is `zip` installed?) - dist/index.html is still fine to drag into the Deploys tab');
}

console.log('\nBUILD OK  ' + kb + 'KB, zero external requests');
console.log('  dist/index.html');
console.log('  dist/sw.js       offline cache world-cup-' + swVersion);
if (fs.existsSync(path.join(distDir, 'world-cup-site.zip'))) console.log('  dist/world-cup-site.zip');
warn.forEach(w => console.log('  ! ' + w));
console.log('\nNext: npm test, then push. CI publishes dist/ to Netlify.\n');

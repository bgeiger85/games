/*
 * Palette legibility guard.
 *
 * The classic board is the bar: it is already proven readable on the target
 * iPad. Any theme must meet or beat it on every measure that matters, with a
 * small tolerance only on "white fill vs light square", which is inherently
 * near 1.0 in any theme because a white piece sits on a light square. That
 * case is carried by the outline, which is checked separately and strictly.
 *
 * This exists because colour was picked by measurement, not by eye, and the
 * next person to nudge a hex value should find out immediately if they broke it.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'theme.js');
const raw = fs.readFileSync(SRC, 'utf8');
const sandbox = {};
new Function('module', 'exports', raw + '\nmodule.exports={THEMES,DEFAULT_THEME,crestSvg,themeNames};')
  (sandbox, sandbox);
const { THEMES, DEFAULT_THEME } = sandbox.module ? sandbox.module.exports : sandbox.exports;

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}

function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
}
function lum(h) {
  const c = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function measure(v) {
  return {
    'board checker':      ratio(v['--light'], v['--dark']),
    'white on light':     ratio(v['--pc-w'], v['--light']),
    'white on dark':      ratio(v['--pc-w'], v['--dark']),
    'white outline/light':ratio(v['--pc-w-line'], v['--light']),
    'dark piece on light':ratio(v['--pc-b'], v['--light']),
    'dark piece on dark': ratio(v['--pc-b'], v['--dark']),
    'dark outline/dark':  ratio(v['--pc-b-line'], v['--dark']),
    'piece vs piece':     ratio(v['--pc-w'], v['--pc-b'])
  };
}

const base = measure(THEMES.classic.vars);
log('classic reference bar:');
for (const k in base) log('  ' + k.padEnd(22) + base[k].toFixed(2));

/* Absolute floors, independent of the classic bar. */
const FLOOR = {
  'board checker': 2.5,
  'white on dark': 3.0,
  'white outline/light': 4.5,
  'dark piece on light': 6.0,
  'dark piece on dark': 2.5,
  'dark outline/dark': 3.0,
  'piece vs piece': 9.0
};
const TOLERANT = { 'white on light': true };   // carried by the outline, not the fill

for (const name of Object.keys(THEMES)) {
  const t = THEMES[name];
  const m = measure(t.vars);
  log('\ntheme "' + name + '" (' + t.label + '):');
  for (const k in m) log('  ' + k.padEnd(22) + m[k].toFixed(2));

  const floorFails = Object.keys(FLOOR).filter(k => m[k] < FLOOR[k]);
  check('theme "' + name + '" clears every absolute legibility floor',
    floorFails.length === 0,
    floorFails.map(k => k + ' ' + m[k].toFixed(2) + ' < ' + FLOOR[k]).join('; '));

  if (name !== 'classic') {
    const belowBar = Object.keys(base).filter(k => !TOLERANT[k] && m[k] < base[k]);
    check('theme "' + name + '" meets or beats the classic board everywhere that matters',
      belowBar.length === 0,
      belowBar.map(k => k + ' ' + m[k].toFixed(2) + ' vs classic ' + base[k].toFixed(2)).join('; '));
  }

  const required = ['--bg', '--panel', '--ink', '--muted', '--light', '--dark',
                    '--sel', '--last', '--dot', '--pc-w', '--pc-w-line', '--pc-b', '--pc-b-line'];
  const missing = required.filter(k => !t.vars[k]);
  check('theme "' + name + '" defines every variable the stylesheet uses',
    missing.length === 0, missing.join(', '));
}

check('default theme exists', !!THEMES[DEFAULT_THEME], DEFAULT_THEME);

/* The Woodland Springs palette must actually be the school's colours.
   Campus colours are published as Green, White and Purple. */
const w = THEMES.wildcats.vars;
function hue(h) {
  const [r, g, b] = hex2rgb(h).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return -1;
  let x;
  if (mx === r) x = ((g - b) / d) % 6; else if (mx === g) x = (b - r) / d + 2; else x = (r - g) / d + 4;
  return (x * 60 + 360) % 360;
}
const gh = hue(w['--dark']), ph = hue(w['--pc-b']);
check('Wildcats dark squares are green (hue 90-170)', gh >= 90 && gh <= 170, Math.round(gh));
check('Wildcats dark pieces are purple (hue 250-300)', ph >= 250 && ph <= 300, Math.round(ph));
check('Wildcats light pieces are white', w['--pc-w'].toLowerCase() === '#ffffff', w['--pc-w']);

log(fails === 0 ? '\nALL CONTRAST TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);

/* ============================================================
   THEMES

   Colour lives here and nowhere else. Every themed value is written
   to a CSS custom property on <html>, so switching themes is one
   function call and no repaint logic.

   The Wildcats palette is Woodland Springs Elementary (Keller ISD).
   The campus publishes "Campus Colors: Green, White and Purple" and its
   spirit wear ships in Kelly Green, Purple, Amethyst and White, so the
   greens and purples below are those families, not invented ones.

   Exact shades were chosen by measuring WCAG contrast against the
   classic board, which is already proven readable on the target iPad.
   Every measure meets or beats it. Do not nudge these by eye: run
   `node tests/contrast.test.js` after any change.
   ============================================================ */

var THEMES = {

  classic: {
    label: 'Classic',
    title: 'Chess Quest',
    subtitle: 'Road to Grandmaster',
    crest: null,
    vars: {
      '--bg':        '#161c2a',
      '--bg-glow':   '#243052',
      '--panel':     '#212a3d',
      '--panel-2':   '#1a2233',
      '--ink':       '#f4f7ff',
      '--muted':     '#9fb0cd',
      '--light':     '#f2dcb6',
      '--dark':      '#b1794f',
      '--coord-on-light': '#3a2a1a',
      '--coord-on-dark':  '#f3e2c7',
      '--sel':       '#f7d64a',
      '--last':      'rgba(247,214,74,.28)',
      '--dot':       'rgba(40,120,70,.45)',
      '--accent':    '#7cc4ff',
      '--good':      '#5fd08c',
      '--warn':      '#ffb648',
      '--danger':    '#ff6b6b',
      '--btn':       '#33405c',
      '--btn-ghost': '#2a344a',
      '--pc-w':      '#ffffff',
      '--pc-w-line': '#2b2b2b',
      '--pc-b':      '#242a36',
      '--pc-b-line': '#e9edf6'
    }
  },

  /* Woodland Springs Elementary, Keller ISD. Mascot: Wildcat. */
  wildcats: {
    label: 'Wildcats',
    title: 'Wildcat Chess',
    subtitle: 'Woodland Springs Wildcats',
    crest: 'paw',
    vars: {
      '--bg':        '#1b1233',
      '--bg-glow':   '#2e1a52',
      '--panel':     '#2a1b4d',
      '--panel-2':   '#22143f',
      '--ink':       '#f6f2ff',
      '--muted':     '#b8a9d9',
      '--light':     '#e6f0df',   /* pale green-white */
      '--dark':      '#009a44',   /* PMS 355 kelly green */
      '--coord-on-light': '#2f5e3e',
      '--coord-on-dark':  '#e6f0df',
      '--sel':       '#ffffff',
      '--last':      'rgba(255,255,255,.42)',
      '--dot':       'rgba(51,0,114,.50)',
      '--accent':    '#00c25a',
      '--good':      '#38d97a',
      '--warn':      '#ffc845',
      '--danger':    '#ff6b6b',
      '--btn':       '#3c2a68',
      '--btn-ghost': '#31215a',
      '--pc-w':      '#ffffff',
      '--pc-w-line': '#2a1550',
      '--pc-b':      '#330072',   /* deep school purple */
      '--pc-b-line': '#ffffff'
    }
  }
};

var DEFAULT_THEME = 'wildcats';

/* A wildcat paw, drawn rather than copied. The school's own logo is its
   mark; this is an original silhouette in the campus colours. */
function crestSvg(kind, cls) {
  if (kind !== 'paw') return '';
  return '<svg class="crest ' + (cls || '') + '" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<ellipse cx="24" cy="31.5" rx="10.5" ry="8.5"/>' +
    '<ellipse cx="11.5" cy="21" rx="4.6" ry="6" transform="rotate(-18 11.5 21)"/>' +
    '<ellipse cx="19.5" cy="14.5" rx="4.4" ry="6.2" transform="rotate(-7 19.5 14.5)"/>' +
    '<ellipse cx="28.5" cy="14.5" rx="4.4" ry="6.2" transform="rotate(7 28.5 14.5)"/>' +
    '<ellipse cx="36.5" cy="21" rx="4.6" ry="6" transform="rotate(18 36.5 21)"/>' +
    '</svg>';
}

function themeNames() {
  var out = [];
  for (var k in THEMES) out.push(k);
  return out;
}

function applyTheme(name) {
  var t = THEMES[name] || THEMES[DEFAULT_THEME];
  var root = document.documentElement;
  for (var k in t.vars) root.style.setProperty(k, t.vars[k]);
  root.setAttribute('data-theme', THEMES[name] ? name : DEFAULT_THEME);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.vars['--bg']);
  return t;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEMES: THEMES, DEFAULT_THEME: DEFAULT_THEME, crestSvg: crestSvg, themeNames: themeNames };
}

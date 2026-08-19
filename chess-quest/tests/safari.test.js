/* Safari / WebKit behaviour suite.

   The three things that behave differently on iOS Safari than on the Linux
   Chromium that runs CI, and that the main browser suite cannot see:

     1. Storage.   WebKit is the strictest engine about localStorage. The game
                   caches every value in a `mem` object and reads that first,
                   so an in-page read passes even when localStorage is dead.
                   Only a reload proves persistence.
     2. Audio.     iOS refuses to start an AudioContext outside a user gesture.
                   This asserts the unlock fires on a *trusted* gesture.
     3. Workers.   The bot runs in a Worker built from a Blob URL. Some WebKit
                   contexts refuse Blob workers; the game falls back to a
                   main-thread search. Both paths must produce a playable game.

   Plus a regression guard for the shipped pawn bug (§14 of BUILD-NOTES): the
   pieces must not depend on the device font stack. That bug was invisible on
   Linux Chromium precisely because font fallback differs per platform, so it
   is worth re-checking on a non-Chromium engine.

   Runs on any engine: ENGINE=chromium|webkit|firefox. Chromium is useful for
   shaking out the test logic; WebKit is the run that means something. */
const playwright = require('playwright');
const path = require('path');
const { serve } = require('./static-server');

const TARGET = process.env.TARGET || 'dist/index.html';
const ENGINE = process.env.ENGINE || 'webkit';

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

(async () => {
  const fs = require('fs');
  const engine = playwright[ENGINE];
  if (!engine || typeof engine.launch !== 'function') {
    log('FAIL  unknown ENGINE "' + ENGINE + '"'); process.exit(1);
  }

  const site = await serve(path.join(__dirname, '..', path.dirname(TARGET)));
  const URL_ = 'http://127.0.0.1:' + site.port + '/' + path.basename(TARGET);
  log('engine: ' + ENGINE + '    target: ' + TARGET + '\n');

  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
  ];
  const exe = ENGINE === 'chromium' ? candidates.find(p => fs.existsSync(p)) : null;
  const browser = await engine.launch(exe ? { executablePath: exe } : {});

  // A real iPad viewport, and a context that persists storage across reloads.
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL_);
  await page.waitForTimeout(600);
  check('game boots with no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ================= 1. STORAGE ================= */

  // Is localStorage genuinely usable on this origin, or silently dead?
  const probe = await page.evaluate(() => {
    try {
      window.localStorage.setItem('__probe__', 'yes');
      const v = window.localStorage.getItem('__probe__');
      window.localStorage.removeItem('__probe__');
      return v === 'yes' ? true : 'readback=' + v;
    } catch (e) { return 'threw ' + e.name; }
  });
  check('localStorage is usable on a served origin', probe === true, probe);

  // The real test: write progress, reload, and see if it survived. The game's
  // in-memory cache is wiped by the reload, so this can only pass if the write
  // actually reached localStorage.
  await page.click('#goPlay');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.ChessQuest.setLevel(7));
  await page.waitForTimeout(150);

  /* Read the version the game itself writes rather than hardcoding a number.
     A literal goes stale the moment the schema is bumped, and then a working
     migration fails its own test. */
  const CURRENT_V = await page.evaluate(() => {
    const raw = window.localStorage.getItem('chessQuest.save');
    return raw ? JSON.parse(raw).v : null;
  });
  check('saving progress writes the game key, version-stamped', CURRENT_V > 0, 'v=' + CURRENT_V);

  await page.reload();
  await page.waitForTimeout(700);
  const levelAfterReload = await page.evaluate(() => window.ChessQuest.state.level);
  check('level survives a reload (real persistence, not the memory cache)',
    levelAfterReload === 7, 'level=' + levelAfterReload);

  // Puzzle scheduling has to persist across days, so it gets the same treatment.
  await page.evaluate(() => {
    window.ChessQuest.puzzles.progress['__t__'] = { box: 2, due: 0 };
    window.ChessQuest.enterPuzzles();
  });
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(700);
  const pzSurvived = await page.evaluate(() => {
    const raw = window.localStorage.getItem('chessQuest.puzzles');
    return raw !== null && raw.indexOf('__t__') !== -1;
  });
  check('puzzle schedule survives a reload', pzSurvived);

  /* Migration: a player arriving from the shipped v3 build must keep her
     level, her stats and the puzzles built from her own blunders. Simulate
     that by planting the old keys and removing the new ones. */
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('chessQuest.v3', JSON.stringify({
      level: 9, myColor: 1,
      stats: { wins: 12, losses: 3 },
      settings: { theme: 'classic' }
    }));
    localStorage.setItem('chessQuest.puzzles.v1', JSON.stringify({
      progress: { legacyPuzzle: { box: 3, due: 0 } }, own: [], session: 5, stats: {}
    }));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const migrated = await page.evaluate(() => ({
    level: window.ChessQuest.state.level,
    wins: window.ChessQuest.state.stats.wins,
    theme: window.ChessQuest.state.settings.theme,
    myColor: window.ChessQuest.state.myColor,
    session: window.ChessQuest.puzzles.session,
    keptPuzzle: !!window.ChessQuest.puzzles.progress.legacyPuzzle,
    adopted: JSON.parse(localStorage.getItem('chessQuest.save') || 'null'),
    puzzlesAdopted: JSON.parse(localStorage.getItem('chessQuest.puzzles') || 'null'),
    legacyLeftAlone: localStorage.getItem('chessQuest.v3') !== null
  }));
  check('a v3 save keeps its level, stats, colour and theme',
    migrated.level === 9 && migrated.wins === 12 &&
    migrated.theme === 'classic' && migrated.myColor === 1, JSON.stringify(migrated));
  check('a v3 puzzle schedule survives the migration',
    migrated.keptPuzzle === true && migrated.session === 5, JSON.stringify(migrated));
  check('migrated data is rewritten under the stable key, version-stamped',
    migrated.adopted && migrated.adopted.v === CURRENT_V &&
    migrated.puzzlesAdopted && migrated.puzzlesAdopted.v === CURRENT_V,
    'expected v=' + CURRENT_V + ' ' + JSON.stringify(migrated));
  // Left in place on purpose: rolling back to an older build should still work.
  check('the legacy key is not deleted', migrated.legacyLeftAlone);

  // The fixture above sets myColor to Black, which would leave every later
  // section playing the wrong side. Reset to a clean first-run state.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  /* ================= 2. AUDIO ================= */

  // ui.js runs in its own scope, so `actx` and `audioUnlocked` are not reachable
  // from the page. Instrument the constructor instead: that tests the mechanism
  // iOS actually enforces — an AudioContext may only be created inside a user
  // gesture — and it cannot rot when an internal variable gets renamed.
  const fresh = await context.newPage();
  await fresh.addInitScript(() => {
    const Real = window.AudioContext || window.webkitAudioContext;
    window.__audio = { built: 0, ctx: null, available: typeof Real === 'function' };
    if (typeof Real !== 'function') return;
    function Traced() {
      const c = new Real();
      window.__audio.built++;
      window.__audio.ctx = c;
      return c;
    }
    Traced.prototype = Real.prototype;
    window.AudioContext = Traced;
    window.webkitAudioContext = Traced;
  });
  await fresh.goto(URL_);
  await fresh.waitForTimeout(500);

  const before = await fresh.evaluate(() => ({ built: window.__audio.built, available: window.__audio.available }));
  check('this engine provides an AudioContext at all', before.available === true);
  check('no AudioContext is created before a user gesture', before.built === 0, JSON.stringify(before));

  // Playwright's click dispatches a trusted event, which is what iOS demands.
  await fresh.click('#goPlay');
  await fresh.waitForTimeout(600);
  const after = await fresh.evaluate(() => ({
    built: window.__audio.built,
    state: window.__audio.ctx ? window.__audio.ctx.state : 'none'
  }));
  check('a trusted gesture creates the AudioContext', after.built >= 1, JSON.stringify(after));
  // Reaching "running" needs an audio sink, which headless CI has none of.
  // Reported so a regression is visible, not asserted so CI is not flaky.
  info('AudioContext state after gesture', after.state);
  await fresh.close();

  /* ================= 3. WORKERS ================= */

  // `worker` is not reachable from the page either, so trace the constructor on
  // a fresh page to learn whether this engine accepted a Blob-URL Worker.
  const wkPage = await context.newPage();
  await wkPage.addInitScript(() => {
    const Real = window.Worker;
    window.__wk = { tried: 0, failed: null };
    window.Worker = function (url, opts) {
      window.__wk.tried++;
      try { return new Real(url, opts); }
      catch (e) { window.__wk.failed = String(e && e.name || e); throw e; }
    };
  });
  await wkPage.goto(URL_);
  await wkPage.waitForTimeout(700);
  const wk = await wkPage.evaluate(() => window.__wk);
  await wkPage.close();
  const workerPath = wk.tried > 0 && !wk.failed ? 'blob worker' : 'main-thread fallback';
  info('bot search path on this engine', workerPath + '  ' + JSON.stringify(wk));

  // Whichever path this engine took, a move must come back and the turn return
  // to the player. That is the property that matters; the path is an detail.
  await page.evaluate(() => { window.ChessQuest.newGame(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const Q = window.ChessQuest;
    Q.play(genLegal(Q.state.s).find(m => toSan(Q.state.s, m) === 'e4'));
  });
  const replied = await page.waitForFunction(
    () => window.ChessQuest.state.phase === 'myturn', null, { timeout: 30000 }
  ).then(() => true).catch(() => false);
  check('the bot replies and the turn comes back (' + workerPath + ')', replied);

  /* ================= 4. FONT INDEPENDENCE (the pawn bug) ================= */

  const glyphs = await page.evaluate(() => {
    const t = document.getElementById('board').textContent || '';
    const hits = [];
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (c >= 0x2654 && c <= 0x265F) hits.push('U+' + c.toString(16).toUpperCase());
    }
    return hits;
  });
  check('no piece is drawn from a Unicode chess codepoint', glyphs.length === 0, glyphs.join(','));

  // Colour is carried by the .w / .b class on the svg itself and applied with
  // CSS fill. (data-sq is a 0-63 index, not algebraic notation.)
  // Colour is carried by the .w / .b class and applied by CSS to the child
  // shapes (svg.pc.w circle,path,rect), not to the <svg> itself.
  // (data-sq is a 0-63 index, not algebraic notation.)
  const fills = await page.evaluate(() => {
    const shapeOf = (sel) => {
      const svg = document.querySelector(sel);
      const shape = svg && svg.querySelector('path, rect, circle');
      return shape ? getComputedStyle(shape).fill : null;
    };
    return {
      white: shapeOf('#board svg.pc.w'),
      black: shapeOf('#board svg.pc.b'),
      count: document.querySelectorAll('#board svg.pc').length
    };
  });
  check('pieces render as SVG shapes', fills.count === 32, 'count=' + fills.count);
  // Theme-agnostic on purpose: asserting a literal colour would break whenever
  // the theme changes. What must hold is that CSS colour reaches the artwork at
  // all, and that the two sides are distinguishable — an emoji image would make
  // both sides identical because a picture ignores CSS.
  check('white and black pieces resolve to different fills',
    fills.white && fills.black && fills.white !== fills.black, JSON.stringify(fills));

  /* ================= 5. OFFLINE ================= */

  // The claim has always been "runs offline". Until now nothing checked it:
  // the game was loaded from disk, where there is no network to lose.
  const swActive = await page.evaluate(() => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    return navigator.serviceWorker.ready.then(r => !!r.active).catch(e => 'error ' + e.name);
  });
  check('a service worker takes control of the page', swActive === true, String(swActive));

  // Assert the shell is genuinely in Cache Storage. This runs on every engine
  // and checks the thing that actually makes offline work, rather than
  // inferring it from a successful load.
  const cached = await page.evaluate(async () => {
    if (!('caches' in window)) return 'no Cache Storage';
    const keys = await caches.keys();
    const shell = await caches.match('./index.html');
    return { keys: keys, shell: !!shell, bytes: shell ? (await shell.text()).length : 0 };
  });
  check('the app shell is stored in a versioned cache',
    cached.shell === true && cached.bytes > 10000 &&
    cached.keys.some(k => k.indexOf('wildcat-chess-') === 0), JSON.stringify(cached));

  // The real proof is cutting the network and reloading, but Playwright cannot
  // toggle offline in WebKit: setOffline followed by a reload raises "WebKit
  // encountered an internal error" inside the browser. So the network cut runs
  // where it is supported, and the cache assertion above covers every engine.
  if (ENGINE === 'webkit') {
    info('offline reload', 'skipped, Playwright cannot toggle offline in WebKit');
  } else {
    await context.setOffline(true);
    await page.reload();
    await page.waitForTimeout(1200);
    const offline = await page.evaluate(() => ({
      board: document.querySelectorAll('#board .sq').length,
      api: typeof window.ChessQuest === 'object'
    }));
    check('the game still loads with the network off',
      offline.board === 64 && offline.api === true, JSON.stringify(offline));
    await context.setOffline(false);
  }

  /* ================= 6. LAYOUT ON APPLE VIEWPORTS ================= */

  const devices = [
    { name: 'iPhone SE', w: 375, h: 667 },
    { name: 'iPhone 15 Pro', w: 393, h: 852 },
    { name: 'iPad portrait', w: 820, h: 1180 },
    { name: 'iPad landscape', w: 1180, h: 820 }
  ];
  for (const d of devices) {
    await page.setViewportSize({ width: d.w, height: d.h });
    await page.evaluate(() => { window.ChessQuest.newGame(); window.ChessQuest.fitBoard(); });
    await page.waitForTimeout(400);
    const b = await page.locator('#board').boundingBox();
    const fits = await page.evaluate(() => {
      const app = document.getElementById('app');
      return { scroll: app.scrollHeight, client: app.clientHeight };
    });
    check(d.name + ': board is square and fully on screen',
      Math.abs(b.width - b.height) < 2 && b.x >= 0 && (b.x + b.width) <= d.w + 1,
      JSON.stringify(b));
    check(d.name + ': no scrolling', fits.scroll <= fits.client + 2, JSON.stringify(fits));
  }

  check('no JS errors across the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  await site.close();
  log(fails === 0
    ? `\nALL SAFARI TESTS PASSED (${ENGINE})`
    : `\n${fails} FAILURE(S) (${ENGINE})`);
  process.exit(fails ? 1 : 0);
})();

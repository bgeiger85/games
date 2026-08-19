/* Safari / WebKit behaviour suite.

   CLAUDE.md lists four things that behave differently on iOS and have never
   been checked there. This suite covers three of them directly; the fourth
   (pointermove drag) is covered by running care.test.js with ENGINE=webkit,
   since that suite already scrubs, tucks and tickles.

     1. localStorage surviving across sessions
     2. Web Audio unlocking on first tap
     3. SVG-to-canvas in the Photo Booth

   Number 3 is the one worth being careful about. The snap handler wraps
   toDataURL in try/catch with an empty catch, and calls celebrate() outside
   it. So if WebKit taints the canvas after drawing the SVG bear, the failure
   is silent: confetti fires, a sound plays, and no picture is saved. Checking
   "no error was thrown" would pass while the feature is dead, so this asserts
   the album actually grew and holds a real JPEG.

   Run with ENGINE=chromium to shake out the test logic, ENGINE=webkit for the
   run that means something. */
const { launch, site, engineName } = require('./harness');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

(async () => {
  const browser = await launch();
  const SITE = await site();
  log('engine: ' + engineName() + '    target: ' + SITE.target + '\n');

  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  // Trace the AudioContext constructor before any app code runs. iOS enforces
  // "only inside a user gesture", and the app's AC variable is not reachable
  // from the page, so watch the constructor instead of the variable.
  await page.addInitScript(() => {
    const Real = window.AudioContext || window.webkitAudioContext;
    window.__audio = { built: 0, ctx: null, available: typeof Real === 'function' };
    if (typeof Real !== 'function') return;
    function Traced() { const c = new Real(); window.__audio.built++; window.__audio.ctx = c; return c; }
    Traced.prototype = Real.prototype;
    window.AudioContext = Traced;
    window.webkitAudioContext = Traced;
  });

  await page.goto(SITE.url);
  await page.waitForTimeout(800);
  check('app boots with no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  /* ================= 0. THE HOME SCREEN ICON ================= */

  /* This app is added to an iPad home screen, so the icon is not decoration,
     it is how she opens it. It was an SVG data URI, which iOS silently refuses
     for apple-touch-icon: it ignores the link and puts a screenshot of the page
     on the home screen instead. The app therefore had no icon on the only
     device it targets, and nothing noticed. Chess Quest has the same guards for
     the same reason. */
  const icon = await page.evaluate(() => {
    const l = document.querySelector('link[rel="apple-touch-icon"]');
    if (!l) return { missing: true };
    const href = l.getAttribute('href') || '';
    return { png: href.indexOf('data:image/png') === 0, head: href.slice(0, 24), len: href.length };
  });
  check('a home screen icon is declared', !icon.missing, JSON.stringify(icon));
  check('the icon is a PNG data URI (iOS will not accept SVG here)',
    icon.png === true, JSON.stringify(icon));

  const iconSize = await page.evaluate(() => new Promise(resolve => {
    const l = document.querySelector('link[rel="apple-touch-icon"]');
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 0, h: 0, error: true });
    img.src = l.getAttribute('href');
  }));
  check('the icon decodes as a real image at 180x180, the size iOS wants',
    iconSize.w === 180 && iconSize.h === 180, JSON.stringify(iconSize));

  const homeName = await page.evaluate(() => {
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    return m ? m.getAttribute('content') : null;
  });
  check('the home screen name is set', !!homeName, String(homeName));

  /* ================= 1. STORAGE ================= */

  const probe = await page.evaluate(() => {
    try {
      localStorage.setItem('__probe__', 'yes');
      const v = localStorage.getItem('__probe__');
      localStorage.removeItem('__probe__');
      return v === 'yes' ? true : 'readback=' + v;
    } catch (e) { return 'threw ' + e.name; }
  });
  check('localStorage is usable on a served origin', probe === true, probe);

  await page.evaluate(() => {
    S.stars = 175;
    S.rooms.photo = true;
    S.friends = ['bunny', 'dragon'];
    persist();
  });
  /* Read the version the app itself writes, rather than hardcoding a number.
     A literal here goes stale the moment the schema is bumped, which is
     exactly what happened when Star Steps gained its level ladder: the
     migration was working perfectly and the test failed anyway. */
  const CURRENT_V = await page.evaluate(() => {
    const raw = localStorage.getItem('cutiebear.save');
    return raw ? JSON.parse(raw).v : null;
  });
  check('persist() writes the save key, version-stamped', CURRENT_V > 0, 'v=' + CURRENT_V);

  await page.reload();
  await page.waitForTimeout(800);
  const restored = await page.evaluate(() => ({
    stars: S.stars, photo: S.rooms.photo, friends: S.friends.length
  }));
  check('stars, unlocked rooms and friends survive a reload',
    restored.stars === 175 && restored.photo === true && restored.friends === 2,
    JSON.stringify(restored));

  /* Migration: whatever Addison already has on the iPad was written by the
     shipped v1 build. She must not lose it. */
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cutiebear.save.v1', JSON.stringify({
      stars: 240,
      owned: ['bow_pink', 'crown_gold', 'dress_star'],
      worn: { head: 'crown_gold', body: 'dress_star', feet: null, extra: null },
      rooms: { photo: true, steps: true },
      friends: ['bunny', 'dragon', 'kitten'],
      album: ['data:image/jpeg;base64,AAAA'],
      best: { chase: 310, steps: 44, song: 7 },
      care: { food: 80, clean: 62, energy: 71, fun: 55, t: 0 },
      music: false, sfx: true
    }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  const mig = await page.evaluate(() => ({
    stars: S.stars, owned: S.owned.length, friends: S.friends.length,
    album: S.album.length, worn: S.worn.head, best: S.best.chase,
    rooms: S.rooms.photo && S.rooms.steps, music: S.music,
    adopted: JSON.parse(localStorage.getItem('cutiebear.save') || 'null'),
    legacyLeftAlone: localStorage.getItem('cutiebear.save.v1') !== null
  }));
  check('a v1 save keeps stars, outfits, friends and the photo album',
    mig.stars === 240 && mig.owned === 3 && mig.friends === 3 && mig.album === 1,
    JSON.stringify(mig));
  check('what she was wearing, her unlocked rooms and best scores survive',
    mig.worn === 'crown_gold' && mig.rooms === true && mig.best === 310 && mig.music === false,
    JSON.stringify(mig));
  check('migrated data is rewritten under the stable key, version-stamped',
    mig.adopted && mig.adopted.v === CURRENT_V && mig.adopted.stars === 240,
    'expected v=' + CURRENT_V + ' ' + JSON.stringify(mig));
  // Left in place on purpose: an older build should still find its own save.
  check('the legacy key is not deleted', mig.legacyLeftAlone);

  /* ================= 2. AUDIO ================= */

  const before = await page.evaluate(() => ({ built: window.__audio.built, available: window.__audio.available }));
  check('this engine provides an AudioContext', before.available === true);
  check('no AudioContext before a user gesture', before.built === 0, JSON.stringify(before));

  // A trusted tap anywhere on the stage is what unlocks audio on iOS.
  await page.mouse.click(512, 384);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    built: window.__audio.built,
    state: window.__audio.ctx ? window.__audio.ctx.state : 'none'
  }));
  check('a trusted tap creates the AudioContext', after.built >= 1, JSON.stringify(after));
  info('AudioContext state after tap', after.state); // headless CI has no audio sink

  /* ================= 3. SVG TO CANVAS (PHOTO BOOTH) ================= */

  // bearImage() serialises the SVG and loads it as an Image. If iOS refuses
  // the data URL, this callback gets null and every canvas game loses the bear.
  const raster = await page.evaluate(() => new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => { if (!done) resolve({ ok: false, why: 'timeout' }); }, 8000);
    try {
      bearImage({}, img => {
        done = true; clearTimeout(t);
        resolve(img ? { ok: true, w: img.width, h: img.height } : { ok: false, why: 'onerror' });
      });
    } catch (e) { clearTimeout(t); resolve({ ok: false, why: String(e && e.message || e) }); }
  }));
  check('bearImage() rasterises the SVG bear to an Image',
    raster.ok === true && raster.w > 0, JSON.stringify(raster));

  await page.evaluate(() => { S.rooms.photo = true; persist(); buildDoors(); go('photo'); });
  await page.waitForTimeout(1200);
  const beforeSnap = await page.evaluate(() => ({ album: S.album.length, bear: !!photo.img }));
  check('photo booth has the bear image ready', beforeSnap.bear === true, JSON.stringify(beforeSnap));

  await page.click('#snapbtn');
  await page.waitForTimeout(900);
  const snap = await page.evaluate(() => ({
    album: S.album.length,
    head: (S.album[0] || '').slice(0, 22),
    len: (S.album[0] || '').length
  }));
  // The empty catch means a tainted canvas fails silently, so assert the
  // picture really landed rather than merely that nothing threw.
  check('taking a picture actually stores one (canvas is not tainted)',
    snap.album === beforeSnap.album + 1, JSON.stringify(snap));
  check('the stored picture is a real JPEG data URL',
    snap.head.indexOf('data:image/jpeg') === 0 && snap.len > 1000, JSON.stringify(snap));

  const afterReload = await (async () => {
    await page.reload();
    await page.waitForTimeout(800);
    return page.evaluate(() => S.album.length);
  })();
  check('the picture is still in the album after a reload', afterReload >= 1, 'album=' + afterReload);

  /* ================= 3b. THE ALBUM CANNOT EAT THE SAVE ================= */

  /* Photos are 14KB each and everything else in the save is about 400 bytes,
     so the album is the only thing that can reach the ~5MB quota. What made
     that dangerous was persist() swallowing the failure: once the save no
     longer fit, nothing was written and her stars, outfits, friends, garden
     and levels stopped saving with no sign anything was wrong. */
  const capped = await page.evaluate(() => {
    const fake = 'data:image/jpeg;base64,' + 'A'.repeat(14000);
    S.album = [];
    for (let i = 0; i < 40; i++) { S.album.unshift(fake); albumTrim(); }
    return { count: S.album.length, bytes: S.album.join('').length };
  });
  check('the album is capped by count', capped.count <= 12, JSON.stringify(capped));
  check('the album is capped by size', capped.bytes <= 500 * 1024, JSON.stringify(capped));

  // The real test: fill storage, then confirm progress still saves.
  const survived = await page.evaluate(() => {
    S.stars = 1234; S.garden.harvests = 7;
    const huge = 'data:image/jpeg;base64,' + 'B'.repeat(900 * 1024);
    S.album = [huge, huge, huge, huge, huge, huge];   // far past the quota
    const ok = persist();
    const raw = localStorage.getItem('cutiebear.save');
    const back = raw ? JSON.parse(raw) : null;
    return {
      ok: ok, stars: back && back.stars, harvests: back && back.garden && back.garden.harvests,
      photosKept: back && back.album ? back.album.length : null
    };
  });
  check('a save too big for storage still writes', survived.ok === true, JSON.stringify(survived));
  check('progress survives by shedding photos, not the other way round',
    survived.stars === 1234 && survived.harvests === 7, JSON.stringify(survived));
  info('photos kept when storage was full', survived.photosKept);
  await page.evaluate(() => { S.album = []; persist(); });

  /* ================= 4. OFFLINE ================= */

  // "Opens instantly on bad hotel wifi" was the whole point of the one-file
  // rule, but nothing ever checked the app survives having no wifi at all.
  const swActive = await page.evaluate(() => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    return navigator.serviceWorker.ready.then(r => !!r.active).catch(e => 'error ' + e.name);
  });
  check('a service worker takes control of the page', swActive === true, String(swActive));

  // Assert the app is genuinely in Cache Storage. This runs on every engine and
  // checks the thing that actually makes offline work, rather than inferring it
  // from a successful load.
  const cached = await page.evaluate(async () => {
    if (!('caches' in window)) return 'no Cache Storage';
    const keys = await caches.keys();
    const shell = await caches.match('./index.html');
    return { keys: keys, shell: !!shell, bytes: shell ? (await shell.text()).length : 0 };
  });
  check('the app is stored in a versioned cache',
    cached.shell === true && cached.bytes > 10000 &&
    cached.keys.some(k => k.indexOf('cutie-bear-') === 0), JSON.stringify(cached));

  // The real proof is cutting the network and reloading, but Playwright cannot
  // toggle offline in WebKit: setOffline followed by a reload raises "WebKit
  // encountered an internal error" inside the browser. So the network cut runs
  // where it is supported, and the cache assertion above covers every engine.
  if (engineName() === 'webkit') {
    info('offline reload', 'skipped, Playwright cannot toggle offline in WebKit');
  } else {
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForTimeout(1200);
    const offline = await page.evaluate(() => ({
      stage: !!document.getElementById('stage'),
      save: typeof S === 'object',
      doors: document.querySelectorAll('.door').length
    }));
    check('the app still loads with the network off',
      offline.stage && offline.save && offline.doors >= 6, JSON.stringify(offline));
    await ctx.setOffline(false);
  }

  /* ================= 5. STAGE SCALING ON APPLE VIEWPORTS ================= */

  // Everything is laid out on a fixed 960x720 board and scaled by one CSS
  // transform. If that transform is wrong the whole app is off-screen.
  const views = [
    { name: 'iPad landscape', w: 1180, h: 820 },
    { name: 'iPad portrait', w: 820, h: 1180 },
    { name: 'iPhone 15 Pro landscape', w: 852, h: 393 }
  ];
  for (const v of views) {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    });
    // The board keeps its 4:3 shape and stays inside the viewport at any size.
    const ratioOk = Math.abs((box.w / box.h) - (960 / 720)) < 0.02;
    const insideOk = box.x >= -1 && box.y >= -1 &&
      box.x + box.w <= box.vw + 1 && box.y + box.h <= box.vh + 1;
    check(v.name + ': stage keeps its 4:3 shape', ratioOk, JSON.stringify(box));
    check(v.name + ': stage fits inside the viewport', insideOk, JSON.stringify(box));

    /* The stage fitting the screen says nothing about the content fitting the
       stage. #stage is overflow:hidden, so anything past its edge is simply
       sliced off with no error and no failing test. That is exactly how a
       seventh room door shipped cut in half on the iPad: the door grid was a
       hardcoded 2x3 with room for six, and every geometry check still passed.
       Check the doors are actually inside the box they live in. */
    const doors = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const out = [];
      document.querySelectorAll('.door').forEach((d, i) => {
        const r = d.getBoundingClientRect();
        if (r.bottom > st.bottom + 1 || r.right > st.right + 1 ||
            r.top < st.top - 1 || r.left < st.left - 1) {
          out.push({ i: i, name: (d.querySelector('.dn') || {}).textContent,
                     over: Math.round(r.bottom - st.bottom) });
        }
      });
      return { total: document.querySelectorAll('.door').length, clipped: out };
    });
    check(v.name + ': every room door is fully inside the stage',
      doors.clipped.length === 0, JSON.stringify(doors));
  }

  await browser.close();
  await SITE.close();

  if (errs.length) {
    log('\npage errors:\n' + errs.slice(0, 5).join('\n'));
    fails += errs.length;
  }
  log(fails === 0
    ? '\nALL SAFARI TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

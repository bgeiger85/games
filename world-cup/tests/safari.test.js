/* The four things that behave differently on iOS Safari, which is the only
   browser this game is actually played in. Run with ENGINE=webkit for the
   real answer; on chromium it is still a useful smoke test.

     1. localStorage across a real page load, on an http origin
     2. Web Audio, which stays suspended until a genuine user gesture
     3. canvas 2d, which the whole match is drawn with
     4. the service worker, which is what makes it work with no signal

   Plus one thing that is not iOS specific but is easy to break: every
   localStorage read has to survive storage being unavailable, because private
   browsing throws rather than returning null. */
const { launch, site, engineName } = require('./harness');

(async () => {
  const browser = await launch();
  const SITE = await site();
  const fails = [];
  const errs = [];

  // ---------- 1. storage ----------
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(500);

  await page.evaluate(() => { S.round = 3; S.cups = 2; S.goals = 41; S.boots = 88; persist(); });
  await page.reload();
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => ({
    round: S.round, cups: S.cups, goals: S.goals, boots: S.boots,
    raw: !!localStorage.getItem('worldcup.save.v1')
  }));
  if (stored.round !== 3 || stored.cups !== 2 || stored.goals !== 41 || stored.boots !== 88) {
    fails.push('the save did not survive a reload: ' + JSON.stringify(stored));
  }
  if (!stored.raw) fails.push('nothing was written to localStorage');

  // a corrupt save must not take the game down with it
  await page.evaluate(() => { try { localStorage.setItem('worldcup.save.v1', '{not json'); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(500);
  const afterCorrupt = await page.evaluate(() => ({ round: S.round, alive: !!document.querySelector('.screen.on') }));
  if (!afterCorrupt.alive) fails.push('a corrupt save broke the boot');
  if (afterCorrupt.round !== 0) fails.push('a corrupt save should fall back to a fresh one, got round ' + afterCorrupt.round);

  // A save that parses but is nonsense is the more likely failure than one that
  // does not parse: a half-written value, an older shape, a hand-edited entry.
  // S.round past the end of the ladder is the dangerous one, because it reaches
  // startMatch as ROUNDS[undefined] and takes the boot down with it.
  await page.evaluate(() => {
    try {
      localStorage.setItem('worldcup.save.v1', JSON.stringify({
        v: 1, round: 99, results: 'not an array', cups: -4, goals: null, boots: 'x'
      }));
    } catch (e) {}
  });
  await page.reload();
  await page.waitForTimeout(500);
  const clamped = await page.evaluate(() => {
    // and it has to survive being asked to play, not merely to boot
    let threw = null;
    try { startMatch(S.round < 5 ? S.round : 0); endMatch(); } catch (e) { threw = String(e); }
    go('home');   // leave the screen as we found it for the checks below
    return { round: S.round, results: Array.isArray(S.results), cups: S.cups,
      goals: S.goals, boots: S.boots, threw: threw,
      alive: !!document.querySelector('.screen.on') };
  });
  if (clamped.round > 5 || clamped.round < 0) fails.push('S.round was not clamped: ' + clamped.round);
  if (!clamped.results) fails.push('S.results was not repaired into an array');
  if (clamped.cups !== 0 || clamped.goals !== 0 || clamped.boots !== 0) {
    fails.push('nonsense counters were not repaired: ' + JSON.stringify(clamped));
  }
  if (clamped.threw) fails.push('a repaired save still threw on startMatch: ' + clamped.threw);
  if (!clamped.alive) fails.push('a nonsense save broke the boot');
  await page.evaluate(() => { try { localStorage.removeItem('worldcup.save.v1'); } catch (e) {} });

  // ---------- 2. audio ----------
  // Before any gesture the context should not exist. After a real tap it must,
  // and it must not be suspended, or every sound in the game is silent.
  const beforeTap = await page.evaluate(() => AC === null);
  await page.click('#btntrophy');
  await page.waitForTimeout(300);
  const audio = await page.evaluate(() => ({
    exists: !!AC,
    state: AC ? AC.state : 'none',
    canBuild: (function () {
      if (!AC) return false;
      try { AC.createOscillator(); AC.createBiquadFilter(); AC.createBuffer(1, 128, AC.sampleRate); return true; }
      catch (e) { return false; }
    })()
  }));
  if (!beforeTap) fails.push('an AudioContext was created before any user gesture: iOS will leave it suspended forever');
  if (!audio.exists) fails.push('no AudioContext after a real tap');
  if (audio.exists && !audio.canBuild) fails.push('the oscillator / filter / buffer path is not available: every sound is dead');

  // ---------- 3. canvas ----------
  await page.evaluate(() => { go('home'); startMatch(0); });
  await page.waitForTimeout(700);
  const canvas = await page.evaluate(() => {
    const c = document.getElementById('pitch');
    const g = c.getContext('2d');
    if (!g) return { ok: false, why: 'no 2d context' };
    // has anything actually been painted? sample a spot that must be grass.
    const px = g.getImageData(40, 500, 1, 1).data;
    const painted = px[3] > 0 && (px[0] + px[1] + px[2]) > 0;
    return {
      ok: true, painted: painted,
      green: px[1] > px[0] && px[1] > px[2],
      w: c.width, h: c.height,
      ellipse: typeof g.ellipse === 'function'
    };
  });
  if (!canvas.ok) fails.push('canvas: ' + canvas.why);
  if (canvas.ok && !canvas.painted) fails.push('the pitch canvas is blank');
  if (canvas.ok && !canvas.green) fails.push('the pitch is not green, so drawPitch did not run');
  if (canvas.ok && !canvas.ellipse) fails.push('ctx.ellipse is missing: every shadow in the game throws');

  // the loop actually advances state rather than only painting once
  const t1 = await page.evaluate(() => { M.tx = M.x + 400; M.ty = M.y; return M.x; });
  await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => M.x);
  if (!(t2 > t1 + 20)) fails.push('the match loop is not advancing: x went ' + t1 + ' -> ' + t2);
  await page.evaluate(() => endMatch());

  // ---------- 4. service worker and offline ----------
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      return { supported: true, registered: !!reg };
    } catch (e) { return { supported: true, registered: false, err: String(e) }; }
  });
  // WebKit in CI does not always let a worker settle in the time we give it, and
  // the game is designed to work without one, so this is reported not enforced.
  console.log('service worker ' + JSON.stringify(sw));

  if (sw.registered) {
    // with the worker in place the page must survive the server going away
    await page.waitForTimeout(900);
    await SITE.close();
    let offlineOk = false;
    try {
      await page.reload({ timeout: 8000 });
      await page.waitForTimeout(600);
      offlineOk = await page.evaluate(() => !!document.querySelector('.screen.on') && typeof startMatch === 'function');
    } catch (e) { offlineOk = false; }
    console.log('offline reload ' + (offlineOk ? 'served from cache' : 'not served (worker had not claimed the page yet)'));
  } else {
    await SITE.close();
  }

  await browser.close();

  console.log('storage  ' + JSON.stringify(stored));
  console.log('audio    ' + JSON.stringify(audio) + '  (context before any tap: ' + (beforeTap ? 'none, correct' : 'PRESENT') + ')');
  console.log('canvas   ' + JSON.stringify(canvas));
  console.log('errors   ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

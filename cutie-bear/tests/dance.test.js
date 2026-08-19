/* Dance Studio.

   Three jobs, in order of how much they matter.

   1. Calibrate the forgiveness. A rhythm game is only as good as its hit
      window, and a window tuned by the person who wrote it is tuned to
      somebody who already knows when the beat lands. So the important bot here
      is the SLOPPY one: it taps late and early by up to a third of a second
      and gets the pad wrong now and then, which is roughly what an eight year
      old does. If that bot cannot open the next routine, the windows are too
      tight, no matter how good the game feels to play deliberately.

   2. Prove the no-fail-states rule holds. A routine where she taps nothing at
      all must still finish, still celebrate and still pay stars. Nothing on
      screen may tell her she got it wrong.

   3. Prove the ladder works and survives a reload, and that the Dance Studio
      arriving does not disturb a save written before it existed.

   Both bots are seeded, so a run either passes or fails for a reason. The
   Chess Quest suite had a test that asserted an outcome the rules did not
   promise and it went red at random until that was fixed; a stochastic bot
   judged against a fixed goal is the same mistake waiting to happen. */
const { launch, site, engineName } = require('./harness');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

/* Dances one routine and reports what happened.

   jitter is how far off the beat the bot taps, in milliseconds, and wrong is
   how often it hits the wrong pad, 0 to 1. Both are driven by a seeded
   generator so the same arguments always produce the same performance. */
async function danceRoutine(page, idx, jitter, wrong, seed) {
  await page.evaluate((a) => {
    document.getElementById('pop').classList.remove('on');
    dance.idx = a.idx;
    danceBuildLevels(); danceBuildPads();
  }, { idx });
  await page.click('#dancego');
  return page.evaluate((a) => new Promise(res => {
    let s = a.seed >>> 0;
    const rnd = () => {                      // same generator the app seeds levels with
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const plan = dance.cards.map(c => ({
      at: c.t + (rnd() * 2 - 1) * a.jitter,
      m: rnd() < a.wrong ? (c.m + 1) % Math.max(1, danceCfg().pads) : c.m,
      tapped: false
    }));
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (!dance.on) {
        clearInterval(iv);
        return res({ ended: true, hits: dance.hits, perfect: dance.perfect,
                     cards: dance.cards.length, goal: danceCfg().goal });
      }
      if (performance.now() - t0 > 60000) {
        clearInterval(iv);
        return res({ ended: false, hits: dance.hits, perfect: dance.perfect,
                     cards: dance.cards.length, goal: danceCfg().goal });
      }
      const now = performance.now();
      for (let i = 0; i < plan.length; i++) {
        if (!plan[i].tapped && now >= plan[i].at) { plan[i].tapped = true; danceTap(plan[i].m); }
      }
    }, 8);
  }), { jitter, wrong, seed });
}

(async () => {
  const browser = await launch();
  const SITE = await site();
  log('engine: ' + engineName() + '    target: ' + SITE.target + '\n');

  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(SITE.url);
  await page.waitForTimeout(700);

  /* ================= 1. THE DOOR ================= */

  const door = await page.evaluate(() => {
    const r = ROOMS.filter(r => r.id === 'dance')[0];
    const btns = [...document.querySelectorAll('#doors .door')];
    const el = btns[ROOMS.indexOf(r)];
    return { cost: r.cost, key: r.key, locked: el.className.indexOf('locked') >= 0,
             doors: btns.length, unlockedByDefault: S.rooms.dance };
  });
  check('the Dance Studio is a locked door on a fresh save',
    door.locked === true && door.unlockedByDefault === false, JSON.stringify(door));
  check('it costs stars like the other unlockable rooms', door.cost === 45 && door.key === 'dance',
    JSON.stringify(door));
  info('doors on the home screen', door.doors);

  await page.evaluate(() => { S.rooms.dance = true; persist(); go('dance'); });
  await page.waitForTimeout(500);

  /* ================= 2. THE ROUTINE LADDER ================= */

  const strip = await page.evaluate(() => ({
    total: document.querySelectorAll('#dancelevels button').length,
    routines: DANCE_ROUTINES.length,
    styles: DANCE_ROUTINES.map(r => r.style).filter((v, i, a) => a.indexOf(v) === i),
    unlocked: S.dance.unlocked,
    pads: document.querySelectorAll('#dancepads .pad').length,
    firstPads: DANCE_ROUTINES[0].pads
  }));
  check('every routine is listed, including the locked ones',
    strip.total === strip.routines && strip.total === 9, JSON.stringify(strip));
  check('all three of her dance styles are in the ladder',
    strip.styles.length === 3 && strip.styles.indexOf('ballet') >= 0, JSON.stringify(strip));
  check('only the first routine is open on a fresh save', strip.unlocked === 1, 'unlocked=' + strip.unlocked);
  check('the first routine starts with fewer pads than the last',
    strip.pads === strip.firstPads && strip.pads === 2, JSON.stringify(strip));

  // Tapping a locked routine explains itself and changes nothing.
  await page.evaluate(() => document.querySelector('#dancelevels button[data-routine="5"]').click());
  await page.waitForTimeout(250);
  const locked = await page.evaluate(() => ({
    idx: dance.idx, popped: document.getElementById('pop').classList.contains('on')
  }));
  check('a locked routine says so and does not switch to it',
    locked.idx === 0 && locked.popped === true, JSON.stringify(locked));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* The four pad shapes must stay in the same places across the three styles.
     Muscle memory built in hip-hop is supposed to carry into ballet; if the
     shapes move, it carries nothing. */
  const padOrder = await page.evaluate(() => {
    const seen = [];
    [0, 3, 6].forEach(i => {
      dance.idx = i; danceBuildPads();
      seen.push([...document.querySelectorAll('#dancepads .pad')].map(p => p.querySelector('svg').innerHTML.slice(0, 40)));
    });
    dance.idx = 0; danceBuildPads();
    return seen;
  });
  check('pad 1 is the same shape in hip-hop, jazz and ballet',
    padOrder[0][0] === padOrder[1][0] && padOrder[1][0] === padOrder[2][0]);
  check('pad 2 is the same shape in all three styles',
    padOrder[0][1] === padOrder[1][1] && padOrder[1][1] === padOrder[2][1]);

  /* ================= 3. NO FAIL STATE ================= */

  const starsBefore = await page.evaluate(() => S.stars);
  await page.evaluate(() => { dance.idx = 0; danceBuildPads(); });
  await page.click('#dancego');
  const idle = await page.evaluate(() => new Promise(res => {
    const iv = setInterval(() => { if (!dance.on) { clearInterval(iv); res({ hits: dance.hits }); } }, 40);
  }));
  await page.waitForTimeout(1100);
  const nothing = await page.evaluate(() => ({
    stars: S.stars,
    head: document.getElementById('poph').textContent,
    body: document.getElementById('popp').textContent,
    popped: document.getElementById('pop').classList.contains('on')
  }));
  check('tapping nothing at all still finishes the routine', idle.hits === 0);
  check('and still pays stars', nothing.stars > starsBefore, starsBefore + ' -> ' + nothing.stars);
  check('and still says something kind',
    nothing.popped && !/oops|wrong|lost|fail|bad/i.test(nothing.head + ' ' + nothing.body),
    JSON.stringify(nothing));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* Tapping the wrong pad, repeatedly, must not take anything away. */
  const spam = await page.evaluate(() => {
    const before = S.stars;
    for (let i = 0; i < 30; i++) danceTap(i % 2);
    return { before, after: S.stars, hits: dance.hits, on: dance.on };
  });
  check('mashing the pads outside a routine costs nothing',
    spam.after === spam.before && spam.hits === 0, JSON.stringify(spam));

  /* ================= 4. THE LADDER OPENS ================= */

  const first = await danceRoutine(page, 0, 40, 0, 12345);
  await page.waitForTimeout(1100);
  const afterFirst = await page.evaluate(() => ({ unlocked: S.dance.unlocked, best: S.dance.best[0] }));
  check('a bot dancing on the beat clears the first routine',
    first.ended && first.hits >= first.goal, JSON.stringify(first));
  check('clearing the first routine opens the second', afterFirst.unlocked === 2, JSON.stringify(afterFirst));
  check('a per-routine best is recorded', afterFirst.best === first.hits, JSON.stringify(afterFirst));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  await page.reload();
  await page.waitForTimeout(800);
  const afterReload = await page.evaluate(() => S.dance.unlocked);
  check('the unlock survives a reload', afterReload === 2, 'unlocked=' + afterReload);

  /* ================= 5. IS IT FORGIVING ENOUGH? ================= */

  await page.evaluate(() => {
    S.dance.unlocked = DANCE_ROUTINES.length; persist();
    document.getElementById('pop').classList.remove('on');
    go('dance');
  });
  await page.waitForTimeout(400);

  // The first routine of each style, danced badly: a third of a second off the
  // beat either way, and one tap in twelve on the wrong pad.
  const sloppyFails = [];
  for (const i of [0, 3, 6]) {
    const r = await danceRoutine(page, i, 350, 0.08, 700 + i);
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
    const name = await page.evaluate((n) => DANCE_ROUTINES[n].name + ' (' + DANCE_ROUTINES[n].style + ')', i);
    info('sloppy bot on ' + name, r.hits + '/' + r.cards + ' moves, needed ' + r.goal);
    if (!r.ended || r.hits < r.goal) sloppyFails.push(name);
  }
  check('a bot tapping a third of a second off the beat still opens the next routine',
    sloppyFails.length === 0, 'too strict on: ' + sloppyFails.join(', '));

  /* A picture of the room mid-routine, with four pads and moves on the way in.
     Nothing here asserts: it is for the pair of eyes that reads the shots
     folder, which is the only thing that catches a screen that passes every
     check and still looks wrong. */
  await page.evaluate(() => { dance.idx = 4; danceBuildLevels(); danceBuildPads(); });
  await page.click('#dancego');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'tests/shots/dance-playing.png' });
  await page.evaluate(() => danceEnd(true));
  await page.waitForTimeout(200);

  /* ================= 6. EVERY ROUTINE IS DANCEABLE ================= */

  const unclearable = [];
  for (let i = 0; i < 9; i++) {
    const r = await danceRoutine(page, i, 60, 0, 400 + i * 3);
    await page.waitForTimeout(900);
    await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
    const name = await page.evaluate((n) => DANCE_ROUTINES[n].name, i);
    info('routine ' + (i + 1) + ' ' + name, r.hits + '/' + r.cards + ' moves, ' + r.perfect + ' on the beat');
    if (!r.ended || r.hits < r.goal) unclearable.push(name);
  }
  check('a bot on the beat can clear all nine routines',
    unclearable.length === 0, 'failed: ' + unclearable.join(', '));

  const done = await page.evaluate(() => ({ unlocked: S.dance.unlocked, bests: Object.keys(S.dance.best).length }));
  check('dancing every routine records a best for every routine',
    done.bests === 9, JSON.stringify(done));

  /* ================= 7. AN OLDER SAVE STILL WORKS ================= */

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cutiebear.save.v1', JSON.stringify({
      stars: 240, owned: ['bow_pink', 'crown_gold'], worn: { head: 'crown_gold' },
      rooms: { photo: true, steps: true }, friends: ['bunny'], album: [],
      best: { chase: 310, steps: 44, song: 7 }, music: false, sfx: true
    }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  const mig = await page.evaluate(() => ({
    stars: S.stars, friends: S.friends.length, chase: S.best.chase,
    danceRoom: S.rooms.dance, unlocked: S.dance.unlocked,
    v: JSON.parse(localStorage.getItem('cutiebear.save') || '{}').v,
    current: SAVE_VERSION
  }));
  check('a save written before the Dance Studio existed keeps everything it had',
    mig.stars === 240 && mig.friends === 1 && mig.chase === 310, JSON.stringify(mig));
  check('and gains a closed Dance Studio with the first routine open',
    mig.danceRoom === false && mig.unlocked === 1, JSON.stringify(mig));
  check('and is rewritten at the current schema version', mig.v === mig.current, JSON.stringify(mig));

  await page.evaluate(() => { S.rooms.dance = true; persist(); go('dance'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/shots/dance.png' });

  check('no JS errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  await SITE.close();
  log(fails === 0
    ? '\nALL DANCE TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

/* Star Steps level ladder.

   Two jobs.

   1. Prove the progression works: only level 1 open at the start, clearing a
      level opens the next, and that survives a reload.

   2. Calibrate the difficulty. A bot plays every level and reports how far it
      got. This is the check that matters most, because a level nobody can
      clear is not "hard", it is a wall, and a wall breaks the no-fail-states
      rule this app is built on. The first version of this game shipped too
      hard and it was a bot that caught it.

   The bot is the same simple hopper the games suite uses: look a little way
   ahead, and jump if there is no cloud under where you are about to be. It is
   deliberately not clever. If a plain hopper can clear a level, so can she. */
const { launch, site, engineName } = require('./harness');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

/* Drives one level to its end and reports what happened. */
async function playLevel(page, lvl) {
  await page.evaluate((l) => {
    document.getElementById('pop').classList.remove('on');
    steps.lvl = l;
    stepsBuildLevels();
  }, lvl);
  await page.click('#stepsgo');
  return page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (!steps.on) {
        clearInterval(iv);
        return res({ ended: true, won: steps.won, dist: steps.dist, tokens: steps.tokens });
      }
      if (performance.now() - t0 > 40000) {
        clearInterval(iv);
        return res({ ended: false, won: false, dist: steps.dist, tokens: steps.tokens });
      }
      const px = 180;
      // Battle: the cloud sweeps over her, so jump when it is roughly overhead.
      if (steps.boss && !steps.boss.freed) {
        const B = steps.boss;
        if (Math.abs(B.x - px) < 70 && steps.vy >= 0) stepsJump();
        return;
      }
      const ahead = px + 110;
      const grounded = steps.plats.some(p => {
        const sx = p.x - steps.x;
        return ahead > sx && ahead < sx + p.w && Math.abs(steps.y - p.y) < 130;
      });
      // Same rule the games suite uses. An earlier version held the second
      // jump back until she was clearly falling, which looked like a smarter
      // bot and was not: after a spring it jumped too late to reach the next
      // cloud, and the resulting failures read as an unclearable level. The
      // real overshoot it was written to fix turned out to be the landing
      // test and the spring landing zones, both since fixed properly.
      if (!grounded && steps.vy >= -1) stepsJump();
    }, 40);
  }));
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
  await page.evaluate(() => { S.rooms.steps = true; persist(); go('steps'); });
  await page.waitForTimeout(400);

  /* ================= 1. THE LADDER STARTS LOCKED ================= */

  const strip = await page.evaluate(() => ({
    total: document.querySelectorAll('#stepslevels button').length,
    unlocked: S.steps.unlocked,
    names: STEP_LEVELS.map(l => l.name)
  }));
  check('every level is listed, including the locked ones',
    strip.total === strip.names.length && strip.total === 9, JSON.stringify(strip));
  check('only the first level is open on a fresh save', strip.unlocked === 1, 'unlocked=' + strip.unlocked);

  // Tapping a locked level must explain itself and change nothing.
  await page.evaluate(() => document.querySelector('#stepslevels button[data-lvl="4"]').click());
  await page.waitForTimeout(250);
  const locked = await page.evaluate(() => ({
    lvl: steps.lvl,
    popped: document.getElementById('pop').classList.contains('on')
  }));
  check('a locked level says so and does not switch to it',
    locked.lvl === 0 && locked.popped === true, JSON.stringify(locked));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* ================= 2. CLEARING OPENS THE NEXT ================= */

  const first = await playLevel(page, 0);
  check('the bot can clear level 1', first.won === true, JSON.stringify(first));
  await page.waitForTimeout(900);
  const afterWin = await page.evaluate(() => ({ unlocked: S.steps.unlocked, best: S.steps.best[0] }));
  check('clearing level 1 opens level 2', afterWin.unlocked === 2, JSON.stringify(afterWin));
  check('a per-level best is recorded', afterWin.best > 0, JSON.stringify(afterWin));

  await page.reload();
  await page.waitForTimeout(800);
  const afterReload = await page.evaluate(() => S.steps.unlocked);
  check('the unlock survives a reload', afterReload === 2, 'unlocked=' + afterReload);

  /* ================= 3. IS EVERY LEVEL ACTUALLY WINNABLE? ================= */

  await page.evaluate(() => {
    S.steps.unlocked = STEP_LEVELS.length; persist();
    document.getElementById('pop').classList.remove('on');
    go('steps');
  });
  await page.waitForTimeout(400);

  // Up to three attempts per level. The layout is fixed by its seed, but the
  // bot's polling and the browser's frame timing are not, so a level tuned
  // close to the bot's ceiling can flip between runs. Retrying is also what a
  // real player does: the popup literally says "Again!". A level that needs
  // all three tries is a signal it sits near the limit, so the count is
  // reported rather than hidden.
  const unwinnable = [];
  for (let i = 0; i < 8; i++) {                    // index 8 is the endless level
    const meta = await page.evaluate((l) => ({ goal: STEP_LEVELS[l].goal, name: STEP_LEVELS[l].name }), i);
    let r = null, tries = 0;
    while (tries < 3) {
      tries++;
      r = await playLevel(page, i);
      await page.waitForTimeout(900);
      await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
      if (r.won) break;
    }
    info('level ' + (i + 1) + ' ' + meta.name,
      (r.won ? 'CLEARED on try ' + tries : 'fell after 3 tries') +
      ' at ' + r.dist + '/' + meta.goal + ', ' + r.tokens + ' stars');
    if (!r.won) unwinnable.push(i + 1);
  }
  // A plain hopper clearing every level is the evidence that none of them is a
  // wall. If this fails, the level's dials are wrong, not the player.
  check('a plain hopping bot can clear all eight levels',
    unwinnable.length === 0, 'failed on level(s) ' + unwinnable.join(', '));

  /* Three of the levels end in a rescue: a friend is held by the Gloom Cloud
     and freeing her is what clears the level. Winning one has to actually hand
     the friend over, or the battle is scenery. */
  const rescue = await page.evaluate(() => ({
    levels: STEP_LEVELS.filter(l => l.rescue).length,
    friends: S.friends.length
  }));
  check('three levels are rescues', rescue.levels === 3, JSON.stringify(rescue));
  check('clearing the rescue levels actually freed friends',
    rescue.friends >= 3, JSON.stringify(rescue));

  /* ================= 4. THE ENDLESS LEVEL NEVER "WINS" ================= */

  const endless = await playLevel(page, 8);
  check('the endless level runs until she falls rather than ending at a goal',
    endless.won === false && endless.dist > 0, JSON.stringify(endless));

  check('no JS errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  await SITE.close();
  log(fails === 0
    ? '\nALL LEVEL TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

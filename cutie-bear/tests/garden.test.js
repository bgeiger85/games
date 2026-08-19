/* Cloud Garden.

   The garden grows on a real clock, so the interesting cases are all about
   time: time passing, time being hurried, and time behaving badly. The last
   one matters more than it sounds. A tablet's clock can move backwards after
   a timezone change or a manual correction, and a naive elapsed-time
   calculation then reads as "planted in the future", which would leave a plant
   that never finishes growing. There is no way for a child to fix that.

   It also checks the rules the app is built on: a plant left alone never dies,
   and being away is only ever good for the garden. */
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

  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(SITE.url);
  await page.waitForTimeout(700);
  await page.evaluate(() => { S.rooms.garden = true; S.stars = 300; persist(); go('garden'); });
  await page.waitForTimeout(400);

  /* ================= 1. LAYOUT AND UNLOCKS ================= */

  const start = await page.evaluate(() => ({
    pots: document.querySelectorAll('#gardenplots button').length,
    seeds: document.querySelectorAll('#gardenseeds button').length,
    level: gardenLevel()
  }));
  check('a new garden has three pots', start.pots === 3, JSON.stringify(start));
  check('every seed is listed, including the locked ones', start.seeds === 4, JSON.stringify(start));
  check('the garden starts at level 1', start.level === 1, JSON.stringify(start));

  const locked = await page.evaluate(() => {
    const before = S.stars;
    document.querySelector('#gardenseeds button[data-seed="rose"]').click();
    return { spent: before - S.stars, planted: S.garden.plots.filter(Boolean).length };
  });
  check('a seed above the garden level cannot be planted',
    locked.spent === 0 && locked.planted === 0, JSON.stringify(locked));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* ================= 2. PLANTING AND GROWING ================= */

  const planted = await page.evaluate(() => {
    const before = S.stars;
    document.querySelector('#gardenseeds button[data-seed="daisy"]').click();
    const p = S.garden.plots[0];
    return { spent: before - S.stars, seed: p && p.seed, stage: gardenStage(p), ready: gardenReady(p) };
  });
  check('planting costs stars and fills the first pot',
    planted.spent === 5 && planted.seed === 'daisy', JSON.stringify(planted));
  check('a fresh seed is not ready', planted.ready === false && planted.stage === 0, JSON.stringify(planted));

  // Wind the clock back on the planting time to simulate real time passing.
  const grown = await page.evaluate(() => {
    S.garden.plots[0].at -= 12 * 60000;          // 12 of the 20 minutes
    return { stage: gardenStage(S.garden.plots[0]), ready: gardenReady(S.garden.plots[0]) };
  });
  check('time passing moves a plant along', grown.stage >= 1 && grown.ready === false, JSON.stringify(grown));

  /* ================= 3. HURRYING THE CLOCK ================= */

  const watered = await page.evaluate(() => {
    const p = S.garden.plots[0], before = gardenProgress(p);
    gardenWater(0);
    return { before: Math.round(before), after: Math.round(gardenProgress(p)), water: p.water };
  });
  check('watering adds growth', watered.after > watered.before, JSON.stringify(watered));

  const overWatered = await page.evaluate(() => {
    gardenWater(0); gardenWater(0); gardenWater(0);   // past the cap
    return S.garden.plots[0] ? S.garden.plots[0].water : 'harvested';
  });
  check('watering is capped so the wait cannot be erased',
    overWatered === 2 || overWatered === 'harvested', 'water=' + overWatered);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  // Sunshine: earning stars anywhere should feed everything still growing.
  const sun = await page.evaluate(() => {
    S.garden.plots[1] = { seed: 'bloom', at: Date.now(), boost: 0, water: 0 };
    const before = S.garden.plots[1].boost;
    addStars(6, 100, 100);
    return { before: before, after: S.garden.plots[1].boost };
  });
  check('playing anything gives every growing plant sunshine',
    sun.after > sun.before, JSON.stringify(sun));

  /* ================= 4. NOTHING EVER DIES ================= */

  // A month away. In the genre this copies, that is a dead garden. Here it is
  // a ready one, and that difference is the whole point.
  const away = await page.evaluate(() => {
    S.garden.plots[2] = { seed: 'daisy', at: Date.now() - 30 * 24 * 60 * 60000, boost: 0, water: 0 };
    return { ready: gardenReady(S.garden.plots[2]), stage: gardenStage(S.garden.plots[2]) };
  });
  check('a plant left for a month is ready, not dead',
    away.ready === true && away.stage === 3, JSON.stringify(away));

  /* ================= 5. A CLOCK THAT MOVES BACKWARDS ================= */

  // A timezone change or a manual clock correction can put "planted at" in the
  // future. Without a guard the plant never finishes and she cannot fix it.
  const backwards = await page.evaluate(() => {
    S.garden.plots[2] = { seed: 'daisy', at: Date.now() + 6 * 60 * 60000, boost: 0, water: 0 };
    const first = gardenProgress(S.garden.plots[2]);       // re-anchors
    return { progress: first, at: S.garden.plots[2].at <= Date.now() };
  });
  check('a clock that has moved backwards cannot strand a plant',
    backwards.progress >= 0 && backwards.at === true, JSON.stringify(backwards));

  /* ================= 6. HARVEST AND THE LADDER ================= */

  const harvested = await page.evaluate(() => {
    S.garden.plots[0] = { seed: 'daisy', at: Date.now() - 60 * 60000, boost: 0, water: 0 };
    const stars = S.stars, h = S.garden.harvests;
    gardenHarvest(0);
    return {
      gained: S.stars - stars, harvests: S.garden.harvests - h,
      emptied: S.garden.plots[0] === null, flowers: S.garden.flowers.daisy
    };
  });
  check('harvesting pays stars, empties the pot and records the flower',
    harvested.gained === 12 && harvested.harvests === 1 &&
    harvested.emptied === true && harvested.flowers >= 1, JSON.stringify(harvested));
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  // Four harvests open a level, a level opens a pot.
  const levelled = await page.evaluate(() => {
    S.garden.harvests = 4; persist(); gardenRender();
    return { level: gardenLevel(), pots: document.querySelectorAll('#gardenplots button').length };
  });
  check('four flowers grows the garden and opens another pot',
    levelled.level === 2 && levelled.pots === 4, JSON.stringify(levelled));

  const maxed = await page.evaluate(() => {
    S.garden.harvests = 999; persist(); gardenRender();
    return { level: gardenLevel(), pots: document.querySelectorAll('#gardenplots button').length };
  });
  check('the garden stops at level 6 and eight pots',
    maxed.level === 6 && maxed.pots === 8, JSON.stringify(maxed));

  /* ================= 7. IT ALL SURVIVES A RELOAD ================= */

  await page.evaluate(() => {
    S.garden.harvests = 5;
    S.garden.plots[0] = { seed: 'lily', at: Date.now() - 10 * 60000, boost: 3, water: 1 };
    persist();
  });
  await page.reload();
  await page.waitForTimeout(800);
  const reloaded = await page.evaluate(() => ({
    harvests: S.garden.harvests,
    seed: S.garden.plots[0] && S.garden.plots[0].seed,
    water: S.garden.plots[0] && S.garden.plots[0].water,
    v: JSON.parse(localStorage.getItem('cutiebear.save')).v
  }));
  check('the garden survives a reload',
    reloaded.harvests === 5 && reloaded.seed === 'lily' && reloaded.water === 1,
    JSON.stringify(reloaded));
  info('save schema version', reloaded.v);

  // An older save must gain a garden without losing anything else.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cutiebear.save.v1', JSON.stringify({
      stars: 88, owned: ['bow_pink', 'crown_gold'], friends: ['bunny'],
      rooms: { photo: true, steps: true }
    }));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const migrated = await page.evaluate(() => ({
    stars: S.stars, owned: S.owned.length, friends: S.friends.length,
    garden: !!(S.garden && S.garden.plots), pots: S.garden.plots.length,
    harvests: S.garden.harvests
  }));
  check('an old save gains an empty garden and keeps everything else',
    migrated.stars === 88 && migrated.owned === 2 && migrated.friends === 1 &&
    migrated.garden === true && migrated.pots === 3 && migrated.harvests === 0,
    JSON.stringify(migrated));

  check('no JS errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  await SITE.close();
  log(fails === 0
    ? '\nALL GARDEN TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

/* The same dim bot from match.test plays all five rounds and has to lift the
   trophy.

   The matches are shortened to 25 seconds each so the suite finishes in about
   three minutes instead of five. That changes what the number means and it is
   worth being clear about it: what this measures is a SCORING RATE, goals per
   25 seconds against each opponent, and the printed table is the tuning
   signal. A round where the bot cannot score inside 25 seconds is a round
   where a six year old will be chasing shadows for a minute.

   It retries a round up to three times, because the bot's timing is not
   deterministic even though the ladder is. */
const { launch, site, engineName } = require('./harness');
const { BOT_SOURCE } = require('./bot');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

/* Compressed so thirteen matches finish in a few minutes rather than a
   quarter of an hour.

   How far it can be compressed is NOT a free choice, and 14 was too far. At 14
   the bot got one shot a match, nearly everything finished 0-0, every knockout
   became a penalty shootout, and the run turned into a sequence of coin
   flips - it lost three semi-finals in a row on WebKit and failed. Nothing was
   wrong with the game; the measurement had been squeezed until it stopped
   measuring anything.

   22 gives two to three shots a match, which is enough for the score table to
   mean something again. If this is ever lowered, watch the shots column: one
   shot a match means the number is too low. */
/* Matches are compressed so the suite is minutes rather than a quarter of an
   hour. That also collapses every round to a single break away, because the
   count is a rate over the match length - so this run proves the campaign can
   be completed, NOT that the real knockout lengths are winnable.
   MATCH_SECS=real plays them at their true lengths for that. */
const SECS = process.env.MATCH_SECS === 'real' ? null : parseInt(process.env.MATCH_SECS || '22', 10);
const RETRIES = 3;

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(500);

  await page.evaluate(s => {
    if (s !== null) ROUNDS.forEach(r => { r.secs = s; });
    S.round = 0; S.results = []; S.cups = 0; S.goals = 0; persist();
  }, SECS);
  console.log(SECS === null ? 'match length: real (per round)' : 'match length: ' + SECS + 's, compressed');

  const table = [];
  const fails = [];

  const TOTAL = await page.evaluate(() => ROUNDS.length);
  for (let i = 0; i < TOTAL; i++) {
    // The playoff is skipped when he qualifies straight from the table, so
    // follow S.round rather than marching through every index.
    const at = await page.evaluate(() => S.round);
    if (at >= TOTAL) break;
    if (at !== i) { i = at; }
    let won = false, best = null;
    for (let attempt = 1; attempt <= RETRIES && !won; attempt++) {
      await page.evaluate(() => closePop());
      await page.evaluate(n => startMatch(n), i);
      await page.waitForTimeout(250);
      const r = await page.evaluate(BOT_SOURCE);
      await page.waitForTimeout(1300);
      const st = await page.evaluate(() => ({
        round: S.round,
        pop: document.getElementById('pop').classList.contains('on'),
        title: document.getElementById('poptitle').textContent,
        screen: current
      }));
      if (!best || (r.gf - r.ga) > (best.gf - best.ga)) best = r;

      if (st.round > i) { won = true; }
      else if (/point each/i.test(st.title)) {
        // A league draw is a point and the campaign has already moved on.
        won = true;
      }
      else if (/draw/i.test(st.title)) {
        // a level match goes to penalties. Take them, always to zone 0, and
        // always dive middle. This is a real path a player will hit.
        await page.click('#poprow .btn');
        await page.waitForTimeout(500);
        for (let k = 0; k < 20; k++) {
          const ps = await page.evaluate(() => P ? { turn: P.turn, busy: P.busy, done: P.done } : null);
          if (!ps || ps.done) break;
          if (ps.busy) { await page.waitForTimeout(120); continue; }
          if (ps.turn === 'us') await page.click('#goalbox .zone[data-zone="' + (k % 6) + '"]');
          else await page.click('[data-dive="' + (k % 3) + '"]');
          await page.waitForTimeout(1500);
        }
        await page.waitForTimeout(1600);
        const after = await page.evaluate(() => S.round);
        if (after > i) won = true;
      }
      // a loss just means going round again, which is the point of the retry
    }
    const meta = await page.evaluate(n => ({ stage: ROUNDS[n].stage, foe: TEAMS[ROUNDS[n].foe].name }), i);
    table.push({ round: i, stage: meta.stage, foe: meta.foe,
      gf: best ? best.gf : 0, ga: best ? best.ga : 0, shots: best ? best.shots : 0, won: won });
    if (!won) {
      fails.push('round ' + i + ' was not winnable in ' + RETRIES + ' tries: best ' +
        (best ? best.gf + '-' + best.ga : 'none'));
      break;
    }
  }

  await page.evaluate(() => { closePop(); go('trophy'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, '12-trophy-room-won.png') });
  const end = await page.evaluate(() => ({ round: S.round, cups: S.cups, goals: S.goals, boots: S.boots }));

  await browser.close();
  await SITE.close();

  console.log('\n  round  stage           opponent   score   shots   won');
  table.forEach(t => {
    console.log('  ' + String(t.round).padEnd(6) + (t.stage || '?').padEnd(16) +
      (t.foe || '').padEnd(11) +
      (t.gf + '-' + t.ga).padEnd(8) + String(t.shots).padEnd(8) + (t.won ? 'yes' : 'NO'));
  });
  console.log('\nend  ' + JSON.stringify(end));
  console.log('errors ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (end.round !== TOTAL) fails.push('the campaign did not finish, S.round=' + end.round + ' of ' + TOTAL);
  if (end.cups !== 1) fails.push('the World Cup was not recorded, S.cups=' + end.cups);
  if (end.goals < 5) fails.push('career goals look wrong: ' + end.goals);

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')  the trophy is liftable');
})();

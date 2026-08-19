/* The shootout, played through with real taps.

   Two things worth proving. First that it always terminates: a best-of-five
   that rolls into sudden death is easy to write so that it either ends a kick
   early or never ends at all. Second that a drawn knockout match reaches it
   and that winning it advances the ladder with the 90 minute score intact,
   not the shootout tally. */
const { launch, site, engineName } = require('./harness');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

/* Taps zones and dive buttons until the shootout resolves. Real clicks, so the
   zone overlays have to actually be on top of the net and tappable. */
async function playShootout(page, kicks = 40) {
  for (let i = 0; i < kicks; i++) {
    const state = await page.evaluate(() => P ? { turn: P.turn, busy: P.busy, done: P.done } : null);
    if (!state || state.done) return;
    if (state.busy) { await page.waitForTimeout(120); continue; }
    if (state.turn === 'us') {
      const zone = i % 6;
      await page.click(`#goalbox .zone[data-zone="${zone}"]`);
    } else {
      await page.click(`[data-dive="${i % 3}"]`);
    }
    await page.waitForTimeout(1500);
  }
}

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(500);

  // --- 1. practice mode plays out and finishes
  await page.click('#btnpens');
  await page.waitForTimeout(400);
  await playShootout(page);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(shotDir, '10-shootout.png') });
  const practice = await page.evaluate(() => ({
    done: P ? P.done : null,
    us: P ? P.us.length : 0,
    them: P ? P.them.length : 0,
    a: P ? P.us.filter(x => x === 'goal').length : 0,
    b: P ? P.them.filter(x => x === 'goal').length : 0,
    popup: document.getElementById('pop').classList.contains('on'),
    penGoals: S.penGoals, penSaves: S.penSaves,
    round: S.round
  }));

  // --- 2. a drawn Quarter-Final goes to penalties and a win advances the ladder
  await page.evaluate(() => {
    closePop();
    /* A KNOCKOUT, deliberately. Qualifying and the group are decided on points
       now, so a level match there is a draw worth a point and never reaches a
       shootout. Only the knockouts and the playoff have to produce a winner on
       the day, which is what this suite is about. */
    S.round = 10; S.results = [];
    for (var i = 0; i < 10; i++) S.results[i] = { gf: 2, ga: 0 };
    S.cups = 0; persist();
    startMatch(10);
    // force a 2-2 draw one tick before full time
    M.gf = 2; M.ga = 2; updateScore();
    // Push the accumulated clock to full time. The match clock counts clamped
    // frame deltas rather than wall clock now, so winding M.t0 back no longer
    // does anything - see the comment on the clamp in step().
    M.elapsed = M.r.secs;
  });
  await page.waitForTimeout(1200);
  const drawPop = await page.evaluate(() => ({
    popup: document.getElementById('pop').classList.contains('on'),
    title: document.getElementById('poptitle').textContent
  }));
  await page.click('#poprow .btn');
  await page.waitForTimeout(500);
  const penFromMatch = await page.evaluate(() => ({ screen: current, idx: P.roundIdx, gf: P.gf, ga: P.ga }));

  // rig the keeper so Spain always score and always save, then play it out
  await page.evaluate(() => { P.r = Object.assign({}, P.r, { keeper: 0 }); });
  await page.evaluate(() => {
    // their kick always goes down the middle, so diving "stay" always saves it
    window.__rand = Math.random;
    Math.random = () => 0.5;
  });
  for (let i = 0; i < 20; i++) {
    const st = await page.evaluate(() => P ? { turn: P.turn, busy: P.busy, done: P.done } : null);
    if (!st || st.done) break;
    if (st.busy) { await page.waitForTimeout(120); continue; }
    if (st.turn === 'us') await page.click('#goalbox .zone[data-zone="0"]');
    else await page.click('[data-dive="1"]');
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1600);
  await page.evaluate(() => { if (window.__rand) Math.random = window.__rand; });
  const advanced = await page.evaluate(() => ({
    round: S.round,
    result: S.results[10],
    popup: document.getElementById('pop').classList.contains('on'),
    title: document.getElementById('poptitle').textContent
  }));
  await page.screenshot({ path: path.join(shotDir, '11-shootout-won.png') });

  // --- 3. the odds, for every round on the ladder
  // The first cut of this had the keeper guess a zone and save on a match,
  // which stopped 52% of the player's kicks. It read as fair and was not. The
  // formula below mirrors takePen and theirPen; it duplicates two constants on
  // purpose, so that turning up a round's keeper skill in ROUNDS - by far the
  // likeliest future edit - trips this rather than quietly making the final
  // unwinnable.
  const odds = await page.evaluate(() => ROUNDS.map(r => ({
    stage: r.stage,
    weScore: 1 - (0.14 + r.keeper * 0.28),
    theyScore: (1 - 0.12) * (2 / 3)
  })));

  await browser.close();
  await SITE.close();

  const fails = [];
  odds.forEach(o => {
    if (o.weScore <= o.theyScore + 0.04) {
      fails.push(o.stage + ' shootout is not in the player\'s favour: he scores ' +
        o.weScore.toFixed(2) + ', they score ' + o.theyScore.toFixed(2));
    }
  });
  if (!practice.done) fails.push('the practice shootout never resolved');
  if (practice.us < 3 || practice.us > 12) fails.push('odd number of kicks taken: ' + practice.us);
  if (Math.abs(practice.us - practice.them) > 1) fails.push('the kicks did not alternate: ' + practice.us + ' v ' + practice.them);
  if (practice.a === practice.b) fails.push('the shootout ended level: ' + practice.a + '-' + practice.b);
  if (!practice.popup) fails.push('no result popup after the practice shootout');
  if (practice.round !== 0) fails.push('practice touched the tournament ladder, S.round=' + practice.round);
  if (!drawPop.popup || !/draw/i.test(drawPop.title)) fails.push('a level match did not offer penalties: ' + JSON.stringify(drawPop));
  if (penFromMatch.screen !== 'pens') fails.push('the draw did not open the shootout');
  if (penFromMatch.idx !== 10) fails.push('the shootout lost which round it belongs to: ' + penFromMatch.idx);
  if (penFromMatch.gf !== 2 || penFromMatch.ga !== 2) fails.push('the 90 minute score was lost: ' + JSON.stringify(penFromMatch));
  if (advanced.round !== 11) fails.push('winning the shootout did not advance the campaign, S.round=' + advanced.round);
  if (!advanced.result || !advanced.result.pens) fails.push('the result was not marked as won on penalties: ' + JSON.stringify(advanced.result));
  if (!advanced.result || advanced.result.gf !== 2 || advanced.result.ga !== 2) {
    fails.push('the ladder recorded the shootout tally instead of 2-2: ' + JSON.stringify(advanced.result));
  }

  odds.forEach(o => console.log('odds      ' + o.stage.padEnd(15) +
    'he scores ' + o.weScore.toFixed(2) + ', they score ' + o.theyScore.toFixed(2)));
  console.log('practice  ' + JSON.stringify(practice));
  console.log('draw      ' + JSON.stringify(drawPop));
  console.log('handoff   ' + JSON.stringify(penFromMatch));
  console.log('advanced  ' + JSON.stringify(advanced));
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

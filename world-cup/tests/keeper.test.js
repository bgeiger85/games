/* The keeper moment: the other team's break away, played with real taps.

   The thing worth guarding here is that the scoreboard can move BOTH ways.
   Before this existed, conceding needed Jaxson to ignore a defender carrying
   the ball for ten seconds and then lose a dice roll that was zero on the
   first round, so the opposition never scored and 3-0 meant nothing.

   The rest guards the rules:
     - a right guess ALWAYS saves, so his choice is what decides it
     - a wrong guess is never a CERTAIN goal (forgive), and neither is freezing
     - the match clock does not run while he is being asked to choose
     - it never fires in the last seconds, and never over a shot in flight
     - it cannot outlive the match it belongs to */
const { launch, site, engineName } = require('./harness');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const shot = n => path.join(shotDir, n);

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(400);
  // warm-ups off: this suite is about the match, and the gate has its own suite
  await page.evaluate(() => { S.warm.on = false; persist(); });

  const startFresh = async (idx = 0) => {
    await page.evaluate(n => { if (M) endMatch(); startMatch(n); }, idx);
    await page.waitForTimeout(700);
  };

  // --- 1. every round schedules at least one break away, and none of them
  //        lands in the last seconds of the match
  const schedule = await page.evaluate(() => ROUNDS.map((r, i) => {
    const t = attackTimes(r);
    return { stage: r.stage, gap: r.gap, n: t.length, secs: r.secs,
             min: Math.min.apply(null, t), max: Math.max.apply(null, t) };
  }));

  // --- 2. the overlay comes up and the match freezes behind it
  await startFresh(0);
  await page.evaluate(() => oppAttack());
  await page.waitForTimeout(300);
  const up = await page.evaluate(() => ({
    saving: !!M.saving,
    overlay: document.getElementById('savewrap').classList.contains('on'),
    btns: document.querySelectorAll('#savebtns .savebtn').length,
    head: document.getElementById('savehead').textContent
  }));
  await page.screenshot({ path: shot('19-keeper-moment.png') });

  // the clock and Yamal both have to be still while he is choosing
  const frozen = await page.evaluate(() => new Promise(res => {
    const e0 = M.elapsed, x0 = M.x;
    M.tx = M.x + 400; M.ty = M.y;
    setTimeout(() => res({ clock: M.elapsed - e0, moved: M.x - x0 }), 800);
  }));

  // the countdown bar actually runs down. It once snapped straight to empty,
  // because the transition was set up while the overlay was still display:none.
  const bar = await page.evaluate(() => {
    const m = getComputedStyle(document.getElementById('savebar')).transform;
    return m === 'none' ? 1 : parseFloat(m.split('(')[1]);
  });

  // --- 3. a RIGHT guess always saves. Rig where the ball went, 12 times.
  const rightGuess = await page.evaluate(async () => {
    let conceded = 0;
    for (let i = 0; i < 12; i++) {
      if (!M || M.over) startMatch(0);
      const before = M.ga;
      Math.random = () => 0.0;          // ball goes to zone 0
      M.saving = { picked: 0, done: false };
      resolveSave();
      if (M.ga > before) conceded++;
      M.saving = null;
    }
    return conceded;
  });
  await page.evaluate(() => { delete Math.random; });
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(() => { S.warm.on = false; persist(); });

  // --- 4. a WRONG guess is not a certain goal, and neither is not choosing.
  //        Both must sometimes save and sometimes concede across many tries.
  const odds = await page.evaluate(() => {
    const out = {};
    ['wrong', 'notap'].forEach(kind => {
      let saved = 0, conceded = 0;
      for (let i = 0; i < 300; i++) {
        if (!M || M.over) startMatch(0);
        const before = M.ga;
        // force a mismatch: ball goes to 2, he picks 0 (or nothing at all)
        const realRandom = Math.random;
        let call = 0;
        Math.random = () => (call++ === 0 ? 0.9 : realRandom());
        M.saving = { picked: kind === 'wrong' ? 0 : null, done: false };
        resolveSave();
        Math.random = realRandom;
        if (M.ga > before) conceded++; else saved++;
        M.saving = null;
      }
      out[kind] = { saved, conceded };
    });
    return out;
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(() => { S.warm.on = false; persist(); });

  // --- 5. tapping a side resolves it, and play resumes cleanly
  await startFresh(0);
  await page.evaluate(() => oppAttack());
  await page.waitForTimeout(300);
  await page.click('[data-save="1"]');
  await page.waitForTimeout(300);
  const outcome = await page.evaluate(() => ({
    done: M.saving ? M.saving.done : null,
    head: document.getElementById('savehead').textContent,
    btnsHidden: document.getElementById('savebtns').style.visibility === 'hidden'
  }));
  await page.screenshot({ path: shot('20-keeper-outcome.png') });
  await page.waitForTimeout(1700);
  const resumed = await page.evaluate(() => ({
    overlay: document.getElementById('savewrap').classList.contains('on'),
    saving: !!M.saving, phase: M.phase, running: M.running
  }));
  // and the clock starts moving again
  const clockRan = await page.evaluate(() => new Promise(res => {
    const e0 = M.elapsed;
    setTimeout(() => res(M.elapsed - e0), 700);
  }));

  // --- 6. it never interrupts a shot in flight
  const notOverShot = await page.evaluate(() => {
    M.atkAt = [0];               // due immediately
    M.phase = 'shot';
    const before = !!M.saving;
    step(performance.now());
    return { before, after: !!M.saving, still: M.atkAt.length };
  });

  // --- 7. leaving the match takes the keeper moment with it
  const tornDown = await page.evaluate(() => {
    if (!M || M.over) startMatch(0);
    oppAttack();
    const during = document.getElementById('savewrap').classList.contains('on');
    go('cup');
    return { during, after: document.getElementById('savewrap').classList.contains('on'), m: M };
  });
  await page.waitForTimeout(1600);   // the resolve timer would have fired by now
  const afterLeaving = await page.evaluate(() => ({
    screen: current, m: M, overlay: document.getElementById('savewrap').classList.contains('on')
  }));

  await browser.close();
  await SITE.close();

  const fails = [];
  schedule.forEach(r => {
    if (r.n < 1) fails.push(r.stage + ' schedules no break away at all');
    const want = Math.max(1, Math.round((r.secs - 15) / r.gap));
    if (r.n !== want) fails.push(r.stage + ' scheduled ' + r.n + ' attacks, expected ' + want);
    if (r.min < 8) fails.push(r.stage + ' attacks in the first seconds: ' + r.min.toFixed(1) + 's');
    if (r.max > r.secs - 4) {
      fails.push(r.stage + ' attacks on the whistle: ' + r.max.toFixed(1) + 's of ' + r.secs + 's');
    }
  });
  if (!up.saving || !up.overlay) fails.push('the break away did not come up: ' + JSON.stringify(up));
  if (up.btns !== 3) fails.push('expected 3 dive buttons, got ' + up.btns);
  if (!/break away/i.test(up.head)) fails.push('no break away headline: "' + up.head + '"');
  if (frozen.clock > 0.02) fails.push('the match clock ran while he was choosing: +' + frozen.clock.toFixed(2) + 's');
  if (Math.abs(frozen.moved) > 1) fails.push('Yamal kept moving during the keeper moment: ' + frozen.moved);
  if (!(bar < 0.99)) fails.push('the countdown bar is not running down: scaleX=' + bar);

  if (rightGuess !== 0) {
    fails.push('a correct guess conceded ' + rightGuess + ' times out of 12; a right guess must always save');
  }
  ['wrong', 'notap'].forEach(k => {
    const o = odds[k];
    if (!o.conceded) fails.push('a ' + k + ' guess never concedes, so the choice does not matter: ' + JSON.stringify(o));
    if (!o.saved) fails.push('a ' + k + ' guess is a CERTAIN goal: ' + JSON.stringify(o));
  });
  // freezing must not be punished harder than guessing wrong
  if (odds.notap.saved / 300 < odds.wrong.saved / 300 - 0.12) {
    fails.push('not choosing is punished much harder than choosing wrong: ' + JSON.stringify(odds));
  }

  if (!outcome.done) fails.push('tapping a side did not resolve it');
  if (!outcome.btnsHidden) fails.push('the buttons stayed up after he chose');
  if (resumed.overlay || resumed.saving) fails.push('the keeper moment did not clear: ' + JSON.stringify(resumed));
  if (resumed.phase !== 'us') fails.push('play did not restart with the ball: ' + JSON.stringify(resumed));
  if (clockRan < 0.15) fails.push('the clock did not restart after the keeper moment: +' + clockRan.toFixed(2) + 's');
  if (notOverShot.after) fails.push('a break away interrupted a shot in flight');
  if (!tornDown.during) fails.push('the setup for the teardown check never showed the overlay');
  if (tornDown.after || tornDown.m !== null) fails.push('leaving the match left the keeper moment up: ' + JSON.stringify(tornDown));
  if (afterLeaving.m !== null || afterLeaving.overlay) {
    fails.push('the keeper moment outlived its match: ' + JSON.stringify(afterLeaving));
  }

  schedule.forEach(r => console.log('schedule  ' + r.stage.padEnd(15) + r.n + ' attack(s), ' +
    r.min.toFixed(1) + 's-' + r.max.toFixed(1) + 's of ' + r.secs + 's'));
  console.log('overlay   ' + JSON.stringify(up));
  console.log('frozen    ' + JSON.stringify(frozen) + ' bar scaleX=' + bar.toFixed(2));
  console.log('right     conceded ' + rightGuess + '/12 (must be 0)');
  console.log('wrong     ' + JSON.stringify(odds.wrong) + '  = ' + (odds.wrong.saved / 3).toFixed(0) + '% saved');
  console.log('no tap    ' + JSON.stringify(odds.notap) + '  = ' + (odds.notap.saved / 3).toFixed(0) + '% saved');
  console.log('resumed   ' + JSON.stringify(resumed) + ' clock +' + clockRan.toFixed(2) + 's');
  console.log('teardown  ' + JSON.stringify(afterLeaving));
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

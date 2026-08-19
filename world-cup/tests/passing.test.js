/* Nico, the pass, and the one-two, driven with real taps.

   Brian's diagnosis was that the game would go stale: the rounds get harder
   but they never ask anything new, so a six year old masters the one move in
   about three minutes and after that it is only tighter margins. Nico is the
   new verb, and the give-and-go is the skill.

   What this suite guards:
     - a pass ALWAYS connects. No interception, ever. The skill is when and
       where, and a turnover would break the bargain the whole game makes.
     - pass, run, get it back inside the window = a one-two, and it says so
     - Nico is gated to the knockouts, so the ladder teaches something new
     - he never shoots; he gives it back
     - Passing Practice has no clock and never touches the ladder */
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
  await page.evaluate(() => { S.warm.on = false; persist(); });

  const start = async n => {
    await page.evaluate(i => { if (M) endMatch(); startMatch(i); }, n);
    await page.waitForFunction(() => M && M.running, null, { timeout: 8000, polling: 60 });
    await page.waitForTimeout(500);
  };
  const waitFor = (fn, t = 8000) => page.waitForFunction(fn, null, { timeout: t, polling: 60 });

  // --- 1. who plays with him, and who does not
  const gating = await page.evaluate(() => ROUNDS.map(r => ({ stage: r.stage, mate: !!r.mate })));

  await start(0);
  const round0 = await page.evaluate(() => ({
    mate: M.mate, btn: document.getElementById('passbtn').classList.contains('on'), canPass: canPass()
  }));

  // --- 2. the first round he plays: Qualifier 5. Nico used to arrive at the
  // quarter-final, but the campaign has thirteen rungs now instead of five, so
  // there is room to introduce him earlier.
  await start(4);
  const round2 = await page.evaluate(() => ({
    mate: !!M.mate, num: 17,
    btn: document.getElementById('passbtn').classList.contains('on'), canPass: canPass()
  }));
  await page.screenshot({ path: shot('24-nico.png') });

  // --- 3. a pass always connects, even with a defender standing on the line
  const connects = await page.evaluate(async () => {
    let arrived = 0;
    for (let i = 0; i < 8; i++) {
      // reset, then park every defender directly between the two of them
      kickoff(false);
      M.mate.x = M.x + 260; M.mate.y = M.y;
      M.defs.forEach((d, n) => { d.x = M.x + 90 + n * 40; d.y = M.y; d.stun = 0; });
      M.grace = 0;
      pass();
      // run the pass to completion by hand, so this does not depend on frames
      for (let f = 0; f < 400 && M.inPass; f++) step(performance.now() + f * 16);
      if (M.mate.hasBall) arrived++;
    }
    return { arrived, of: 8 };
  });

  // --- 4. pass, then get it back inside the window, is a one-two
  await start(4);
  await waitFor(() => canPass());
  const onesBefore = await page.evaluate(() => ({ m: M.ones, s: S.ones }));
  await page.click('#passbtn');
  const inFlight = await page.evaluate(() => ({ phase: M.phase, to: M.inPass && M.inPass.to }));
  await page.screenshot({ path: shot('25-pass-inflight.png') });
  await waitFor(() => M.mate.hasBall);
  const held = await page.evaluate(() => ({ hasBall: M.mate.hasBall, phase: M.phase }));
  await page.click('#passbtn');                   // ask for it back
  await waitFor(() => M.phase === 'us');
  await page.waitForTimeout(150);
  const oneTwo = await page.evaluate(() => ({
    m: M.ones, s: S.ones, phase: M.phase,
    toast: document.getElementById('toast').textContent
  }));
  await page.screenshot({ path: shot('26-one-two.png') });

  // --- 5. dawdling is not a one-two. Same exchange, past the window.
  const slow = await page.evaluate(async () => {
    kickoff(false);
    const before = M.ones;
    pass();
    for (let f = 0; f < 400 && M.inPass; f++) step(performance.now() + f * 16);
    M.sincePass = ONETWO_FRAMES + 60;             // he took too long
    passBack();
    for (let f = 0; f < 400 && M.inPass; f++) step(performance.now() + f * 16);
    return { before: before, after: M.ones, phase: M.phase };
  });

  // --- 6. Nico gives it back on his own, and never shoots
  const givesBack = await page.evaluate(async () => {
    kickoff(false);
    pass();
    for (let f = 0; f < 400 && M.inPass; f++) step(performance.now() + f * 16);
    const got = M.mate.hasBall;
    let gf = M.gf;
    // let him hold it and decide for himself, with nobody touching PASS
    for (let f = 0; f < 900 && !(M.phase === 'us'); f++) step(performance.now() + f * 16);
    return { received: got, backWithUs: M.phase === 'us', scoredHimself: M.gf > gf };
  });

  // --- 7. a pass cannot be intercepted even by a defender sitting on Nico
  const noSteal = await page.evaluate(async () => {
    kickoff(false);
    M.mate.x = M.x + 240; M.mate.y = M.y;
    M.defs.forEach(d => { d.x = M.mate.x; d.y = M.mate.y; d.stun = 0; });
    M.grace = 0;
    pass();
    let lost = false;
    for (let f = 0; f < 400 && M.inPass; f++) {
      step(performance.now() + f * 16);
      if (M.phase === 'them') lost = true;
    }
    return { lost: lost, arrived: M.mate.hasBall };
  });

  // --- 8. Passing Practice: no clock, no ladder, and it says what to do
  const before = await page.evaluate(() => ({ round: S.round, cups: S.cups, goals: S.goals }));
  await page.evaluate(() => { if (M) endMatch(); go('home'); });
  await page.waitForTimeout(200);
  await page.click('#btnpass');
  await waitFor(() => M && M.running);
  await page.waitForTimeout(600);
  const prac = await page.evaluate(() => ({
    practice: M.practice, mate: !!M.mate, secs: M.r.secs,
    stage: document.getElementById('matchstage').textContent,
    clock: document.getElementById('clock').textContent
  }));
  await page.screenshot({ path: shot('27-passing-practice.png') });
  // it must never end by itself
  const noEnd = await page.evaluate(() => new Promise(res => {
    setTimeout(() => res({ over: M ? M.over : null, screen: current }), 1500);
  }));
  await page.click('#btnquit');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    screen: current, m: M, round: S.round, cups: S.cups
  }));

  await browser.close();
  await SITE.close();

  const fails = [];
  /* He is alone for the first few and has Nico for the rest. Asserting the
     shape rather than a hardcoded list, so lengthening the campaign again does
     not mean rewriting this. */
  const firstWith = gating.findIndex(g => g.mate);
  if (firstWith < 1) fails.push('Nico plays from the very first match; he is meant to arrive later');
  if (firstWith > 6) fails.push('Nico arrives too late to be worth learning: match ' + (firstWith + 1));
  gating.slice(firstWith).forEach(g => {
    if (!g.mate) fails.push(g.stage + ' drops Nico again after he has joined');
  });
  if (round0.mate !== null) fails.push('Nico turned up in the group match');
  if (round0.btn) fails.push('the PASS button showed in a round with no teammate');
  if (round0.canPass) fails.push('passing was possible with no teammate');
  if (!round2.mate) fails.push('Nico is missing from the quarter-final');
  if (!round2.btn) fails.push('the PASS button did not appear when Nico is playing');

  if (connects.arrived !== connects.of) {
    fails.push('a pass did not always connect through a wall of defenders: ' + JSON.stringify(connects));
  }
  if (inFlight.phase !== 'pass' || inFlight.to !== 'mate') {
    fails.push('tapping PASS did not send it to Nico: ' + JSON.stringify(inFlight));
  }
  if (!held.hasBall) fails.push('Nico never received it');
  if (oneTwo.m !== onesBefore.m + 1) fails.push('the one-two was not counted on the match: ' + JSON.stringify(oneTwo));
  if (oneTwo.s !== onesBefore.s + 1) fails.push('the one-two was not counted on the save: ' + JSON.stringify(oneTwo));
  if (!/one-two/i.test(oneTwo.toast)) fails.push('the one-two was not named on screen: "' + oneTwo.toast + '"');
  if (slow.after !== slow.before) {
    fails.push('getting it back far too late still counted as a one-two: ' + JSON.stringify(slow));
  }
  if (slow.phase !== 'us') fails.push('a slow exchange did not return the ball at all: ' + JSON.stringify(slow));
  if (!givesBack.received || !givesBack.backWithUs) {
    fails.push('Nico did not give it back on his own: ' + JSON.stringify(givesBack));
  }
  if (givesBack.scoredHimself) fails.push('Nico scored. He is a teammate, not the star.');
  if (noSteal.lost || !noSteal.arrived) {
    fails.push('a pass was intercepted; it must always connect: ' + JSON.stringify(noSteal));
  }

  if (!prac.practice || !prac.mate) fails.push('Passing Practice did not start properly: ' + JSON.stringify(prac));
  if (prac.secs !== 0) fails.push('Passing Practice has a clock: secs=' + prac.secs);
  if (!/passing practice/i.test(prac.stage)) fails.push('the practice screen is not labelled: ' + prac.stage);
  if (noEnd.over) fails.push('Passing Practice ended by itself');
  if (after.screen !== 'home') fails.push('leaving practice did not go home: ' + after.screen);
  if (after.m !== null) fails.push('leaving practice left the match running');
  if (after.round !== before.round || after.cups !== before.cups) {
    fails.push('practice touched the ladder: ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
  }

  console.log('gating    alone for ' + gating.filter(g => !g.mate).length + ', Nico for ' +
    gating.filter(g => g.mate).length + '; joins at "' + (gating.find(g => g.mate) || {}).stage + '"');
  console.log('round 0   ' + JSON.stringify(round0));
  console.log('round 2   ' + JSON.stringify(round2));
  console.log('connects  ' + connects.arrived + '/' + connects.of + ' through a wall of defenders');
  console.log('one-two   ' + JSON.stringify(oneTwo));
  console.log('too slow  ' + JSON.stringify(slow));
  console.log('gives back' + JSON.stringify(givesBack));
  console.log('no steal  ' + JSON.stringify(noSteal));
  console.log('practice  ' + JSON.stringify(prac) + ' -> ' + JSON.stringify(after));
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

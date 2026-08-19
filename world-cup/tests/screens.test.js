/* Every screen renders at iPad size, real touch input actually moves Yamal,
   and a reload keeps the save. Zero console errors is a hard gate.

   The touch check is the important one. The stage is CSS-scaled, so a pointer
   coordinate is in screen pixels and everything in the game is in board pixels.
   Poking M.tx from evaluate() would pass whether or not stageXY exists, so this
   suite drives the canvas with a real mouse instead. */
const { launch, site, engineName } = require('./harness');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const shot = n => path.join(shotDir, n);

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto(SITE.url);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('1-home.png') });

  // --- the ladder, with some of it already won so the won/locked states show
  await page.evaluate(() => {
    S.round = 2;
    /* A won qualifier and a drawn one. Qualifying is decided on points now, so
       a level match is a draw carrying a point, not a shootout. */
    S.results = [{ gf: 3, ga: 0 }, { gf: 2, ga: 2, drew: true }];
    S.boots = 17; S.goals = 5;
    persist();
  });
  await page.evaluate(() => go('cup'));
  await page.waitForTimeout(450);
  await page.screenshot({ path: shot('2-ladder.png') });
  /* The campaign screen shows the phase he is in, not all fourteen matches at
     once, so this counts the qualifying phase: six rungs, two of them played.
     It also has to carry the phase strip and a standings table. */
  const rungs = await page.evaluate(() => ({
    rungs: document.querySelectorAll('#ladder .rung').length,
    won: document.querySelectorAll('#ladder .rung.won').length,
    locked: document.querySelectorAll('#ladder .rung.locked').length,
    drew: document.querySelectorAll('#ladder .rung.drew').length,
    phases: document.querySelectorAll('#ladder .phase').length,
    table: document.querySelectorAll('#ladder .trow').length
  }));

  // --- trophy room
  await page.evaluate(() => { S.cups = 1; persist(); go('trophy'); });
  await page.waitForTimeout(450);
  await page.screenshot({ path: shot('3-trophy.png') });

  // --- penalty shootout
  await page.evaluate(() => startPens(null));
  await page.waitForTimeout(450);
  await page.screenshot({ path: shot('4-penalties.png') });
  const penUi = await page.evaluate(() => ({
    zones: document.querySelectorAll('#goalbox .zone').length,
    keeper: !!document.querySelector('#penkeeper g'),
    dots: document.querySelectorAll('#penrowA .pendot').length
  }));

  // --- a match, driven by a real drag rather than by poking state
  await page.evaluate(() => { closePop(); startMatch(0); });
  await page.waitForTimeout(500);

  /* Wait for Yamal to travel `dist` board pixels from where he is now, and
     report how far he actually got.

     Every movement check below goes through this rather than sleeping for a
     fixed time, because headless WebKit throttles requestAnimationFrame hard
     when nothing is forcing a paint. A 600ms window can contain zero frames on
     a completely healthy loop, which is precisely how this suite went red
     after the pointer capture fix had already worked. Polling on a wall clock
     interval rather than on rAF is the whole point: `polling: 'raf'` would be
     throttled in exactly the same way as the thing being measured. */
  async function travelled(dist, timeout = 8000) {
    const from = await page.evaluate(() => ({ x: M.x, y: M.y }));
    try {
      await page.waitForFunction(
        f => Math.hypot(M.x - f.x, M.y - f.y) >= f.d,
        { x: from.x, y: from.y, d: dist },
        { timeout, polling: 60 }
      );
    } catch (e) { /* fall through and report whatever distance was reached */ }
    const to = await page.evaluate(() => ({ x: M.x, y: M.y, cam: M.cam, aimx: M.aimx }));
    return { from, to, moved: Math.hypot(to.x - from.x, to.y - from.y) };
  }

  // First prove the loop is alive by steering without any pointer at all.
  // Without this, a dead rAF loop and pointer events not arriving produce the
  // identical symptom - Yamal did not move - and the failure message sends you
  // hunting in the wrong half of the code.
  await page.evaluate(() => { M.tx = M.x + 300; M.ty = M.y; });
  const loopAlive = (await travelled(60)).moved;
  await page.evaluate(() => { M.tx = null; M.ty = null; kickoff(true); });
  await page.waitForTimeout(200);

  // The canvas sits below the 78px bar inside a stage scaled to the viewport.
  // Drag toward the bottom right and Yamal has to follow, in board pixels.
  // The endpoint deliberately stays clear of the SHOOT button; dragging across
  // it is its own test below.
  const box = await page.locator('#pitch').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.78, { steps: 12 });
  const drag = await travelled(80);
  await page.mouse.up();
  await page.screenshot({ path: shot('5-match.png') });

  const before = drag.from, after = drag.to;
  const moved = drag.moved;
  const wentRight = after.x > before.x;
  const wentDown = after.y > before.y;

  // --- steering must survive the finger sliding over the SHOOT button.
  // That button is a 158px circle in the bottom right, which is exactly where
  // a right handed thumb steers.
  //
  // This check only bites on WebKit, and that is the point rather than a
  // weakness. Chromium does implicit mouse capture for the duration of a drag,
  // so the canvas keeps receiving moves whatever is underneath and this passes
  // with or without the fix. WebKit does not do that for pointer events: the
  // pointer crossing onto the button cancels the canvas gesture, and because
  // Playwright walks a stepped move in a couple of milliseconds the cancel
  // lands before the first animation frame, so Yamal never moves at all. That
  // is exactly how the WebKit leg first went red, reporting a flat 0.0px.
  // Run it with ENGINE=webkit to actually exercise this.
  await page.evaluate(() => { kickoff(true); });
  await page.waitForTimeout(200);
  const overBtn = await page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? (e.id || e.tagName) : 'null';
  }, [box.x + box.width * 0.85, box.y + box.height * 0.8]);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8, { steps: 14 });
  // read while the button is still held: the claim is that steering continues
  // during the drag, not that it recovers after the finger lifts
  const btnDrag = await travelled(80);
  const duringBtn = await page.evaluate(() => ({ gf: M.gf, phase: M.phase }));
  await page.mouse.up();
  const movedOverBtn = btnDrag.moved;

  // shooting from a real tap on the button
  await page.evaluate(() => { M.x = 1700; M.y = 320; M.tx = 1980; M.ty = 250; });
  await page.waitForTimeout(200);
  await page.click('#shootbtn');
  await page.waitForTimeout(120);
  const shotState = await page.evaluate(() => ({ phase: M.phase, vx: Math.round(M.ball.vx) }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot('6-shot.png') });

  // --- the match clock must not run while the game is not running.
  // Wall clock timing meant a backgrounded iPad finished the match by itself:
  // the physics are fixed step, so play stops while game time keeps going, and
  // a kid called away to dinner came back to a 0-0 draw and a penalty shootout.
  // Two things are checked: the clock only advances when frames advance, and
  // losing visibility pauses the match rather than letting it run on.
  await page.evaluate(() => { closePop(); startMatch(0); });
  await page.waitForTimeout(400);
  const clockBefore = await page.evaluate(() => M.elapsed);
  // stall for well over a second WITHOUT the page ever stepping a frame
  await page.evaluate(() => { M.running = false; });
  await page.waitForTimeout(1500);
  const clockAfterStall = await page.evaluate(() => {
    const e = M.elapsed;
    M.running = true; M.last = 0; loop();
    return e;
  });
  /* Wait for the clock to move rather than sampling it after a fixed delay.
     What is being proven here is liveness - frames resumed, so the clock
     resumed - and not a frame rate. Headless WebKit throttles rAF hard when
     nothing forces a paint, so a fixed 400ms window caught only +0.11s and
     failed a game that was working perfectly. Same reason travelled() polls
     instead of sleeping. */
  const clockAfterResume = await (async () => {
    const want = clockAfterStall + 0.15;
    try {
      await page.waitForFunction(e => M.elapsed >= e, want, { timeout: 8000, polling: 60 });
    } catch (err) { /* fall through and report whatever the clock reached */ }
    return page.evaluate(() => M.elapsed);
  })();

  // and a single huge frame delta must cost at most one clamped tick
  const jump = await page.evaluate(() => {
    const before = M.elapsed;
    M.last = (window.performance && performance.now ? performance.now() : Date.now()) - 120000;
    step();
    return M.elapsed - before;
  });

  // hiding the page pauses the match and shows the resume card
  const paused = await page.evaluate(() => {
    pauseMatch();
    return { flag: M.paused, overlay: document.getElementById('pausewrap').classList.contains('on') };
  });
  const pausedHeld = await page.evaluate(() => new Promise(res => {
    const e0 = M.elapsed, x0 = M.x;
    M.tx = M.x + 400; M.ty = M.y;
    setTimeout(() => res({ clockMoved: M.elapsed - e0, yamalMoved: M.x - x0 }), 700);
  }));
  const resumed = await page.evaluate(() => {
    resumeMatch();
    return { flag: M.paused, overlay: document.getElementById('pausewrap').classList.contains('on') };
  });
  await page.evaluate(() => { M.tx = null; M.ty = null; endMatch(); });

  // --- the save survives a reload
  await page.evaluate(() => { endMatch(); go('home'); });
  await page.reload();
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => ({ round: S.round, boots: S.boots, cups: S.cups, results: S.results.length }));

  // --- portrait iPad is still playable; a phone gets the rotate prompt
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(350);
  const portraitRotate = await page.evaluate(() => document.getElementById('rotate').classList.contains('on'));
  await page.screenshot({ path: shot('7-portrait-ipad.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const phoneRotate = await page.evaluate(() => document.getElementById('rotate').classList.contains('on'));
  await page.screenshot({ path: shot('8-phone-rotate.png') });

  await browser.close();
  await SITE.close();

  const fails = [];
  if (rungs.rungs !== 6) fails.push('expected the 6 qualifying rungs, got ' + rungs.rungs);
  if (rungs.phases !== 3) fails.push('the campaign phase strip is missing: ' + rungs.phases);
  if (rungs.table < 5) fails.push('the qualifying table is missing: ' + rungs.table + ' rows');
  if (rungs.won !== 1) fails.push('expected 1 won rung, got ' + rungs.won);
  if (rungs.drew !== 1) fails.push('expected 1 drawn rung, got ' + rungs.drew);
  if (rungs.locked < 2) fails.push('expected the later qualifiers locked, got ' + rungs.locked);
  if (penUi.zones !== 6) fails.push('expected 6 penalty zones, got ' + penUi.zones);
  if (!penUi.keeper) fails.push('the penalty keeper was not drawn');
  if (penUi.dots !== 5) fails.push('expected 5 penalty dots, got ' + penUi.dots);
  if (loopAlive < 40) {
    fails.push('the match loop is not advancing: steering with no pointer at all moved Yamal ' +
      loopAlive.toFixed(1) + 'px. Everything below this is a consequence, not a cause.');
  }
  if (moved < 40) fails.push('a real drag moved Yamal only ' + moved.toFixed(1) + 'px: stageXY is wrong');
  if (!wentRight || !wentDown) fails.push('Yamal did not follow the drag direction (right=' + wentRight + ' down=' + wentDown + ')');
  if (overBtn !== 'shootbtn') {
    fails.push('the drag-over-button test is no longer dragging over the button, it hits "' +
      overBtn + '". Move the endpoint back onto SHOOT or the check proves nothing.');
  }
  if (movedOverBtn < 40) {
    fails.push('steering died when the finger crossed the SHOOT button (moved ' +
      movedOverBtn.toFixed(1) + 'px): the canvas is not holding pointer capture');
  }
  if (duringBtn.phase === 'shot' || duringBtn.gf > 0) {
    fails.push('dragging across SHOOT fired a shot; it should only fire on a real tap');
  }
  if (shotState.phase !== 'shot' || shotState.vx < 8) fails.push('the SHOOT button did not launch the ball: ' + JSON.stringify(shotState));
  if (saved.round !== 2 || saved.boots !== 17 || saved.cups !== 1 || saved.results !== 2) {
    fails.push('the save did not survive a reload: ' + JSON.stringify(saved));
  }
  if (clockAfterStall - clockBefore > 0.25) {
    fails.push('the match clock ran while no frames were drawn: +' +
      (clockAfterStall - clockBefore).toFixed(2) + 's over a 1.5s stall');
  }
  if (clockAfterResume - clockAfterStall < 0.15) {
    fails.push('the clock did not advance once frames resumed: +' +
      (clockAfterResume - clockAfterStall).toFixed(2) + 's');
  }
  if (jump > 0.06) fails.push('a 120s frame gap added ' + jump.toFixed(2) + 's of match time; it must be clamped');
  if (!paused.flag || !paused.overlay) fails.push('hiding the page did not pause the match: ' + JSON.stringify(paused));
  if (pausedHeld.clockMoved > 0.05) fails.push('the clock ran while paused: +' + pausedHeld.clockMoved.toFixed(2) + 's');
  if (Math.abs(pausedHeld.yamalMoved) > 1) fails.push('Yamal moved while paused: ' + pausedHeld.yamalMoved.toFixed(1) + 'px');
  if (resumed.flag || resumed.overlay) fails.push('tapping the card did not resume: ' + JSON.stringify(resumed));
  if (portraitRotate) fails.push('a portrait iPad should NOT get the rotate prompt');
  if (!phoneRotate) fails.push('a portrait phone SHOULD get the rotate prompt');

  console.log('ladder  ', JSON.stringify(rungs));
  console.log('pens ui ', JSON.stringify(penUi));
  console.log('loop    ', loopAlive.toFixed(1) + 'px with no pointer');
  console.log('clock   ', 'stall +' + (clockAfterStall - clockBefore).toFixed(2) + 's, resume +' +
    (clockAfterResume - clockAfterStall).toFixed(2) + 's, 120s gap +' + jump.toFixed(2) + 's');
  console.log('pause   ', JSON.stringify(paused) + ' held ' + JSON.stringify(pausedHeld) + ' -> ' + JSON.stringify(resumed));
  console.log('drag    ', moved.toFixed(1) + 'px, cam ' + after.cam.toFixed(0));
  console.log('over btn', movedOverBtn.toFixed(1) + 'px while crossing ' + overBtn);
  console.log('shot    ', JSON.stringify(shotState));
  console.log('reloaded', JSON.stringify(saved));
  console.log('errors  ', errs.length ? errs.join('\n') : 'NONE');

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')  target=' + SITE.target);
})();

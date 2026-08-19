/* The floating stick, driven with a real mouse.

   Brian played the game and said his hand was in the way and he could not see
   what he was shooting at. That was structural, not a tuning problem: the old
   scheme set Yamal's target TO the finger position, so the finger sat on the
   exact spot he was running at, which attacking rightward is the goalmouth.

   So the thing this suite really guards is that the control surface and the
   play surface are separate. The stick stays where the thumb landed; Yamal
   goes somewhere else.

   And the skill that came with it: how far you push sets both his speed and
   how far the ball sits from his feet, and a defender reaches for the ball. */
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
  await page.evaluate(() => { S.warm.on = false; S.stickSeen = false; persist(); });

  const start = async () => {
    await page.evaluate(() => { if (M) endMatch(); startMatch(0); });
    await page.waitForFunction(() => M && M.running, null, { timeout: 8000, polling: 60 });
    await page.waitForTimeout(400);
  };
  /* Wait for movement rather than sleeping. Headless WebKit throttles rAF hard
     when nothing forces a paint, so a fixed delay measures the frame rate. */
  const travelled = async (dist, timeout = 8000) => {
    const from = await page.evaluate(() => ({ x: M.x, y: M.y }));
    try {
      await page.waitForFunction(
        f => Math.hypot(M.x - f.x, M.y - f.y) >= f.d,
        { x: from.x, y: from.y, d: dist }, { timeout, polling: 60 });
    } catch (e) { /* report whatever distance was reached */ }
    const to = await page.evaluate(() => ({ x: M.x, y: M.y }));
    return { from, to, moved: Math.hypot(to.x - from.x, to.y - from.y) };
  };

  await start();
  const box = await page.locator('#pitch').boundingBox();
  const sx = box.x + box.width * 0.16, sy = box.y + box.height * 0.78;
  await page.screenshot({ path: shot('21-stick-hint.png') });
  const hintBefore = await page.evaluate(() => S.stickSeen);

  // --- 1. a drag in the bottom left corner moves Yamal, who is nowhere near it
  const before = await page.evaluate(() => ({ x: M.x, y: M.y }));
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 120, sy - 44, { steps: 8 });
  const run = await travelled(90);
  const full = await page.evaluate(() => ({
    push: M.push, mag: M.stick.mag,
    reach: Math.hypot(M.ball.x - M.x, M.ball.y - M.y),
    ox: M.stick.ox, oy: M.stick.oy
  }));
  await page.screenshot({ path: shot('22-stick-sprint.png') });

  // the stick origin must NOT have chased Yamal across the pitch
  const originStayed = Math.abs(full.ox - (120 * (960 / box.width) + (sx - box.x) * (960 / box.width) - 120 * (960 / box.width))) >= 0;
  const yamalFarFromThumb = Math.hypot(
    (full.ox) - (run.to.x - (await page.evaluate(() => M.cam))),
    (full.oy) - run.to.y);

  // --- 2. easing off gives close control: slower, ball tucked in
  await page.mouse.move(sx + 20, sy - 7, { steps: 6 });
  await page.waitForTimeout(400);
  const easy = await page.evaluate(() => ({
    push: M.push, mag: M.stick.mag,
    reach: Math.hypot(M.ball.x - M.x, M.ball.y - M.y)
  }));
  await page.screenshot({ path: shot('23-stick-close.png') });

  // --- 3. inside the dead zone he does not move at all
  await page.mouse.move(sx + 3, sy + 2, { steps: 3 });
  await page.waitForTimeout(320);
  const dead = await page.evaluate(() => new Promise(res => {
    const x0 = M.x, y0 = M.y;
    setTimeout(() => res({ push: M.push, moved: Math.hypot(M.x - x0, M.y - y0) }), 420);
  }));

  // --- 4. letting go stops him and clears the stick
  await page.mouse.up();
  await page.waitForTimeout(300);
  const up = await page.evaluate(() => new Promise(res => {
    const x0 = M.x, y0 = M.y;
    setTimeout(() => res({ stick: M.stick, push: M.push, drift: Math.hypot(M.x - x0, M.y - y0) }), 420);
  }));

  // --- 5. aim survives letting go, so he can stop and then shoot
  const aimHeld = await page.evaluate(() => ({ aimx: M.aimx, aimy: M.aimy }));

  // --- 6. the stick starts wherever the finger lands, not in a fixed spot
  const tx = box.x + box.width * 0.62, ty = box.y + box.height * 0.35;
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx + 60, ty + 30, { steps: 5 });
  await page.waitForTimeout(260);
  const elsewhere = await page.evaluate(() => ({ ox: M.stick.ox, oy: M.stick.oy, mag: M.stick.mag }));
  await page.mouse.up();

  // --- 7. the ball being further out is what a defender reaches for
  // Sweep every distance a defender could stand at and find the band where
  // walking keeps the ball and sprinting loses it. Asserting that band is
  // non-empty is the real property; picking one probe distance by hand just
  // tests my arithmetic, and the first version of this got that arithmetic
  // wrong and reported the game broken.
  const reachRule = await page.evaluate(() => {
    const near = BALL_NEAR, far = BALL_FAR, safe = [];
    for (let d = 0; d <= 160; d++) {
      // "walking" here is a real cruising push, not a crawl: if close control
      // only works at a dead stop it is not a control, it is a punishment.
      const cruise = near + (far - near) * 0.45 * 0.45;
      const walkTakes = Math.abs(d - cruise) < TACKLE_DIST;
      const sprintTakes = Math.abs(d - far) < TACKLE_DIST;
      if (!walkTakes && sprintTakes) safe.push(d);
    }
    return {
      near: near, far: far, tackle: TACKLE_DIST,
      band: safe.length ? [safe[0], safe[safe.length - 1]] : null,
      width: safe.length
    };
  });

  // --- 8. the hint disappears once he has used it, and stays gone
  const hintAfter = await page.evaluate(() => S.stickSeen);
  await page.reload();
  await page.waitForTimeout(500);
  const hintPersisted = await page.evaluate(() => S.stickSeen);

  await browser.close();
  await SITE.close();

  const fails = [];
  if (hintBefore) fails.push('the DRAG HERE hint was already dismissed before he touched anything');
  if (run.moved < 90) fails.push('a drag in the corner did not move Yamal: ' + run.moved.toFixed(0) + 'px');
  if (run.to.x <= run.from.x) fails.push('Yamal did not follow the drag direction in x: ' + JSON.stringify(run));
  if (run.to.y >= run.from.y) fails.push('Yamal did not follow the drag direction in y: ' + JSON.stringify(run));
  if (yamalFarFromThumb < 150) {
    fails.push('Yamal ended up under the thumb (' + yamalFarFromThumb.toFixed(0) +
      'px away); the whole point is that the hand is not on the play');
  }
  if (full.mag < 0.95) fails.push('a long drag did not reach full push: ' + full.mag.toFixed(2));
  if (Math.abs(full.reach - 48) > 1.5) fails.push('the ball is not pushed out at a sprint: ' + full.reach.toFixed(1));
  if (easy.push >= full.push - 0.3) {
    fails.push('easing off did not slow him down: ' + easy.push.toFixed(2) + ' vs ' + full.push.toFixed(2));
  }
  if (easy.reach >= full.reach - 6) {
    fails.push('easing off did not pull the ball in: ' + easy.reach.toFixed(1) + ' vs ' + full.reach.toFixed(1));
  }
  if (dead.push !== 0 || dead.moved > 1) fails.push('he moved inside the dead zone: ' + JSON.stringify(dead));
  if (up.stick !== null) fails.push('letting go did not clear the stick');
  if (up.push !== 0 || up.drift > 1) fails.push('he kept running after the finger lifted: ' + JSON.stringify(up));
  if (Math.abs(Math.hypot(aimHeld.aimx, aimHeld.aimy) - 1) > 0.01) {
    fails.push('aim was lost when the finger lifted: ' + JSON.stringify(aimHeld));
  }
  if (elsewhere.mag < 0.2) fails.push('a stick started away from the corner did not register: ' + JSON.stringify(elsewhere));
  if (Math.abs(elsewhere.ox - 595) > 90) {
    fails.push('the stick did not start where the finger landed: ox=' + elsewhere.ox.toFixed(0));
  }
  if (!reachRule.band || reachRule.width < 20) {
    fails.push('there is no useful range where slowing down keeps the ball and sprinting loses it, ' +
      'so close control buys nothing: ' + JSON.stringify(reachRule));
  }
  if (!hintAfter) fails.push('the hint was not dismissed after using the stick');
  if (!hintPersisted) fails.push('the dismissed hint came back after a reload');

  console.log('hint      before=' + hintBefore + ' after=' + hintAfter + ' reload=' + hintPersisted);
  console.log('sprint    push=' + full.push.toFixed(2) + ' ball ' + full.reach.toFixed(1) + 'px from his feet');
  console.log('close     push=' + easy.push.toFixed(2) + ' ball ' + easy.reach.toFixed(1) + 'px from his feet');
  console.log('moved     ' + run.moved.toFixed(0) + 'px, thumb ' + yamalFarFromThumb.toFixed(0) + 'px away from him');
  console.log('dead zone ' + JSON.stringify(dead));
  console.log('released  ' + JSON.stringify(up));
  console.log('floating  ' + JSON.stringify(elsewhere));
  console.log('reach     ball ' + reachRule.near + 'px walking, ' + reachRule.far + 'px sprinting; ' +
    'slowing down saves it from a defender ' + (reachRule.band ? reachRule.band[0] + '-' + reachRule.band[1] : 'never') +
    'px away (' + reachRule.width + 'px wide)');
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

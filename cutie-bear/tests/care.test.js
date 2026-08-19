const { launch, site, engineName } = require('./harness');
const path = require('path');

const shot = n => path.resolve(__dirname, 'shots', n);

(async () => {
  const b = await launch();
  const SITE = await site();
  const ctx = await b.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.goto(SITE.url);
  await p.waitForTimeout(500);

  // board coords -> screen coords (the stage is CSS-scaled)
  const geo = await p.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { left: r.left, top: r.top, sc: r.width / 960 };
  });
  const S = (bx, by) => [geo.left + bx * geo.sc, geo.top + by * geo.sc];
  const drag = async (from, to, steps = 14) => {
    await p.mouse.move(...S(...from)); await p.mouse.down();
    for (let i = 1; i <= steps; i++)
      await p.mouse.move(...S(from[0] + (to[0]-from[0]) * i/steps, from[1] + (to[1]-from[1]) * i/steps));
    await p.mouse.up();
  };
  const tap = async (bx, by) => { await p.mouse.move(...S(bx, by)); await p.mouse.down(); await p.mouse.up(); };
  // properly finish an activity: click the popup button so closeCare() runs
  const finish = async () => {
    await p.waitForTimeout(300);
    const on = await p.evaluate(() => document.getElementById('pop').classList.contains('on'));
    if (on) { await p.click('#popb'); await p.waitForTimeout(400); }
    await p.evaluate(() => { document.getElementById('pop').classList.remove('on'); if (careMode) closeCare(); });
    await p.waitForTimeout(250);
  };
  // fire a pointerdown straight at a moving element, so aim is not what is under test
  const hit = async (sel) => p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    return true;
  }, sel);
  const care = k => p.evaluate(k => S.care[k], k);

  const out = {};

  // ---------- SNACK ----------
  await p.evaluate(() => { S.care.food = 20; persist(); go('care'); openCare('snack'); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot('c1-snack.png') });
  for (let i = 0; i < 3; i++) {
    const f = await p.evaluate(() => {
      const el = document.querySelector('.cs-food');
      return el ? [parseFloat(el.style.left) + 41, parseFloat(el.style.top) + 41] : null;
    });
    if (!f) break;
    await drag(f, [340, 340]);
    await p.waitForTimeout(950);
  }
  await p.waitForTimeout(900);
  out.snack = { food: await care('food'), popped: await p.evaluate(() => document.getElementById('pop').classList.contains('on')) };
  await finish();

  // ---------- BATH ----------
  await p.evaluate(() => { S.care.clean = 20; persist(); openCare('bath'); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot('c2-bath.png') });
  await tap(850, 340);                       // shampoo bottle
  await p.waitForTimeout(400);
  out.bathSpots = await p.evaluate(() => document.querySelectorAll('.cs-dirt').length);
  for (let pass = 0; pass < 8; pass++) {
    const spots = await p.evaluate(() =>
      [...document.querySelectorAll('.cs-dirt')].map(e => [parseFloat(e.style.left) + 32, parseFloat(e.style.top) + 32]));
    if (!spots.length) break;
    await p.mouse.move(...S(...spots[0])); await p.mouse.down();
    for (const s of spots) { await p.mouse.move(...S(...s)); await p.waitForTimeout(140); }
    await p.mouse.up();
    await p.waitForTimeout(160);
  }
  await p.waitForTimeout(1100);
  await p.screenshot({ path: shot('c2b-bath-clean.png') });
  out.bath = { clean: await care('clean'), left: await p.evaluate(() => document.querySelectorAll('.cs-dirt').length) };
  await finish();

  // ---------- BEDTIME ----------
  await p.evaluate(() => { S.care.energy = 20; persist(); openCare('bed'); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot('c3-bed.png') });
  await drag([480, 660], [480, 440], 18);            // pull the blanket up
  await p.waitForTimeout(900);
  out.bedStep1 = await p.evaluate(() => !!document.querySelector('.cs-back') && parseFloat(document.querySelectorAll('#carestage > div')[3]?.style.top || 999));
  for (let i = 0; i < 4; i++) { await tap(740, 300); await p.waitForTimeout(450); }   // turn pages
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot('c3b-bed-story.png') });
  await tap(875, 330);                               // lamp
  await p.waitForTimeout(2800);
  await p.screenshot({ path: shot('c3c-bed-dark.png') });
  out.bed = { energy: await care('energy') };
  await finish();

  // ---------- PLAY: all four ----------
  const playRuns = {};

  // tickle
  await p.evaluate(() => { S.care.fun = 10; persist(); openCare('play'); playTickle(careStage()); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: shot('c4-tickle.png') });
  await p.mouse.move(...S(490, 430)); await p.mouse.down();
  for (let i = 0; i < 60; i++) await p.mouse.move(...S(430 + (i % 2) * 120, 400 + ((i >> 1) % 2) * 60));
  await p.mouse.up();
  await p.waitForTimeout(1100);
  playRuns.tickle = await care('fun');
  await finish();

  // ball
  await p.evaluate(() => { S.care.fun = 10; persist(); openCare('play'); playBall(careStage()); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: shot('c5-ball.png') });
  for (let i = 0; i < 10; i++) {
    if (!await hit('#playball')) break;
    await p.waitForTimeout(230);
  }
  await p.waitForTimeout(1000);
  playRuns.ball = await care('fun');
  await finish();

  // peekaboo
  await p.evaluate(() => { S.care.fun = 10; persist(); openCare('play'); playPeek(careStage()); });
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(220); await tap(480, 560); }
  await p.waitForTimeout(900);
  await p.screenshot({ path: shot('c6-peek.png') });
  playRuns.peek = await care('fun');
  await finish();

  // bubbles
  await p.evaluate(() => { S.care.fun = 10; persist(); openCare('play'); playBubbles(careStage()); });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: shot('c7-bubbles.png') });
  for (let i = 0; i < 40; i++) {
    if (!await hit('.cs-pop')) { await p.waitForTimeout(300); continue; }
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(1200);
  playRuns.bubbles = await care('fun');
  out.play = playRuns;

  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs.length ? errs.join('\n') : 'NONE');
  await b.close();
  await SITE.close();
  if (errs.length) {
    console.error('\n' + errs.length + ' page error(s) on ' + engineName() + ' - failing.');
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')  target=' + SITE.target);
})();

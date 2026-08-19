const { launch, site, engineName } = require('./harness');
const path = require('path');

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(500);

  // --- STAR STEPS: a simple bot jumps when the ground ahead runs out ---
  await page.evaluate(() => { S.rooms.steps = true; S.rooms.photo = true; persist(); go('steps'); });
  await page.click('#stepsgo');
  const survived = await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (!steps.on) { clearInterval(iv); return res({ ended: true, dist: steps.dist, secs: (performance.now() - t0) / 1000 }); }
      if (performance.now() - t0 > 25000) { clearInterval(iv); return res({ ended: false, dist: steps.dist, secs: 25 }); }
      // is there ground under the spot we will be at in ~30 frames?
      const px = 180, ahead = px + 110;
      const grounded = steps.plats.some(p => {
        const sx = p.x - steps.x;
        return ahead > sx && ahead < sx + p.w && Math.abs(steps.y - p.y) < 130;
      });
      if (!grounded && steps.vy >= -1) stepsJump();
    }, 40);
  }));

  // --- TREAT CHASE: a bot chases the lowest treat ---
  await page.evaluate(() => { document.getElementById('pop').classList.remove('on'); go('chase'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
  await page.click('#chasego');
  const caught = await page.evaluate(() => new Promise(res => {
    const iv = setInterval(() => {
      if (!chase.on) { clearInterval(iv); return res({ score: chase.score }); }
      let best = null;
      chase.items.forEach(i => { if (!best || i.y > best.y) best = i; });
      if (best) chase.targetX = Math.max(75, Math.min(745, best.x + 33));
    }, 30);
  }));

  // --- STAR SONG: a bot plays 4 perfect rounds ---
  await page.evaluate(() => { document.getElementById('pop').classList.remove('on'); go('song'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
  await page.click('#songgo');
  const song = await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    let busy = false;
    const iv = setInterval(() => {
      if (performance.now() - t0 > 40000 || window.song.level > 4) {
        clearInterval(iv); return res({ level: window.song.level, stars: S.stars });
      }
      if (busy || !window.song.accept) return;
      busy = true;
      const seq = window.song.seq.slice();
      let i = 0;
      const step = () => {
        if (i >= seq.length) { busy = false; return; }
        songTap(seq[i]); i++; setTimeout(step, 150);
      };
      step();
    }, 120);
  }));

  console.log('steps  ', JSON.stringify(survived));
  console.log('chase  ', JSON.stringify(caught));
  console.log('song   ', JSON.stringify(song));
  console.log('errors ', errs.length ? errs.join('\n') : 'NONE');
  await browser.close();
  await SITE.close();
  if (errs.length) {
    console.error('\n' + errs.length + ' page error(s) on ' + engineName() + ' - failing.');
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')  target=' + SITE.target);
})();

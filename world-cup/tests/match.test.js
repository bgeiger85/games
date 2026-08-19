/* A bot plays a real Group Match, start to finish, at the real clock length.

   The point is not that the code runs. The point is that a six year old can
   win. See tests/bot.js for what the bot does and why it is deliberately dim.

   If it cannot beat Japan, round one is too hard and the round is wrong, not
   the player. */
const { launch, site, engineName } = require('./harness');
const { BOT_SOURCE } = require('./bot');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(500);

  await page.evaluate(() => startMatch(0));
  await page.waitForTimeout(300);
  const r = await page.evaluate(BOT_SOURCE);
  await page.screenshot({ path: path.join(shotDir, '9-match-fulltime.png') });

  // the score is recorded and the ladder advanced
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => ({ round: S.round, goals: S.goals, boots: S.boots, popup: document.getElementById('pop').classList.contains('on') }));

  // losing the ball and winning it back both work: force a tackle and watch
  await page.evaluate(() => { closePop(); startMatch(0); });
  await page.waitForTimeout(400);
  const possession = await page.evaluate(() => new Promise(done => {
    // park a defender on top of him
    M.grace = 0;
    M.defs[0].x = M.x + 10; M.defs[0].y = M.y; M.defs[0].stun = 0;
    setTimeout(() => {
      const lost = M.phase;
      // now chase the carrier down
      const iv = setInterval(() => {
        if (!M) { clearInterval(iv); return done({ lost, regained: 'gone' }); }
        if (M.carrier) { M.tx = M.carrier.x; M.ty = M.carrier.y; }
        if (M.phase === 'us') { clearInterval(iv); done({ lost, regained: 'us' }); }
      }, 30);
      setTimeout(() => { clearInterval(iv); done({ lost, regained: M ? M.phase : 'gone' }); }, 6000);
    }, 260);
  }));
  await page.evaluate(() => { endMatch(); });

  await browser.close();
  await SITE.close();

  const fails = [];
  if (r.err) fails.push(r.err);
  if (!r.gf || r.gf < 1) fails.push('the bot scored ' + r.gf + ' goals in a Group Match. Round 1 is too hard.');
  if (r.gf <= r.ga) fails.push('the bot did not win: ' + r.gf + ' - ' + r.ga);
  if (after.round !== 1) fails.push('the ladder did not advance, S.round=' + after.round);
  if (after.goals < r.gf) fails.push('career goals did not record the match goals');
  if (!after.popup) fails.push('no full time popup appeared');
  if (possession.lost !== 'them') fails.push('a defender standing on Yamal did not win the ball: ' + possession.lost);
  if (possession.regained !== 'us') fails.push('chasing the carrier did not win the ball back: ' + possession.regained);

  console.log('full time  Spain ' + r.gf + ' - ' + r.ga + ' Japan, from ' + r.shots + ' shots');
  console.log('after      ' + JSON.stringify(after));
  console.log('possession ' + JSON.stringify(possession));
  console.log('errors     ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

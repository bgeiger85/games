/* The warm-up, played with real taps.

   What actually needs proving here is not that the questions are right. It is
   the promise made to a six year old: that doing the drill earns the match and
   that nothing he answers can ever shut him out of his own game. So the
   centrepiece below is a warm-up answered ENTIRELY WRONG on the first tap of
   every question, which still has to reach the pitch.

   The rest guards the rules in section Jb of src/index.html:
     - a wrong tap never skips the question, it ends on the right answer
     - a loss does not re-charge the toll
     - a round already won is free to replay
     - the grown-ups switch really does turn it off
     - a perfect run puts a gold ball on the pitch */
const { launch, site, engineName } = require('./harness');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const shot = n => path.join(shotDir, n);

/* The buttons carry their own text in data-ans, so the bot can answer without
   knowing anything about how a question is laid out. */
const RIGHT = () => String(WU.item.ans);
const WRONG = () => {
  const b = [...document.querySelectorAll('#qrow .ans')]
    .find(x => x.getAttribute('data-ans') !== String(WU.item.ans));
  return b ? b.getAttribute('data-ans') : null;
};

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(400);

  /* Answers the current question. missFirst taps a wrong button first, then
     the right one, which is the path a struggling reader takes. Returns
     nothing: the caller reads state off WU and S. */
  async function answer(missFirst) {
    await page.waitForFunction(() => WU && WU.item && !WU.locked &&
      document.querySelectorAll('#qrow .ans').length === 3, null, { timeout: 8000, polling: 60 });
    if (missFirst) {
      const w = await page.evaluate(WRONG);
      await page.click(`#qrow .ans[data-ans="${w}"]`);
      await page.waitForTimeout(120);
    }
    const r = await page.evaluate(RIGHT);
    await page.click(`#qrow .ans[data-ans="${r}"]`);
  }

  /* Plays a whole warm-up. missEvery makes every single question a miss. */
  async function playWarmUp(missEvery) {
    const n = await page.evaluate(() => WU.items.length);
    for (let i = 0; i < n; i++) await answer(missEvery);
    await page.waitForFunction(() => document.getElementById('pop').classList.contains('on'),
      null, { timeout: 8000, polling: 60 });
    return n;
  }

  // --- 1. the ladder asks for a warm-up instead of kicking off
  await page.click('#btncup');
  await page.waitForTimeout(300);
  const ladderBtn = await page.evaluate(() => document.querySelector('#ladder .btn.gold').textContent.trim());
  await page.click('#ladder .btn.gold');
  await page.waitForTimeout(300);
  const onWarm = await page.evaluate(() => ({ screen: current, drills: document.querySelectorAll('.drill').length }));
  await page.screenshot({ path: shot('12-warmup-pick.png') });

  // --- 2. a WORDS drill, getting every question wrong on the first tap
  // This is the one that matters. He can answer nothing correctly and still play.
  await page.click('#drillword');
  await page.waitForTimeout(300);
  const wordLook = await page.evaluate(() => ({
    kind: WU.item.kind,
    blank: !!document.querySelector('.qsent u'),
    opts: document.querySelectorAll('#qrow .ans').length,
    n: WU.items.length
  }));
  await page.screenshot({ path: shot('13-warmup-word.png') });

  // tap a wrong one and look at what happens before moving on
  const w0 = await page.evaluate(WRONG);
  await page.click(`#qrow .ans[data-ans="${w0}"]`);
  await page.waitForTimeout(200);
  const afterWrong = await page.evaluate(() => ({
    gone: document.querySelectorAll('#qrow .ans.gone').length,
    showing: document.querySelectorAll('#qrow .ans.show').length,
    showIsRight: (document.querySelector('#qrow .ans.show') || {}).getAttribute
      ? document.querySelector('#qrow .ans.show').getAttribute('data-ans') === String(WU.item.ans) : false,
    at: WU.at,               // must NOT have advanced past a wrong answer
    hint: document.getElementById('warmhint').textContent
  }));
  await page.screenshot({ path: shot('14-warmup-wrong.png') });

  const r0 = await page.evaluate(RIGHT);
  await page.click(`#qrow .ans[data-ans="${r0}"]`);
  const nWrong = await page.evaluate(() => WU.items.length);
  for (let i = 1; i < nWrong; i++) await answer(true);
  await page.waitForFunction(() => document.getElementById('pop').classList.contains('on'),
    null, { timeout: 8000, polling: 60 });

  const allWrong = await page.evaluate(() => ({
    title: document.getElementById('poptitle').textContent,
    ready: S.warm.ready,
    gold: S.warm.gold,
    done: S.warm.done,
    boots: S.boots,
    wrong: S.warm.wrong
  }));
  await page.click('#poprow .btn');
  await page.waitForTimeout(400);
  const reachedPitch = await page.evaluate(() => ({ screen: current, gold: M ? M.gold : null }));

  // --- 3. losing does not ask him to do it again.
  //
  // This has to be tested on a KNOCKOUT. Qualifying and the group are decided
  // on points, so losing one of those advances the campaign to a genuinely new
  // match, and a new match legitimately gets its own warm-up. The rule being
  // guarded is narrower than it used to be and worth stating precisely: when
  // he REPLAYS the same match, he does not pay again.
  await page.evaluate(() => { if (M) endMatch(); });
  await page.evaluate(() => {
    S.round = 10;                      // Round of 16
    S.results = []; for (var i = 0; i < 10; i++) S.results[i] = { gf: 2, ga: 0 };
    S.warm.ready = 10; S.warm.gold = false; persist();
    startMatch(10);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { M.gf = 0; M.ga = 1; M.elapsed = M.r.secs; });
  await page.waitForTimeout(1200);
  const lostPop = await page.evaluate(() => document.getElementById('poptitle').textContent);
  await page.evaluate(() => { closePop(); go('cup'); });
  await page.waitForTimeout(300);
  const afterLoss = await page.evaluate(() => ({
    round: S.round,
    ready: S.warm.ready,
    needs: needsWarmUp(S.round),
    label: document.querySelector('#ladder .btn.gold').textContent.trim()
  }));
  await page.click('#ladder .btn.gold');
  await page.waitForTimeout(500);
  const replay = await page.evaluate(() => current);

  // --- 4. winning spends the unlock, so the next round asks again
  await page.evaluate(() => { M.gf = 3; M.ga = 0; M.elapsed = M.r.secs; });
  await page.waitForTimeout(1400);
  const afterWin = await page.evaluate(() => ({
    round: S.round, ready: S.warm.ready, gold: S.warm.gold, needs: needsWarmUp(S.round)
  }));
  await page.evaluate(() => { closePop(); go('cup'); });
  await page.waitForTimeout(300);

  // --- 5. a round already won is free to replay, no warm-up
  const replayWon = await page.evaluate(() => {
    const before = current;
    kickOff(0);                        // a qualifier he won long ago
    return { before, after: current, needs: needsWarmUp(0) };
  });
  await page.evaluate(() => { endMatch(); go('cup'); });
  await page.waitForTimeout(200);

  // --- 6. a perfect NUMBERS drill earns the gold ball
  await page.evaluate(() => { S.warm.ready = -1; S.warm.gold = false; persist(); });
  await page.evaluate(() => kickOff(S.round));
  await page.waitForTimeout(300);
  await page.click('#drillmath');
  await page.waitForTimeout(300);
  const mathLook = await page.evaluate(() => ({
    kind: WU.item.kind,
    sum: !!document.querySelector('.qsum'),
    balls: document.querySelectorAll('.qb').length,
    opts: [...document.querySelectorAll('#qrow .ans')].map(b => b.getAttribute('data-ans'))
  }));
  await page.screenshot({ path: shot('15-warmup-math.png') });
  const nPerfect = await playWarmUp(false);
  const perfect = await page.evaluate(() => ({
    title: document.getElementById('poptitle').textContent,
    gold: S.warm.gold,
    perfect: S.warm.perfect,
    ready: S.warm.ready
  }));
  await page.screenshot({ path: shot('16-warmup-perfect.png') });
  await page.click('#poprow .btn');
  await page.waitForTimeout(400);
  const goldMatch = await page.evaluate(() => ({ screen: current, gold: M ? M.gold : null }));
  // past the KICK OFF! toast, or the screenshot is of the toast and not the ball
  await page.waitForTimeout(1800);
  await page.screenshot({ path: shot('17-gold-ball.png') });
  await page.evaluate(() => { endMatch(); go('home'); });

  // --- 7. the grown-ups switch turns it off
  await page.evaluate(() => { S.warm.on = false; S.warm.ready = -1; persist(); go('cup'); });
  await page.waitForTimeout(300);
  const offLabel = await page.evaluate(() => document.querySelector('#ladder .btn.gold').textContent.trim());
  await page.click('#ladder .btn.gold');
  await page.waitForTimeout(400);
  const straightIn = await page.evaluate(() => current);
  await page.evaluate(() => { endMatch(); S.warm.on = true; persist(); go('grown'); });
  await page.waitForTimeout(300);
  const panel = await page.evaluate(() => ({
    screen: current,
    groups: document.querySelectorAll('#gwrap .gsec').length,
    selected: document.querySelectorAll('#gwrap .gopt.sel').length
  }));
  await page.screenshot({ path: shot('18-grown-ups.png') });

  // --- 8. what he got wrong is remembered across a reload
  const beforeReload = await page.evaluate(() => ({
    keys: Object.keys(S.warm.facts).length, right: S.warm.right, wrong: S.warm.wrong
  }));
  await page.reload();
  await page.waitForTimeout(500);
  const afterReload = await page.evaluate(() => ({
    keys: Object.keys(S.warm.facts).length, right: S.warm.right, wrong: S.warm.wrong
  }));

  // --- 9. a poisoned save must not lock him out or take the boot down
  const repaired = await page.evaluate(() => {
    localStorage.setItem('worldcup.save.v1', JSON.stringify({
      round: 1, warm: { on: 'yes', n: 99, ready: 44, mlev: 9, wlev: -3, facts: 'nope', right: -5 }
    }));
    load();
    var threw = null;
    try { kickOff(S.round); } catch (e) { threw = String(e); }
    return {
      threw: threw, screen: current, ready: S.warm.ready, n: S.warm.n,
      mlev: S.warm.mlev, wlev: S.warm.wlev, facts: typeof S.warm.facts, right: S.warm.right
    };
  });

  await browser.close();
  await SITE.close();

  const fails = [];
  if (!/warm up/i.test(ladderBtn)) fails.push('the ladder button did not offer a warm-up: "' + ladderBtn + '"');
  if (onWarm.screen !== 'warm') fails.push('kick off did not open the warm-up: ' + JSON.stringify(onWarm));
  if (onWarm.drills !== 2) fails.push('expected 2 drills to choose from, got ' + onWarm.drills);
  if (wordLook.kind !== 'word') fails.push('the words drill served a ' + wordLook.kind);
  if (!wordLook.blank) fails.push('the sentence had no blank in it');
  if (wordLook.opts !== 3) fails.push('expected 3 choices, got ' + wordLook.opts);

  if (afterWrong.gone !== 1) fails.push('a wrong tap did not fade that button out: ' + JSON.stringify(afterWrong));
  if (afterWrong.showing !== 1 || !afterWrong.showIsRight) {
    fails.push('a wrong tap did not point at the right answer: ' + JSON.stringify(afterWrong));
  }
  if (afterWrong.at !== 0) fails.push('a wrong answer skipped the question, at=' + afterWrong.at);
  if (!afterWrong.hint) fails.push('no hint after a wrong tap');

  // THE promise: every question wrong, and he still plays.
  if (allWrong.ready !== 0) fails.push('getting everything wrong did not unlock the match: ready=' + allWrong.ready);
  if (allWrong.gold) fails.push('a warm-up with wrong answers still awarded the gold ball');
  if (allWrong.done !== 1) fails.push('the warm-up was not counted: done=' + allWrong.done);
  if (allWrong.wrong < wordLook.n) fails.push('not every miss was recorded: ' + JSON.stringify(allWrong));
  if (allWrong.boots !== 0) fails.push('boots were awarded for answers he got wrong: ' + allWrong.boots);
  if (/perfect/i.test(allWrong.title)) fails.push('an all-wrong warm-up was called perfect');
  if (reachedPitch.screen !== 'match') {
    fails.push('HE WAS LOCKED OUT: every question wrong and the match never started: ' +
      JSON.stringify(reachedPitch));
  }
  if (reachedPitch.gold !== false) fails.push('an all-wrong warm-up put a gold ball on the pitch');

  if (!/good try/i.test(lostPop)) fails.push('losing did not show the kind popup: "' + lostPop + '"');
  if (afterLoss.round !== 10) fails.push('losing a knockout advanced the campaign: ' + JSON.stringify(afterLoss));
  if (afterLoss.ready !== 10 || afterLoss.needs) {
    fails.push('losing re-charged the warm-up toll: ' + JSON.stringify(afterLoss));
  }
  if (/warm up/i.test(afterLoss.label)) fails.push('the ladder asked him to warm up again after a loss');
  if (replay !== 'match') fails.push('replaying after a loss did not go straight to the match: ' + replay);

  if (afterWin.round !== 11) fails.push('winning did not advance the campaign: ' + JSON.stringify(afterWin));
  if (afterWin.ready !== -1 || afterWin.gold) fails.push('winning did not spend the unlock: ' + JSON.stringify(afterWin));
  if (!afterWin.needs) fails.push('the next round did not ask for its own warm-up');
  if (replayWon.after !== 'match' || replayWon.needs) {
    fails.push('a round already won asked for a warm-up: ' + JSON.stringify(replayWon));
  }

  if (mathLook.kind !== 'sum') fails.push('the numbers drill served a ' + mathLook.kind);
  if (!mathLook.sum) fails.push('no sum was drawn');
  if (mathLook.balls < 2) fails.push('level 1 did not draw balls to count: ' + mathLook.balls);
  if (new Set(mathLook.opts).size !== 3) fails.push('the number choices were not distinct: ' + JSON.stringify(mathLook.opts));
  if (mathLook.opts.some(o => Number(o) < 0)) fails.push('a negative number was offered: ' + JSON.stringify(mathLook.opts));
  if (!perfect.gold) fails.push('a perfect warm-up did not award the gold ball');
  if (perfect.perfect !== 1) fails.push('the perfect warm-up was not counted: ' + perfect.perfect);
  if (!/perfect/i.test(perfect.title)) fails.push('a perfect warm-up was not celebrated: "' + perfect.title + '"');
  if (goldMatch.gold !== true) fails.push('the gold ball did not reach the pitch: ' + JSON.stringify(goldMatch));

  if (/warm up/i.test(offLabel)) fails.push('warm-ups were off but the ladder still asked for one');
  if (straightIn !== 'match') fails.push('warm-ups off did not go straight to the match: ' + straightIn);
  if (panel.screen !== 'grown') fails.push('the grown-ups panel did not open');
  if (panel.groups < 5) fails.push('the grown-ups panel is missing sections: ' + panel.groups);
  if (panel.selected < 4) fails.push('the grown-ups panel showed no current settings: ' + panel.selected);

  if (afterReload.keys !== beforeReload.keys || afterReload.right !== beforeReload.right ||
      afterReload.wrong !== beforeReload.wrong) {
    fails.push('what he has learned did not survive a reload: ' +
      JSON.stringify(beforeReload) + ' -> ' + JSON.stringify(afterReload));
  }
  if (!beforeReload.keys) fails.push('nothing was recorded about which questions he saw');

  if (repaired.threw) fails.push('a poisoned save threw on kickOff: ' + repaired.threw);
  if (repaired.ready !== -1) fails.push('a poisoned save left a bogus unlock: ready=' + repaired.ready);
  if (repaired.n !== 5 || repaired.mlev !== 1 || repaired.wlev !== 1) {
    fails.push('a poisoned save left bogus settings: ' + JSON.stringify(repaired));
  }
  if (repaired.facts !== 'object') fails.push('a poisoned save left facts as a ' + repaired.facts);
  if (repaired.right !== 0) fails.push('a poisoned save left a negative count: ' + repaired.right);
  if (repaired.screen !== 'warm') fails.push('a repaired save did not reach the warm-up: ' + repaired.screen);

  console.log('ladder    ' + JSON.stringify(ladderBtn) + ' -> ' + JSON.stringify(onWarm));
  console.log('words     ' + JSON.stringify(wordLook));
  console.log('wrong tap ' + JSON.stringify(afterWrong));
  console.log('all wrong ' + JSON.stringify(allWrong) + ' -> ' + JSON.stringify(reachedPitch));
  console.log('lost      ' + JSON.stringify(afterLoss) + ' replay=' + replay);
  console.log('won       ' + JSON.stringify(afterWin) + ' replayWon=' + JSON.stringify(replayWon));
  console.log('numbers   ' + JSON.stringify(mathLook));
  console.log('perfect   ' + nPerfect + '/' + nPerfect + ' ' + JSON.stringify(perfect) +
    ' -> ' + JSON.stringify(goldMatch));
  console.log('switch    off="' + offLabel + '" -> ' + straightIn + ', panel ' + JSON.stringify(panel));
  console.log('memory    ' + JSON.stringify(beforeReload) + ' -> ' + JSON.stringify(afterReload));
  console.log('poisoned  ' + JSON.stringify(repaired));
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

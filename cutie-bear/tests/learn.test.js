/* Learning Lab.

   Four jobs, in the order they matter.

   1. Is the maths RIGHT? Questions are generated, so a bad generator ships a
      wrong answer to a child who will believe it. Every level is sampled
      hundreds of times, every question is checked for well-formedness, and
      every arithmetic question that can be parsed is re-derived independently
      here and compared. A test that only checked "a question appeared" would
      have been worthless.

   2. Is it actually the fastest stars? The room is sold to her as the quickest
      way to earn, and if that is not true it is just homework with a bear on
      it. The measured rate is asserted against the other rooms.

   3. Does it adapt? Three right in a row moves her up, three wrong eases her
      back, and it survives closing the app.

   4. Does the no-fail rule hold? A round where she gets everything wrong must
      still finish, still pay, and still say something kind. */
const { launch, site, engineName } = require('./harness');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

(async () => {
  const browser = await launch();
  const SITE = await site();
  log('engine: ' + engineName() + '    target: ' + SITE.target + '\n');

  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(SITE.url);
  await page.waitForTimeout(700);

  /* ================= 1. FREE FROM THE START ================= */

  const door = await page.evaluate(() => {
    const r = ROOMS.filter(r => r.id === 'learn')[0];
    const el = [...document.querySelectorAll('#doors .door')][ROOMS.indexOf(r)];
    return { cost: r.cost, key: r.key, locked: el.className.indexOf('locked') >= 0,
             text: el.textContent, doors: document.querySelectorAll('#doors .door').length };
  });
  check('the Learning Lab is free and open on a brand new save',
    door.cost === 0 && !door.key && door.locked === false, JSON.stringify(door));
  check('its door does not ask for stars', door.text.indexOf('Costs') < 0, door.text);
  info('doors on the home screen', door.doors);

  /* ================= 2. IS THE MATHS RIGHT? ================= */

  /* Re-derives the answer here, in the test, rather than trusting the app.
     Only handles the forms it can parse with certainty; anything else is
     counted as unchecked and reported, never silently passed. */
  const audit = await page.evaluate(() => {
    const bad = [], out = { checked: 0, unchecked: 0, byLevel: {} };
    for (let lv = 1; lv <= 10; lv++) {
      S.learn.lvl.math = lv;
      out.byLevel[lv] = 0;
      for (let i = 0; i < 300; i++) {
        const q = learnMakeQ('math');
        const label = 'L' + lv + ' ' + q.q + ' [a=' + q.a + ']';
        // well-formedness, which applies to every question whatever its shape
        if (q.q === undefined || /undefined|NaN|Infinity/.test(q.q + ' ' + q.a + ' ' + q.why)) bad.push('malformed: ' + label);
        if (q.choices.length !== 4) bad.push('not 4 choices: ' + label);
        if (new Set(q.choices.map(String)).size !== 4) bad.push('duplicate choices: ' + label);
        if (!q.choices.map(String).includes(String(q.a))) bad.push('answer missing from choices: ' + label);
        if (!q.why || q.why.length < 8) bad.push('no explanation: ' + label);

        // independent re-derivation where the arithmetic is unambiguous
        let m, expect = null;
        if ((m = q.q.match(/^(\d+) × (\d+) = \?$/))) expect = +m[1] * +m[2];
        else if ((m = q.q.match(/^(\d+) ÷ (\d+) = \?$/))) expect = (+m[1] % +m[2] === 0) ? +m[1] / +m[2] : null;
        else if ((m = q.q.match(/^(\d+) − (\d+) = \?$/))) expect = +m[1] - +m[2];
        else if ((m = q.q.match(/^(\d+) \+ (\d+) × (\d+) = \?$/))) expect = +m[1] + +m[2] * +m[3];
        else if ((m = q.q.match(/^A rectangle is (\d+) cm by (\d+) cm\. What is its AREA\?$/))) expect = (+m[1] * +m[2]) + ' sq cm';
        else if ((m = q.q.match(/^A rectangle is (\d+) cm by (\d+) cm\. What is its PERIMETER\?$/))) expect = (2 * (+m[1] + +m[2])) + ' cm';
        else if ((m = q.q.match(/^A box is (\d+) by (\d+) by (\d+)\. What is its VOLUME\?$/))) expect = +m[1] * +m[2] * +m[3];
        else if ((m = q.q.match(/^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \?$/)) && m[2] === m[4]) expect = (+m[1] + +m[3]) + '/' + m[2];
        else if ((m = q.q.match(/^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/)) && m[2] === m[4]) expect = (+m[1] - +m[3]) + '/' + m[2];
        else if ((m = q.q.match(/^What is 1\/(\d+) of (\d+)\?$/))) expect = +m[2] / +m[1];

        if (expect === null) out.unchecked++;
        else {
          out.checked++; out.byLevel[lv]++;
          if (String(expect) !== String(q.a)) bad.push('WRONG ANSWER: ' + label + ' should be ' + expect);
        }
      }
    }
    S.learn.lvl.math = 1;
    return { bad: bad.slice(0, 8), n: bad.length, ...out };
  });
  check('3000 generated maths questions are all well formed',
    audit.n === 0, audit.bad.join(' | '));
  check('every arithmetic answer the test can re-derive is correct',
    audit.checked > 800 && audit.n === 0, 'independently checked ' + audit.checked);
  info('maths questions re-derived by the test', audit.checked + ' of 3000 (' + audit.unchecked + ' are word or concept questions)');

  /* The written banks: an answer must never also appear as a wrong option. */
  const banks = await page.evaluate(() => {
    const bad = [];
    [['reading', LEARN_READ], ['science', LEARN_SCI], ['passages', LEARN_PASSAGE]].forEach(([name, bank]) => {
      bank.forEach(x => {
        if (x.w.map(String).includes(String(x.a))) bad.push(name + ': answer repeated as a wrong option: ' + x.q);
        if (!x.why || x.why.length < 8) bad.push(name + ': no explanation: ' + x.q);
        if (x.lv < 1 || x.lv > 10) bad.push(name + ': level out of range: ' + x.q);
      });
    });
    return { bad, counts: { reading: LEARN_READ.length, science: LEARN_SCI.length, passages: LEARN_PASSAGE.length } };
  });
  check('the written reading and science banks are clean', banks.bad.length === 0, banks.bad.slice(0, 3).join(' | '));
  info('written questions', JSON.stringify(banks.counts));

  /* Every level of every subject must be able to produce a question. A gap
     means she levels up into an empty room. */
  const coverage = await page.evaluate(() => {
    const holes = [];
    ['reading', 'math', 'science'].forEach(sub => {
      for (let lv = 1; lv <= 10; lv++) {
        S.learn.lvl[sub] = lv;
        for (let i = 0; i < 30; i++) {
          const q = learnMakeQ(sub);
          if (!q || !q.q || !q.choices || q.choices.length !== 4) { holes.push(sub + ' L' + lv); break; }
        }
      }
      S.learn.lvl[sub] = 1;
    });
    return holes;
  });
  check('all ten levels of all three subjects produce questions',
    coverage.length === 0, 'empty at: ' + coverage.join(', '));

  /* ================= 3. PLAYING A ROUND ================= */

  await page.evaluate(() => { S.stars = 0; persist(); go('learn'); });
  await page.waitForTimeout(500);

  const subjects = await page.evaluate(() => document.querySelectorAll('#learnsubj .subj').length);
  check('all three subjects are offered', subjects === 3, subjects);

  /* Answers every question correctly, and times the round. */
  async function playRound(sub, correct) {
    const t0 = Date.now();
    await page.evaluate((s) => document.querySelector('#learnsubj .subj[data-subj="' + s + '"]').click(), sub);
    for (let i = 0; i < 12; i++) {
      const done = await page.evaluate((wantRight) => {
        if (learn.sub === null) return true;
        const btns = [...document.querySelectorAll('#learnans .ans')];
        if (!btns.length || learn.locked) return false;
        const right = btns.find(b => String(b.textContent) === String(learn.q.a));
        const wrong = btns.find(b => String(b.textContent) !== String(learn.q.a));
        (wantRight ? right : wrong).click();
        return false;
      }, correct);
      if (done) break;
      await page.waitForTimeout(correct ? 950 : 2500);
    }
    await page.waitForTimeout(900);
    return Date.now() - t0;
  }

  const ms = await playRound('math', true);
  const after = await page.evaluate(() => ({
    stars: S.stars, best: S.learn.best, asked: S.learn.asked, right: S.learn.right,
    popped: document.getElementById('pop').classList.contains('on'),
    body: document.getElementById('popp').textContent
  }));
  check('a full round of ten can be played', after.asked >= 10, JSON.stringify(after));
  check('a perfect round pays the advertised 31 stars', after.stars === 31, 'got ' + after.stars);
  check('the round ends with a message', after.popped === true, after.body);
  info('perfect round', after.stars + ' stars in ' + (ms / 1000).toFixed(1) + 's');

  /* THE CLAIM: fastest stars in the app. The other rooms, measured from their
     own code: Treat Chase pays score/6 over a 45s round, about 8 a minute; the
     Dance Studio pays 2 + hits/4, about 9; a strong Star Steps level about 15.
     The bot answers instantly, so this is an upper bound rather than her real
     pace, but the margin is what matters. */
  const perMin = after.stars / (ms / 60000);
  check('the Learning Lab really is the fastest way to earn', perMin > 15,
    perMin.toFixed(1) + ' stars/min vs about 15 for the best other room');
  info('measured rate', perMin.toFixed(1) + ' stars per minute');

  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* ================= 4. NO FAIL STATE ================= */

  const before = await page.evaluate(() => S.stars);
  await playRound('science', false);
  const wrongRound = await page.evaluate(() => ({
    stars: S.stars, head: document.getElementById('poph').textContent,
    body: document.getElementById('popp').textContent,
    popped: document.getElementById('pop').classList.contains('on')
  }));
  check('getting every question wrong still finishes the round', wrongRound.popped === true);
  check('and still pays stars', wrongRound.stars > before, before + ' -> ' + wrongRound.stars);
  check('and never says anything unkind',
    !/wrong|bad|fail|oops|sorry|lost|poor/i.test(wrongRound.head + ' ' + wrongRound.body),
    wrongRound.head + ' ' + wrongRound.body);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));

  /* ================= 5. DOES IT ADAPT? ================= */

  const adapt = await page.evaluate(() => {
    S.learn.lvl.math = 4; learn.runUp = 0; learn.runDown = 0; learn.sub = 'math';
    const start = learnLvl('math');
    learnGrade('math', true); learnGrade('math', true);
    const afterTwo = learnLvl('math');
    learnGrade('math', true);
    const afterThree = learnLvl('math');
    learn.runUp = 0; learn.runDown = 0;
    learnGrade('math', false); learnGrade('math', false); learnGrade('math', false);
    const afterMisses = learnLvl('math');
    return { start, afterTwo, afterThree, afterMisses };
  });
  check('two right in a row does NOT jump her a level', adapt.afterTwo === adapt.start, JSON.stringify(adapt));
  check('three right in a row moves her up', adapt.afterThree === adapt.start + 1, JSON.stringify(adapt));
  check('three misses ease her back down', adapt.afterMisses === adapt.afterThree - 1, JSON.stringify(adapt));

  const floors = await page.evaluate(() => {
    S.learn.lvl.math = 1; learn.runUp = 0; learn.runDown = 0;
    for (let i = 0; i < 9; i++) learnGrade('math', false);
    const low = learnLvl('math');
    S.learn.lvl.math = 10; learn.runUp = 0; learn.runDown = 0;
    for (let i = 0; i < 9; i++) learnGrade('math', true);
    return { low, high: learnLvl('math') };
  });
  check('the level cannot fall below 1 or climb past 10',
    floors.low === 1 && floors.high === 10, JSON.stringify(floors));

  await page.evaluate(() => { S.learn.lvl = { reading: 3, math: 7, science: 5 }; persist(); });
  await page.reload();
  await page.waitForTimeout(800);
  const kept = await page.evaluate(() => S.learn.lvl);
  check('her levels survive closing and reopening the app',
    kept.reading === 3 && kept.math === 7 && kept.science === 5, JSON.stringify(kept));

  /* ================= 6. AN OLDER SAVE ================= */

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cutiebear.save.v1', JSON.stringify({
      stars: 240, owned: ['bow_pink'], worn: { head: 'bow_pink' },
      rooms: { photo: true }, friends: ['bunny'], album: [],
      best: { chase: 310, steps: 44, song: 7 }, music: true, sfx: true
    }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  const mig = await page.evaluate(() => ({
    stars: S.stars, lvl: S.learn.lvl,
    v: JSON.parse(localStorage.getItem('cutiebear.save') || '{}').v, current: SAVE_VERSION
  }));
  check('an older save keeps its stars and gains the Learning Lab at level 1',
    mig.stars === 240 && mig.lvl.math === 1 && mig.lvl.reading === 1, JSON.stringify(mig));
  check('and is rewritten at the current schema version', mig.v === mig.current, JSON.stringify(mig));

  await page.evaluate(() => go('learn'));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#learnsubj .subj[data-subj="math"]').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/shots/learn.png' });

  check('no JS errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  await SITE.close();
  log(fails === 0
    ? '\nALL LEARNING LAB TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

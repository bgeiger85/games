/* The campaign: qualifying, the playoff, the group, the knockouts.

   Brian asked for a longer season and asked whether memory was the limit. It
   is not - the save with a full campaign is under 5 KB against Safari's 5 MB.
   The real risks are structural, and they are what this guards:

     - a five match save from v1 must not be reinterpreted as a fourteen match
       campaign. Round 2 used to mean "quarter final" and now means "third
       qualifier". Everything EARNED survives the migration; the campaign
       restarts.
     - top two qualify and the playoff is skipped. Finish third and it is not.
     - losing a qualifier still moves him on. Those phases are decided on
       points, and standing still after a defeat turns a table back into a gate.
     - a league draw is a POINT, not a penalty shootout.
     - no arrangement of results can end the campaign. */
const { launch, site, engineName } = require('./harness');
const path = require('path');
const fs = require('fs');

const shotDir = path.resolve(__dirname, 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const shot = n => path.join(shotDir, n);

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(SITE.url);
  await page.waitForTimeout(400);
  await page.evaluate(() => { S.warm.on = false; persist(); });

  // --- 1. the shape of the campaign
  const shape = await page.evaluate(() => ({
    total: ROUNDS.length,
    phases: ROUNDS.map(r => r.phase),
    qualEnd: QUAL_END, groupStart: GROUP_START, koStart: KO_START,
    teams: Object.keys(TEAMS).length
  }));

  // --- 2. a v1 save keeps what he earned and restarts the campaign
  const migrated = await page.evaluate(() => {
    localStorage.setItem('worldcup.save.v1', JSON.stringify({
      v: 1, round: 3, results: [{ gf: 2, ga: 0 }, { gf: 1, ga: 0 }, { gf: 3, ga: 1 }],
      cups: 2, goals: 41, boots: 88, penGoals: 12, penSaves: 5, ones: 30, sound: true,
      warm: { on: true, n: 5, mlev: 2, wlev: 2, done: 40, perfect: 12, right: 180, wrong: 20,
              facts: { '4+3': { r: 5, w: 0 } } }
    }));
    load();
    return {
      v: S.v, round: S.round, results: S.results.length,
      cups: S.cups, goals: S.goals, boots: S.boots, penGoals: S.penGoals,
      penSaves: S.penSaves, ones: S.ones,
      warmDone: S.warm.done, warmRight: S.warm.right, mlev: S.warm.mlev,
      facts: Object.keys(S.warm.facts).length
    };
  });

  // --- 3. top two qualify and skip the playoff
  const direct = await page.evaluate(() => {
    S.v = 2; S.round = 6;
    // six wins: nobody is catching that
    S.results = [0, 1, 2, 3, 4, 5].map(() => ({ gf: 3, ga: 0 }));
    persist();
    return { place: ourPlace(qualTable()), playoff: needPlayoff(), next: nextRound(5) };
  });

  // --- 4. finishing below the line means the playoff, and losing it repeats it
  const viaPlayoff = await page.evaluate(() => {
    S.round = 6;
    S.results = [0, 1, 2, 3, 4, 5].map(() => ({ gf: 0, ga: 3, lost: true }));
    persist();
    const before = { place: ourPlace(qualTable()), playoff: needPlayoff(), next: nextRound(5) };
    // now lose the playoff itself: he must still be sitting on it, not past it
    S.round = 6;
    startMatch(6);
    M.gf = 0; M.ga = 2; M.elapsed = M.r.secs;
    return before;
  });
  await page.waitForTimeout(1200);
  const afterLostPlayoff = await page.evaluate(() => ({
    round: S.round, stage: ROUNDS[S.round] && ROUNDS[S.round].stage
  }));
  await page.evaluate(() => { closePop(); if (M) endMatch(); });

  // --- 5. losing a QUALIFIER still moves him on. A table is not a gate.
  const lostQual = await page.evaluate(() => {
    S.round = 2; S.results = [{ gf: 1, ga: 0 }, { gf: 1, ga: 0 }];
    persist();
    startMatch(2);
    M.gf = 0; M.ga = 2; M.elapsed = M.r.secs;
    return true;
  });
  await page.waitForTimeout(1200);
  const afterLostQual = await page.evaluate(() => ({
    round: S.round, recorded: S.results[2]
  }));
  await page.evaluate(() => { closePop(); if (M) endMatch(); });

  // --- 6. a league draw is a point, NOT a shootout
  const drewGroup = await page.evaluate(() => {
    S.round = 8; S.results[7] = { gf: 1, ga: 0 };
    persist();
    startMatch(8);
    M.gf = 1; M.ga = 1; M.elapsed = M.r.secs;
    return true;
  });
  await page.waitForTimeout(1200);
  const afterDraw = await page.evaluate(() => ({
    screen: current,
    title: document.getElementById('poptitle').textContent,
    round: S.round, recorded: S.results[8]
  }));
  await page.evaluate(() => { closePop(); if (M) endMatch(); });

  // --- 7. a drawn KNOCKOUT still goes to penalties
  await page.evaluate(() => {
    S.round = 10; persist();
    startMatch(10);
    M.gf = 1; M.ga = 1; M.elapsed = M.r.secs;
  });
  await page.waitForTimeout(1200);
  const afterKoDraw = await page.evaluate(() => document.getElementById('poptitle').textContent);
  await page.evaluate(() => { closePop(); if (M) endMatch(); });

  // --- 8. nothing can end the campaign: lose every single match
  const survives = await page.evaluate(() => {
    S.v = 2; S.round = 0; S.results = []; persist();
    // lose all six qualifiers on the table
    for (let i = 0; i < 6; i++) { S.results[i] = { gf: 0, ga: 4, lost: true }; }
    S.round = nextRound(5);
    const atPlayoff = S.round;
    // and lose the group as well
    S.round = GROUP_START;
    for (let i = GROUP_START; i <= GROUP_START + 2; i++) { S.results[i] = { gf: 0, ga: 4, lost: true }; }
    S.round = nextRound(GROUP_START + 2);
    return { atPlayoff: atPlayoff, afterGroup: S.round, reachedKo: S.round >= KO_START,
             stage: ROUNDS[S.round] && ROUNDS[S.round].stage };
  });

  // --- 8b. the table has to agree with the match he just played.
  //
  //   Brian: "he beat Norway in his first game and it gave both him and Norway
  //   the win." Rival records were invented from a hash that had never heard of
  //   S.results, so the team he beat could go unbeaten. Every rival row is now
  //   built matchday by matchday, and the match Spain was in is the real one,
  //   mirrored. The audit below is the general form of that: every match has
  //   two teams, so across a table goals for must equal goals against, wins
  //   must equal losses, draws must be even, and points must be 3W+D. A table
  //   that invents a result for one side only cannot satisfy those.
  const standings = await page.evaluate(() => {
    const audit = rows => {
      const t = k => rows.reduce((a, r) => a + r[k], 0);
      return {
        rows: rows.map(r => r.name + ' P' + r.p + ' W' + r.w + ' D' + r.d + ' L' + r.l +
          ' ' + r.gf + ':' + r.ga + ' ' + r.pts + 'pts'),
        gf: t('gf'), ga: t('ga'), w: t('w'), l: t('l'), d: t('d'), pts: t('pts'),
        played: rows.map(r => r.p),
        by: rows.reduce((a, r) => { a[r.key] = r; return a; }, {})
      };
    };
    S.v = 2; S.round = 2;
    S.results = [{ gf: 2, ga: 1 }, { gf: 3, ga: 0 }];   // beat Norway 2-1, Scotland 3-0
    persist();
    const early = audit(qualTable());

    S.round = 6;
    S.results = [{ gf: 2, ga: 1 }, { gf: 3, ga: 0 }, { gf: 1, ga: 1, drew: true },
                 { gf: 0, ga: 2, lost: true }, { gf: 4, ga: 1 }, { gf: 2, ga: 2, drew: true }];
    persist();
    const full = audit(qualTable());

    S.round = 10;
    S.results[7] = { gf: 1, ga: 1, drew: true };
    S.results[8] = { gf: 0, ga: 2, lost: true };
    S.results[9] = { gf: 3, ga: 1 };
    persist();
    const group = audit(groupTable());

    /* And it must not reshuffle itself between two looks at the same save. */
    const again = audit(groupTable());
    return { early, full, group, stable: JSON.stringify(again.rows) === JSON.stringify(group.rows) };
  });

  // --- 9. the screen renders every phase without throwing
  const screens = {};
  for (const [name, round] of [['qual', 2], ['playoff', 6], ['group', 8], ['ko', 11]]) {
    await page.evaluate(n => {
      S.round = n;
      S.results = [];
      for (let i = 0; i < n; i++) S.results[i] = { gf: 2, ga: 1 };
      persist(); go('cup');
    }, round);
    await page.waitForTimeout(250);
    screens[name] = await page.evaluate(() => ({
      title: document.getElementById('cuptitle').textContent,
      rungs: document.querySelectorAll('#ladder .rung').length,
      table: document.querySelectorAll('#ladder .trow').length,
      phases: document.querySelectorAll('#ladder .phase').length
    }));
    await page.screenshot({ path: shot('28-campaign-' + name + '.png') });
  }

  // --- 10. how big the save actually gets
  const size = await page.evaluate(() => {
    S.round = 14;
    S.results = [];
    for (let i = 0; i < 14; i++) S.results[i] = { gf: 3, ga: 1, pens: true };
    for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) S.warm.facts[a + '+' + b] = { r: 4, w: 1 };
    persist();
    return (localStorage.getItem('worldcup.save.v1') || '').length;
  });

  await browser.close();
  await SITE.close();

  const fails = [];
  if (shape.total !== 14) fails.push('expected a 14 entry campaign, got ' + shape.total);
  if (shape.phases.filter(p => p === 'qual').length !== 6) fails.push('expected 6 qualifiers');
  if (shape.phases.filter(p => p === 'playoff').length !== 1) fails.push('expected 1 playoff');
  if (shape.phases.filter(p => p === 'group').length !== 3) fails.push('expected 3 group matches');
  if (shape.phases.filter(p => p === 'ko').length !== 4) fails.push('expected 4 knockout rounds');
  if (shape.teams < 12) fails.push('not enough teams for a campaign: ' + shape.teams);

  if (migrated.v !== 2) fails.push('the save was not migrated to v2: ' + migrated.v);
  if (migrated.round !== 0 || migrated.results !== 0) {
    fails.push('the v1 campaign was carried over instead of restarted: ' + JSON.stringify(migrated));
  }
  ['cups', 'goals', 'boots', 'penGoals', 'penSaves', 'ones'].forEach(k => {
    const want = { cups: 2, goals: 41, boots: 88, penGoals: 12, penSaves: 5, ones: 30 }[k];
    if (migrated[k] !== want) fails.push('migration lost ' + k + ': ' + migrated[k] + ', wanted ' + want);
  });
  if (migrated.warmDone !== 40 || migrated.warmRight !== 180 || migrated.mlev !== 2 || !migrated.facts) {
    fails.push('migration lost what the warm-up had learned: ' + JSON.stringify(migrated));
  }

  if (direct.place > 2 || direct.playoff) fails.push('six wins did not qualify directly: ' + JSON.stringify(direct));
  if (direct.next !== 7) fails.push('qualifying directly did not skip the playoff: next=' + direct.next);
  if (viaPlayoff.place <= 2 || !viaPlayoff.playoff) {
    fails.push('six defeats still qualified directly: ' + JSON.stringify(viaPlayoff));
  }
  if (viaPlayoff.next !== 6) fails.push('finishing below the line did not lead to the playoff: ' + viaPlayoff.next);
  if (afterLostPlayoff.round !== 6) {
    fails.push('losing the playoff moved him on anyway: ' + JSON.stringify(afterLostPlayoff));
  }

  if (afterLostQual.round !== 3) {
    fails.push('losing a qualifier did not advance the campaign: ' + JSON.stringify(afterLostQual));
  }
  if (!afterLostQual.recorded || !afterLostQual.recorded.lost) {
    fails.push('a lost qualifier was not recorded on the table: ' + JSON.stringify(afterLostQual));
  }

  if (/penalt/i.test(afterDraw.title)) fails.push('a group draw went to penalties: "' + afterDraw.title + '"');
  if (!/point/i.test(afterDraw.title)) fails.push('a group draw was not called a point: "' + afterDraw.title + '"');
  if (afterDraw.round !== 9) fails.push('a group draw did not advance the campaign: ' + JSON.stringify(afterDraw));
  if (!afterDraw.recorded || !afterDraw.recorded.drew) fails.push('the draw was not recorded');
  if (!/penalt|draw/i.test(afterKoDraw)) fails.push('a drawn knockout did not offer penalties: "' + afterKoDraw + '"');

  if (survives.atPlayoff !== 6) fails.push('losing every qualifier did not lead to the playoff');
  if (!survives.reachedKo) {
    fails.push('LOSING EVERYTHING ENDED THE CAMPAIGN: ' + JSON.stringify(survives));
  }

  ['early', 'full', 'group'].forEach(k => {
    const t = standings[k];
    if (t.gf !== t.ga) fails.push(k + ' table: goals for ' + t.gf + ' != goals against ' + t.ga);
    if (t.w !== t.l) fails.push(k + ' table: ' + t.w + ' wins but ' + t.l + ' losses');
    if (t.d % 2) fails.push(k + ' table: ' + t.d + ' draws, which cannot happen');
    if (t.pts !== t.w * 3 + t.d) fails.push(k + ' table: ' + t.pts + ' points, wanted ' + (t.w * 3 + t.d));
    if (t.played.some(p => p !== t.played[0])) {
      fails.push(k + ' table: teams on different games played: ' + t.played.join(','));
    }
  });
  // the specific report: he beat Norway, so Norway cannot be unbeaten
  if (!standings.early.by.norway || standings.early.by.norway.l < 1) {
    fails.push('BEAT NORWAY AND NORWAY IS STILL UNBEATEN: ' + standings.early.rows.join(' | '));
  }
  if (standings.early.by.spain.pts !== 6 || standings.early.by.norway.pts > 3) {
    fails.push('two wins did not read as two wins: ' + standings.early.rows.join(' | '));
  }
  // group: drew with Japan, lost to Morocco, beat Uruguay. All three have to show it.
  if (standings.group.by.japan.d < 1) {
    fails.push('drew with Japan and Japan has no draw: ' + standings.group.rows.join(' | '));
  }
  if (standings.group.by.morocco.w < 1) {
    fails.push('lost to Morocco and Morocco has no win: ' + standings.group.rows.join(' | '));
  }
  if (standings.group.by.uruguay.l < 1) {
    fails.push('beat Uruguay and Uruguay has no loss: ' + standings.group.rows.join(' | '));
  }
  if (!standings.stable) fails.push('the table reshuffled itself between two looks');

  Object.keys(screens).forEach(k => {
    const sc = screens[k];
    if (sc.phases !== 3) fails.push(k + ' screen lost the phase strip: ' + sc.phases);
    if (!sc.rungs) fails.push(k + ' screen drew no matches');
    if ((k === 'qual' || k === 'group') && sc.table < 5) fails.push(k + ' screen has no standings table');
    if (k === 'ko' && sc.table) fails.push('the knockout screen should not show a league table');
  });

  if (size > 20000) fails.push('the save is larger than expected: ' + size + ' bytes');

  console.log('shape     ' + shape.total + ' matches, ' + shape.teams + ' teams: ' +
    shape.phases.join(','));
  console.log('migration v1 -> v' + migrated.v + ', campaign reset, kept cups=' + migrated.cups +
    ' goals=' + migrated.goals + ' boots=' + migrated.boots + ' ones=' + migrated.ones +
    ' warm-ups=' + migrated.warmDone);
  console.log('direct    place ' + direct.place + ', playoff=' + direct.playoff + ', next=' + direct.next);
  console.log('playoff   place ' + viaPlayoff.place + ', playoff=' + viaPlayoff.playoff +
    ', lost it -> still at round ' + afterLostPlayoff.round);
  console.log('lost qual -> round ' + afterLostQual.round + ', recorded ' + JSON.stringify(afterLostQual.recorded));
  console.log('group draw "' + afterDraw.title + '" -> round ' + afterDraw.round);
  console.log('ko draw   "' + afterKoDraw + '"');
  console.log('lose all  -> playoff at ' + survives.atPlayoff + ', then ' + survives.stage);
  ['early', 'full', 'group'].forEach(k => console.log('table ' + k.padEnd(6) +
    standings[k].rows.join(' | ')));
  Object.keys(screens).forEach(k => console.log('screen ' + k.padEnd(8) + JSON.stringify(screens[k])));
  console.log('save      ' + size + ' bytes for a full campaign (Safari allows ~5 MB)');
  console.log('errors    ' + (errs.length ? errs.join('\n') : 'NONE'));

  if (errs.length || fails.length) {
    console.error('\nFAILED on ' + engineName());
    errs.forEach(e => console.error('  x ' + e));
    fails.forEach(f => console.error('  x ' + f));
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')');
})();

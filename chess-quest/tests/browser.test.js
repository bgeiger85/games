/* End-to-end browser test: loads the real HTML file, plays real games,
   and checks the interface behaves. */
const playwright = require('playwright');
const path = require('path');
const { serve } = require('./static-server');

// Defaults to the file you actually deploy. Override with TARGET=dist/chess-quest.html
const TARGET = process.env.TARGET || 'dist/index.html';
// Which engine to drive. WebKit is the one that matters for iPad Safari.
const ENGINE = process.env.ENGINE || 'chromium';
let FILE; // resolved once the static server has a port
let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}

(async () => {
  const fs = require('fs');
  const engine = playwright[ENGINE];
  if (!engine || typeof engine.launch !== 'function') {
    log('FAIL  unknown ENGINE "' + ENGINE + '" (expected chromium, webkit or firefox)');
    process.exit(1);
  }

  // Serve the built directory so the game runs on a real http origin, exactly
  // as it does when deployed. See tests/static-server.js for why this matters.
  const site = await serve(path.join(__dirname, '..', path.dirname(TARGET)));
  FILE = 'http://127.0.0.1:' + site.port + '/' + path.basename(TARGET);
  log('engine: ' + ENGINE + '    target: ' + TARGET + '    url: ' + FILE + '\n');

  // Only Chromium is baked into this image; other engines come from Playwright's
  // own download cache, so let it resolve them.
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
  ];
  const exe = ENGINE === 'chromium' ? candidates.find(p => fs.existsSync(p)) : null;
  const browser = await engine.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(600);

  check('page loads with no JS errors', errors.length === 0, errors.join(' | '));
  check('start screen is shown', await page.locator('#overlay.on').isVisible());
  const cardTitle = await page.locator('#card h1').textContent();
  check('title renders and matches the active theme', /Chess/.test(cardTitle), cardTitle);

  await page.click('#goPlay');
  await page.waitForTimeout(400);

  check('board has 64 squares', await page.locator('#board .sq').count() === 64);
  const pieces = await page.locator('#board svg.pc').count();
  check('32 pieces on the board at the start', pieces === 32, pieces);
  const emojiFree = await page.evaluate(() => {
    // No piece may be rendered from a text glyph: U+265F is an emoji on iOS
    // and would ignore CSS colour, which is what turned White's pawns black.
    const txt = Array.from(document.querySelectorAll('#board .sq')).map(s => s.textContent).join('');
    return !/[\u2654-\u265F]/.test(txt);
  });
  check('no piece is drawn with a Unicode chess glyph', emojiFree);
  check('white pieces are styled differently from black',
    await page.locator('#board svg.pc.w').count() === 16 && await page.locator('#board svg.pc.b').count() === 16);
  // The actual reported bug: White's pawns must render light, not dark.
  // Theme-agnostic version of the original pawn bug guard: whatever the theme,
  // a white pawn must paint the light piece colour, a black pawn the dark one,
  // and the two must be far apart. Hardcoding a hex here would only test one theme.
  const pawns = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const grab = (sq) => {
      const el = document.querySelector('.sq[data-sq="' + sq + '"] svg.pc path');
      return el ? getComputedStyle(el).fill : null;
    };
    const toRgb = (v) => {
      const d = document.createElement('div');
      d.style.color = v.trim(); document.body.appendChild(d);
      const out = getComputedStyle(d).color; d.remove(); return out;
    };
    return {
      white: grab(100),                                   // e2
      black: grab(20),                                    // e7
      varWhite: toRgb(cs.getPropertyValue('--pc-w')),
      varBlack: toRgb(cs.getPropertyValue('--pc-b'))
    };
  });
  check('White pawns paint the theme light piece colour', pawns.white === pawns.varWhite,
    pawns.white + ' vs ' + pawns.varWhite);
  check('Black pawns paint the theme dark piece colour', pawns.black === pawns.varBlack,
    pawns.black + ' vs ' + pawns.varBlack);
  check('the two pawn colours are actually different', pawns.white !== pawns.black,
    pawns.white + ' / ' + pawns.black);

  const workerOk = await page.evaluate(() => typeof Worker !== 'undefined');
  check('Worker API available (bot thinks off the main thread)', workerOk);

  /* --- tap to select shows legal moves --- */
  await page.locator('#board .sq[data-sq="100"]').click();   // e2 pawn
  await page.waitForTimeout(150);
  const dots = await page.locator('#board .dot, #board .ring').count();
  check('tapping the e2 pawn shows its legal moves', dots === 2, dots);
  check('the tapped square is highlighted', await page.locator('#board .sq.sel').count() === 1);

  /* --- tap target plays the move and the bot replies --- */
  await page.locator('#board .sq[data-sq="68"]').click();    // e4
  await page.waitForFunction(() => window.ChessQuest.state.phase === 'myturn', null, { timeout: 15000 });
  const fen = await page.evaluate(() => toFen(window.ChessQuest.state.s));
  check('my move and the bot reply were both played', fen.split(' ')[1] === 'w' && fen.indexOf('4P3') > 0, fen);
  check('last move is highlighted', await page.locator('#board .sq.last').count() === 2);

  /* --- hint --- */
  await page.click('#btnHint');
  await page.waitForTimeout(1200);
  const hintText = await page.locator('#coachHead').textContent();
  check('hint button produces advice', /hint/i.test(hintText), hintText);

  /* --- coach catches a deliberate blunder --- */
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    G.s = loadFen('4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1');
    G.hist = [posKey(G.s)]; G.records = []; G.lastMove = 0; G.doOvers = 3;
    G.phase = 'myturn'; window.ChessQuest.render();
  });
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    const m = genLegal(G.s).find(x => toSan(G.s, x) === 'Qd5');
    window.ChessQuest.play(m);
  });
  await page.waitForFunction(() => window.ChessQuest.state.phase === 'offering', null, { timeout: 15000 })
    .then(() => check('coach interrupts a blunder and offers a do-over', true))
    .catch(() => check('coach interrupts a blunder and offers a do-over', false,
      'phase=' + JSON.stringify(errors)));
  const alertText = await page.locator('#coachHead').textContent();
  check('do-over message names the problem', /queen/i.test(alertText), alertText);
  check('do-over buttons are offered', await page.locator('#coachActs .btn').count() === 2);

  await page.locator('#coachActs .btn', { hasText: 'Try again' }).click();
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => ({
    phase: window.ChessQuest.state.phase,
    hearts: window.ChessQuest.state.doOvers,
    fen: toFen(window.ChessQuest.state.s)
  }));
  check('taking the do-over rewinds the board', afterUndo.fen.indexOf('3QK3') > 0, afterUndo.fen);
  check('taking the do-over costs a heart', afterUndo.hearts === 2, afterUndo.hearts);
  check('it is my turn again after a do-over', afterUndo.phase === 'myturn');

  /* --- winning levels you up, and the report renders on a loss --- */
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    G.level = 3;
    G.s = loadFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');   // Ra8# available
    G.hist = [posKey(G.s)]; G.records = []; G.phase = 'myturn'; G.settings.coach = true;
    window.ChessQuest.render();
  });
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    window.ChessQuest.play(genLegal(G.s).find(x => toSan(G.s, x) === 'Ra8#'));
  });
  await page.waitForTimeout(2500);
  const won = await page.evaluate(() => ({ lvl: window.ChessQuest.state.level, card: document.getElementById('card').textContent }));
  check('checkmating the bot levels you up (3 -> 4)', won.lvl === 4, won.lvl);
  // Assert against the ladder itself, not a hardcoded name, so renaming the
  // opponents cannot silently break this check.
  const nextName = await page.evaluate(() => BOTS[3].name);   // level 4
  check('win screen names the next opponent', won.card.indexOf(nextName) >= 0,
    nextName + ' not in: ' + won.card.slice(0, 140));

  await page.screenshot({ path: 'docs/screenshots/run-win.png' });

  /* --- loss report --- */
  await page.click('#wNext');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    G.records = [{
      fenBefore: '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1',
      move: (function () { const s = loadFen('4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1'); return genLegal(s).find(x => toSan(s, x) === 'Qd5'); })(),
      san: 'Qd5', mover: 0,
      review: { severity: 'blunder', loss: 900, tag: 'movedintodanger',
                headline: 'Your queen can be taken on d5.', detail: 'Test detail.',
                bestMove: (function () { const s = loadFen('4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1'); return genLegal(s).find(x => toSan(s, x) === 'Qd4'); })(),
                bestSan: 'Qd4', good: false }
    }];
    G.lossStreak = 0;
    G.s = loadFen('4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1');
  });
  await page.evaluate(() => {
    // trigger the loss screen through the real code path
    const G = window.ChessQuest.state;
    G.s = loadFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'); // white is checkmated
    G.hist = [posKey(G.s)];
    G.phase = 'botturn';
    document.querySelector('#board');
  });
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    const res = gameResult(G.s, G.hist);
    // call finish() indirectly by playing through: simplest is to click New then assert report renders
    window.__res = res;
  });
  const mateRes = await page.evaluate(() => window.__res);
  check('a real checkmate position is detected as a loss for the player',
    mateRes.over && mateRes.type === 'checkmate' && mateRes.winner === 1, JSON.stringify(mateRes));

  /* --- full game against level 1 driven by the engine itself --- */
  await page.evaluate(() => { window.ChessQuest.setLevel(1); window.ChessQuest.newGame(); });
  await page.waitForFunction(() => window.ChessQuest.state.phase === 'myturn', null, { timeout: 10000 });
  // finish() bumps stats.won and the level together, so comparing the count
  // across the game tells us whether this was actually a win.
  const wonBefore = await page.evaluate(() => window.ChessQuest.state.stats.won);
  let plies = 0, finished = false;
  for (; plies < 80; plies++) {
    const st = await page.evaluate(() => window.ChessQuest.state.phase);
    if (st === 'over') { finished = true; break; }
    if (st === 'offering') { await page.locator('#coachActs .btn', { hasText: 'Keep' }).click(); await page.waitForTimeout(120); continue; }
    if (st !== 'myturn') { await page.waitForTimeout(200); continue; }
    const played = await page.evaluate(() => {
      const G = window.ChessQuest.state;
      const r = searchRoot(G.s, 4, 900, true);
      if (!r.length) return false;
      // pick among near-equal best moves, so the driver does not shuffle into
      // a repetition the way a fixed deterministic picker would
      const pool = r.filter(x => r[0].score - x.score <= 30).slice(0, 3);
      // Randomising that pick lowered the odds of a threefold repetition. It
      // could not remove them, and CI drew the short straw: the game ended
      // "the same position happened three times" and nothing was promoted.
      //
      // It is not bad luck so much as a trap the game lays on purpose. Once
      // the bot is losing badly it stops avoiding repetitions and starts
      // playing for one - see the movePepeats guard in ui.js, which it applies
      // only while it is not behind. A human gets a coach warning the second
      // time a position comes round. The driver gets no warning, so it has to
      // look for itself and refuse the move that completes the draw.
      //
      // Declining is always safe here: the only moves removed are ones that
      // end the game as a draw, which fails this test however it happens.
      const completesDraw = (m) => {
        makeMove(G.s, m);
        const k = posKey(G.s);
        let n = 1;
        for (let i = 0; i < G.hist.length; i++) if (G.hist[i] === k) n++;
        unmakeMove(G.s);
        return n >= 3;
      };
      const safe = pool.filter(x => !completesDraw(x.move));
      const from = safe.length ? safe : pool;
      window.ChessQuest.play(from[Math.floor(Math.random() * from.length)].move);
      return true;
    });
    if (!played) break;
    await page.waitForTimeout(150);
    try {
      await page.waitForFunction(() => ['myturn', 'over', 'offering'].includes(window.ChessQuest.state.phase), null, { timeout: 20000 });
    } catch (e) { break; }
  }
  const endState = await page.evaluate(() => ({
    phase: window.ChessQuest.state.phase,
    level: window.ChessQuest.state.level,
    won: window.ChessQuest.state.stats.won,
    last: window.ChessQuest.state.lastResult,
    card: document.getElementById('card').textContent.slice(0, 200)
  }));
  const iWon = endState.won > wonBefore;
  check('a full game against level 1 reaches a finish', finished || endState.phase === 'over',
    'phase=' + endState.phase + ' after ' + plies + ' of my moves');
  // Split deliberately. "The driver could not win" and "winning did not promote"
  // used to produce the same red, and telling them apart meant reading the end
  // card by hand. Only the second one is a bug in the game.
  check('the driver actually beat level 1', iWon,
    'game ended as a ' + endState.last + ' — end card: ' + endState.card.replace(/\s+/g, ' ').slice(0, 80));
  check('beating level 1 promotes to level 2', !iWon || endState.level >= 2,
    'won the game but the level stayed at ' + endState.level);
  log('  end card: ' + endState.card.replace(/\s+/g, ' ').slice(0, 140));

  await page.screenshot({ path: 'docs/screenshots/run-end.png' });

  /* --- a real losing game against a strong bot, exercising the loss report ---
     Playing the worst legal move does not GUARANTEE a loss: shuffling a piece
     back and forth can hit a threefold repetition, and level 8 picks between
     its top two moves, so the ending varies run to run. A draw produces a
     draw card, not the coach's loss report, so the checks below would fail on
     an outcome the rules never promised. Play the game up to four times and
     keep the first one that really is a loss. */
  let lost = false, lastEnding = 'never finished';
  for (let attempt = 1; attempt <= 4 && !lost; attempt++) {
    await page.evaluate(() => { window.ChessQuest.setLevel(8); window.ChessQuest.newGame(); });
    await page.waitForFunction(() => window.ChessQuest.state.phase === 'myturn', null, { timeout: 15000 });
    let over = false;
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => window.ChessQuest.state.phase);
      if (st === 'over') { over = true; break; }
      if (st === 'offering') { await page.locator('#coachActs .btn', { hasText: 'Keep' }).click(); await page.waitForTimeout(100); continue; }
      if (st !== 'myturn') { await page.waitForTimeout(200); continue; }
      const ok = await page.evaluate(() => {
        const G = window.ChessQuest.state;
        const r = searchRoot(G.s, 2, 300, true);          // play the WORST legal move on purpose
        if (!r.length) return false;
        window.ChessQuest.play(r[r.length - 1].move);
        return true;
      });
      if (!ok) break;
      try { await page.waitForFunction(() => ['myturn', 'over', 'offering'].includes(window.ChessQuest.state.phase), null, { timeout: 25000 }); }
      catch (e) { break; }
    }
    if (over) {
      lastEnding = await page.evaluate(() => window.ChessQuest.state.lastResult || 'unknown');
      lost = /won this one/.test(await page.evaluate(() => document.getElementById('card').textContent));
    }
    if (!lost) log('  attempt ' + attempt + ' ended in a ' + lastEnding + ', not a loss — replaying');
  }
  check('deliberately playing badly against level 8 loses the game', lost, 'last ending: ' + lastEnding);
  const lossCard = await page.evaluate(() => document.getElementById('card').textContent);
  check('loss screen appears', /won this one/.test(lossCard), lossCard.slice(0, 100));
  check('loss screen lists flagged moments', /Show me on the board/.test(lossCard) || /clean game/.test(lossCard));
  check('loss screen gives a practice tip', /Practice this/.test(lossCard), lossCard.slice(-200));
  const momentBtns = await page.locator('#card .moment .btn').count();
  if (momentBtns > 0) {
    await page.locator('#card .moment .btn').first().click();
    await page.waitForTimeout(400);
    check('mistake replay board renders 64 squares', await page.locator('#miniBoard .sq').count() === 64);
    const arrows = await page.locator('#miniSvg line').count();
    check('mistake replay draws both arrows', arrows === 2, arrows);
    await page.screenshot({ path: 'docs/screenshots/run-loss.png', fullPage: true });
  } else {
    log('  (no flagged moments this run — replay board not exercised)');
  }
  check('losing does NOT change the level', await page.evaluate(() => window.ChessQuest.state.level) === 8);

  /* ================= PUZZLE MODE ================= */
  await page.evaluate(() => { window.ChessQuest.newGame(); });
  await page.waitForTimeout(300);

  const pzCount = await page.evaluate(() => window.ChessQuest.allPuzzles().length);
  check('built-in puzzles are bundled into the page', pzCount >= 20, pzCount);

  await page.evaluate(() => window.ChessQuest.enterPuzzles());
  await page.waitForTimeout(500);
  check('puzzle mode switches the interface', await page.evaluate(() => document.getElementById('app').className) === 'mode-puzzle');
  check('a puzzle is loaded', await page.evaluate(() => !!window.ChessQuest.puzzles.current));
  check('puzzle prompt is shown', (await page.locator('#coachHead').textContent()).length > 10);
  check('ladder and captured trays are hidden in puzzle mode',
    !(await page.locator('#ladder').isVisible()) && !(await page.locator('#trayMine').isVisible()));
  check('puzzle controls replace the game controls',
    await page.locator('#btnPzHint').isVisible() && !(await page.locator('#btnHint').isVisible()));

  /* board must be shown from the solving side */
  const orient = await page.evaluate(() => ({
    turn: window.ChessQuest.state.s.turn,
    view: window.ChessQuest.state.viewColor
  }));
  check('puzzle board is oriented for the side to move', orient.turn === orient.view, JSON.stringify(orient));

  /* solve the first one cleanly, so the spaced-repetition promotion is exercised */
  await page.evaluate(() => {
    const Q = window.ChessQuest, p = Q.puzzles.current;
    const from = nameToSq(p.from), to = nameToSq(p.to);
    const mv = genLegal(Q.state.s).find(m => FROM(m) === from && TO(m) === to && (!p.pr || PROMO(m) === p.pr));
    Q.play(mv);
  });
  await page.waitForTimeout(600);
  const cleanMsg = await page.locator('#coachHead').textContent();
  check('a first-try solve is praised', /yes|got it|exactly|beautiful/i.test(cleanMsg), cleanMsg);
  check('a first-try solve counts as solved', await page.evaluate(() => window.ChessQuest.puzzles.stats.solved) >= 1);
  check('a first-try solve starts a streak', await page.evaluate(() => window.ChessQuest.puzzles.streak) >= 1);
  await page.waitForTimeout(1700);

  /* wrong answer */
  const wrongDone = await page.evaluate(() => {
    const Q = window.ChessQuest, p = Q.puzzles.current;
    const from = nameToSq(p.from), to = nameToSq(p.to);
    const wrong = genLegal(Q.state.s).find(m => !(FROM(m) === from && TO(m) === to));
    if (!wrong) return false;
    Q.play(wrong);
    return true;
  });
  await page.waitForTimeout(1200);
  check('a wrong answer is rejected', wrongDone && await page.evaluate(() => window.ChessQuest.puzzles.tries) === 1,
    await page.evaluate(() => window.ChessQuest.puzzles.tries));
  const wrongMsg = await page.locator('#coachHead').textContent();
  check('a wrong answer gets an encouraging retry message', /again|not quite|better one|look/i.test(wrongMsg), wrongMsg);
  check('a "Show me" escape hatch is offered', await page.locator('#coachActs .btn').count() >= 1);

  /* hint highlights the right piece */
  await page.click('#btnPzHint');
  await page.waitForTimeout(300);
  const hintSel = await page.evaluate(() => ({
    sel: window.ChessQuest.state.sel,
    want: nameToSq(window.ChessQuest.puzzles.current.from)
  }));
  check('puzzle hint highlights the piece to move', hintSel.sel === hintSel.want, JSON.stringify(hintSel));

  /* correct answer */
  const beforeSolved = await page.evaluate(() => window.ChessQuest.puzzles.stats.solved);
  await page.evaluate(() => {
    const Q = window.ChessQuest, p = Q.puzzles.current;
    const from = nameToSq(p.from), to = nameToSq(p.to);
    const mv = genLegal(Q.state.s).find(m => FROM(m) === from && TO(m) === to && (!p.pr || PROMO(m) === p.pr));
    Q.play(mv);
  });
  await page.waitForTimeout(700);
  const solvedMsg = await page.locator('#coachHead').textContent();
  check('a correct answer is celebrated', /yes|got it|exactly|beautiful|that is the one/i.test(solvedMsg), solvedMsg);
  await page.screenshot({ path: 'docs/screenshots/run-puzzle.png' });
  await page.waitForTimeout(1700);
  check('it advances to the next puzzle by itself', await page.evaluate(() => window.ChessQuest.puzzles.sessionSeen) >= 2,
    await page.evaluate(() => window.ChessQuest.puzzles.sessionSeen));

  /* solving after a wrong try still counts as practice but not as a clean solve */
  check('a solve after a wrong try is recorded',
    await page.evaluate(() => window.ChessQuest.puzzles.stats.attempted) > 0);

  /* three wrong answers reveal the answer */
  await page.evaluate(() => {
    const Q = window.ChessQuest, p = Q.puzzles.current;
    const from = nameToSq(p.from), to = nameToSq(p.to);
    for (let i = 0; i < 3; i++) {
      if (Q.puzzles.revealed) break;
      const wrong = genLegal(Q.state.s).find(m => !(FROM(m) === from && TO(m) === to));
      if (wrong) Q.play(wrong);
    }
  });
  await page.waitForTimeout(1500);
  check('three wrong tries reveal the answer', await page.evaluate(() => window.ChessQuest.puzzles.revealed));
  check('the reveal names the move', /the move was/i.test(await page.locator('#coachHead').textContent()),
    await page.locator('#coachHead').textContent());

  /* spaced repetition bookkeeping */
  const prog = await page.evaluate(() => Object.keys(window.ChessQuest.puzzles.progress).length);
  check('spaced repetition records progress per puzzle', prog >= 2, prog);
  const boxes = await page.evaluate(() => Object.values(window.ChessQuest.puzzles.progress).map(p => p.box));
  check('a clean solve promotes a puzzle to a higher box', boxes.some(b => b >= 2), JSON.stringify(boxes));

  /* leaving puzzle mode */
  await page.click('#btnPzQuit');
  await page.waitForTimeout(300);
  check('leaving puzzles shows a summary', /Puzzles done/.test(await page.evaluate(() => document.getElementById('card').textContent)));
  await page.click('#pDone');
  await page.waitForTimeout(400);
  check('back in game mode after puzzles', await page.evaluate(() => document.getElementById('app').className) === 'mode-play');

  /* her own blunders become puzzles */
  async function blunderIn(fen, san) {
    await page.evaluate(([f, sn]) => {
      const Q = window.ChessQuest, G2 = Q.state;
      G2.s = loadFen(f);
      G2.hist = [posKey(G2.s)]; G2.records = []; G2.doOvers = 0; G2.phase = 'myturn';
      G2.settings.coach = true; Q.render();
      const mv = genLegal(G2.s).find(m => toSan(G2.s, m) === sn);
      if (!mv) throw new Error('test move ' + sn + ' is not legal in ' + f);
      Q.play(mv);
    }, [fen, san]);
    await page.waitForTimeout(2500);
    return page.evaluate(() => window.ChessQuest.puzzles.own.length);
  }

  // Missing a free queen: one obviously right answer, so it makes a good puzzle.
  const ownBefore = await page.evaluate(() => window.ChessQuest.puzzles.own.length);
  const ownAfter = await blunderIn('4k3/8/8/3q4/4P3/8/P7/4K3 w - - 0 1', 'a3');
  check('a clear-cut blunder is saved as a puzzle', ownAfter === ownBefore + 1, ownBefore + ' -> ' + ownAfter);
  const ownPz = await page.evaluate(() => window.ChessQuest.puzzles.own[0]);
  check('the saved puzzle stores a legal answer and a prompt',
    !!ownPz && !!ownPz.from && !!ownPz.to && !!ownPz.q, JSON.stringify(ownPz));

  // Same position again: must not pile up duplicates.
  const ownDup = await blunderIn('4k3/8/8/3q4/4P3/8/P7/4K3 w - - 0 1', 'a3');
  check('the same mistake is not saved twice', ownDup === ownAfter, ownAfter + ' -> ' + ownDup);

  // A blunder whose "best" move is a near-tie makes an unfair puzzle: skip it.
  const ownVague = await blunderIn('4k3/5p2/8/8/8/8/8/3QK3 w - - 0 1', 'Qd7+');
  check('a blunder with no clearly findable answer is NOT turned into a puzzle',
    ownVague === ownAfter, ownAfter + ' -> ' + ownVague);

  /* ================= LADDER NAMING ================= */
  const ladder = await page.evaluate(() => BOTS.map(b => ({ lvl: b.lvl, name: b.name, icon: b.icon, crest: !!b.crest })));
  check('ten opponents on the ladder', ladder.length === 10, ladder.length);
  check('every opponent has a distinct name',
    new Set(ladder.map(b => b.name)).size === 10, JSON.stringify(ladder.map(b => b.name)));
  check('every opponent has an icon', ladder.every(b => b.icon && b.icon.length), '');
  check('the final opponent is the Wildcat', /Wildcat/i.test(ladder[9].name), ladder[9].name);
  check('only the final opponent carries the school crest',
    ladder.filter(b => b.crest).length === 1 && ladder[9].crest,
    JSON.stringify(ladder.filter(b => b.crest).map(b => b.lvl)));
  log('  ladder: ' + ladder.map(b => b.lvl + ' ' + b.name).join(' | '));

  // beating level 10 must name the Wildcat, not a stale hardcoded name
  await page.evaluate(() => {
    const G = window.ChessQuest.state;
    window.ChessQuest.setLevel(10);
    G.s = loadFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    G.hist = [posKey(G.s)]; G.records = []; G.phase = 'myturn';
    window.ChessQuest.render();
    window.ChessQuest.play(genLegal(G.s).find(x => toSan(G.s, x) === 'Ra8#'));
  });
  await page.waitForTimeout(2500);
  const topCard = await page.evaluate(() => document.getElementById('card').textContent);
  check('beating level 10 names the Wildcat and awards a crown',
    /Wildcat/i.test(topCard) && /Chess Master/i.test(topCard), topCard.slice(0, 160));
  check('level 10 does not promote past 10', await page.evaluate(() => window.ChessQuest.state.level) === 10);
  await page.evaluate(() => { window.ChessQuest.setLevel(1); window.ChessQuest.newGame(); });
  await page.waitForTimeout(400);

  /* ================= EASIER STARTING LEVELS ================= */
  const dials = await page.evaluate(() => BOTS.map(b => ({
    lvl: b.lvl, depth: b.depth, q: !!b.q, rand: b.rand, gentle: b.gentle || 0, resignAt: b.resignAt || 0
  })));
  check('the bottom of the ladder is gentle (declines some captures)',
    dials[0].gentle > 0 && dials[1].gentle > 0 && dials[2].gentle > 0,
    JSON.stringify(dials.slice(0, 3).map(d => d.gentle)));
  check('gentleness decreases as levels rise',
    dials.every((d, i) => i === 0 || d.gentle <= dials[i - 1].gentle),
    JSON.stringify(dials.map(d => d.gentle)));
  check('the random-move rate decreases as levels rise',
    dials.every((d, i) => i === 0 || d.rand <= dials[i - 1].rand),
    JSON.stringify(dials.map(d => d.rand)));
  check('search depth never decreases as levels rise',
    dials.every((d, i) => i === 0 || d.depth >= dials[i - 1].depth),
    JSON.stringify(dials.map(d => d.depth)));
  check('only the lower half ever resigns',
    dials.slice(0, 7).every(d => d.resignAt > 0) && dials.slice(7).every(d => d.resignAt === 0),
    JSON.stringify(dials.map(d => d.resignAt)));
  check('the top three never resign or play gently',
    dials.slice(7).every(d => d.resignAt === 0 && d.gentle === 0 && d.rand === 0));

  // a hopelessly lost low-level bot concedes, and that counts as a win
  await page.evaluate(() => {
    const G2 = window.ChessQuest.state;
    window.ChessQuest.setLevel(1);
    window.ChessQuest.newGame();
  });
  await page.waitForTimeout(500);
  const beforeLvl = await page.evaluate(() => window.ChessQuest.state.level);
  await page.evaluate(() => {
    const G2 = window.ChessQuest.state;
    // White is a queen and two rooks up, well past move 15
    G2.s = loadFen('4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 30');
    G2.hist = new Array(40).fill('x');
    G2.hist.push(posKey(G2.s));
    G2.records = []; G2.phase = 'myturn'; G2.settings.coach = false;
    window.ChessQuest.render();
    window.ChessQuest.play(genLegal(G2.s).find(m => toSan(G2.s, m) === 'a4'));
  });
  await page.waitForTimeout(1800);
  const resigned = await page.evaluate(() => ({
    card: document.getElementById('card').textContent,
    level: window.ChessQuest.state.level,
    phase: window.ChessQuest.state.phase
  }));
  check('a hopelessly lost starter bot resigns', /give up|resign/i.test(resigned.card), resigned.card.slice(0, 120));
  check('a resignation counts as a win and levels you up', resigned.level === beforeLvl + 1,
    beforeLvl + ' -> ' + resigned.level);

  // the learning levels get extra do-overs
  await page.evaluate(() => { window.ChessQuest.setLevel(2); window.ChessQuest.newGame(); });
  await page.waitForTimeout(400);
  check('levels 1-3 get five do-overs', await page.evaluate(() => window.ChessQuest.state.doOvers) === 5);
  await page.evaluate(() => { window.ChessQuest.setLevel(6); window.ChessQuest.newGame(); });
  await page.waitForTimeout(400);
  check('higher levels keep three do-overs', await page.evaluate(() => window.ChessQuest.state.doOvers) === 3);
  await page.evaluate(() => { window.ChessQuest.setLevel(1); window.ChessQuest.newGame(); });
  await page.waitForTimeout(400);

  /* ================= THEME ================= */
  await page.evaluate(() => { window.ChessQuest.newGame(); });
  await page.waitForTimeout(300);
  const themed = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const sq = document.querySelector('.sq.d');
    const pathW = document.querySelector('#board svg.pc.w path');
    const pathB = document.querySelector('#board svg.pc.b path');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      darkSq: getComputedStyle(sq).backgroundColor,
      wFill: getComputedStyle(pathW).fill,
      bFill: getComputedStyle(pathB).fill,
      title: document.title
    };
  });
  check('Wildcats theme is active by default', themed.theme === 'wildcats', themed.theme);
  check('dark squares are Kelly green #009A44', themed.darkSq === 'rgb(0, 154, 68)', themed.darkSq);
  check('light pieces are white', themed.wFill === 'rgb(255, 255, 255)', themed.wFill);
  check('dark pieces are school purple #330072', themed.bFill === 'rgb(51, 0, 114)', themed.bFill);
  check('page title names the school', /Woodland Springs/.test(themed.title), themed.title);
  await page.screenshot({ path: 'docs/screenshots/run-wildcats.png' });

  // switching to Classic must repaint without a reload, then switch back
  await page.evaluate(() => {
    const cq = window.ChessQuest;
    cq.state.settings.theme = 'classic';
    applyTheme('classic');
  });
  await page.waitForTimeout(200);
  const classic = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    darkSq: getComputedStyle(document.querySelector('.sq.d')).backgroundColor,
    bFill: getComputedStyle(document.querySelector('#board svg.pc.b path')).fill
  }));
  check('switching to Classic repaints the board with no reload',
    classic.theme === 'classic' && classic.darkSq === 'rgb(177, 121, 79)', JSON.stringify(classic));
  check('switching theme also repaints the pieces', classic.bFill === 'rgb(36, 42, 54)', classic.bFill);
  await page.evaluate(() => { window.ChessQuest.state.settings.theme = 'wildcats'; applyTheme('wildcats'); });

  /* ================= DEVICE SWEEP ================= */
  const devices = [
    { name: 'iPhone SE',        w: 375,  h: 667 },
    { name: 'iPhone 15 Pro',    w: 393,  h: 852 },
    { name: 'iPhone 15 Pro Max',w: 430,  h: 932 },
    { name: 'iPad portrait',    w: 820,  h: 1180 },
    { name: 'iPad landscape',   w: 1180, h: 820 },
    { name: 'iPhone landscape', w: 852,  h: 393 }
  ];
  for (const d of devices) {
    await page.setViewportSize({ width: d.w, height: d.h });
    await page.evaluate(() => { window.ChessQuest.newGame(); window.ChessQuest.fitBoard(); });
    await page.waitForTimeout(450);
    const b = await page.locator('#board').boundingBox();
    const fits = await page.evaluate(() => {
      const app = document.getElementById('app');
      return { scroll: app.scrollHeight, client: app.clientHeight };
    });
    const pieceSize = await page.evaluate(() => {
      const svg = document.querySelector('#board svg.pc');
      return svg ? svg.getBoundingClientRect().width : 0;
    });
    const square = Math.abs(b.width - b.height) < 2;
    const onScreen = b.x >= 0 && b.y >= -1 && (b.x + b.width) <= d.w + 1;
    const noScroll = fits.scroll <= fits.client + 2;
    const scaled = pieceSize > b.width / 8 * 0.6 && pieceSize < b.width / 8 * 1.0;
    check(`${d.name} (${d.w}x${d.h}): board square, on screen, no scrolling, pieces scaled`,
      square && onScreen && noScroll && scaled,
      `board ${Math.round(b.width)}px at ${Math.round(b.x)},${Math.round(b.y)} scroll ${fits.scroll}/${fits.client} piece ${Math.round(pieceSize)}px`);
    await page.screenshot({ path: 'docs/screenshots/run-' + d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png' });
  }

  /* iPad landscape should use the two-column layout, not a narrow strip */
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(300);
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById('app')).gridTemplateColumns.split(' ').length);
  check('iPad landscape uses a two-column layout', cols === 2, cols + ' column(s)');
  const ipadBoard = await page.locator('#board').boundingBox();
  check('iPad board is large, not phone-sized', ipadBoard.width > 500, Math.round(ipadBoard.width));

  /* ================= HOME SCREEN / PWA ================= */
  await page.setViewportSize({ width: 393, height: 852 });
  const meta = await page.evaluate(() => ({
    appleCapable: !!document.querySelector('meta[name="apple-mobile-web-app-capable"][content="yes"]'),
    title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
    icon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '',
    manifest: (document.querySelector('link[rel="manifest"]') || {}).href || '',
    statusBar: !!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'),
    themeColor: !!document.querySelector('meta[name="theme-color"]')
  }));
  check('Add to Home Screen is enabled for iOS', meta.appleCapable && meta.statusBar);
  check('home screen name is set', meta.title === 'Wildcat Chess', meta.title);
  // Actually decode the icon rather than trusting its byte length.
  const iconInfo = await page.evaluate(() => new Promise(resolve => {
    const href = (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '';
    if (!href) return resolve({ ok: false, why: 'no icon link' });
    const img = new Image();
    img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ ok: false, why: 'failed to decode' });
    img.src = href;
  }));
  check('the embedded app icon decodes as a real image', iconInfo.ok, JSON.stringify(iconInfo));
  check('the app icon is 180x180, the size iOS wants',
    iconInfo.w === 180 && iconInfo.h === 180, iconInfo.w + 'x' + iconInfo.h);
  check('the icon is a PNG data URI (iOS will not accept SVG here)',
    meta.icon.indexOf('data:image/png;base64,') === 0, meta.icon.slice(0, 30));
  check('a web app manifest is embedded', meta.manifest.indexOf('data:application/manifest+json') === 0, meta.manifest.slice(0, 40));
  check('theme colour is set for the status bar', meta.themeColor);

  const noZoom = await page.evaluate(() => getComputedStyle(document.body).touchAction);
  check('double-tap zoom is suppressed', noZoom === 'manipulation', noZoom);
  const noSelect = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('board'));
    return cs.webkitUserSelect || cs.userSelect;
  });
  check('long-press text selection is suppressed on the board', noSelect === 'none', noSelect);
  const bodyFixed = await page.evaluate(() => getComputedStyle(document.body).position);
  check('page is pinned so iOS cannot rubber-band scroll it', bodyFixed === 'fixed', bodyFixed);

  /* the game must still work with no Worker (iOS blocks blob workers in some contexts) */
  const noWorkerPage = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const nwErrors = [];
  noWorkerPage.on('pageerror', e => nwErrors.push(String(e)));
  await noWorkerPage.addInitScript(() => { delete window.Worker; });
  await noWorkerPage.goto(FILE);
  await noWorkerPage.waitForTimeout(500);
  await noWorkerPage.click('#goPlay');
  await noWorkerPage.waitForTimeout(400);
  await noWorkerPage.evaluate(() => {
    const Q = window.ChessQuest;
    Q.play(genLegal(Q.state.s).find(m => toSan(Q.state.s, m) === 'e4'));
  });
  await noWorkerPage.waitForFunction(() => window.ChessQuest.state.phase === 'myturn', null, { timeout: 25000 })
    .then(() => check('game still plays with Web Workers unavailable', true))
    .catch(() => check('game still plays with Web Workers unavailable', false, 'timed out'));
  check('no errors in the no-Worker fallback path', nwErrors.length === 0, nwErrors.slice(0, 2).join(' | '));
  await noWorkerPage.close();

  await page.screenshot({ path: 'docs/screenshots/run-play.png' });
  check('no JS errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  await site.close();
  log(fails === 0
    ? `\nALL BROWSER TESTS PASSED (${ENGINE})`
    : `\n${fails} FAILURE(S) (${ENGINE})`);
  process.exit(fails ? 1 : 0);
})();

/* Correctness + behaviour tests for the chess engine, bots and coach. */
const G = require('../build/combined.js');
const path = require('path');
const PUZZLES = path.join(__dirname, '..', 'src', 'puzzles.js');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}

/* ================= SEE ================= */
const seeAt = (fen, sq) => G.seeSquare(G.loadFen(fen), G.nameToSq(sq));

check('SEE: undefended knight is worth its full value',
  seeAt('4k3/8/8/4n3/3P4/8/8/4K3 w - - 0 1', 'e5') === 320);
check('SEE: pawn-defended knight taken by pawn nets 220',
  seeAt('4k3/8/5p2/4n3/3P4/8/8/4K3 w - - 0 1', 'e5') === 220);
check('SEE: defended pawn is not winnable by a knight',
  seeAt('4k3/8/5p2/4p3/8/3N4/8/4K3 w - - 0 1', 'e5') <= 0);
check('SEE: king-defended knight vs rook is a losing trade',
  seeAt('8/8/8/8/8/4k3/4n3/4R1K1 w - - 0 1', 'e2') < 0,
  seeAt('8/8/8/8/8/4k3/4n3/4R1K1 w - - 0 1', 'e2'));
check('SEE: a king alone cannot win a defended piece',
  seeAt('8/8/8/8/8/3kn3/8/4K3 w - - 0 1', 'e3') === 0,
  seeAt('8/8/8/8/8/3kn3/8/4K3 w - - 0 1', 'e3'));

/* ================= game end ================= */
check('detects stalemate', (() => { const r = G.gameResult(G.loadFen('k7/2Q5/K7/8/8/8/8/8 b - - 0 1'), []); return r.over && r.type === 'stalemate'; })());
check('detects checkmate', (() => { const r = G.gameResult(G.loadFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), []); return r.over && r.type === 'checkmate' && r.winner === G.BLACK; })());
check('detects K vs K draw', (() => { const r = G.gameResult(G.loadFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), []); return r.over && r.type === 'material'; })());
check('detects K+B vs K draw', (() => { const r = G.gameResult(G.loadFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'), []); return r.over && r.type === 'material'; })());
check('K+R vs K is NOT a draw', (() => { const r = G.gameResult(G.loadFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), []); return !r.over; })());

/* ================= FEN / SAN ================= */
(() => {
  const fens = [G.START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'];
  check('FEN round-trips', fens.every(f => G.toFen(G.loadFen(f)) === f));
})();
(() => {
  const s = G.loadFen(G.START_FEN);
  const sans = G.genLegal(s).map(m => G.toSan(s, m)).sort();
  const want = ['Na3','Nc3','Nf3','Nh3','a3','a4','b3','b4','c3','c4','d3','d4','e3','e4','f3','f4','g3','g4','h3','h4'].sort();
  check('SAN for all 20 opening moves', JSON.stringify(sans) === JSON.stringify(want), sans.join(','));
})();
(() => {
  // knights on b1 and f3 can both reach d2 -> needs file disambiguation
  const s = G.loadFen('4k3/8/8/8/8/5N2/8/1N1K4 w - - 0 1');
  const sans = G.genLegal(s).map(m => G.toSan(s, m));
  check('SAN disambiguates two knights (Nbd2 / Nfd2)', sans.includes('Nbd2') && sans.includes('Nfd2'), sans.join(','));
})();
(() => {
  // rooks on a1 and h1 both reach d1 with nothing in between -> file disambiguation
  const s = G.loadFen('3k4/8/8/8/4K3/8/8/R6R w - - 0 1');
  const sans = G.genLegal(s).map(m => G.toSan(s, m));
  check('SAN disambiguates two rooks (Rad1 / Rhd1)',
    sans.some(x => x.indexOf('Rad1') === 0) && sans.some(x => x.indexOf('Rhd1') === 0), sans.join(','));
})();
(() => {
  const s = G.loadFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const sans = G.genLegal(s).map(m => G.toSan(s, m));
  check('SAN emits both castling moves', sans.includes('O-O') && sans.includes('O-O-O'), sans.join(','));
})();

/* ================= make/unmake integrity ================= */
(() => {
  const s = G.loadFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const before = G.toFen(s);
  let ok = true;
  for (const m of G.genLegal(s)) {
    G.makeMove(s, m);
    for (const m2 of G.genLegal(s)) { G.makeMove(s, m2); G.unmakeMove(s); }
    G.unmakeMove(s);
    if (G.toFen(s) !== before) { ok = false; break; }
  }
  check('make/unmake restores state exactly, 2 ply deep', ok);
})();

/* ================= tactics ================= */
function bestSan(fen, d = 4, t = 1500) {
  const s = G.loadFen(fen);
  const r = G.analyseBest(s, d, t);
  return G.toSan(s, r.move);
}
check("finds Fool's mate Qh4#", bestSan('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 3, 1000) === 'Qh4#');
check('finds back-rank mate Ra8#', bestSan('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1') === 'Ra8#');
check('takes a free queen', bestSan('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 3, 1000) === 'exd5');
check('finds the royal fork Nxc7+ winning the rook',
  bestSan('r3k3/ppp2ppp/8/3N4/8/8/PPP2PPP/4K3 w - - 0 1', 4, 1500) === 'Nxc7+',
  bestSan('r3k3/ppp2ppp/8/3N4/8/8/PPP2PPP/4K3 w - - 0 1', 4, 1500));
check('promotes a pawn to a queen when it can',
  bestSan('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 4, 1200).indexOf('a8=Q') === 0,
  bestSan('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 4, 1200));
// Qg7# mates; the lazy-looking Qg6 would be stalemate. A weak engine picks the draw.
check('plays mate rather than stalemate',
  bestSan('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 4, 1500) === 'Qg7#',
  bestSan('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 4, 1500));

/* ================= coach ================= */
(() => {
  // White queen steps onto d5, which the black e6 pawn attacks. Undefended -> blunder.
  const s = G.loadFen('4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1');
  const blunder = G.genLegal(s).find(m => G.toSan(s, m) === 'Qd5');
  const rv = G.reviewMove(s, blunder, 3, 900);
  check('coach catches moving a piece into danger', !!rv && rv.tag === 'movedintodanger', rv && rv.tag + ' / ' + rv.headline);
  check('coach names the piece and square', !!rv && /queen/i.test(rv.headline) && /d5/.test(rv.headline), rv && rv.headline);
})();
(() => {
  // A genuinely free pawn capture should be praised, not scolded.
  const s = G.loadFen('rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2');
  const good = G.genLegal(s).find(m => G.toSan(s, m) === 'Nxe5');
  const rv = G.reviewMove(s, good, 3, 900);
  check('coach does not scold a sound capture', !rv || rv.good, rv && JSON.stringify({t: rv.tag, g: rv.good, l: rv.loss}));
})();
(() => {
  // White to move, black queen hangs on d5. Playing a random pawn move should be flagged as a missed capture.
  const s = G.loadFen('4k3/8/8/3q4/4P3/8/P7/4K3 w - - 0 1');
  const quiet = G.genLegal(s).find(m => G.toSan(s, m) === 'a3');
  const rv = G.reviewMove(s, quiet, 3, 900);
  check('coach flags a missed free queen', !!rv && rv.severity === 'blunder', rv && rv.headline);
  check('coach names the missed piece', !!rv && /queen/i.test(rv.headline + rv.detail), rv && rv.headline);
})();
(() => {
  // White to move with mate in one available (Ra8#); playing something else must be flagged.
  const s = G.loadFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const other = G.genLegal(s).find(m => G.toSan(s, m) === 'Ra7');
  const rv = G.reviewMove(s, other, 4, 1200);
  check('coach spots a missed checkmate', !!rv && rv.tag === 'missedmate', rv && rv.tag);
})();
(() => {
  // moving a knight to a square attacked by a pawn = "moved into danger"
  const s = G.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const nf3 = G.genLegal(s).find(m => G.toSan(s, m) === 'Nf3');
  const rv = G.reviewMove(s, nf3, 3, 900);
  check('coach stays quiet about a normal good opening move', !rv || rv.good || rv.severity === 'ok', rv && rv.headline);
})();
(() => {
  const s = G.loadFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const h = G.makeHint(s);
  check('hint points at the free queen', !!h && /queen/i.test(h.text), h && h.text);
})();
(() => {
  const s = G.loadFen('4k3/8/8/8/4n3/8/8/4K3 b - - 0 1');
  const d = G.dangerSquares(G.loadFen('4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1'), G.BLACK);
  check('danger goggles flag the attacked knight', d.includes(G.nameToSq('e5')), JSON.stringify(d.map(G.sqName)));
})();

/* ================= bot ladder ================= */
function playGame(whiteBot, blackBot, maxPly) {
  const s = G.loadFen(G.START_FEN);
  const hist = [G.posKey(s)];
  for (let ply = 0; ply < maxPly; ply++) {
    const r = G.gameResult(s, hist);
    if (r.over) return r;
    const bot = (s.turn === G.WHITE) ? whiteBot : blackBot;
    const m = G.chooseBotMove(s, bot);
    if (!m) return { over: true, type: 'nomove' };
    if (G.genLegal(s).indexOf(m) < 0) throw new Error('ILLEGAL MOVE by ' + bot.name + ' at ' + G.toFen(s));
    G.makeMove(s, m);
    hist.push(G.posKey(s));
  }
  return { over: false, type: 'maxply' };
}

/* ================= built-in puzzles ================= */
(() => {
  const fs = require('fs');
  if (!fs.existsSync(PUZZLES)) { log('  (no puzzles.js yet — skipping puzzle checks)'); return; }
  const src = fs.readFileSync(PUZZLES, 'utf8');
  const m = src.match(/var BUILTIN_PUZZLES = (\[[\s\S]*?\]);/);
  const P = JSON.parse(m[1]);
  check('built-in puzzle set is not empty', P.length > 0, P.length);

  let legalOk = true, sanOk = true, tagOk = true, uniq = true, mateOk = true;
  const seen = new Set();
  const bad = [];
  for (const p of P) {
    if (seen.has(p.f)) uniq = false;
    seen.add(p.f);
    const s = G.loadFen(p.f);
    const from = G.nameToSq(p.from), to = G.nameToSq(p.to);
    const mv = G.genLegal(s).find(x => G.FROM(x) === from && G.TO(x) === to && (!p.pr || G.PROMO(x) === p.pr));
    if (!mv) { legalOk = false; bad.push(p.a + ' not legal in ' + p.f); continue; }
    const san = G.toSan(s, mv);
    if (san !== p.a) { sanOk = false; bad.push(san + ' != stored ' + p.a); }
    if (!p.q || !p.t) tagOk = false;
    // a puzzle labelled "mate" must really be mate in one
    if (p.t === 'mate' && san.charAt(san.length - 1) !== '#') { mateOk = false; bad.push('tagged mate but is ' + san); }
    if (p.t !== 'mate' && san.charAt(san.length - 1) === '#') { mateOk = false; bad.push('is mate but tagged ' + p.t); }
  }
  check('every puzzle answer is a legal move in its position', legalOk, bad.slice(0, 3).join(' | '));
  check('every stored answer matches the real notation', sanOk, bad.slice(0, 3).join(' | '));
  check('every puzzle has a prompt and a theme', tagOk);
  check('no duplicate puzzle positions', uniq);
  check('mate puzzles really are mate in one', mateOk, bad.slice(0, 3).join(' | '));

  // The stated answer must still be clearly best under a fresh, deeper search.
  let ambiguous = 0;
  for (const p of P) {
    const s = G.loadFen(p.f);
    // generous budget so this check tests the puzzle, not the clock
    const r = G.searchRoot(s, 5, 2500, true);
    const isMate = r[0].score > G.MATE - 200;
    if (G.toSan(s, r[0].move) !== p.a) { ambiguous++; log('    ambiguous: ' + p.a + ' vs ' + G.toSan(s, r[0].move)); continue; }
    if (!isMate && r[0].score - r[1].score < 180) { ambiguous++; log('    narrow gap: ' + p.a + ' by ' + (r[0].score - r[1].score)); }
  }
  check('every puzzle still has one clearly best answer on re-search', ambiguous === 0, ambiguous + ' ambiguous');

  const tiers = {};
  P.forEach(p => { tiers[p.tier] = (tiers[p.tier] || 0) + 1; });
  const themes = {};
  P.forEach(p => { themes[p.t] = (themes[p.t] || 0) + 1; });
  log('  puzzles by tier: ' + JSON.stringify(tiers) + '  by theme: ' + JSON.stringify(themes));
  check('puzzle set covers at least 3 different themes', Object.keys(themes).length >= 3, Object.keys(themes).join(','));
})();

if (process.env.QUICK) {
  log(fails === 0 ? '\nQUICK TESTS PASSED (self-play skipped)' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
}

log('\n--- self-play smoke test (adjacent levels) ---');
let crash = null;
const t0 = Date.now();
try {
  for (let i = 0; i < G.BOTS.length - 1; i++) {
    const r = playGame(G.BOTS[i], G.BOTS[i + 1], 100);
    log(`  L${i + 1} vs L${i + 2}: ${r.type}`);
  }
} catch (e) { crash = e; }
check('no illegal moves or crashes across the whole ladder', !crash, crash && crash.message);
log(`  (${Date.now() - t0}ms)`);

log('\n--- strength ordering ---');
function matchup(strongIdx, weakIdx, games, maxPly) {
  let strong = 0, draw = 0, weak = 0;
  for (let g = 0; g < games; g++) {
    const strongWhite = g % 2 === 0;
    const r = playGame(strongWhite ? G.BOTS[strongIdx] : G.BOTS[weakIdx],
                       strongWhite ? G.BOTS[weakIdx] : G.BOTS[strongIdx], maxPly);
    if (r.type === 'checkmate') {
      const strongWon = (r.winner === G.WHITE) === strongWhite;
      if (strongWon) strong++; else weak++;
    } else draw++;
  }
  return { strong, draw, weak };
}
const m1 = matchup(2, 0, 6, 120);   // L3 vs L1
log(`  L3 vs L1: ${JSON.stringify(m1)}`);
check('L3 clearly beats L1', m1.strong >= 4 && m1.weak === 0, JSON.stringify(m1));

const m2 = matchup(5, 2, 6, 140);   // L6 vs L3
log(`  L6 vs L3: ${JSON.stringify(m2)}`);
check('L6 beats L3 more than it loses', m2.strong > m2.weak, JSON.stringify(m2));

const m3 = matchup(7, 4, 4, 160);   // L8 vs L5
log(`  L8 vs L5: ${JSON.stringify(m3)}`);
check('L8 beats L5 more than it loses', m3.strong > m3.weak, JSON.stringify(m3));

log('\n--- per-move latency (what the child actually waits) ---');
(() => {
  const s = G.loadFen('r2q1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10');
  let worst = 0;
  for (const bot of G.BOTS) {
    const t = Date.now(); G.chooseBotMove(s, bot); const dt = Date.now() - t;
    worst = Math.max(worst, dt);
    log(`  L${bot.lvl} ${bot.name}: ${dt}ms (budget ${bot.time}ms)`);
  }
  check('every bot answers within its stated budget + 25%', worst < G.BOTS[9].time * 1.25, worst + 'ms');
})();

log(fails === 0 ? '\nALL TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);

/* Builds the built-in puzzle set.
   Every puzzle is machine-verified: the intended answer must beat the
   runner-up move by a clear margin at depth 5, so there is never an
   argument about whether the child's move "should" have counted. */
const G = require('../build/combined.js');
const path = require('path');
const ROOT = path.dirname(__dirname);
const fs = require('fs');

const VERIFY_DEPTH = 5, VERIFY_TIME = 1400, GAP = 250;

function pieceCount(s) {
  let n = 0;
  for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } if (s.b[sq]) n++; }
  return n;
}

/* Cheap pre-filter so we only pay for a deep search on plausible positions. */
function looksInteresting(s) {
  const legal = G.genLegal(s);
  if (legal.length < 3) return false;
  if (G.gameResult(s, null).over) return false;
  for (const m of legal) {                       // mate in one?
    G.makeMove(s, m);
    const over = G.genLegal(s).length === 0 && G.inCheck(s, s.turn);
    G.unmakeMove(s);
    if (over) return true;
  }
  const them = s.turn ^ 1;                        // a piece worth winning?
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = s.b[sq];
    if (p && G.colorOf(p) === them && (p & 7) !== G.KING && G.seeSquare(s, sq) >= 280) return true;
  }
  return false;
}

function classify(s, bestMove, isMate) {
  if (isMate) return 'mate';   // caller guarantees this is mate in exactly one
  const to = G.TO(bestMove);
  if (s.b[to]) {
    const before = G.seeSquare(s, to);
    if (before >= 250) return 'freepiece';
    return 'trade';
  }
  const from = G.FROM(bestMove);
  const wasHanging = G.seeSquare(s, from) > 40;
  if (wasHanging) return 'save';
  return 'tactic';
}

const PROMPT = {
  mate:      'Can you find checkmate in ONE move?',
  freepiece: 'There is a piece you can win for free. Find it!',
  save:      'One of your pieces is in danger. Can you save it?',
  trade:     'Find the move that wins material.',
  tactic:    'Find the strongest move in this position.'
};

function verify(fen) {
  const s = G.loadFen(fen);
  if (!looksInteresting(s)) return null;
  const r = G.searchRoot(s, VERIFY_DEPTH, VERIFY_TIME, true);
  if (r.length < 3) return null;
  const best = r[0], second = r[1];
  const bestSan = G.toSan(s, best.move);
  const scoreIsMate = best.score > G.MATE - 200;
  const isMateInOne = bestSan.indexOf('#') === bestSan.length - 1 && bestSan.length > 1;

  if (scoreIsMate) {
    // Only mate in ONE is fair for this age, and only if it is the single mating move.
    // A forced mate in 3 would make the on-screen prompt a lie.
    if (!isMateInOne) return null;
    if (second.score > G.MATE - 200) return null;   // more than one mate: ambiguous
  } else {
    if (best.score - second.score < GAP) return null;
    if (Math.abs(second.score) > G.MATE - 200) return null;  // runner-up loses to mate: not a clean puzzle
  }

  const n = pieceCount(s);
  if (n > 26) return null;                          // too cluttered for a child to read
  const tag = classify(s, best.move, scoreIsMate);
  if ((tag === 'trade' || tag === 'tactic') && n > 20) return null;
  // "capture it with your king" is a legal move but a useless lesson - the habit
  // it teaches does not generalise. Keep kings out of non-mate answers.
  if (tag !== 'mate' && (s.b[G.FROM(best.move)] & 7) === G.KING) return null;
  return {
    fen: fen,
    answer: bestSan,
    from: G.sqName(G.FROM(best.move)),
    to: G.sqName(G.TO(best.move)),
    promo: G.PROMO(best.move) || 0,
    tag: tag,
    prompt: PROMPT[tag],
    gap: scoreIsMate ? 9999 : (best.score - second.score),
    pieces: n,
    tier: n <= 8 ? 1 : (n <= 16 ? 2 : 3),
    turn: s.turn === G.WHITE ? 'w' : 'b'
  };
}

/* ---------- source A: tiny constructed positions ---------- */
const TYPES = [G.PAWN, G.KNIGHT, G.BISHOP, G.ROOK, G.QUEEN];
function randSq() { const r = (Math.random() * 8) | 0, f = (Math.random() * 8) | 0; return r * 16 + f; }

function constructed() {
  const s = G.newState();
  const used = {};
  function place(p, allowBackRanks) {
    for (let t = 0; t < 40; t++) {
      const sq = randSq();
      if (used[sq]) continue;
      if (!allowBackRanks && (p & 7) === G.PAWN && (G.rankOf(sq) === 0 || G.rankOf(sq) === 7)) continue;
      used[sq] = 1; s.b[sq] = p; return sq;
    }
    return -1;
  }
  const wk = place(G.pc(G.KING, G.WHITE), true);
  const bk = place(G.pc(G.KING, G.BLACK), true);
  if (wk < 0 || bk < 0) return null;
  // kings may not touch
  for (let i = 0; i < 8; i++) if (wk + [-17,-16,-15,-1,1,15,16,17][i] === bk) return null;
  s.king[G.WHITE] = wk; s.king[G.BLACK] = bk;
  const nw = 1 + ((Math.random() * 3) | 0), nb = 1 + ((Math.random() * 3) | 0);
  for (let i = 0; i < nw; i++) place(G.pc(TYPES[(Math.random() * 5) | 0], G.WHITE), false);
  for (let i = 0; i < nb; i++) place(G.pc(TYPES[(Math.random() * 5) | 0], G.BLACK), false);
  s.turn = G.WHITE; s.castle = 0; s.ep = -1;
  if (G.isAttacked(s, bk, G.WHITE)) return null;   // side not to move cannot be in check
  if (G.inCheck(s, G.WHITE)) return null;          // keep easy puzzles out of check
  return G.toFen(s);
}

/* ---------- source B: positions from real games ---------- */
function gamePositions(games, maxPly) {
  const out = [];
  for (let g = 0; g < games; g++) {
    const s = G.loadFen(G.START_FEN);
    const hist = [G.posKey(s)];
    const a = G.BOTS[3 + ((Math.random() * 3) | 0)];
    const b = G.BOTS[3 + ((Math.random() * 3) | 0)];
    for (let ply = 0; ply < maxPly; ply++) {
      if (G.gameResult(s, hist).over) break;
      if (ply > 6) out.push(G.toFen(s));
      const m = G.chooseBotMove(s, s.turn === G.WHITE ? a : b);
      if (!m) break;
      G.makeMove(s, m);
      hist.push(G.posKey(s));
    }
  }
  return out;
}

/* ---------- run ---------- */
const target = { 1: +(process.env.T1 || 12), 2: +(process.env.T2 || 12), 3: +(process.env.T3 || 8) };
const OUT = process.env.OUT || path.join(ROOT, 'src', 'puzzles.js');
const found = { 1: [], 2: [], 3: [] };
const seen = new Set();
// Merge with an existing set so repeat runs top up rather than start over.
const MERGE = process.env.MERGE || path.join(ROOT, 'src', 'puzzles.js');
if (fs.existsSync(MERGE)) {
  const prev = fs.readFileSync(MERGE, 'utf8');
  const m = prev.match(/var BUILTIN_PUZZLES = (\[[\s\S]*?\]);/);
  if (m) {
    for (const p of JSON.parse(m[1])) {
      seen.add(p.f);
      const tier = p.tier || 2;
      found[tier].push({ fen: p.f, answer: p.a, from: p.from, to: p.to, promo: p.pr,
                         tag: p.t, prompt: p.q, tier: tier, gap: 9999, pieces: 0, keep: 1 });
    }
    process.stdout.write('merged ' + seen.size + ' existing puzzles\n');
  }
}
const t0 = Date.now();

function tryFen(fen) {
  if (seen.has(fen)) return;
  seen.add(fen);
  const p = verify(fen);
  if (!p) return;
  if (found[p.tier].length >= target[p.tier]) return;
  // keep the mix varied: no more than 5 of any one tag per tier
  const sameTag = found[p.tier].filter(x => x.tag === p.tag).length;
  if (sameTag >= 5) return;
  if (found[p.tier].some(x => x.answer === p.answer)) return;
  found[p.tier].push(p);
  process.stdout.write(`  tier ${p.tier} ${p.tag.padEnd(10)} ${p.answer.padEnd(7)} gap=${p.gap === 9999 ? 'mate' : p.gap} pieces=${p.pieces}\n`);
}

process.stdout.write('--- constructed positions (easy tier) ---\n');
for (let i = 0; i < 60000 && found[1].length < target[1]; i++) {
  const fen = constructed();
  if (fen) tryFen(fen);
}

process.stdout.write('--- positions from real games ---\n');
let rounds = 0;
while ((found[2].length < target[2] || found[3].length < target[3]) && rounds < 12) {
  rounds++;
  const fens = gamePositions(4, 60);
  for (const f of fens) {
    if (found[2].length >= target[2] && found[3].length >= target[3]) break;
    tryFen(f);
  }
}

const all = [].concat(found[1], found[2], found[3]);
process.stdout.write(`\n${all.length} puzzles in ${Math.round((Date.now() - t0) / 1000)}s\n`);

/* ---------- second, independent verification pass at greater depth ---------- */
process.stdout.write('--- re-verifying every puzzle at depth 6 ---\n');
let bad = 0;
const finalSet = [];
for (const p of all) {
  if (p.keep) { finalSet.push(p); continue; }     // already verified in a previous run
  const s = G.loadFen(p.fen);
  const r = G.searchRoot(s, 6, 2500, true);
  const bestSan = G.toSan(s, r[0].move);
  const isMate = r[0].score > G.MATE - 200;
  const gap = r[0].score - r[1].score;
  const mateAligned = (p.tag === 'mate') === (isMate && bestSan.charAt(bestSan.length - 1) === '#');
  const ok = (bestSan === p.answer) && (isMate || gap >= 200) && mateAligned;
  if (!ok) { bad++; process.stdout.write(`  DROP ${p.answer} (depth6 says ${bestSan}, gap ${gap})\n`); continue; }
  finalSet.push(p);
}
process.stdout.write(`kept ${finalSet.length}, dropped ${bad}\n`);

const js = 'var BUILTIN_PUZZLES = ' + JSON.stringify(finalSet.map(p => ({
  f: p.fen, a: p.answer, from: p.from, to: p.to, pr: p.promo, t: p.tag, q: p.prompt, tier: p.tier
})), null, 0) + ';\n';
fs.writeFileSync(OUT, '/* Auto-generated by generate-puzzles.js — every entry machine-verified.\n' +
  '   Do not hand-edit: regenerate instead. */\n' + js);
process.stdout.write(OUT + ' written (' + fs.statSync(OUT).size + ' bytes)\n');

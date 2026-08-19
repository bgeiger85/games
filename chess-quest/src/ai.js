/* ============================================================
   AI LAYER — evaluation, search, bot ladder, coach analysis
   Depends on engine.js globals.
   ============================================================ */

var PST = {};
PST[PAWN] = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0];
PST[KNIGHT] = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50];
PST[BISHOP] = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20];
PST[ROOK] = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0];
PST[QUEEN] = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20];
var KING_MID = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20];
var KING_END = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50];

var MATE = 100000;

function pstIndex(sq, color) {
  var r = sq >> 4, f = sq & 15;
  return (color === WHITE) ? (r * 8 + f) : ((7 - r) * 8 + f);
}

var _pfW = new Int8Array(8), _pfB = new Int8Array(8);

function evaluate(s) {
  var b = s.b, sq, p, t, c, phase = 0, score = 0;
  var bishW = 0, bishB = 0, i;
  for (i = 0; i < 8; i++) { _pfW[i] = 0; _pfB[i] = 0; }

  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p) continue;
    t = p & 7;
    if (t !== KING && t !== PAWN) phase += VAL[t];
    if (t === BISHOP) { if (p & CB) bishB++; else bishW++; }
    if (t === PAWN) { if (p & CB) _pfB[sq & 15]++; else _pfW[sq & 15]++; }
  }
  var endgame = phase < 1800;

  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p) continue;
    t = p & 7; c = (p & CB) ? BLACK : WHITE;
    var v = VAL[t];
    var idx = pstIndex(sq, c);
    if (t === KING) v += endgame ? KING_END[idx] : KING_MID[idx];
    else v += PST[t][idx];
    score += (c === WHITE) ? v : -v;
  }

  if (bishW >= 2) score += 30;
  if (bishB >= 2) score -= 30;
  for (i = 0; i < 8; i++) {
    if (_pfW[i] > 1) score -= 15 * (_pfW[i] - 1);
    if (_pfB[i] > 1) score += 15 * (_pfB[i] - 1);
  }
  return (s.turn === WHITE) ? score : -score;
}

/* ---------- move ordering (allocation-light, lazy selection) ---------- */

function scoreMoves(s, moves, pvMove, killers, ply) {
  var n = moves.length, sc = new Int32Array(n), b = s.b;
  var kill0 = 0, kill1 = 0;
  if (killers && killers[ply]) { kill0 = killers[ply][0]; kill1 = killers[ply][1]; }
  for (var i = 0; i < n; i++) {
    var m = moves[i], to = (m >> 7) & 127, from = m & 127;
    var victim = b[to], v = 0;
    if (victim) v = 100000 + 10 * VAL[victim & 7] - VAL[b[from] & 7];
    else if (((m >> 17) & 7) === F_EP) v = 100000 + 10 * VAL[PAWN] - VAL[PAWN];
    var promo = (m >> 14) & 7;
    if (promo) v += VAL[promo];
    if (m === pvMove) v += 1000000;
    else if (v < 100000) {
      if (m === kill0) v += 9000;
      else if (m === kill1) v += 8000;
    }
    sc[i] = v;
  }
  return sc;
}

function pickNext(moves, sc, i) {
  var bi = i, n = moves.length;
  for (var j = i + 1; j < n; j++) if (sc[j] > sc[bi]) bi = j;
  if (bi !== i) {
    var tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
    var ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts;
  }
}

/* ---------- search ---------- */

function Searcher() {
  this.nodes = 0;
  this.deadline = 0;
  this.aborted = false;
  this.killers = [];
}

Searcher.prototype.timeUp = function () {
  if (this.aborted) return true;
  if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) { this.aborted = true; return true; }
  return false;
};

Searcher.prototype.quiesce = function (s, alpha, beta, depth) {
  this.nodes++;
  if (this.timeUp()) return alpha;
  var stand = evaluate(s);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  var caps = genLegalCaptures(s);
  var sc = scoreMoves(s, caps, 0, null, 0);
  for (var i = 0; i < caps.length; i++) {
    pickNext(caps, sc, i);
    makeMove(s, caps[i]);
    var v = -this.quiesce(s, -beta, -alpha, depth - 1);
    unmakeMove(s);
    if (this.aborted) return alpha;
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
};

Searcher.prototype.negamax = function (s, depth, alpha, beta, ply, useQ) {
  this.nodes++;
  if (this.timeUp()) return alpha;

  var checked = inCheck(s, s.turn);
  if (checked && ply < 12) depth++;                 // bounded check extension

  if (depth <= 0) return useQ ? this.quiesce(s, alpha, beta, 6) : evaluate(s);

  var moves = genLegal(s);
  if (moves.length === 0) return checked ? (-MATE + ply) : 0;
  if (s.half >= 100) return 0;

  var sc = scoreMoves(s, moves, 0, this.killers, ply);
  var best = -Infinity, b = s.b;
  for (var i = 0; i < moves.length; i++) {
    pickNext(moves, sc, i);
    var m = moves[i];
    var isQuiet = !b[(m >> 7) & 127] && ((m >> 17) & 7) !== F_EP;
    makeMove(s, m);
    var v = -this.negamax(s, depth - 1, -beta, -alpha, ply + 1, useQ);
    unmakeMove(s);
    if (this.aborted) return (best === -Infinity) ? alpha : best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (isQuiet) {
        if (!this.killers[ply]) this.killers[ply] = [0, 0];
        if (this.killers[ply][0] !== m) {
          this.killers[ply][1] = this.killers[ply][0];
          this.killers[ply][0] = m;
        }
      }
      break;
    }
  }
  return best;
};

/* Root search: returns every legal move scored, best first. */
function searchRoot(s, maxDepth, timeMs, useQ) {
  var searcher = new Searcher();
  searcher.deadline = Date.now() + (timeMs || 800);
  var moves = genLegal(s);
  if (moves.length === 0) return [];

  var results = [];
  for (var i0 = 0; i0 < moves.length; i0++) results.push({ move: moves[i0], score: 0 });
  var bestMove = 0;

  for (var d = 1; d <= maxDepth; d++) {
    var sc = scoreMoves(s, moves, bestMove, null, 0);
    var alpha = -Infinity;
    var iter = [];
    var aborted = false;
    for (var i = 0; i < moves.length; i++) {
      pickNext(moves, sc, i);
      var m = moves[i];
      // Full window at every root move: we need exact scores, not bounds,
      // because the weaker bots pick randomly among near-equal top moves.
      makeMove(s, m);
      var v = -searcher.negamax(s, d - 1, -Infinity, Infinity, 1, useQ);
      unmakeMove(s);
      if (searcher.aborted) { aborted = true; break; }
      iter.push({ move: m, score: v });
      if (v > alpha) { alpha = v; bestMove = m; }
    }
    if (!aborted && iter.length === moves.length) {
      iter.sort(function (a, b) { return b.score - a.score; });
      results = iter;
      bestMove = results[0].move;
    }
    if (aborted) break;
    if (Math.abs(alpha) > MATE - 200) break;   // forced mate found
    if (Date.now() > searcher.deadline) break;
  }
  // An aborted iteration still searched the best-ordered moves first, so if it
  // turned up a different favourite, trust the deeper (partial) information.
  if (bestMove && results.length && results[0].move !== bestMove) {
    for (var k = 1; k < results.length; k++) {
      if (results[k].move === bestMove) {
        var promoted = results.splice(k, 1)[0];
        results.unshift(promoted);
        break;
      }
    }
  }
  results.nodes = searcher.nodes;
  return results;
}

/* ---------- static exchange evaluation on a square ----------
   "If the opponent starts capturing here, how much do they win?"
   Positive => that piece is hanging or under-defended. */

function attackersTo(s, sq, by) {
  var list = [], b = s.b, t, i, d, p;
  if (by === WHITE) {
    t = sq + 15; if (!(t & 0x88) && b[t] === PAWN) list.push(PAWN);
    t = sq + 17; if (!(t & 0x88) && b[t] === PAWN) list.push(PAWN);
  } else {
    t = sq - 15; if (!(t & 0x88) && b[t] === (PAWN | CB)) list.push(PAWN);
    t = sq - 17; if (!(t & 0x88) && b[t] === (PAWN | CB)) list.push(PAWN);
  }
  for (i = 0; i < 8; i++) { t = sq + KNIGHT_D[i]; if (!(t & 0x88) && b[t] === pc(KNIGHT, by)) list.push(KNIGHT); }
  for (i = 0; i < 8; i++) { t = sq + KING_D[i]; if (!(t & 0x88) && b[t] === pc(KING, by)) list.push(KING); }
  for (i = 0; i < 4; i++) {
    d = BISHOP_D[i]; t = sq + d;
    while (!(t & 0x88)) {
      p = b[t];
      if (p) { if (colorOf(p) === by && ((p & 7) === BISHOP || (p & 7) === QUEEN)) list.push(p & 7); break; }
      t += d;
    }
  }
  for (i = 0; i < 4; i++) {
    d = ROOK_D[i]; t = sq + d;
    while (!(t & 0x88)) {
      p = b[t];
      if (p) { if (colorOf(p) === by && ((p & 7) === ROOK || (p & 7) === QUEEN)) list.push(p & 7); break; }
      t += d;
    }
  }
  list.sort(function (a, b2) { return VAL[a] - VAL[b2]; });
  return list;
}

function seeSquare(s, sq) {
  var victim = s.b[sq];
  if (!victim) return 0;
  var owner = colorOf(victim);
  var atk = attackersTo(s, sq, owner ^ 1);
  var def = attackersTo(s, sq, owner);
  if (atk.length === 0) return 0;
  // a king may not capture into a defended square
  if (atk.length === 1 && atk[0] === KING && def.length > 0) return 0;
  if (atk[atk.length - 1] === KING && def.length > 0) atk.pop();
  if (atk.length === 0) return 0;

  var gain = [VAL[victim & 7]];
  var ai = 0, di = 0, depth = 0, sideAtk = true, onSq;
  while (true) {
    if (sideAtk) { if (ai >= atk.length) break; onSq = atk[ai++]; }
    else { if (di >= def.length) break; onSq = def[di++]; }
    depth++;
    gain[depth] = VAL[onSq] - gain[depth - 1];
    sideAtk = !sideAtk;
  }
  for (var k = depth - 1; k > 0; k--) {
    gain[k - 1] = -Math.max(-gain[k - 1], gain[k]);
  }
  return gain[0];
}

/* Every piece of `color` the opponent can profitably win right now. */
function hangingPieces(s, color) {
  var out = [];
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = s.b[sq];
    if (!p || colorOf(p) !== color || (p & 7) === KING) continue;
    var v = seeSquare(s, sq);
    if (v > 40) out.push({ sq: sq, type: p & 7, gain: v });
  }
  out.sort(function (a, b) { return b.gain - a.gain; });
  return out;
}

/* ---------- bot ladder ---------- */

var BOTS = [
  /* The ladder walks the woods and ends at the school mascot.

     Dials, in the order they matter for a beginner:
       gentle   fraction of turns the bot declines to capture at all. This is
                what makes the bottom of the ladder easier than "random", because
                a random mover still takes hanging pieces by accident, and that
                is precisely what a struggling learner keeps losing to.
       rand     fraction of turns it throws away a random legal move
       depth    search depth
       q        quiescence, the single biggest strength jump
       resignAt material deficit (in pawns) at which it concedes, so a learner
                who wins the material actually gets the win even if she cannot
                yet force mate. 0 means it never resigns.

     Measured, not guessed. Re-run `npm run test:engine` after any change. */
  { lvl: 1,  name: 'Pip the Chipmunk', icon: '\uD83D\uDC3F\uFE0F', depth: 0, q: false, rand: 1.00, gentle: 0.75, top: 1, time: 200, resignAt: 6,
    line: "I am brand new at chess. Go easy on me!" },
  { lvl: 2,  name: 'Nutmeg the Rabbit', icon: '\uD83D\uDC30', depth: 1, q: false, rand: 0.78, gentle: 0.48, top: 3, time: 250, resignAt: 7,
    line: "I hop about a lot. I might not notice your pieces." },
  { lvl: 3,  name: 'Bramble the Hedgehog', icon: '\uD83E\uDD94', depth: 1, q: false, rand: 0.64, gentle: 0.32, top: 3, time: 300, resignAt: 8,
    line: "I am starting to spot free pieces. Keep yours safe!" },
  { lvl: 4,  name: 'Dozer the Beaver', icon: '\uD83E\uDDAB', depth: 1, q: false, rand: 0.52, gentle: 0.21, top: 3, time: 350, resignAt: 9,
    line: "I build my plan one move at a time. Careful!" },
  { lvl: 5,  name: 'Bandit the Raccoon', icon: '\uD83E\uDD9D', depth: 2, q: false, rand: 0.44, gentle: 0.15, top: 3, time: 400, resignAt: 10,
    line: "I check my trades before I take. Are you checking yours?" },
  { lvl: 6,  name: 'Ember the Fox', icon: '\uD83E\uDD8A', depth: 2, q: true,  rand: 0.30, gentle: 0.06, top: 2, time: 500, resignAt: 12,
    line: "I look for forks. Watch your king and queen on the same line." },
  { lvl: 7,  name: 'Digger the Badger', icon: '\uD83E\uDDA1', depth: 3, q: true,  rand: 0.07, gentle: 0, top: 3, time: 800, resignAt: 14,
    line: "I punish loose pieces. Defend before you attack." },
  { lvl: 8,  name: 'Shadow the Coyote', icon: '\uD83D\uDC3A', depth: 4, q: true,  rand: 0.00, gentle: 0, top: 2, time: 1200, resignAt: 0,
    line: "I hunt in a straight line. You will need a real plan." },
  { lvl: 9,  name: 'Talon the Hawk', icon: '\uD83E\uDD85', depth: 5, q: true,  rand: 0.00, gentle: 0, top: 1, time: 2200, resignAt: 0,
    line: "I see the whole board from up here. No free gifts." },
  { lvl: 10, name: 'The Wildcat', icon: '\uD83D\uDC2F', crest: true, depth: 6, q: true, rand: 0.00, gentle: 0, top: 1, time: 3200, resignAt: 0,
    line: "Beat me and you are a Woodland Springs Chess Master." }
];

/* Would this bot concede? A learner who wins the material should get the win
   even before she can force mate; without this she captures everything and the
   game dribbles into a draw, which is the opposite of encouraging.
   Only the lower half of the ladder ever resigns, and never before move 15, so
   she still gets a real game and still has to learn mating higher up. */
function shouldResign(s, bot, botColor, plyCount) {
  if (!bot || !bot.resignAt) return false;
  if (plyCount < 30) return false;
  return (materialCount(s, botColor ^ 1) - materialCount(s, botColor)) >= bot.resignAt;
}

function chooseBotMove(s, bot) {
  var legal = genLegal(s);
  if (!legal.length) return 0;
  if (legal.length === 1) return legal[0];

  // Gentle turns: decline to capture at all, so a hanging piece usually survives.
  var pool = legal;
  if (bot.gentle && Math.random() < bot.gentle) {
    var quiet = [];
    for (var g = 0; g < legal.length; g++) {
      if (!s.b[TO(legal[g])] && FLAG(legal[g]) !== F_EP) quiet.push(legal[g]);
    }
    if (quiet.length) pool = quiet;
  }

  if (bot.depth === 0) return pool[Math.floor(Math.random() * pool.length)];
  if (bot.rand > 0 && Math.random() < bot.rand) return pool[Math.floor(Math.random() * pool.length)];

  var results = searchRoot(s, bot.depth, bot.time, bot.q);
  if (!results.length) return pool[0];

  if (pool !== legal) {                       // keep the search honest but gentle
    var allowed = {}, i2;
    for (i2 = 0; i2 < pool.length; i2++) allowed[pool[i2]] = 1;
    var kept = [];
    for (i2 = 0; i2 < results.length; i2++) if (allowed[results[i2].move]) kept.push(results[i2]);
    if (kept.length) results = kept;
  }

  if (bot.top <= 1) return results[0].move;
  var bestScore = results[0].score, poolTop = [];
  for (var i = 0; i < results.length && poolTop.length < bot.top; i++) {
    if (bestScore - results[i].score <= 40) poolTop.push(results[i].move);
  }
  if (!poolTop.length) return results[0].move;
  return poolTop[Math.floor(Math.random() * poolTop.length)];
}

/* ---------- coach ---------- */

var COACH_DEPTH = 3, COACH_TIME = 600;

function analyseBest(s, depth, time) {
  var r = searchRoot(s, depth || COACH_DEPTH, time || COACH_TIME, true);
  return r.length ? r[0] : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evaluate: evaluate, searchRoot: searchRoot, chooseBotMove: chooseBotMove,
    BOTS: BOTS, seeSquare: seeSquare, hangingPieces: hangingPieces,
    attackersTo: attackersTo, analyseBest: analyseBest, MATE: MATE, shouldResign: shouldResign
  };
}

/* ============================================================
   CHESS ENGINE — rules layer
   0x88 board. Pure logic, no DOM. Shared by the game and tests.
   ============================================================ */

var WHITE = 0, BLACK = 1;
var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
var CB = 8; // color bit: set = black

function pc(type, color) { return type | (color ? CB : 0); }
function typeOf(p) { return p & 7; }
function colorOf(p) { return (p & CB) ? BLACK : WHITE; }

var KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
var BISHOP_D = [-17, -15, 15, 17];
var ROOK_D   = [-16, -1, 1, 16];
var KING_D   = [-17, -16, -15, -1, 1, 15, 16, 17];

// move flags
var F_NORMAL = 0, F_DPP = 1, F_KCASTLE = 2, F_QCASTLE = 3, F_EP = 4;

function MOVE(from, to, promo, flag) {
  return from | (to << 7) | ((promo || 0) << 14) | ((flag || 0) << 17);
}
function FROM(m) { return m & 127; }
function TO(m) { return (m >> 7) & 127; }
function PROMO(m) { return (m >> 14) & 7; }
function FLAG(m) { return (m >> 17) & 7; }

// castling rights bits
var C_WK = 1, C_WQ = 2, C_BK = 4, C_BQ = 8;

var SQ = {
  a8: 0, b8: 1, c8: 2, d8: 3, e8: 4, f8: 5, g8: 6, h8: 7,
  a1: 112, b1: 113, c1: 114, d1: 115, e1: 116, f1: 117, g1: 118, h1: 119
};

function fileOf(sq) { return sq & 15; }
function rankOf(sq) { return sq >> 4; }          // 0 = 8th rank, 7 = 1st rank
function sqName(sq) { return 'abcdefgh'[fileOf(sq)] + (8 - rankOf(sq)); }
function nameToSq(n) {
  var f = 'abcdefgh'.indexOf(n[0]);
  var r = 8 - parseInt(n[1], 10);
  return r * 16 + f;
}

/* ---------- state ---------- */

function newState() {
  return {
    b: new Int8Array(128),
    turn: WHITE,
    castle: 0,
    ep: -1,
    half: 0,
    full: 1,
    king: [SQ.e1, SQ.e8],
    hist: []
  };
}

function cloneState(s) {
  var n = newState();
  n.b = Int8Array.from(s.b);
  n.turn = s.turn; n.castle = s.castle; n.ep = s.ep;
  n.half = s.half; n.full = s.full;
  n.king = [s.king[0], s.king[1]];
  n.hist = [];
  return n;
}

var PIECE_CHARS = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
var CHAR_OF = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };

function loadFen(fen) {
  var s = newState();
  var parts = fen.trim().split(/\s+/);
  var rows = parts[0].split('/');
  for (var r = 0; r < 8; r++) {
    var f = 0;
    for (var i = 0; i < rows[r].length; i++) {
      var ch = rows[r][i];
      if (ch >= '1' && ch <= '8') { f += parseInt(ch, 10); continue; }
      var color = (ch === ch.toLowerCase()) ? BLACK : WHITE;
      var t = PIECE_CHARS[ch.toLowerCase()];
      var sq = r * 16 + f;
      s.b[sq] = pc(t, color);
      if (t === KING) s.king[color] = sq;
      f++;
    }
  }
  s.turn = (parts[1] === 'b') ? BLACK : WHITE;
  s.castle = 0;
  if (parts[2] && parts[2] !== '-') {
    if (parts[2].indexOf('K') >= 0) s.castle |= C_WK;
    if (parts[2].indexOf('Q') >= 0) s.castle |= C_WQ;
    if (parts[2].indexOf('k') >= 0) s.castle |= C_BK;
    if (parts[2].indexOf('q') >= 0) s.castle |= C_BQ;
  }
  s.ep = (parts[3] && parts[3] !== '-') ? nameToSq(parts[3]) : -1;
  s.half = parts[4] ? parseInt(parts[4], 10) : 0;
  s.full = parts[5] ? parseInt(parts[5], 10) : 1;
  return s;
}

function toFen(s) {
  var out = '';
  for (var r = 0; r < 8; r++) {
    var empty = 0;
    for (var f = 0; f < 8; f++) {
      var p = s.b[r * 16 + f];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      var ch = CHAR_OF[typeOf(p)];
      out += (colorOf(p) === WHITE) ? ch.toUpperCase() : ch;
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  out += ' ' + (s.turn === WHITE ? 'w' : 'b') + ' ';
  var c = '';
  if (s.castle & C_WK) c += 'K';
  if (s.castle & C_WQ) c += 'Q';
  if (s.castle & C_BK) c += 'k';
  if (s.castle & C_BQ) c += 'q';
  out += (c || '-') + ' ';
  out += (s.ep >= 0 ? sqName(s.ep) : '-') + ' ';
  out += s.half + ' ' + s.full;
  return out;
}

var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* ---------- attacks ---------- */

function isAttacked(s, sq, by) {
  var b = s.b, t, d, i, p;
  // pawns
  if (by === WHITE) {
    t = sq + 15; if (!(t & 0x88) && b[t] === PAWN) return true;
    t = sq + 17; if (!(t & 0x88) && b[t] === PAWN) return true;
  } else {
    t = sq - 15; if (!(t & 0x88) && b[t] === (PAWN | CB)) return true;
    t = sq - 17; if (!(t & 0x88) && b[t] === (PAWN | CB)) return true;
  }
  var kn = pc(KNIGHT, by), kg = pc(KING, by);
  for (i = 0; i < 8; i++) { t = sq + KNIGHT_D[i]; if (!(t & 0x88) && b[t] === kn) return true; }
  for (i = 0; i < 8; i++) { t = sq + KING_D[i]; if (!(t & 0x88) && b[t] === kg) return true; }
  var bq = pc(BISHOP, by), qq = pc(QUEEN, by), rq = pc(ROOK, by);
  for (i = 0; i < 4; i++) {
    d = BISHOP_D[i]; t = sq + d;
    while (!(t & 0x88)) {
      p = b[t];
      if (p) { if (p === bq || p === qq) return true; break; }
      t += d;
    }
  }
  for (i = 0; i < 4; i++) {
    d = ROOK_D[i]; t = sq + d;
    while (!(t & 0x88)) {
      p = b[t];
      if (p) { if (p === rq || p === qq) return true; break; }
      t += d;
    }
  }
  return false;
}

function inCheck(s, color) {
  if (color === undefined) color = s.turn;
  return isAttacked(s, s.king[color], color ^ 1);
}

/* ---------- move generation ---------- */

var PROMO_PIECES = [QUEEN, ROOK, BISHOP, KNIGHT];

function genPseudo(s, capturesOnly) {
  var moves = [], b = s.b, us = s.turn, them = us ^ 1;
  var i, sq, p, t, d, j, k;
  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p || colorOf(p) !== us) continue;
    var ty = typeOf(p);

    if (ty === PAWN) {
      var fwd = (us === WHITE) ? -16 : 16;
      var startRank = (us === WHITE) ? 6 : 1;
      var promoRank = (us === WHITE) ? 0 : 7;
      t = sq + fwd;
      if (!capturesOnly && !(t & 0x88) && !b[t]) {
        if (rankOf(t) === promoRank) {
          for (k = 0; k < 4; k++) moves.push(MOVE(sq, t, PROMO_PIECES[k], F_NORMAL));
        } else {
          moves.push(MOVE(sq, t, 0, F_NORMAL));
          if (rankOf(sq) === startRank && !b[sq + 2 * fwd]) {
            moves.push(MOVE(sq, sq + 2 * fwd, 0, F_DPP));
          }
        }
      }
      var caps = [fwd - 1, fwd + 1];
      for (j = 0; j < 2; j++) {
        t = sq + caps[j];
        if (t & 0x88) continue;
        if (b[t] && colorOf(b[t]) === them) {
          if (rankOf(t) === promoRank) {
            for (k = 0; k < 4; k++) moves.push(MOVE(sq, t, PROMO_PIECES[k], F_NORMAL));
          } else moves.push(MOVE(sq, t, 0, F_NORMAL));
        } else if (t === s.ep) {
          moves.push(MOVE(sq, t, 0, F_EP));
        }
      }
      continue;
    }

    if (ty === KNIGHT || ty === KING) {
      var dirs = (ty === KNIGHT) ? KNIGHT_D : KING_D;
      for (i = 0; i < 8; i++) {
        t = sq + dirs[i];
        if (t & 0x88) continue;
        if (b[t]) {
          if (colorOf(b[t]) === them) moves.push(MOVE(sq, t, 0, F_NORMAL));
        } else if (!capturesOnly) moves.push(MOVE(sq, t, 0, F_NORMAL));
      }
      continue;
    }

    var dd = (ty === BISHOP) ? BISHOP_D : (ty === ROOK) ? ROOK_D : KING_D;
    var nd = (ty === QUEEN) ? 8 : 4;
    for (i = 0; i < nd; i++) {
      d = dd[i]; t = sq + d;
      while (!(t & 0x88)) {
        if (b[t]) {
          if (colorOf(b[t]) === them) moves.push(MOVE(sq, t, 0, F_NORMAL));
          break;
        }
        if (!capturesOnly) moves.push(MOVE(sq, t, 0, F_NORMAL));
        t += d;
      }
    }
  }

  // castling
  if (!capturesOnly) {
    var them2 = us ^ 1;
    if (us === WHITE) {
      if ((s.castle & C_WK) && !b[SQ.f1] && !b[SQ.g1] && b[SQ.h1] === pc(ROOK, WHITE) &&
          !isAttacked(s, SQ.e1, them2) && !isAttacked(s, SQ.f1, them2) && !isAttacked(s, SQ.g1, them2))
        moves.push(MOVE(SQ.e1, SQ.g1, 0, F_KCASTLE));
      if ((s.castle & C_WQ) && !b[SQ.d1] && !b[SQ.c1] && !b[SQ.b1] && b[SQ.a1] === pc(ROOK, WHITE) &&
          !isAttacked(s, SQ.e1, them2) && !isAttacked(s, SQ.d1, them2) && !isAttacked(s, SQ.c1, them2))
        moves.push(MOVE(SQ.e1, SQ.c1, 0, F_QCASTLE));
    } else {
      if ((s.castle & C_BK) && !b[SQ.f8] && !b[SQ.g8] && b[SQ.h8] === pc(ROOK, BLACK) &&
          !isAttacked(s, SQ.e8, them2) && !isAttacked(s, SQ.f8, them2) && !isAttacked(s, SQ.g8, them2))
        moves.push(MOVE(SQ.e8, SQ.g8, 0, F_KCASTLE));
      if ((s.castle & C_BQ) && !b[SQ.d8] && !b[SQ.c8] && !b[SQ.b8] && b[SQ.a8] === pc(ROOK, BLACK) &&
          !isAttacked(s, SQ.e8, them2) && !isAttacked(s, SQ.d8, them2) && !isAttacked(s, SQ.c8, them2))
        moves.push(MOVE(SQ.e8, SQ.c8, 0, F_QCASTLE));
    }
  }
  return moves;
}

var CASTLE_MASK = new Int8Array(128);
(function () {
  for (var i = 0; i < 128; i++) CASTLE_MASK[i] = 15;
  CASTLE_MASK[SQ.e1] = 15 & ~(C_WK | C_WQ);
  CASTLE_MASK[SQ.h1] = 15 & ~C_WK;
  CASTLE_MASK[SQ.a1] = 15 & ~C_WQ;
  CASTLE_MASK[SQ.e8] = 15 & ~(C_BK | C_BQ);
  CASTLE_MASK[SQ.h8] = 15 & ~C_BK;
  CASTLE_MASK[SQ.a8] = 15 & ~C_BQ;
})();

function makeMove(s, m) {
  var from = FROM(m), to = TO(m), promo = PROMO(m), flag = FLAG(m);
  var b = s.b, p = b[from], us = colorOf(p);
  var captured = b[to], capSq = to;

  if (flag === F_EP) {
    capSq = to + (us === WHITE ? 16 : -16);
    captured = b[capSq];
  }

  s.hist.push({
    m: m, cap: captured, capSq: capSq, castle: s.castle,
    ep: s.ep, half: s.half, king: s.king[us]
  });

  if (captured) b[capSq] = 0;
  b[to] = promo ? pc(promo, us) : p;
  b[from] = 0;

  if (flag === F_KCASTLE) {
    if (us === WHITE) { b[SQ.f1] = b[SQ.h1]; b[SQ.h1] = 0; }
    else { b[SQ.f8] = b[SQ.h8]; b[SQ.h8] = 0; }
  } else if (flag === F_QCASTLE) {
    if (us === WHITE) { b[SQ.d1] = b[SQ.a1]; b[SQ.a1] = 0; }
    else { b[SQ.d8] = b[SQ.a8]; b[SQ.a8] = 0; }
  }

  if (typeOf(p) === KING) s.king[us] = to;

  s.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
  s.ep = (flag === F_DPP) ? (from + (us === WHITE ? -16 : 16)) : -1;
  s.half = (captured || typeOf(p) === PAWN) ? 0 : s.half + 1;
  if (us === BLACK) s.full++;
  s.turn = us ^ 1;
}

function unmakeMove(s) {
  var h = s.hist.pop();
  if (!h) return;
  var m = h.m, from = FROM(m), to = TO(m), promo = PROMO(m), flag = FLAG(m);
  var b = s.b;
  var us = s.turn ^ 1;

  var moved = b[to];
  b[from] = promo ? pc(PAWN, us) : moved;
  b[to] = 0;
  if (h.cap) b[h.capSq] = h.cap;

  if (flag === F_KCASTLE) {
    if (us === WHITE) { b[SQ.h1] = b[SQ.f1]; b[SQ.f1] = 0; }
    else { b[SQ.h8] = b[SQ.f8]; b[SQ.f8] = 0; }
  } else if (flag === F_QCASTLE) {
    if (us === WHITE) { b[SQ.a1] = b[SQ.d1]; b[SQ.d1] = 0; }
    else { b[SQ.a8] = b[SQ.d8]; b[SQ.d8] = 0; }
  }

  s.king[us] = h.king;
  s.castle = h.castle;
  s.ep = h.ep;
  s.half = h.half;
  if (us === BLACK) s.full--;
  s.turn = us;
}

function genLegal(s) {
  var pseudo = genPseudo(s, false), out = [], us = s.turn;
  for (var i = 0; i < pseudo.length; i++) {
    makeMove(s, pseudo[i]);
    if (!isAttacked(s, s.king[us], us ^ 1)) out.push(pseudo[i]);
    unmakeMove(s);
  }
  return out;
}

function genLegalCaptures(s) {
  var pseudo = genPseudo(s, true), out = [], us = s.turn;
  for (var i = 0; i < pseudo.length; i++) {
    makeMove(s, pseudo[i]);
    if (!isAttacked(s, s.king[us], us ^ 1)) out.push(pseudo[i]);
    unmakeMove(s);
  }
  return out;
}

/* ---------- game end detection ---------- */

function insufficientMaterial(s) {
  var counts = { 0: [], 1: [] };
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = s.b[sq];
    if (!p) continue;
    var t = typeOf(p);
    if (t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    counts[colorOf(p)].push({ t: t, light: ((fileOf(sq) + rankOf(sq)) % 2) === 0 });
  }
  var w = counts[0], b = counts[1];
  if (w.length === 0 && b.length === 0) return true;                 // K v K
  if (w.length + b.length === 1) return true;                        // K+minor v K
  if (w.length === 1 && b.length === 1 &&
      w[0].t === BISHOP && b[0].t === BISHOP && w[0].light === b[0].light) return true;
  return false;
}

// posKey: compact repeatable signature of a position
function posKey(s) {
  var out = '';
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    out += String.fromCharCode(48 + s.b[sq]);
  }
  return out + '|' + s.turn + '|' + s.castle + '|' + s.ep;
}

// history = array of posKey strings for every position that has occurred
function gameResult(s, history) {
  var legal = genLegal(s);
  if (legal.length === 0) {
    if (inCheck(s, s.turn)) return { over: true, type: 'checkmate', winner: s.turn ^ 1 };
    return { over: true, type: 'stalemate', winner: null };
  }
  if (s.half >= 100) return { over: true, type: 'fiftymove', winner: null };
  if (insufficientMaterial(s)) return { over: true, type: 'material', winner: null };
  if (history) {
    var k = posKey(s), n = 0;
    for (var i = 0; i < history.length; i++) if (history[i] === k) n++;
    if (n >= 3) return { over: true, type: 'repetition', winner: null };
  }
  return { over: false, legal: legal };
}

/* ---------- notation ---------- */

var LETTER = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
var FULLNAME = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };

function toSan(s, m) {
  var from = FROM(m), to = TO(m), promo = PROMO(m), flag = FLAG(m);
  var p = s.b[from], ty = typeOf(p);
  var san;

  if (flag === F_KCASTLE) san = 'O-O';
  else if (flag === F_QCASTLE) san = 'O-O-O';
  else {
    var isCap = !!s.b[to] || flag === F_EP;
    if (ty === PAWN) {
      san = isCap ? ('abcdefgh'[fileOf(from)] + 'x' + sqName(to)) : sqName(to);
    } else {
      var same = [];
      var all = genLegal(s);
      for (var i = 0; i < all.length; i++) {
        var o = all[i];
        if (o !== m && TO(o) === to && typeOf(s.b[FROM(o)]) === ty) same.push(FROM(o));
      }
      var dis = '';
      if (same.length) {
        var sameFile = same.some(function (x) { return fileOf(x) === fileOf(from); });
        var sameRank = same.some(function (x) { return rankOf(x) === rankOf(from); });
        if (!sameFile) dis = 'abcdefgh'[fileOf(from)];
        else if (!sameRank) dis = String(8 - rankOf(from));
        else dis = sqName(from);
      }
      san = LETTER[ty] + dis + (isCap ? 'x' : '') + sqName(to);
    }
    if (promo) san += '=' + LETTER[promo];
  }

  makeMove(s, m);
  if (inCheck(s, s.turn)) san += (genLegal(s).length === 0) ? '#' : '+';
  unmakeMove(s);
  return san;
}

/* ---------- material ---------- */

var VAL = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 20000 };
var KIDVAL = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0 };

function materialCount(s, color) {
  var total = 0;
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = s.b[sq];
    if (p && colorOf(p) === color) total += KIDVAL[typeOf(p)];
  }
  return total;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WHITE: WHITE, BLACK: BLACK, PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP,
    ROOK: ROOK, QUEEN: QUEEN, KING: KING, pc: pc, typeOf: typeOf, colorOf: colorOf,
    MOVE: MOVE, FROM: FROM, TO: TO, PROMO: PROMO, FLAG: FLAG,
    F_NORMAL: F_NORMAL, F_DPP: F_DPP, F_KCASTLE: F_KCASTLE, F_QCASTLE: F_QCASTLE, F_EP: F_EP,
    SQ: SQ, sqName: sqName, nameToSq: nameToSq, fileOf: fileOf, rankOf: rankOf,
    newState: newState, cloneState: cloneState, loadFen: loadFen, toFen: toFen,
    START_FEN: START_FEN, isAttacked: isAttacked, inCheck: inCheck,
    genPseudo: genPseudo, genLegal: genLegal, genLegalCaptures: genLegalCaptures,
    makeMove: makeMove, unmakeMove: unmakeMove, gameResult: gameResult, posKey: posKey,
    toSan: toSan, VAL: VAL, KIDVAL: KIDVAL, materialCount: materialCount,
    FULLNAME: FULLNAME, LETTER: LETTER, insufficientMaterial: insufficientMaterial
  };
}

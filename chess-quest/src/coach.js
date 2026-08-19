/* ============================================================
   COACH LAYER — turns engine numbers into words a 7-9 year old
   can act on. Depends on engine.js + ai.js globals.
   ============================================================ */

var COACH_LEVELS = { BLUNDER: 300, MISTAKE: 140, SLIP: 70 };

var PIECE_WORD = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
var PIECE_ICON_W = { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔' };
var PIECE_ICON_B = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };

function describeMove(s, m) {
  var from = FROM(m), to = TO(m), flag = FLAG(m);
  if (flag === F_KCASTLE || flag === F_QCASTLE) return 'castle';
  var p = s.b[from];
  if (!p) return sqName(from) + '-' + sqName(to);
  var txt = PIECE_WORD[p & 7] + ' to ' + sqName(to);
  if (s.b[to]) txt += ' (taking the ' + PIECE_WORD[s.b[to] & 7] + ')';
  if (PROMO(m)) txt += ' and make a ' + PIECE_WORD[PROMO(m)];
  return txt;
}

/* Can the side to move legally capture on this square? */
function hasCaptureTo(s, sq) {
  var legal = genLegal(s);
  for (var i = 0; i < legal.length; i++) if (TO(legal[i]) === sq) return true;
  return false;
}

/* Find the score the search gave to one specific move. */
function scoreOfMove(results, m) {
  for (var i = 0; i < results.length; i++) if (results[i].move === m) return results[i].score;
  return null;
}

/*
  reviewMove(sBefore, move, depth, time)
  sBefore must be the position BEFORE the move, with the learner to move.
  Returns null if nothing worth saying, else a review object.
*/
function reviewMove(sBefore, move, depth, time) {
  var me = sBefore.turn;
  var results = searchRoot(sBefore, depth || 3, time || 700, true);
  if (!results.length) return null;

  var bestScore = results[0].score;
  var bestMove = results[0].move;
  var actual = scoreOfMove(results, move);
  if (actual === null) return null;

  var loss = bestScore - actual;
  var bestSan = toSan(sBefore, bestMove);
  // How much clearer is the best move than the next best? A position where two
  // moves are nearly equal makes a terrible puzzle: there is no findable answer.
  var clarity = (results.length > 1) ? (bestScore - results[1].score) : 9999;

  // look at the position AFTER the move
  var after = cloneState(sBefore);
  makeMove(after, move);
  var myHang = hangingPieces(after, me);
  var movedTo = TO(move);
  var oppHangBefore = hangingPieces(sBefore, me ^ 1);

  var missedMate = bestScore > MATE - 200 && actual < MATE - 200;
  var allowsMate = actual < -(MATE - 200) && bestScore > -(MATE - 200);

  var severity = 'ok';
  if (missedMate || allowsMate || loss >= COACH_LEVELS.BLUNDER) severity = 'blunder';
  else if (loss >= COACH_LEVELS.MISTAKE) severity = 'mistake';
  else if (loss >= COACH_LEVELS.SLIP) severity = 'slip';

  var rv = {
    severity: severity, loss: loss, clarity: clarity,
    bestMove: bestMove, bestSan: bestSan,
    bestPlain: describeMove(sBefore, bestMove), tag: 'other',
    headline: '', detail: '', good: false
  };

  /* ---- praise path ---- */
  if (severity === 'ok') {
    if (actual > MATE - 200) { rv.good = true; rv.tag = 'mate'; rv.headline = 'Checkmate! Beautiful.'; return rv; }
    var gained = sBefore.b[movedTo] ? KIDVAL[sBefore.b[movedTo] & 7] : 0;
    if (gained >= 3 && myHang.length === 0) {
      rv.good = true; rv.tag = 'goodcapture';
      rv.headline = 'Nice! You won a ' + PIECE_WORD[sBefore.b[movedTo] & 7] + ' and stayed safe.';
      return rv;
    }
    if (move === bestMove && loss === 0) {
      rv.good = true; rv.tag = 'best';
      rv.headline = 'That was the best move on the board.';
      return rv;
    }
    return null;   // fine move, nothing to say
  }

  /* ---- problem path: name the pattern ---- */
  if (missedMate) {
    rv.tag = 'missedmate';
    rv.headline = 'You had checkmate!';
    rv.detail = 'The winning move was ' + bestSan + ' — ' + rv.bestPlain + '. Look for checks first: check, capture, then everything else.';
    return rv;
  }
  if (allowsMate) {
    rv.tag = 'allowsmate';
    rv.headline = 'Careful — that lets them checkmate you.';
    rv.detail = 'Before you move, ask: can they check my king next turn? ' + bestSan + ' would have kept your king safe.';
    return rv;
  }

  // Two things can be wrong at once. Lead with whichever costs more material,
  // otherwise the coach tells a child about a pawn while a queen is on offer.
  var worst = myHang.length ? myHang[0] : null;
  var freebie = null;
  for (var fi = 0; fi < oppHangBefore.length; fi++) {
    if (hasCaptureTo(sBefore, oppHangBefore[fi].sq)) { freebie = oppHangBefore[fi]; break; }
  }
  var hangCost = worst ? worst.gain : 0;
  var missCost = freebie ? freebie.gain : 0;
  // taking something yourself offsets a missed capture elsewhere
  if (freebie && sBefore.b[movedTo]) missCost -= VAL[sBefore.b[movedTo] & 7];

  if (freebie && missCost >= hangCost && missCost > 0) {
    rv.tag = 'missedcapture';
    rv.headline = 'There was a free ' + PIECE_WORD[freebie.type] + ' on ' + sqName(freebie.sq) + '.';
    rv.detail = bestSan + ' would have won it. Every turn, look at their loose pieces first.';
    return rv;
  }
  if (worst && worst.sq === movedTo) {
    rv.tag = 'movedintodanger';
    rv.headline = 'Your ' + PIECE_WORD[worst.type] + ' can be taken on ' + sqName(worst.sq) + '.';
    rv.detail = 'You moved it to a square they attack, and it is not defended enough. ' +
                'Before letting go of a piece, ask: "if I put it here, who can take it?"';
    return rv;
  }
  if (worst) {
    rv.tag = 'leftHanging';
    rv.headline = 'You left your ' + PIECE_WORD[worst.type] + ' on ' + sqName(worst.sq) + ' where it can be taken.';
    rv.detail = 'It is attacked and nothing is guarding it. After every move, scan your own pieces and count attackers against defenders.';
    return rv;
  }

  rv.tag = 'better';
  rv.headline = 'There was a stronger move: ' + bestSan + '.';
  rv.detail = 'Try ' + rv.bestPlain + '. Compare your idea with one other idea before you play.';
  return rv;
}

/* A hint for the learner, in kid language. */
function makeHint(s) {
  var results = searchRoot(s, 3, 700, true);
  if (!results.length) return null;
  var m = results[0].move;
  var me = s.turn;
  var hint = { move: m, san: toSan(s, m), text: '' };

  if (results[0].score > MATE - 200) { hint.text = 'There is a checkmate here. Look for a check!'; return hint; }

  var myHang = hangingPieces(s, me);
  var theirHang = hangingPieces(s, me ^ 1);
  var target = s.b[TO(m)];

  if (target) hint.text = 'Look at their ' + PIECE_WORD[target & 7] + ' on ' + sqName(TO(m)) + '. Can you take it?';
  else if (myHang.length) hint.text = 'Your ' + PIECE_WORD[myHang[0].type] + ' on ' + sqName(myHang[0].sq) + ' is in danger. Save it or defend it.';
  else if (theirHang.length) hint.text = 'Their ' + PIECE_WORD[theirHang[0].type] + ' on ' + sqName(theirHang[0].sq) + ' is loose. Can you attack it?';
  else hint.text = 'Try moving your ' + (s.b[FROM(m)] ? PIECE_WORD[s.b[FROM(m)] & 7] : 'piece') + ' toward the middle.';
  return hint;
}

/* Squares of the learner's pieces that are currently in danger (for Danger Goggles). */
function dangerSquares(s, color) {
  var out = [];
  var h = hangingPieces(s, color);
  for (var i = 0; i < h.length; i++) out.push(h[i].sq);
  return out;
}

/* One practice tip from the pattern that hurt most this game. */
var TIPS = {
  movedintodanger: 'Practice this: before you let go of a piece, say out loud "who attacks this square?"',
  leftHanging:     'Practice this: after every single move, do a quick check of all your own pieces. Loose pieces drop off.',
  missedcapture:   'Practice this: start every turn by looking for free pieces — theirs first, then yours.',
  missedmate:      'Practice this: look at checks first. Checks, then captures, then quiet moves.',
  allowsmate:      'Practice this: after you pick a move, ask "can they check me next turn?" before you play it.',
  better:          'Practice this: always find two candidate moves and compare them before choosing.',
  other:           'Practice this: slow down one extra breath before each move.'
};

function buildReport(records) {
  var bad = records.filter(function (r) { return r.review && !r.review.good && r.review.severity !== 'ok'; });
  bad.sort(function (a, b) {
    var wa = (a.review.tag === 'allowsmate' || a.review.tag === 'missedmate') ? 100000 : a.review.loss;
    var wb = (b.review.tag === 'allowsmate' || b.review.tag === 'missedmate') ? 100000 : b.review.loss;
    return wb - wa;
  });
  var top = bad.slice(0, 3);
  var counts = {};
  bad.forEach(function (r) { counts[r.review.tag] = (counts[r.review.tag] || 0) + 1; });
  var mainTag = 'other', mainN = 0;
  for (var k in counts) if (counts[k] > mainN) { mainN = counts[k]; mainTag = k; }
  return { moments: top, tip: TIPS[mainTag] || TIPS.other, mistakeCount: bad.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reviewMove: reviewMove, makeHint: makeHint, dangerSquares: dangerSquares,
    buildReport: buildReport, describeMove: describeMove, PIECE_WORD: PIECE_WORD,
    COACH_LEVELS: COACH_LEVELS
  };
}

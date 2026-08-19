/* ============================================================
   CHESS QUEST — interface, progression, coaching and puzzles
   ============================================================ */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var NAMEOF = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
/* ---------------- storage (never allowed to break the game) ---------------

   The keys are deliberately NOT version-stamped. They used to be
   ('chessQuest.v3'), which meant every release that bumped the number handed
   the player an empty save: level back to 1, stats gone, and every puzzle
   built from her own blunders gone with them. Nothing warned anyone, because
   a missing key is indistinguishable from a first run.

   So: one stable key per store, with the schema version carried INSIDE the
   payload, and an explicit upgrade path. Old keys are read once and then left
   alone rather than deleted, so rolling back to an older build still finds its
   own data. */
var SAVE_VERSION = 4;
var STORE_KEY = 'chessQuest.save';
var PZ_KEY = 'chessQuest.puzzles';
var LEGACY_STORE = ['chessQuest.v3', 'chessQuest.v2', 'chessQuest.v1'];
var LEGACY_PZ = ['chessQuest.puzzles.v1'];

var mem = {};
function put(key, data) {
  mem[key] = data;
  try { window.localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* private mode / sandbox */ }
}
function get(key) {
  if (mem[key] !== undefined) return mem[key];
  try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
}

/* Bring any older payload up to the current schema. Each step is additive and
   guarded by the version it upgrades FROM, so a save can skip releases. */
function upgrade(d) {
  var v = d.v || 1;
  /* v1-v3 all shared this shape; the version only ever lived in the key name.
     Nothing to transform, so they adopt the current schema as-is. When a real
     shape change lands, add:  if (v < 5) { ...; }  here. */
  d.v = SAVE_VERSION;
  return d;
}

/* Read the stable key, falling back to the legacy keys exactly once. Anything
   found under a legacy key is rewritten under the stable one immediately, so
   the migration happens on first load and never again. */
function readSave(key, legacy) {
  var d = get(key), fromLegacy = false;
  for (var i = 0; !d && i < legacy.length; i++) {
    d = get(legacy[i]);
    if (d) fromLegacy = true;
  }
  if (!d || typeof d !== 'object') return null;
  var was = d.v || 1;
  d = upgrade(d);
  if (fromLegacy || was !== SAVE_VERSION) put(key, d);
  return d;
}

function saveProgress() {
  put(STORE_KEY, {
    v: SAVE_VERSION,
    level: G.level, stats: G.stats, settings: G.settings, myColor: G.myColor
  });
}
function loadProgress() {
  var d = readSave(STORE_KEY, LEGACY_STORE);
  if (!d) return;
  if (d.level) G.level = Math.min(10, Math.max(1, d.level));
  if (d.stats) for (var s in d.stats) G.stats[s] = d.stats[s];
  if (d.settings) for (var k in d.settings) G.settings[k] = d.settings[k];
  if (d.myColor === 0 || d.myColor === 1) G.myColor = d.myColor;
}
function savePuzzleData() {
  put(PZ_KEY, {
    v: SAVE_VERSION,
    progress: PZ.progress, own: PZ.own, session: PZ.session, stats: PZ.stats
  });
}
function loadPuzzleData() {
  var d = readSave(PZ_KEY, LEGACY_PZ);
  if (!d) return;
  PZ.progress = d.progress || {};
  PZ.own = d.own || [];
  PZ.session = d.session || 0;
  if (d.stats) for (var k in d.stats) PZ.stats[k] = d.stats[k];
}

/* ---------------- sound ---------------- */
var actx = null, audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var b = actx.createBuffer(1, 1, 22050), src = actx.createBufferSource();
    src.buffer = b; src.connect(actx.destination); src.start(0);
    audioUnlocked = true;
  } catch (e) { /* audio unavailable */ }
}
/* iOS only lets audio start inside a real user gesture */
document.addEventListener('touchend', unlockAudio, { once: true, passive: true });
document.addEventListener('pointerdown', unlockAudio, { once: true });

function beep(freq, dur, type, vol) {
  if (!G.settings.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.09, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}
var SFX = {
  move:    function () { beep(440, 0.07, 'triangle'); },
  capture: function () { beep(240, 0.11, 'square', 0.07); },
  check:   function () { beep(720, 0.13, 'sawtooth', 0.06); setTimeout(function () { beep(880, 0.11, 'sawtooth', 0.05); }, 90); },
  good:    function () { beep(660, 0.09); setTimeout(function () { beep(990, 0.14); }, 90); },
  bad:     function () { beep(200, 0.18, 'sawtooth', 0.06); },
  win:     function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.17); }, i * 110); }); },
  lose:    function () { [392, 349, 294, 233].forEach(function (f, i) { setTimeout(function () { beep(f, 0.2, 'triangle'); }, i * 140); }); }
};

/* ---------------- worker ---------------- */
var worker = null, reqId = 0, pending = {};
var WORKER_GLUE = "\nself.onmessage=function(e){var d=e.data,out={};try{" +
  "if(d.cmd==='bot'){var s=loadFen(d.fen);out.move=chooseBotMove(s,d.bot);}" +
  "else if(d.cmd==='review'){var s2=loadFen(d.fen);out.review=reviewMove(s2,d.move,d.depth,d.time);}" +
  "else if(d.cmd==='hint'){var s3=loadFen(d.fen);out.hint=makeHint(s3);}" +
  "else if(d.cmd==='danger'){var s4=loadFen(d.fen);out.sqs=dangerSquares(s4,d.color);}" +
  "else if(d.cmd==='score'){var s5=loadFen(d.fen);var r=searchRoot(s5,3,500,true);out.top=r.length?r[0].score:0;" +
  "out.mine=null;for(var i=0;i<r.length;i++){if(FROM(r[i].move)===d.from&&TO(r[i].move)===d.to){out.mine=r[i].score;break;}}}" +
  "}catch(err){out.error=String(err&&err.message||err);}out.id=d.id;self.postMessage(out);};\n";

function initWorker() {
  try {
    var core = document.getElementById('chess-core').textContent;
    var blob = new Blob([core + WORKER_GLUE], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = function (e) {
      var d = e.data, cb = pending[d.id];
      if (cb) { delete pending[d.id]; cb(d); }
    };
    worker.onerror = function () { worker = null; };
  } catch (e) { worker = null; }
}

function ask(cmd, payload, done) {
  var msg = payload || {};
  msg.cmd = cmd; msg.id = ++reqId;
  if (worker) {
    pending[msg.id] = done;
    try { worker.postMessage(msg); return; }
    catch (e) { worker = null; delete pending[msg.id]; }
  }
  setTimeout(function () {                       /* main-thread fallback */
    var out = {};
    try {
      var s = loadFen(msg.fen);
      if (cmd === 'bot') out.move = chooseBotMove(s, msg.bot);
      else if (cmd === 'review') out.review = reviewMove(s, msg.move, msg.depth, msg.time);
      else if (cmd === 'hint') out.hint = makeHint(s);
      else if (cmd === 'danger') out.sqs = dangerSquares(s, msg.color);
      else if (cmd === 'score') {
        var r = searchRoot(s, 3, 500, true);
        out.top = r.length ? r[0].score : 0; out.mine = null;
        for (var i = 0; i < r.length; i++) {
          if (FROM(r[i].move) === msg.from && TO(r[i].move) === msg.to) { out.mine = r[i].score; break; }
        }
      }
    } catch (err) { out.error = String(err && err.message || err); }
    done(out);
  }, 40);
}

/* ---------------- state ---------------- */
var G = {
  s: null, hist: [], records: [], lastMove: 0,
  myColor: WHITE, viewColor: WHITE, level: 1, phase: 'idle', mode: 'play',
  sel: -1, targets: {}, danger: [], doOvers: 3, lossStreak: 0,
  settings: { sound: true, goggles: true, coach: true, theme: DEFAULT_THEME },
  stats: { played: 0, won: 0, lost: 0, drawn: 0, best: 1, crowns: 0 },
  pendingPromo: null, flash: {}, lastResult: ''
};
var PZ = {
  progress: {}, own: [], session: 0,
  stats: { solved: 0, attempted: 0, bestStreak: 0 },
  queue: [], current: null, tries: 0, streak: 0,
  sessionSolved: 0, sessionSeen: 0, revealed: false
};
function bot() { return BOTS[G.level - 1]; }
function theme() { return THEMES[G.settings.theme] || THEMES[DEFAULT_THEME]; }
function crest() { return theme().crest ? crestSvg(theme().crest) : ''; }
function setTheme(name) {
  G.settings.theme = THEMES[name] ? name : DEFAULT_THEME;
  applyTheme(G.settings.theme);
  saveProgress();
  updateChrome();
}

/* How many times the current position has occurred so far. */
function repCount() {
  var k = posKey(G.s), n = 0;
  for (var i = 0; i < G.hist.length; i++) if (G.hist[i] === k) n++;
  return n;
}
/* Would playing this move produce the third repetition (an automatic draw)? */
function movePepeats(m) {
  makeMove(G.s, m);
  var k = posKey(G.s), n = 1;
  for (var i = 0; i < G.hist.length; i++) if (G.hist[i] === k) n++;
  unmakeMove(G.s);
  return n >= 3;
}
function aheadBy(color) {
  return materialCount(G.s, color) - materialCount(G.s, color ^ 1);
}
function lastPlayed() {
  var h = G.s && G.s.hist;
  return (h && h.length) ? h[h.length - 1].m : 0;
}

/* ---------------- board ---------------- */
var boardEl = $('board'), squares = [];

function displayOrder() {
  var out = [];
  if (G.viewColor === WHITE) { for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) out.push(r * 16 + f); }
  else { for (var r2 = 7; r2 >= 0; r2--) for (var f2 = 7; f2 >= 0; f2--) out.push(r2 * 16 + f2); }
  return out;
}

/* Piece size comes from the measured board, so it is right on a 320 px
   iPhone SE and a 1024 px iPad without any viewport-unit guesswork. */
function fitBoard() {
  /* Pieces are SVG sized as a percentage of their square, so nothing needs
     recomputing on resize. Kept as a hook the rest of the code can call. */
}
window.addEventListener('resize', fitBoard);
window.addEventListener('orientationchange', function () { setTimeout(fitBoard, 250); });

function buildBoard() {
  boardEl.innerHTML = ''; squares = [];
  var order = displayOrder();
  for (var i = 0; i < 64; i++) {
    var sq = order[i];
    var d = document.createElement('div');
    d.className = 'sq ' + (((rankOf(sq) + fileOf(sq)) % 2 === 0) ? 'l' : 'd');
    d.dataset.sq = sq;
    var col = i % 8, row = (i / 8) | 0;
    if (row === 7) { var c1 = document.createElement('span'); c1.className = 'coord f'; c1.textContent = 'abcdefgh'[fileOf(sq)]; d.appendChild(c1); }
    if (col === 0) { var c2 = document.createElement('span'); c2.className = 'coord r'; c2.textContent = String(8 - rankOf(sq)); d.appendChild(c2); }
    var p = document.createElement('span'); p.className = 'pcwrap'; d.appendChild(p);
    boardEl.appendChild(d);
    squares[sq] = d;
  }
  fitBoard();
}

function render() {
  var s = G.s;
  var checkSq = (s && inCheck(s, s.turn)) ? s.king[s.turn] : -1;
  var order = displayOrder();
  for (var i = 0; i < 64; i++) {
    var sq = order[i], el = squares[sq];
    if (!el) continue;
    var piece = s ? s.b[sq] : 0;
    var wrap = el.querySelector('.pcwrap');
    var want = piece ? (piece & 7) + ':' + (colorOf(piece) === WHITE ? 'w' : 'b') : '';
    if (wrap.dataset.piece !== want) {          // only touch the DOM when it changed
      wrap.innerHTML = piece ? pieceSvg(piece & 7, colorOf(piece) === WHITE) : '';
      wrap.dataset.piece = want;
    }
    el.classList.toggle('sel', G.sel === sq);
    el.classList.toggle('last', !!G.lastMove && (FROM(G.lastMove) === sq || TO(G.lastMove) === sq));
    el.classList.toggle('check', sq === checkSq);
    el.classList.toggle('right', G.flash[sq] === 'right');
    el.classList.toggle('wrong', G.flash[sq] === 'wrong');
    el.classList.toggle('danger', G.mode === 'play' && G.settings.goggles && G.danger.indexOf(sq) >= 0 && G.phase === 'myturn');
    var old = el.querySelector('.dot,.ring');
    if (old) old.remove();
    if (G.targets[sq]) {
      var mark = document.createElement('span');
      mark.className = (s && s.b[sq]) ? 'ring' : 'dot';
      el.appendChild(mark);
    }
  }
  if (G.mode === 'play') renderTrays();
}

var START_COUNT = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
function capturedOf(color) {
  var on = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = G.s.b[sq];
    if (p && colorOf(p) === color && (p & 7) !== KING) on[p & 7]++;
  }
  var out = [], pts = 0;
  for (var t = 5; t >= 1; t--) {
    var n = Math.max(0, START_COUNT[t] - on[t]);
    for (var i = 0; i < n; i++) { out.push(t); pts += KIDVAL[t]; }
  }
  return { list: out, pts: pts };
}
function renderTrays() {
  if (!G.s) return;
  var mine = capturedOf(G.myColor ^ 1), theirs = capturedOf(G.myColor);
  var diff = mine.pts - theirs.pts;
  function fill(el, data, isMine) {
    var h = data.list.map(function (t) { return pieceSvg(t, !isMine ? (G.myColor === WHITE) : (G.myColor !== WHITE)); }).join('');
    if (isMine && diff > 0) h += '<span class="pts">+' + diff + '</span>';
    if (!isMine && diff < 0) h += '<span class="pts">+' + (-diff) + '</span>';
    el.innerHTML = h;
  }
  fill($('trayMine'), mine, true);
  fill($('trayTheirs'), theirs, false);
}

function flash(sqs, kind, ms) {
  G.flash = {};
  sqs.forEach(function (s) { G.flash[s] = kind; });
  render();
  setTimeout(function () { G.flash = {}; render(); }, ms || 700);
}

/* ---------------- coach bar ---------------- */
function say(head, sub, kind, actions, face) {
  $('coachFace').textContent = face || '🦉';
  $('coachHead').textContent = head || '';
  $('coachSub').textContent = sub || '';
  $('coach').className = kind || '';
  var acts = $('coachActs'); acts.innerHTML = '';
  (actions || []).forEach(function (a) {
    var b = document.createElement('button');
    b.className = 'btn ' + (a.style || '');
    b.textContent = a.label;
    b.onclick = a.fn;
    acts.appendChild(b);
  });
}

function updateChrome() {
  if (G.mode === 'puzzle') {
    if (crest()) { $('botFace').innerHTML = crest(); } else { $('botFace').textContent = '\uD83E\uDDE9'; }
    $('botName').textContent = 'Puzzles';
    $('botLvl').textContent = 'Solved ' + PZ.stats.solved + '  •  best streak ' + PZ.stats.bestStreak;
    $('btnMode').textContent = '♟️';
  } else {
    var b = bot();
    if (b.crest && crest()) { $('botFace').innerHTML = crest(); }
    else { $('botFace').innerHTML = ''; $('botFace').textContent = b.icon; }
    $('botName').textContent = b.name;
    $('botLvl').textContent = 'Level ' + b.lvl + ' of 10' + (G.stats.crowns ? '  •  👑 ' + G.stats.crowns : '');
    $('btnMode').textContent = '🧩';
    var lad = $('ladder'); lad.innerHTML = '';
    for (var i = 1; i <= 10; i++) {
      var r = document.createElement('div');
      r.className = 'rung' + (i < G.level ? ' done' : (i === G.level ? ' now' : ''));
      lad.appendChild(r);
    }
    $('hearts').textContent = G.doOvers > 0 ? '♥'.repeat(G.doOvers) : '—';
    $('btnGoggles').classList.toggle('off', !G.settings.goggles);
  }
  $('app').className = 'mode-' + G.mode;
}

/* ================= PLAY MODE ================= */
function newGame() {
  G.mode = 'play';
  G.viewColor = G.myColor;
  G.s = loadFen(START_FEN);
  G.hist = [posKey(G.s)];
  G.records = []; G.lastMove = 0; G.sel = -1; G.targets = {}; G.danger = []; G.flash = {};
  G.doOvers = (G.level <= 3) ? 5 : 3;      // extra safety net on the learning levels
  G.pendingPromo = null;
  PZ.current = null;
  buildBoard(); updateChrome(); render();
  hideOverlay();
  if (G.myColor === WHITE) {
    G.phase = 'myturn'; refreshDanger();
    say('You are White — you go first!', bot().name + ' says: "' + bot().line + '"', '', null, bot().icon);
  } else { G.phase = 'botturn'; botMove(); }
}

function refreshDanger(cb) {
  if (!G.settings.goggles || G.mode !== 'play') { G.danger = []; render(); if (cb) cb(); return; }
  ask('danger', { fen: toFen(G.s), color: G.myColor }, function (res) {
    G.danger = (res && res.sqs) || [];
    render();
    if (cb) cb();
  });
}

function commit(m) {
  var s = G.s;
  var wasCapture = !!s.b[TO(m)] || FLAG(m) === F_EP;
  var fenBefore = toFen(s);
  var san = toSan(s, m);
  var mover = s.turn;
  makeMove(s, m);
  G.hist.push(posKey(s));
  G.lastMove = m;
  G.sel = -1; G.targets = {};
  if (inCheck(s, s.turn)) SFX.check();
  else if (wasCapture) SFX.capture();
  else SFX.move();
  render();
  return { fenBefore: fenBefore, move: m, san: san, mover: mover };
}

function humanMove(m) {
  if (G.phase !== 'myturn') return;
  var rec = commit(m);
  G.records.push(rec);
  var over = gameResult(G.s, G.hist);
  if (over.over) { finish(over); return; }
  var repWarn = '';
  if (repCount() === 2) {
    repWarn = aheadBy(G.myColor) >= 3
      ? 'Careful — if this same position happens one more time it is a draw, even though you are winning. Try a different plan.'
      : 'This position has now happened twice. One more time and the game is a draw.';
  }
  if (!G.settings.coach) {
    if (repWarn) say('Watch out for a repeat.', repWarn, 'bad');
    G.phase = 'botturn'; botMove(); return;
  }
  G.phase = 'reviewing';
  say('Coach is checking that move…', '', '');
  ask('review', { fen: rec.fenBefore, move: m, depth: 3, time: 550 }, function (res) {
    var rv = res && res.review;
    rec.review = rv || null;
    if (rv && !rv.good && rv.severity === 'blunder') savePuzzleFromMistake(rec);
    if (rv && !rv.good && rv.severity === 'blunder' && G.doOvers > 0) return offerDoOver(rv);
    if (repWarn) say('Watch out for a repeat.', repWarn, 'bad');
    else if (rv && rv.good) { SFX.good(); say(rv.headline, '', 'good'); }
    else if (rv && (rv.severity === 'mistake' || rv.severity === 'blunder')) say(rv.headline, rv.detail, 'bad');
    else say(bot().name + ' is thinking…', '', '', null, bot().icon);
    G.phase = 'botturn';
    setTimeout(botMove, 220);
  });
}

function offerDoOver(rv) {
  G.phase = 'offering';
  SFX.bad();
  say('Wait — ' + rv.headline, rv.detail + '  You have ' + G.doOvers + ' do-over' + (G.doOvers === 1 ? '' : 's') + ' left.', 'alert', [
    { label: 'Try again ♥', style: 'warn', fn: takeBack },
    { label: 'Keep my move', style: 'ghost', fn: function () {
        G.phase = 'botturn'; say(bot().name + ' is thinking…', '', '', null, bot().icon); setTimeout(botMove, 150);
      } }
  ]);
}

function takeBack() {
  unmakeMove(G.s); G.hist.pop(); G.records.pop();
  G.doOvers--;
  G.lastMove = lastPlayed();
  G.sel = -1; G.targets = {};
  G.phase = 'myturn';
  updateChrome(); refreshDanger();
  say('Good thinking — try a different move.', 'Look at every piece they attack before you choose.', '');
}

function botMove() {
  var over = gameResult(G.s, G.hist);
  if (over.over) { finish(over); return; }
  if (shouldResign(G.s, bot(), G.myColor ^ 1, G.hist.length)) {
    finish({ over: true, type: 'resign', winner: G.myColor });
    return;
  }
  G.phase = 'botturn';
  say(bot().name + ' is thinking…', '', '', null, bot().icon);
  ask('bot', { fen: toFen(G.s), bot: bot() }, function (res) {
    if (G.mode !== 'play') return;                       /* she switched to puzzles mid-think */
    var legal = genLegal(G.s);
    var mv = (res && res.move && legal.indexOf(res.move) >= 0) ? res.move : legal[0];
    if (!mv) { finish(gameResult(G.s, G.hist)); return; }
    // Do not hand back a draw by shuffling when not actually losing.
    if (movePepeats(mv) && aheadBy(G.myColor ^ 1) >= -2) {
      for (var i = 0; i < legal.length; i++) {
        if (legal[i] !== mv && !movePepeats(legal[i])) { mv = legal[i]; break; }
      }
    }
    commit(mv);
    var r2 = gameResult(G.s, G.hist);
    if (r2.over) { finish(r2); return; }
    G.phase = 'myturn';
    refreshDanger();
    if (inCheck(G.s, G.myColor)) say('You are in check!', 'You must get your king out of danger this move.', 'bad');
    else if (aheadBy(G.myColor) >= 9) say('You are miles ahead!',
      'Now go and catch the king. Push it to the edge with two big pieces, then check it where it cannot run.', 'good');
    else say('Your move.', G.danger.length ? 'Careful, something of yours is being attacked.' : '', G.danger.length ? 'bad' : '');
  });
}

/* ================= INPUT ================= */
function canMove() {
  if (G.mode === 'puzzle') return !!PZ.current && !PZ.revealed;
  return G.phase === 'myturn' && G.s && G.s.turn === G.myColor;
}
function moverColor() { return G.mode === 'puzzle' ? G.s.turn : G.myColor; }

function selectSquare(sq) {
  G.sel = sq; G.targets = {};
  var legal = genLegal(G.s);
  for (var i = 0; i < legal.length; i++) if (FROM(legal[i]) === sq) G.targets[TO(legal[i])] = true;
  render();
}

function tryMoveTo(to) {
  var legal = genLegal(G.s);
  var options = legal.filter(function (m) { return FROM(m) === G.sel && TO(m) === to; });
  if (!options.length) return false;
  if (options.length > 1 && PROMO(options[0])) { showPromo(options); return true; }
  submitMove(options[0]);
  return true;
}
function submitMove(m) {
  if (G.mode === 'puzzle') puzzleAnswer(m); else humanMove(m);
}

var drag = { on: false, from: -1, moved: false, x: 0, y: 0 };
var ghost = $('ghost');

function sqFromPoint(x, y) {
  var el = document.elementFromPoint(x, y);
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('sq')) return parseInt(el.dataset.sq, 10);
    el = el.parentElement;
  }
  return -1;
}

boardEl.addEventListener('pointerdown', function (e) {
  if (!canMove()) return;
  e.preventDefault();
  var sq = sqFromPoint(e.clientX, e.clientY);
  if (sq < 0) return;
  var p = G.s.b[sq];
  if (G.sel >= 0 && G.targets[sq]) { tryMoveTo(sq); return; }
  if (p && colorOf(p) === moverColor()) {
    selectSquare(sq);
    drag.on = true; drag.from = sq; drag.moved = false; drag.x = e.clientX; drag.y = e.clientY;
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
  } else { G.sel = -1; G.targets = {}; render(); }
});

boardEl.addEventListener('pointermove', function (e) {
  if (!drag.on) return;
  e.preventDefault();
  if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
  drag.moved = true;
  var p = G.s.b[drag.from];
  if (!p) return;
  var size = boardEl.getBoundingClientRect().width / 8;
  ghost.style.display = 'block';
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = (e.clientY - size * 0.35) + 'px';
  ghost.style.width = (size * 0.86) + 'px';
  ghost.style.height = (size * 0.86) + 'px';
  ghost.innerHTML = pieceSvg(p & 7, colorOf(p) === WHITE);
});

function endDrag(e) {
  if (!drag.on) return;
  ghost.style.display = 'none';
  var wasDragging = drag.moved;
  drag.on = false; drag.moved = false;
  if (!wasDragging) return;
  var to = sqFromPoint(e.clientX, e.clientY);
  if (to >= 0 && G.targets[to]) tryMoveTo(to);
}
boardEl.addEventListener('pointerup', endDrag);
boardEl.addEventListener('pointercancel', function () { drag.on = false; drag.moved = false; ghost.style.display = 'none'; });

/* ================= PUZZLE MODE ================= */
var PZ_PROMPT = {
  mate: 'Can you find checkmate in ONE move?',
  freepiece: 'There is a piece you can win for free. Find it!',
  save: 'One of your pieces is in danger. Can you save it?',
  trade: 'Find the move that wins material.',
  tactic: 'Find the strongest move in this position.',
  movedintodanger: 'You lost a piece here last time. What should you play instead?',
  leftHanging: 'Something of yours was hanging here. Find the safe move.',
  missedcapture: 'You missed something here last time. What can you win?',
  missedmate: 'There is a checkmate here. Can you see it now?',
  allowsmate: 'This move let them mate you last time. Find the safe move.',
  better: 'You can do better than last time here. Find the best move.'
};
var PZ_NUDGE = {
  mate: 'Look for a check the king cannot escape.',
  freepiece: 'Look for one of their pieces that nothing is guarding.',
  save: 'Which of your pieces is attacked? Move it or defend it.',
  trade: 'Count the attackers and defenders before you take.',
  tactic: 'Look at checks first, then captures, then quiet moves.'
};
function nudgeFor(tag) { return PZ_NUDGE[tag] || 'Check every piece they attack, and every piece you can take.'; }

function allPuzzles() {
  var built = (typeof BUILTIN_PUZZLES !== 'undefined') ? BUILTIN_PUZZLES : [];
  return PZ.own.concat(built);
}

function puzzleFromReview(fenBefore, rv) {
  return {
    f: fenBefore, a: rv.bestSan,
    from: sqName(FROM(rv.bestMove)), to: sqName(TO(rv.bestMove)),
    pr: PROMO(rv.bestMove) || 0, t: rv.tag,
    q: PZ_PROMPT[rv.tag] || PZ_PROMPT.better, tier: 2, own: 1
  };
}

var PZ_MIN_CLARITY = 150;
function savePuzzleFromMistake(rec) {
  var rv = rec.review;
  if (!rv || !rv.bestMove) return;
  // Only keep it if the right answer is clearly the right answer. Otherwise we
  // would be asking a child to guess between two moves the engine rates alike.
  if (typeof rv.clarity === 'number' && rv.clarity < PZ_MIN_CLARITY) return;
  for (var i = 0; i < PZ.own.length; i++) if (PZ.own[i].f === rec.fenBefore) return;
  PZ.own.unshift(puzzleFromReview(rec.fenBefore, rv));
  if (PZ.own.length > 60) PZ.own.length = 60;
  savePuzzleData();
}

function buildQueue(priority) {
  PZ.session++;
  var all = allPuzzles();
  var due = [], later = [];
  all.forEach(function (p) {
    var pr = PZ.progress[p.f];
    if (!pr || pr.due <= PZ.session) due.push(p); else later.push(p);
  });
  function rank(p) {
    var pr = PZ.progress[p.f] || { box: 0 };
    return (p.own ? 0 : 100) + pr.box * 10 + (p.tier || 2);
  }
  due.sort(function (a, b) { return rank(a) - rank(b); });
  if (!due.length) {
    later.sort(function (a, b) { return rank(a) - rank(b); });
    due = later.slice(0, 10);
  }
  if (priority && priority.length) {
    var keys = {};
    priority.forEach(function (p) { keys[p.f] = 1; });
    due = priority.concat(due.filter(function (p) { return !keys[p.f]; }));
  }
  PZ.queue = due;
  savePuzzleData();
}

function enterPuzzles(priority) {
  G.mode = 'puzzle';
  G.phase = 'puzzle';
  PZ.sessionSolved = 0; PZ.sessionSeen = 0; PZ.streak = 0;
  buildQueue(priority);
  hideOverlay();
  updateChrome();
  if (!PZ.queue.length) {
    PZ.current = null;
    say('No puzzles yet!', 'Play a game first — every big mistake gets saved here to practise later.', '', [
      { label: 'Back to the game', style: 'primary', fn: newGame }
    ], '🧩');
    return;
  }
  nextPuzzle();
}

function nextPuzzle() {
  G.flash = {};
  if (!PZ.queue.length) { showPuzzleSummary(); return; }
  var p = PZ.queue.shift();
  PZ.current = p; PZ.tries = 0; PZ.revealed = false;
  PZ.sessionSeen++;
  G.s = loadFen(p.f);
  G.viewColor = G.s.turn;                        /* always shown from the solver's side */
  G.hist = [posKey(G.s)];
  G.lastMove = 0; G.sel = -1; G.targets = {}; G.danger = [];
  buildBoard(); render(); updateChrome();
  var who = G.s.turn === WHITE ? 'White' : 'Black';
  say(p.q, 'You are ' + who + '. ' + (p.own ? 'This one is from your own game. ' : '') +
      'Puzzle ' + PZ.sessionSeen + '  •  streak ' + PZ.streak, '', null, p.own ? '🔁' : '🧩');
}

function markPuzzle(solvedCleanly) {
  var p = PZ.current;
  var pr = PZ.progress[p.f] || { box: 1, right: 0, wrong: 0, due: 0 };
  if (solvedCleanly) {
    pr.right++;
    pr.box = Math.min(4, pr.box + 1);
    pr.due = PZ.session + [1, 2, 4, 8][pr.box - 1];
  } else {
    pr.wrong++; pr.box = 1; pr.due = PZ.session + 1;
  }
  PZ.progress[p.f] = pr;
  PZ.stats.attempted++;
  if (solvedCleanly) {
    PZ.stats.solved++; PZ.streak++; PZ.sessionSolved++;
    if (PZ.streak > PZ.stats.bestStreak) PZ.stats.bestStreak = PZ.streak;
  } else PZ.streak = 0;
  savePuzzleData();
  updateChrome();
}

function puzzleAnswer(m) {
  var p = PZ.current;
  if (!p || PZ.revealed) return;
  var from = nameToSq(p.from), to = nameToSq(p.to);
  var correct = (FROM(m) === from && TO(m) === to) && (!p.pr || PROMO(m) === p.pr);

  if (correct) {
    var san = toSan(G.s, m);
    var clean = PZ.tries === 0;
    makeMove(G.s, m);
    G.lastMove = m; G.sel = -1; G.targets = {};
    SFX.good();
    flash([from, to], 'right', 900);
    markPuzzle(clean);
    var praise = clean ? ['Yes!', 'Got it!', 'Exactly right!', 'Beautiful!'][PZ.sessionSeen % 4] : 'That is the one.';
    say(praise + '  ' + san,
        clean ? 'First try. Streak: ' + PZ.streak : 'You found it in the end — that still counts as practice.',
        'good', [{ label: 'Next puzzle →', style: 'primary', fn: nextPuzzle }]);
    setTimeout(function () { if (PZ.current === p) nextPuzzle(); }, 1900);
    return;
  }

  PZ.tries++;
  G.sel = -1; G.targets = {};
  SFX.bad();
  flash([FROM(m), TO(m)], 'wrong', 700);

  if (PZ.tries >= 3) { revealAnswer('Here is the move.'); return; }

  /* Was her move actually good too? Say so rather than a flat "wrong". */
  ask('score', { fen: p.f, from: FROM(m), to: TO(m) }, function (res) {
    if (PZ.current !== p || PZ.revealed) return;
    var closeCall = res && res.mine !== null && res.mine !== undefined && (res.top - res.mine) < 80;
    var head = closeCall ? 'That is a good move too — but there is a better one.'
                         : (PZ.tries === 1 ? 'Not quite. Have another look.' : 'Still not it — one more try.');
    say(head, nudgeFor(p.t), 'bad', [
      { label: 'Show me', style: 'ghost', fn: function () { revealAnswer('No problem — here it is.'); } }
    ]);
  });
}

function revealAnswer(lead) {
  var p = PZ.current;
  if (!p || PZ.revealed) return;
  PZ.revealed = true;
  var from = nameToSq(p.from), to = nameToSq(p.to);
  var legal = genLegal(G.s), mv = null;
  for (var i = 0; i < legal.length; i++) {
    if (FROM(legal[i]) === from && TO(legal[i]) === to && (!p.pr || PROMO(legal[i]) === p.pr)) { mv = legal[i]; break; }
  }
  markPuzzle(false);
  if (mv) { makeMove(G.s, mv); G.lastMove = mv; }
  G.sel = -1; G.targets = {};
  flash([from, to], 'right', 2200);
  say(lead + '  The move was ' + p.a + '.', nudgeFor(p.t) + '  You will see this one again soon.', 'bad',
      [{ label: 'Next puzzle →', style: 'primary', fn: nextPuzzle }]);
}

function puzzleHint() {
  var p = PZ.current;
  if (!p || PZ.revealed) return;
  PZ.tries = Math.max(PZ.tries, 1);
  var from = nameToSq(p.from);
  G.sel = from; G.targets = {};
  var legal = genLegal(G.s);
  for (var i = 0; i < legal.length; i++) if (FROM(legal[i]) === from) G.targets[TO(legal[i])] = true;
  render();
  var piece = G.s.b[from];
  say('Move this piece.', 'It is your ' + (piece ? NAMEOF[piece & 7] : 'piece') + '. Now work out where it should go.', '');
}

function showPuzzleSummary() {
  PZ.current = null;
  var acc = PZ.sessionSeen ? Math.round(PZ.sessionSolved / PZ.sessionSeen * 100) : 0;
  showOverlay(
    '<div class="big">🧩</div><h1>Puzzles done!</h1>' +
    '<p>You have worked through everything that was due. More unlock as you play — every big mistake in a game turns into a puzzle here.</p>' +
    '<div class="stat"><span>Solved this session</span><b>' + PZ.sessionSolved + ' of ' + PZ.sessionSeen + ' (' + acc + '%)</b></div>' +
    '<div class="stat"><span>Solved all time</span><b>' + PZ.stats.solved + '</b></div>' +
    '<div class="stat"><span>Best streak</span><b>' + PZ.stats.bestStreak + '</b></div>' +
    '<div class="stat"><span>Puzzles from your own games</span><b>' + PZ.own.length + '</b></div>' +
    '<div class="row"><button class="btn primary" id="pDone">Back to the game</button>' +
    '<button class="btn ghost" id="pMore">More puzzles</button></div>'
  );
  $('pDone').onclick = newGame;
  $('pMore').onclick = function () { enterPuzzles(); };
}

/* ================= OVERLAYS ================= */
function showOverlay(html) { $('card').innerHTML = html; $('overlay').classList.add('on'); }
function hideOverlay() { $('overlay').classList.remove('on'); }

function showPromo(options) {
  G.pendingPromo = options;
  var promoColor = G.s.turn === WHITE;
  var btns = [QUEEN, ROOK, BISHOP, KNIGHT].map(function (t) {
    return '<button data-t="' + t + '">' + pieceSvg(t, promoColor) + '</button>';
  }).join('');
  showOverlay('<h2>Your pawn made it!</h2><p>Pick what it becomes. Almost always choose the queen — she is the strongest.</p><div class="promo">' + btns + '</div>');
  Array.prototype.forEach.call($('card').querySelectorAll('.promo button'), function (b) {
    b.onclick = function () {
      var t = parseInt(b.dataset.t, 10);
      var chosen = G.pendingPromo.filter(function (m) { return PROMO(m) === t; })[0];
      G.pendingPromo = null; hideOverlay();
      if (chosen) submitMove(chosen);
    };
  });
}

function showStart() {
  var b = bot();
  var duePz = allPuzzles().filter(function (p) {
    var pr = PZ.progress[p.f]; return !pr || pr.due <= PZ.session + 1;
  }).length;
  showOverlay(
    '<div class="big">' + (crest() || '\u265E') + '</div>' +
    '<h1>' + theme().title + '</h1>' +
    '<p style="margin-top:0;color:var(--accent);font-weight:800">' + theme().subtitle + '</p>' +
    '<p>Beat a bot and you climb a level. Ten levels to Grandmaster. Every time you lose, the coach shows you exactly what happened — and turns your mistakes into puzzles.</p>' +
    '<div class="stat"><span>Your level</span><b>' + b.lvl + ' of 10 — ' + b.icon + ' ' + b.name + '</b></div>' +
    '<div class="stat"><span>Games won</span><b>' + G.stats.won + '</b></div>' +
    '<div class="stat"><span>Puzzles solved</span><b>' + PZ.stats.solved + '</b></div>' +
    '<div class="stat"><span>Crowns earned</span><b>' + (G.stats.crowns || 0) + '</b></div>' +
    '<div class="row"><button class="btn primary" id="goPlay">Play a game</button>' +
    '<button class="btn" id="goPuzzles">🧩 Puzzles' + (duePz ? ' (' + duePz + ')' : '') + '</button></div>' +
    '<div class="row"><button class="btn ghost" id="goMenu">Settings</button></div>'
  );
  $('goPlay').onclick = function () { unlockAudio(); beep(660, 0.08); newGame(); };
  $('goPuzzles').onclick = function () { unlockAudio(); enterPuzzles(); };
  $('goMenu').onclick = showMenu;
}

function showMenu() {
  var levelOpts = BOTS.map(function (b) {
    return '<option value="' + b.lvl + '"' + (b.lvl === G.level ? ' selected' : '') + '>Level ' + b.lvl + ' — ' + b.name + '</option>';
  }).join('');
  showOverlay(
    '<h2>Settings</h2>' +
    '<div class="toggles">' +
      '<div class="tg"><span>🥽 Danger goggles<br><span class="small">Rings the pieces that can be taken</span></span><button id="tgG" class="sw ' + (G.settings.goggles ? 'on' : '') + '"></button></div>' +
      '<div class="tg"><span>🦉 Coach<br><span class="small">Warns about big mistakes and offers do-overs</span></span><button id="tgC" class="sw ' + (G.settings.coach ? 'on' : '') + '"></button></div>' +
      '<div class="tg"><span>🔊 Sound</span><button id="tgS" class="sw ' + (G.settings.sound ? 'on' : '') + '"></button></div>' +
      '<div class="tg"><span>Play as</span><button class="btn" id="swapColor">' + (G.myColor === WHITE ? '\u2654 White' : '\u265A Black') + '</button></div>' +
      '<div class="tg"><span>Board colours<br><span class="small">' + theme().subtitle + '</span></span>' +
        '<button class="btn" id="swapTheme">' + theme().label + '</button></div>' +
    '</div>' +
    '<p style="margin-top:14px">Grown-up controls</p>' +
    '<select id="lvlSel">' + levelOpts + '</select>' +
    '<div class="stat" style="margin-top:10px"><span>Puzzles saved from her games</span><b>' + PZ.own.length + '</b></div>' +
    '<div class="stat"><span>Puzzles solved</span><b>' + PZ.stats.solved + ' of ' + PZ.stats.attempted + ' tried</b></div>' +
    '<div class="row"><button class="btn primary" id="mClose">Done</button>' +
    '<button class="btn ghost" id="mReset">Reset progress</button></div>' +
    '<p class="small" style="margin-top:10px">On iPhone or iPad: tap Share, then <b>Add to Home Screen</b> for an app icon and full screen.</p>'
  );
  function tog(id, key) {
    $(id).onclick = function () {
      G.settings[key] = !G.settings[key];
      $(id).classList.toggle('on', G.settings[key]);
      saveProgress(); updateChrome();
      if (key === 'goggles') refreshDanger();
    };
  }
  tog('tgG', 'goggles'); tog('tgC', 'coach'); tog('tgS', 'sound');
  $('swapTheme').onclick = function () {
    var names = themeNames();
    var next = names[(names.indexOf(G.settings.theme) + 1) % names.length];
    setTheme(next);
    $('swapTheme').textContent = theme().label;
    var sub = $('swapTheme').parentNode.querySelector('.small');
    if (sub) sub.textContent = theme().subtitle;
  };
  $('swapColor').onclick = function () {
    G.myColor = G.myColor ^ 1; saveProgress();
    $('swapColor').textContent = G.myColor === WHITE ? '♔ White' : '♚ Black';
  };
  $('lvlSel').onchange = function () { G.level = parseInt($('lvlSel').value, 10); saveProgress(); updateChrome(); };
  $('mClose').onclick = function () { updateChrome(); newGame(); };
  $('mReset').onclick = function () {
    G.level = 1; G.stats = { played: 0, won: 0, lost: 0, drawn: 0, best: 1, crowns: 0 };
    PZ.progress = {}; PZ.own = []; PZ.stats = { solved: 0, attempted: 0, bestStreak: 0 };
    saveProgress(); savePuzzleData(); updateChrome(); showStart();
  };
}

/* ================= END OF GAME ================= */
function finish(result) {
  G.phase = 'over';
  G.sel = -1; G.targets = {}; G.danger = [];
  render();
  G.stats.played++;
  var isWinType = result.type === 'checkmate' || result.type === 'resign';
  var iWon = isWinType && result.winner === G.myColor;
  var iLost = result.type === 'checkmate' && result.winner !== G.myColor;
  G.lastResult = result.type;

  if (iWon) {
    G.stats.won++; G.lossStreak = 0; SFX.win();
    var wasTop = G.level >= 10;
    if (wasTop) G.stats.crowns = (G.stats.crowns || 0) + 1; else G.level++;
    G.stats.best = Math.max(G.stats.best, G.level);
    saveProgress(); updateChrome();
    showWin(wasTop);
    return;
  }
  if (iLost) { G.stats.lost++; G.lossStreak++; SFX.lose(); saveProgress(); showLoss(); return; }
  G.stats.drawn++; G.lossStreak = 0; saveProgress();
  showDraw(result.type);
}

function puzzlesFromThisGame() {
  var out = [], seen = {};
  G.records.forEach(function (r) {
    if (!r.review || r.review.good || r.review.severity !== 'blunder' || !r.review.bestMove) return;
    if (typeof r.review.clarity === 'number' && r.review.clarity < PZ_MIN_CLARITY) return;
    if (seen[r.fenBefore]) return;
    seen[r.fenBefore] = 1;
    out.push(puzzleFromReview(r.fenBefore, r.review));
  });
  return out;
}

function showWin(wasTop) {
  var nb = bot();
  showOverlay(
    '<div class="big">' + (wasTop ? '👑' : '🎉') + '</div>' +
    '<h1>' + (wasTop ? 'You beat ' + BOTS[BOTS.length - 1].name + '!'
              : (G.lastResult === 'resign' ? 'They give up! You win!' : 'Checkmate! You win!')) + '</h1>' +
    (wasTop ? '<p style="margin-top:0;color:var(--accent);font-weight:800">Woodland Springs Chess Master</p>' : '') +
    (G.lastResult === 'resign' && !wasTop
      ? '<p>You won so much material that they resigned. That counts as a win. ' +
        'Higher levels do not give up, so keep practising checkmate.</p>' : '') +
    '<p>' + (wasTop
      ? 'That is the top of the ladder and you are a Woodland Springs Chess Master. You have earned a crown. Play again for another one.'
      : 'You are now on level ' + G.level + '. Your next opponent is ' + nb.icon + ' <b>' + nb.name + '</b>: "' + nb.line + '"') + '</p>' +
    '<div class="stat"><span>Games won</span><b>' + G.stats.won + '</b></div>' +
    '<div class="stat"><span>Crowns</span><b>' + (G.stats.crowns || 0) + '</b></div>' +
    '<div class="row"><button class="btn primary" id="wNext">Next game</button>' +
    '<button class="btn ghost" id="wReview">See my game</button></div>'
  );
  $('wNext').onclick = newGame;
  $('wReview').onclick = function () { showReport(true); };
}

function showDraw(type) {
  var why = {
    stalemate: 'Stalemate — they had no legal move but were not in check. That is a draw. If you are winning, always leave the other king a square to move to.',
    fiftymove: 'Fifty moves with no capture and no pawn move, so it is a draw.',
    repetition: 'The same position happened three times, so it is a draw.',
    material: 'Neither side has enough pieces left to checkmate, so it is a draw.'
  }[type] || 'The game is a draw.';
  showOverlay('<div class="big">🤝</div><h1>It is a draw</h1><p>' + why + '</p>' +
    '<div class="row"><button class="btn primary" id="dNext">Play again</button>' +
    '<button class="btn ghost" id="dReview">See my game</button></div>');
  $('dNext').onclick = newGame;
  $('dReview').onclick = function () { showReport(false); };
}

var MINI_HTML = '<div id="mini" style="display:none"><div id="miniBoard"></div>' +
  '<svg id="miniSvg" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>' +
  '<div class="legend"><span><i style="background:#ff6b6b"></i>what you played</span>' +
  '<span><i style="background:#5fd08c"></i>a better move</span></div></div>';

function momentHtml(r, i) {
  return '<div class="moment"><div class="t">' + (i + 1) + '. Move ' + r.san + ' — ' + r.review.headline + '</div>' +
    '<div class="d">' + r.review.detail + '</div>' +
    '<button class="btn" data-i="' + i + '">Show me on the board</button></div>';
}
function wireMoments(moments) {
  Array.prototype.forEach.call($('card').querySelectorAll('.moment .btn'), function (b) {
    b.onclick = function () { showMoment(moments[parseInt(b.dataset.i, 10)]); };
  });
}

function showLoss() {
  var rep = buildReport(G.records);
  var mine = puzzlesFromThisGame();
  var head = rep.moments.length ? 'Here are the moves that cost you the game.'
                                : 'You played a clean game — ' + bot().name + ' just out-planned you.';
  showOverlay(
    '<div class="big">💪</div><h1>' + bot().name + ' won this one</h1><p>' + head + '</p>' +
    rep.moments.map(momentHtml).join('') + MINI_HTML +
    '<div class="tip">' + rep.tip + '</div>' +
    '<div class="stat"><span>Your moves this game</span><b>' + G.records.length + '</b></div>' +
    '<div class="stat"><span>Moves the coach flagged</span><b>' + rep.mistakeCount + '</b></div>' +
    '<div class="stat"><span>Do-overs left</span><b>' + G.doOvers + ' of ' + (G.level <= 3 ? 5 : 3) + '</b></div>' +
    '<div class="row"><button class="btn primary" id="lAgain">Try again</button>' +
    (mine.length ? '<button class="btn warn" id="lPractise">🧩 Practise these ' + mine.length + '</button>' : '') + '</div>' +
    (G.lossStreak >= 2 && G.level > 1 ? '<div class="row"><button class="btn ghost" id="lEasier">Make it easier</button></div>' : '')
  );
  wireMoments(rep.moments);
  $('lAgain').onclick = newGame;
  if ($('lPractise')) $('lPractise').onclick = function () { enterPuzzles(mine); };
  if ($('lEasier')) $('lEasier').onclick = function () {
    G.level = Math.max(1, G.level - 1); G.lossStreak = 0; saveProgress(); updateChrome(); newGame();
  };
}

function showReport(won) {
  var rep = buildReport(G.records);
  var mine = puzzlesFromThisGame();
  var body = rep.moments.length ? rep.moments.map(momentHtml).join('')
    : '<p>The coach did not flag a single big mistake. That is excellent play.</p>';
  showOverlay('<h2>Your game review</h2>' + body + MINI_HTML +
    (rep.moments.length ? '<div class="tip">' + rep.tip + '</div>' : '') +
    '<div class="row"><button class="btn primary" id="rNext">' + (won ? 'Next game' : 'Play again') + '</button>' +
    (mine.length ? '<button class="btn warn" id="rPractise">🧩 Practise these</button>' : '') + '</div>');
  wireMoments(rep.moments);
  $('rNext').onclick = newGame;
  if ($('rPractise')) $('rPractise').onclick = function () { enterPuzzles(mine); };
}

function showMoment(rec) {
  var wrap = $('mini'); if (!wrap) return;
  wrap.style.display = 'block';
  var s = loadFen(rec.fenBefore);
  var mb = $('miniBoard'); mb.innerHTML = '';
  var order = displayOrder();
  for (var i = 0; i < 64; i++) {
    var sq = order[i];
    var d = document.createElement('div');
    d.className = 'sq ' + (((rankOf(sq) + fileOf(sq)) % 2 === 0) ? 'l' : 'd');
    var p = s.b[sq];
    if (p) {
      var sp = document.createElement('span');
      sp.className = 'pcwrap';
      sp.innerHTML = pieceSvg(p & 7, colorOf(p) === WHITE);
      d.appendChild(sp);
    }
    mb.appendChild(d);
  }
  fitBoard();
  function xy(sq) { var idx = order.indexOf(sq); return { x: (idx % 8) + 0.5, y: ((idx / 8) | 0) + 0.5 }; }
  function arrow(m, color, id) {
    var a = xy(FROM(m)), b = xy(TO(m));
    return '<defs><marker id="h' + id + '" markerWidth="4" markerHeight="4" refX="2.6" refY="2" orient="auto">' +
      '<path d="M0,0 L4,2 L0,4 z" fill="' + color + '"/></marker></defs>' +
      '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + color +
      '" stroke-width="0.22" stroke-linecap="round" opacity="0.9" marker-end="url(#h' + id + ')"/>';
  }
  $('miniSvg').innerHTML = arrow(rec.move, '#ff6b6b', 'r') + arrow(rec.review.bestMove, '#5fd08c', 'g');
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ================= CONTROLS ================= */
$('btnHint').onclick = function () {
  if (G.phase !== 'myturn') return;
  say('Let me look…', '', '');
  ask('hint', { fen: toFen(G.s) }, function (res) {
    if (!res || !res.hint) { say('No hint right now.', '', ''); return; }
    say('Hint: ' + res.hint.text, 'A strong move here is ' + res.hint.san + '.', '');
    G.sel = FROM(res.hint.move); G.targets = {}; G.targets[TO(res.hint.move)] = true;
    render();
  });
};
$('btnUndo').onclick = function () {
  if (G.phase === 'offering') { takeBack(); return; }
  if (G.phase !== 'myturn' || G.doOvers <= 0 || G.records.length < 1 || G.s.hist.length < 2) return;
  unmakeMove(G.s); G.hist.pop();
  unmakeMove(G.s); G.hist.pop(); G.records.pop();
  G.doOvers--;
  G.lastMove = lastPlayed();
  G.sel = -1; G.targets = {};
  updateChrome(); refreshDanger();
  say('Do-over taken.', 'Have another think about this position.', '');
};
$('btnGoggles').onclick = function () {
  G.settings.goggles = !G.settings.goggles; saveProgress(); updateChrome(); refreshDanger();
};
$('btnNew').onclick = function () {
  showOverlay('<h2>Start a new game?</h2><p>This game will end. Your level stays the same.</p>' +
    '<div class="row"><button class="btn primary" id="nYes">Yes, new game</button>' +
    '<button class="btn ghost" id="nNo">Keep playing</button></div>');
  $('nYes').onclick = newGame;
  $('nNo').onclick = hideOverlay;
};
$('btnPzHint').onclick = puzzleHint;
$('btnPzSkip').onclick = function () { revealAnswer('Skipped —'); };
$('btnPzQuit').onclick = showPuzzleSummary;
$('btnMode').onclick = function () { if (G.mode === 'puzzle') newGame(); else enterPuzzles(); };
$('btnMenu').onclick = showMenu;

/* console hook for debugging and for setting up positions */
window.ChessQuest = {
  state: G, puzzles: PZ, play: submitMove, newGame: newGame, render: render,
  enterPuzzles: enterPuzzles, fitBoard: fitBoard, allPuzzles: allPuzzles,
  setLevel: function (n) { G.level = Math.min(10, Math.max(1, n)); saveProgress(); updateChrome(); }
};

/* ================= BOOT ================= */
loadProgress();
loadPuzzleData();
applyTheme(G.settings.theme);
initWorker();
G.s = loadFen(START_FEN);
G.viewColor = G.myColor;
buildBoard();
updateChrome();
render();
showStart();
setTimeout(fitBoard, 60);

})();

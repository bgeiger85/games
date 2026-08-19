const E = require('../build/combined.js');

function perft(s, depth) {
  if (depth === 0) return 1;
  const moves = E.genPseudo(s, false);
  let nodes = 0;
  const us = s.turn;
  for (const m of moves) {
    E.makeMove(s, m);
    if (!E.isAttacked(s, s.king[us], us ^ 1)) {
      nodes += (depth === 1) ? 1 : perft(s, depth - 1);
    }
    E.unmakeMove(s);
  }
  return nodes;
}

// Standard positions with published node counts (CPW perft results)
const tests = [
  { name: 'startpos', fen: E.START_FEN, expect: [20, 400, 8902, 197281, 4865609] },
  { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', expect: [48, 2039, 97862, 4085603] },
  { name: 'position3', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', expect: [14, 191, 2812, 43238, 674624] },
  { name: 'position4', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', expect: [6, 264, 9467, 422333] },
  { name: 'position4-mirror', fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', expect: [6, 264, 9467, 422333] },
  { name: 'position5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', expect: [44, 1486, 62379, 2103487] },
  { name: 'position6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', expect: [46, 2079, 89890, 3894594] }
];

let fail = 0;
for (const t of tests) {
  for (let d = 1; d <= t.expect.length; d++) {
    const s = E.loadFen(t.fen);
    const t0 = Date.now();
    const got = perft(s, d);
    const ok = got === t.expect[d - 1];
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.name} depth ${d}: got ${got}, expect ${t.expect[d - 1]}  (${Date.now() - t0}ms)`);
  }
}
console.log(fail === 0 ? '\nALL PERFT TESTS PASSED' : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);

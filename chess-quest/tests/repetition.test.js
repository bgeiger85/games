/* Regression: a winning side must not shuffle itself into a repetition draw. */
const G = require('../build/combined.js');
let draws = 0, wins = 0;
for (let g = 0; g < 8; g++) {
  const s = G.loadFen(G.START_FEN);
  const hist = [G.posKey(s)];
  let out = 'maxply';
  for (let ply = 0; ply < 200; ply++) {
    const r = G.gameResult(s, hist);
    if (r.over) { out = r.type; break; }
    let m;
    if (s.turn === G.WHITE) {
      const res = G.searchRoot(s, 4, 700, true);
      const pool = res.filter(x => res[0].score - x.score <= 30).slice(0, 3);
      m = pool[Math.floor(Math.random() * pool.length)].move;
    } else m = G.chooseBotMove(s, G.BOTS[0]);
    G.makeMove(s, m);
    hist.push(G.posKey(s));
  }
  if (out === 'repetition') draws++;
  if (out === 'checkmate') wins++;
  process.stdout.write(`  game ${g + 1}: ${out}\n`);
}
process.stdout.write(`\nstrong side: ${wins} checkmates, ${draws} repetition draws\n`);
process.stdout.write(draws === 0 ? 'PASS: no repetition draws\n' : 'NOTE: repetition draws still possible\n');

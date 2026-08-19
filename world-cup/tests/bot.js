/* The playtest bot, shared by match.test.js and tournament.test.js.

   It is deliberately dim. It runs at the goal, steps around a defender that
   gets in front of it, chases the ball down when it loses it, and shoots at
   whichever corner the keeper is further from. That is the whole strategy a
   six year old picks up in about three minutes, and it is the yardstick the
   rounds are tuned against: if this bot cannot win a round, the round is
   wrong, not the player.

   It commits to a corner rather than re-picking one every frame. Re-picking
   made it weave, which dragged the keeper along with it and meant it arrived
   with the keeper already standing on the shot - an artefact of running the
   loop at 33Hz that no child would reproduce.

   It reads GOAL_T and GOAL_B out of the page instead of hardcoding them, so
   moving the posts cannot silently turn the bot into a bad shot.

   It steers by target point rather than by simulating a thumb on the floating
   stick, which is a lot of machinery for no extra confidence. It does use
   M.throttle, the same 0..1 the stick sets, so it experiences close control
   and the risk of sprinting exactly as the player does.

   It also answers the keeper moment. It has to: a bot that let the timer run
   out every time would be measuring the no-tap path, which carries the worst
   odds in the game, and the score table would describe a player who never
   defends rather than one who does. */
const BOT_SOURCE = () => new Promise(res => {
  const GOALX = 1980;
  const midY = (GOAL_T + GOAL_B) / 2;
  let shots = 0, tackles = 0, winbacks = 0, saves = 0, onetwos = 0, corner = null, lastPhase = 'us';

  const iv = setInterval(() => {
    if (!M) { clearInterval(iv); return res({ err: 'the match vanished mid-play' }); }
    if (M.over) {
      clearInterval(iv);
      return res({ gf: M.gf, ga: M.ga, shots: shots, tackles: tackles,
                   winbacks: winbacks, saves: saves, onetwos: onetwos, conceded: M.ga });
    }

    // Their break away: pick a side, the way the player has to. A bot that
    // ignored this would sit through every keeper moment on the no-tap path,
    // which is the worst odds in the game, and the tournament score table
    // would then be measuring a player who never defends.
    if (M.saving) {
      if (!M.saving.done) {
        const pick = (saves + tackles) % 3;        // vary it, no Math.random in here
        M.saving.picked = pick;
        resolveSave();
        saves++;
      }
      return;
    }

    // Nico. The give-and-go is the move the later rounds are built around, so
    // the bot has to play it or the score table describes a player who never
    // learned the thing the game just spent a round teaching.
    if (M.mate) {
      if (M.mate.hasBall) {
        // keep running past the man while he holds it, then call for it back
        M.tx = Math.min(1900, M.x + 260); M.ty = M.y; M.throttle = 1;
        passBack();
        onetwos++;
        return;
      }
      if (M.phase === 'pass') {
        // the "go" half: run into space while it is travelling
        M.tx = Math.min(1900, M.x + 240); M.ty = M.y; M.throttle = 1;
        return;
      }
    }

    if (M.phase !== lastPhase) {
      if (M.phase === 'them') tackles++;
      if (lastPhase === 'them' && M.phase === 'us') winbacks++;
      lastPhase = M.phase;
    }
    if (M.freeze > 0 || M.phase === 'dead' || M.phase === 'shot') return;

    if (M.phase === 'them') {
      if (M.carrier) { M.tx = M.carrier.x; M.ty = M.carrier.y; M.throttle = 1; }
      corner = null;
      return;
    }

    let near = null, nd = 1e9;
    M.defs.forEach(d => {
      if (d.stun > 0) return;
      const dist = Math.hypot(d.x - M.x, d.y - M.y);
      if (dist < nd) { nd = dist; near = d; }
    });

    // Close control near a defender, full tilt in open space. The ball sits
    // further from his feet the harder he runs and a defender reaches for the
    // BALL, so sprinting past someone is how you lose it. A bot that ran flat
    // out everywhere would measure a player who never learned that, and the
    // tournament score table is supposed to describe one who did.
    // Only slow down inside the range where it actually buys something. At a
    // sprint the ball sits BALL_FAR ahead, so a defender takes it from about
    // 86px away; easing off pulls it in to BALL_NEAR and pushes that down to
    // 60. Anywhere further out, slowing is pure lost ground. The first cut
    // eased off at 170px and the bot crawled through the whole tournament,
    // taking one shot a match instead of three.
    M.throttle = nd < 100 ? 0.62 : 1;

    // Cornered with a teammate available: pass around him instead of trying to
    // dribble through. This is the whole point of Nico being on the pitch.
    if (near && nd < 130 && near.x > M.x - 20 && typeof canPass === 'function' && canPass()) {
      pass();
      return;
    }

    // someone in front and close: go round the side he is not on
    if (near && nd < 150 && near.x > M.x - 20) {
      M.tx = M.x + 190;
      M.ty = near.y > M.y ? Math.max(60, M.y - 150) : Math.min(580, M.y + 150);
      return;
    }

    // pick the corner the keeper is further from, then hold that line in
    if (M.x < 1300 || corner === null) corner = M.keeper.y > midY ? GOAL_T + 26 : GOAL_B - 26;
    M.tx = GOALX; M.ty = corner;

    // Shoot only when the aim line is actually on the goal, which is what the
    // player does: the dotted line and the ring on the goal line are drawn
    // every frame for exactly this reason. shoot() fires along Yamal's current
    // facing, and facing is updated by the game's own loop on the next frame,
    // so pulling the trigger in the same tick as a change of direction sends
    // the ball wherever he was running a moment ago. That is not a bug - the
    // aim line shows it happening - but a bot that ignores the line spent four
    // shots a match putting it out for a throw-in.
    if (M.aimx > 0.2 && M.x > 1540 && nd > 70 && M.shotCool === 0) {
      const hit = M.y + (M.aimy / M.aimx) * (GOALX - M.x);
      if (hit > GOAL_T + 18 && hit < GOAL_B - 18) { shoot(); shots++; corner = null; }
    }
  }, 30);
});

module.exports = { BOT_SOURCE };

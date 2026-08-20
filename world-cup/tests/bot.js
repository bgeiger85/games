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
/* The bot drives the physics itself, on a synthetic clock.

   This is the difference between a test that measures the game and a test that
   measures the machine, and the game's own step() comment says why. Movement is
   FIXED STEP - Yamal covers YAMAL_SPEED px per step() call, however long the
   frame took - but the clock advances by REAL elapsed time, clamped to 50ms a
   frame. That clamp is right for the game: it is what stops a locked iPad
   burning through a match. It is fatal for a timed test.

   Work it through. A match is over at M.elapsed >= secs. At 60fps each frame
   adds 16.7ms, so 22 seconds takes about 1320 frames and Yamal gets 1320 moves.
   On a runner delivering 20fps the delta clamps, each frame adds the full 50ms,
   and the same 22 seconds takes 440 frames - a third of the moves, a third of
   the ground covered, a third of the chances. Same code, same game, three times
   less football.

   That is exactly what happened on 2026-08-19: 1.1 shots a match, nearly every
   result 0-0, and the semi-final lost three times running. The header on
   tournament.test.js already described that failure from the SECS 14 era and
   blamed the number; the number was innocent both times. The machine was slow.

   So the rAF loop is parked (M.paused, which makes loop() render without
   stepping) and each bot tick pumps STEPS_PER_TICK calls to step() with a clock
   that advances STEP_MS per call, no matter what the wall clock is doing. A
   match is now a fixed number of physics steps and a fixed number of bot
   decisions, in the same ratio a healthy 60fps browser would produce. A slow
   runner makes the suite take longer; it no longer makes it play a different
   game. */
const BOT_SOURCE = () => new Promise(res => {
  /* These live INSIDE the function on purpose. page.evaluate ships the function
     source to the browser and nothing else - module scope does not travel with
     it - so a constant declared outside is simply not defined once it lands.
     Declared outside, every tick threw "STEPS_PER_TICK is not defined", the
     pump never ran, the clock froze wherever the rAF loop left it, and the
     suite hung until something killed the browser. */
  const STEP_MS = 1000 / 60;   // one frame of game time per pumped step
  const STEPS_PER_TICK = 2;    // 30ms of decisions per ~2 frames, as at 60fps

  const GOALX = 1980;
  const midY = (GOAL_T + GOAL_B) / 2;
  let shots = 0, tackles = 0, winbacks = 0, saves = 0, onetwos = 0, corner = null, lastPhase = 'us';

  /* Park the real loop. render() still runs, so screenshots and the aim line
     are exactly what a player would see; only the stepping is ours. */
  let simT = 0;
  if (M) { M.paused = true; M.last = 0; }
  const release = () => { if (M) { M.paused = false; M.last = 0; } };

  const iv = setInterval(() => {
    if (!M) { clearInterval(iv); return res({ err: 'the match vanished mid-play' }); }
    if (M.over) {
      clearInterval(iv); release();
      return res({ gf: M.gf, ga: M.ga, shots: shots, tackles: tackles,
                   winbacks: winbacks, saves: saves, onetwos: onetwos, conceded: M.ga });
    }

    /* Pumped before the decisions rather than after, so that the early returns
       further down - the keeper moment, Nico holding the ball - cannot skip a
       tick's worth of match time. The intent set on the previous tick is what
       these steps act on, which is how it works with a real loop too. */
    for (let k = 0; k < STEPS_PER_TICK; k++) {
      if (!M || M.over || M.saving) break;
      simT += STEP_MS;
      step(simT);
    }
    if (!M) { clearInterval(iv); return res({ err: 'the match vanished mid-play' }); }
    if (M.over) {
      clearInterval(iv); release();
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

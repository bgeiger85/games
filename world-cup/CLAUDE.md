# Yamal's World Cup

An iPad soccer game for Jaxson, age 6. His dad Brian builds it with him.

**Jaxson is the player. Brian is the client. You are the builder.** When a
design question comes up, ask Jaxson in plain kid language with concrete
options, then build exactly what he picks. He is six: two options, not five.

Same shape as `cutie-bear/` in this repo, on purpose. If you have worked on
that, everything here will be familiar.

---

## Orient first

`docs/STATE.md` is one page: what exists, what is live, what is open, and what
must stay true. Read it before this file if you are arriving cold - it will
tell you which of the twelve ideas below you actually need.

## The single hardest rule

**`src/index.html` is the entire game. One file. No exceptions.**

No npm packages in the game, no CDN links, no external fonts, no image files,
no bundler. Every drawing is SVG or canvas generated in JS, every sound is a
Web Audio oscillator. After the first page load the game makes zero network
requests.

This is why it opens instantly on an iPad on bad wifi, why it cannot break when
someone else's CDN changes, and why "Add to Home Screen" makes it behave like a
native app. If you are about to add a dependency, you are about to break the
thing that makes this work.

`npm` is used only for Playwright, which runs the tests. It never ships.

The one place the rule bends is `dist/sw.js`, and only just: a service worker
cannot be registered from an inline script, so offline support needs one real
file next to the HTML. See `tools/make-sw.js`.

---

## Commands

```bash
npm install          # Playwright only, for tests
npm run serve        # http://localhost:8081, or the printed LAN address on an iPad
npm run build        # validate src/index.html, copy to dist/, make sw.js and the zip
npm test             # all ten suites, about ten minutes

npm run test:screens     # every screen at iPad size, a real drag, save/reload
npm run test:stick       # the floating stick, close control, and the hand-off-the-play rule
npm run test:warmup      # the warm-up with real taps, including one answered all wrong
npm run test:match       # a bot plays a full Group Match and has to win it
npm run test:keeper      # their break away: the odds, the freeze, the teardown
npm run test:passing     # Nico, the pass that always connects, the one-two, practice
npm run test:campaign    # qualifying, the playoff, the tables, and the save migration
npm run test:penalties   # the shootout, played with real taps, plus the odds
npm run test:tournament  # the bot plays all five rounds and has to lift the trophy
npm run test:safari      # storage, audio, canvas, service worker
npm run test:webkit      # all of the above on WebKit, which is the one that counts

npm run icon         # regenerate the home screen PNG in src/index.html
```

Tests write screenshots to `tests/shots/` (gitignored). **Look at them.** A test
that passes and a screen that looks wrong are both real outcomes, and only your
eyes catch the second one. Two of the layout problems fixed on day one passed
every assertion.

---

## Deploying

CI publishes `dist/` to Netlify after a green run on `main`, via
`.github/workflows/deploy-netlify.yml`.

Live at **https://yamals-world-cup.netlify.app**, published by CI. The site name
is in the repository variable `NETLIFY_SITE_SOCCER`; if that is ever unset the
deploy step skips with a warning rather than failing, and
`dist/world-cup-site.zip` can be dropped on netlify.com/drop by hand.

**The URL must never change.** The save lives in `localStorage`, which is scoped
per origin, so renaming the site costs Jaxson every trophy and career goal.

One trap worth knowing: a `workflow_run` deploy always executes the workflow
file from the repository's **default branch**, not from the branch that was
merged. When the default branch was behind `main`, a merge to `main` ran a
deploy that published the other two games and silently skipped this one.

---

## Where things live in `src/index.html`

One `<style>` block then one `<script>` block, sectioned with comment banners
in the order the code runs. Search for the banner text.

| Section | What it holds |
|---|---|
| CSS 1-12 | reset, stage scaling, screens, decor, top bar, home, ladder, match, penalties (9b warm up, 9c grown-ups), trophy room, popup, confetti |
| A | stage scaling and `stageXY` |
| B | save / load (`localStorage`, key `worldcup.save.v1`) |
| C | sound: `tone`, `noise`, the `sfx*` helpers |
| D | `TEAMS` - kits and inline SVG flags |
| E | `ROUNDS` - the fourteen match campaign, the tables, `defenderHome` |
| F | `yamalSVG()`, `trophySVG()` - art for the menus only |
| G | `decorate()` - crowd and bunting |
| H | router `go()`, `popup()`, `celebrate()` |
| I | home screen |
| J | the campaign screen - phases, tables, the bracket |
| Jb | **the warm up** - question banks, the adaptive pick, the gate |
| K | **the match** - state, the stick, `step()`, `render()`, the keeper moment |
| Kb | **Nico and the pass** - his AI, the pass, the one-two |
| L | the penalty shootout |
| M | trophy room |
| Mb | the grown-ups panel |
| N | boot and the service worker |

---

## The load-bearing ideas

### 1. The stage is CSS-scaled, so every input must be unscaled

The game is laid out on a fixed **960 x 720** board (iPad 4:3) and one CSS
transform scales it to fit. Nothing is re-laid-out responsively.

A raw touch coordinate is in screen pixels, not board pixels. Anything
comparing a pointer position to a game coordinate **must** go through
`stageXY(e)` first. The match canvas also sits 78px below the top of the board
and scrolls in x, so steering subtracts 78 and adds `M.cam`.

`test:screens` drives the canvas with a real mouse and asserts Yamal followed,
precisely so that this cannot regress into passing tests and a drifting finger.

### 2. The match is one canvas and one rAF loop

`M` holds the entire match. `M === null` means no match is running.
`step()` advances the world, `render()` draws it, `loop()` calls both.

`M.phase` is the whole state machine: `us` (Yamal has it), `them` (a defender
is carrying it back), `shot` (the ball is flying), `dead` (a reset is pending).

**`go('match')` runs `ROOM_LEAVE.match`, which nulls `M`.** `startMatch` changes
screen *before* it builds `M` for exactly this reason. Build `M` first and
"Play it again" from the full time popup destroys the match it just created.

### 3. Defenders are zonal, and a beaten defender stays beaten

Each defender guards a patch of grass, leaves it only when Yamal comes within
`range`, and jogs home once Yamal is past him.

The first version had all of them chase Yamal directly. It looked right and
played terribly: from three defenders up they converge from different angles
and corner him, and the playtest bot never got past the halfway point on any of
the last three rounds. A defender he had already beaten also turned round and
caught him again, so beating a man bought nothing.

Zonal is what makes it learnable for a six year old: **beat this guy, then that
guy, then shoot.** Do not turn it back into a swarm.

### 4. Shooting goes where he is facing, and the aim line always shows it

`shoot()` fires along `M.aimx/M.aimy`, which is the direction of the last steer.
The dotted line and the ring on the goal line are drawn every frame so this is
never a surprise, and the ring turns gold when the shot is on target. That
drawn line is the contract. Do not add auto-aim; do not remove the line.

Note the ordering: facing is updated by `step()` on the next frame, so code
that changes direction and shoots in the same tick fires along the *old*
direction. That is correct behaviour, and the playtest bot has to respect it
(see `tests/bot.js`).

### 5. The keeper's four numbers decide whether the game is beatable

`KEEPER_ROAM`, `KEEPER_REACH`, `KEEPER_DIVE`, `KEEPER_REACT`. The first three
were wrong at first and together produced a keeper who saved nineteen shots out
of nineteen; the fourth was missing and made close range worse than long range.

- **ROAM** (88) keeps him in the middle before the shot. Too small and he
  simply tracks the ball into the corner and stands on it, so running at a
  corner drags him there with you and the corners are never open.
- **REACH** (30) is how far either side of himself he saves, against a 230px
  goal. At 48 he covered nearly half the mouth from standing.
- **DIVE** (12) is pixels per frame once committed. Fast enough that what beats
  him is guessing wrong rather than being slow, finite enough that shooting
  from close in still helps.

- **REACT** (7 frames) is how long he stands still after the shot. Without it a
  short flight gives him no time to dive the *wrong* way while he is already on
  the shooter's line, so point blank converted 25-45% and dead centre from point
  blank converted 0%, against 74-81% from the edge of the box. Measured, not
  guessed - re-measure if you touch it.

The dive target is deliberately **not** clamped to the goal mouth. Clamping it
there pushed a corner-bound prediction back onto the post, so aiming at a
corner was worse than aiming down the middle.

If you touch any of these, re-run `test:tournament` and read the score table.

### 6. The warm-up is a toll he pays by turning up, not by being right

Before a new round he does five questions, his pick of numbers or words. Three
rules hold it up and none of them is negotiable:

- **Doing it earns the match, not passing it.** Every warm-up ends after n
  questions and unlocks the match whatever he answered. There is no score at
  the end. `test:warmup` plays one with every single question wrong on the
  first tap and fails if it does not reach the pitch, which is the single most
  important assertion in the suite.
- **He always finishes on the right answer.** A wrong tap fades that button and
  pulses the correct one; he then taps the correct one himself. The question is
  never skipped and there is no buzzer.
- **A loss never re-charges the toll.** `S.warm.ready` holds the round he has
  warmed up for, and it is only cleared in `matchWon`. Clear it anywhere else
  and losing starts costing him homework, which breaks the no-fail-states rule
  from the other direction.

The adaptive part is small and lives in `weightOf`: items he gets wrong come
back, items he has right three times mostly retire, and no more than two shaky
items land in one warm-up. Aim at roughly four out of five right.

The gold ball for a perfect warm-up is **cosmetic on purpose**. A real
advantage would make the tournament easier exactly when he is doing well, and
would turn a warm-up into something with stakes.

---

### 7. The finger never goes where the play is

Steering is a **floating stick**. Touch anywhere on the pitch and that point
becomes the centre; drag away from it to run in that direction. The finger
stays parked where it landed.

It used to be "Yamal runs to your fingertip", and that was structurally wrong
in a way no test could have caught. Brian played it and said his hand was in
the way and he could not see what he was shooting at. The old scheme set the
target TO the finger, so the finger sat on the exact spot Yamal was running at,
which attacking rightward is the goalmouth. The hand covered the target. There
was no tuning fix for that; the control had to change.

**Two input paths feed the same movement**, on purpose:

- a finger drives `M.stick`
- the playtest bot and the suites drive `M.tx / M.ty` with `M.throttle`

Simulating a thumb to test a match would be a lot of machinery for no extra
confidence. Both paths set `M.push`, 0 to 1, and push is what the rest of the
frame reads.

### 8. Push is the skill: close control versus running into space

`M.push` sets his speed **and** how far the ball sits from his feet
(`BALL_NEAR` 22 to `BALL_FAR` 48, squared so the middle of the range is still
comfortable). A defender reaches for the **ball**, not for Yamal. So flat out
you cover ground with the ball loose, and easing off tucks it in where he
cannot get it. Winning it back is still measured player to player, because
running into the man is the move.

The band where that decision matters is exactly `BALL_FAR - BALL_NEAR` wide.
At 40 it was 18px, about four frames, too narrow to feel. `test:stick` sweeps
for the band rather than trusting this paragraph.

Two things had to move with it, and both are load bearing:

- **`YAMAL_SPEED` went 4.3 to 5.2.** At 4.3 the stick was a pure downside:
  flat out you moved no faster than the old game but the ball was now loose.
  A risk has to buy something.
- **The reach curve is squared.** Linear meant a half push already had the ball
  two thirds of the way out, so the only safe option was a crawl and there was
  no cruising speed.

Get this wrong and the tournament table tells you immediately: an over-cautious
bot that eased off at 170px instead of 100px took one shot a match instead of
three and could not win the final.

### 9. The scoreboard has to move both ways

Once or twice a match the other team breaks away and Jaxson keeps goal, with
the same three choices as the penalty shootout. He already knows that move, so
it needs no teaching mid-match.

This exists because Brian played one match and asked why the other team never
scored. He was right. There *was* an opposition path - a defender who tackles
him carries the ball to our goal and `counter` rolls the dice - but three
decisions stacked to make it almost unreachable: the Group Match had
`counter: 0.00`, the carrier is deliberately slower than Yamal chases, and the
walk back is up to 1800px. Conceding needed him to ignore the ball for ten
seconds and then lose a roll that did not exist on round one. Winning 3-0 every
time meant nothing.

Two numbers per round control it:

- **`gap`** is seconds of play between break aways. A **rate, not a count**, so
  the number of them follows how long the match is. It was a count first, and
  that made the final much harder under test than in the real game, because
  `tournament.test` compresses every match to 25 seconds and a fixed two
  arrived inside 38% of the playing time.
- **`forgive`** is the chance of a fingertip save when he dives the *wrong*
  way. A right guess **always** saves, so his choice is what decides it;
  forgive is what stops a wrong guess being a certain goal. Effective save rate
  is `1/3 + 2/3 * forgive`. Turn this up if a round feels harsh.

Not choosing at all counts as a wrong guess, never as a free goal. Freezing is
exactly what a six year old does the first time this appears, and it must not
be punished harder than guessing.

It is still not a fail state: conceding costs one goal, the match stays
winnable, a draw goes to the shootout where the odds favour him, and losing
costs nothing.

---

### 10. Nico is the new verb, and the ladder is a curriculum

Brian said the game would go stale, and he was right about why: the rounds got
harder but they never asked anything new. A six year old masters "pull the
keeper one way, shoot the other" in three minutes, and after that it is only
tighter margins. Difficulty is not progression.

So the ladder now teaches something on each rung:

| Round | The new thing |
|---|---|
| Group Match | shoot - learn the aim line |
| Round of 16 | beat a man - learn the angles |
| Quarter-Final | **Nico joins** - pass around a man you cannot beat |
| Semi-Final | the one-two - combine to get through |
| THE FINAL | all of it, under pressure |

`r.mate` gates him. Do not turn him on for the group match: "you get a
teammate in the quarter-final" is a thing to look forward to, and the first two
rounds stay simple for replays.

**A pass ALWAYS connects.** No interception, no dice roll, and `test:passing`
fires eight passes through a wall of defenders parked on the line to keep it
that way. The skill is *when and where*, not whether it arrives: a good pass
finds Nico in space and you are past two men, a lazy one finds him marked. You
are rewarded with a better position and never punished with a turnover, which
is the same bargain the rest of the game makes.

The move is the **one-two**: pass, run past the man, get it back inside
`ONETWO_FRAMES`. It is the answer to being cornered, which was the only
genuinely frustrating position in the game. It shouts ONE-TWO! at him, because
naming the move is how a six year old learns it.

**It is counted, not paid in boots.** A playtest run with the bot spamming
one-twos turned 26 boots a tournament into 68, which quietly devalues every
boot he earned by scoring. A new skill gets a new number.

Nico does not shoot. He gives it back. This is still Yamal's World Cup.

---

### 11. The campaign is a season, and nothing in it can be lost

Fourteen entries, thirteen normally played. Brian again, after the passing
work: "the season is now too short". Five matches is an evening.

```
  0-5    QUALIFYING   a group of four, home and away
  6      THE PLAYOFF  only if he finishes below the top two
  7-9    GROUP STAGE  three matches, another table
  10-13  KNOCKOUTS    round of 16, quarter, semi, final
```

**Qualifying and the group are decided on POINTS.** Three for a win, one for a
draw, and that one point is the whole reason this shape suits the game: he can
lose a match and still go through, so a defeat stops being a wall.

Three rules follow from that and each has a test:

- **Losing a qualifier or a group match still advances the campaign.** Those
  phases are settled over the phase, not one match at a time. Making him replay
  turns a table back into a gate.
- **A league draw is a POINT, not a shootout.** Only knockouts and the playoff
  have to produce a winner on the day. Sending group draws to penalties would
  also quietly make the shootout the most played screen in the game.
- **No arrangement of results ends the campaign.** Lose all six qualifiers and
  the playoff is there; lose the playoff and it is offered again.
  `test:campaign` loses literally every match and asserts he still reaches the
  Round of 16.

`nextRound(idx)` is the only thing that knows the playoff can be skipped. Use
it rather than `idx + 1`.

**A table must never disagree with a match he played.** Four teams, so every
matchday is two matches: Spain against one rival, and the other two against
each other. `rivalRecords` walks the matchdays and gives Spain's opponent the
**real scoreline inverted, off `S.results`**. Only the match Spain was not in
is invented. This is the whole reason that function exists in its current form:
it used to fabricate every rival result from a hash that had never heard of
`S.results`, so Jaxson beat Norway 2-1 in his first qualifier and the table
handed Norway the win too. Brian caught it on the live site.

The cheap general test for this class of bug is arithmetic, and `test:campaign`
runs it on every table: each match has two teams, so across a table **goals for
must equal goals against, wins must equal losses, draws must be even, and
points must be 3W+D**. A table that invents one side of a match cannot satisfy
those. It is a much better assertion than checking any particular row.

**The rivals are not equally good.** The first listed is strong, the last is
weak, via the `edge` term in `rivalGame`. Without it every rival lands on the
same points and the table reads as decoration - a playtest had all three on 5
points with identical W-D-L. The invented results come from a hash of the pair
and the matchday, not `Math.random`, so the standings do not reshuffle when he
looks away. Call `rivalGame` with the lower index first or the two teams read
different versions of the same match.

**Memory is nowhere near a constraint** and this was measured rather than
assumed: a full campaign save is about 3.6 KB against Safari's ~5 MB, and a
flag costs a median 172 bytes. The limit on a longer season is a six year old's
attention, not the machine.

### 12. Changing the campaign shape means migrating the save

`S.v` is 2. v1 was the five match ladder where round 2 meant "quarter final";
v2 is the campaign where round 2 means "third qualifier". Carrying the number
across would drop him into the middle of qualifying holding results from a
tournament that no longer exists.

So the migration **restarts the campaign and keeps everything he earned**:
trophies, career goals, boots, penalties, one-twos, and everything the warm-up
has learned about him. `test:campaign` writes a real v1 save and asserts every
one of those survives. If you change the shape again, bump `v` and do the same.

---

## Design rules that are not negotiable

- **No fail states.** Losing a match costs nothing: the ladder does not move
  backwards, goals still count, and the popup says "Good try!" with a replay
  button. Nothing is ever taken away.
- **Forgiving beats challenging.** Yamal is always faster than every defender.
  The tackle radius is smaller than the players look. He cannot be tackled for
  40 frames after losing the ball or winning it back.
- **Getting the ball back is always possible.** The carrier runs slower than
  Yamal chases, and everyone else clears out of a counter-attack so it stays a
  one on one.
- **The shootout is in his favour on every round**, from 79% down to 68%
  against their 59%. `test:penalties` asserts this from the values in `ROUNDS`.
- **Every reward celebrates.** `celebrate()` on any goal, win or trophy.
- **Touch only.** No keyboard anywhere. Minimum 48px targets; SHOOT is 158px.
- **Kid-facing copy is short, warm, and never negative.** "Good try!" not
  "You lost."
- **Nothing he answers can lock him out of the game.** The warm-up gate is the
  only door in the whole file, it stands in front of new ladder progress only,
  and Penalty Practice and replaying a won round stay free. If a change makes
  it possible for a six year old to open this game and find every door shut,
  the change is wrong.

---

## Gotchas that have already bitten

- **Never time the match against the wall clock.** `M.elapsed` accumulates
  clamped frame deltas, because the physics are fixed step: Yamal moves 4.3px
  per `step()` whether the last frame was 16ms or a minute ago. Wall clock time
  meant a locked iPad finished the match by itself, as a 0-0 draw, straight into
  a shootout. `pauseMatch()` on `visibilitychange` covers the rest.
- **The keeper has a reaction delay, and it is load bearing.** Without
  `KEEPER_REACT` the distance curve runs backwards: point blank converted
  25-45% and dead centre from point blank converted 0%, against 74-81% from the
  edge of the box. Running at the keeper is the most natural thing a six year
  old does and it was the worst thing he could do.
- **The popup blocks everything.** `#pop` is `z-index: 30` and covers the board.
  If a tap does nothing, check whether a popup is still open.
- **Delayed popups after leaving a screen.** Anything on a `setTimeout` that
  shows a popup must re-check `current` before firing, or a full time result
  appears while he is in the trophy room.
- **iOS needs a gesture before audio.** The context unlocks on the first
  `pointerdown`. Do not create it earlier; `test:safari` asserts it does not
  exist before the first tap.
- **The canvas takes pointer capture on `pointerdown`, and needs to.** SHOOT is
  a 158px circle in the bottom right, exactly where a right handed thumb
  steers. Chromium does implicit mouse capture for a drag and hides this;
  WebKit does not, so without the explicit capture the gesture is cancelled the
  moment the finger crosses the button and Yamal stops dead with the finger
  still down. `test:screens` drags across the button on purpose.
- **Only break out of the contact loop when possession actually changed.**
  Breaking on mere contact meant a defender standing on Yamal shadowed the
  carrier behind him in the array, and winning the ball back became impossible.
- **You cannot start a CSS transition on an element inside `display:none`.**
  The keeper moment's countdown bar set up its transition and then showed the
  overlay, so no reflow could happen between the two writes and the bar snapped
  straight to empty. Show the container first, then animate. Worth knowing that
  an instantly empty bar looks like a bar that is simply there - this was found
  by reading the computed transform, not by looking at it.
- **`localStorage` throws in private browsing**, so every access is inside a
  try. `tools/build.js` warns if a new one is not.
- **A looping `transform` makes an element unclickable in Playwright.** The
  pulse on the correct answer started as `translateY` and no test could ever
  tap it: Playwright waits for an element to be stable and one that animates
  forever never is. It is now a ring drawn with `box-shadow`, which does not
  move the button. A target that never holds still was worse for Jaxson than
  for the test.
- **An out of range value in the save falls back to the easiest setting**, it
  does not clamp to the nearest. Clamping answered a corrupted save by putting
  a six year old on the hardest level.
- **`speechSynthesis` is allowed to be missing.** It is the one browser API
  here that can be absent or throw, so every call is inside a try and the
  speaker button simply does nothing on a device without a voice. Cancel it in
  `ROOM_LEAVE.warm` or the iPad keeps reading a sentence he has walked away
  from.
- **Adding a team:** one entry in `TEAMS` with a kit, a trim and an inline SVG
  flag. **Adding a round:** one entry in `ROUNDS`; the ladder, the flags and the
  save all read from that array. Bump nothing else.

---

## House style for this repo

- Plain ES5-flavoured JS in the game. `var`, function declarations, no build
  step, no transpiler. It has to run as-is in Safari. Test files are Node and
  may use modern syntax.
- Comments explain **why**, especially where a number was tuned by playtesting.
  Nearly every constant in the match was wrong once; the comment says how.
- Brian's writing style for anything he will read: no em dashes, plain ASCII,
  short declaratives, no filler.

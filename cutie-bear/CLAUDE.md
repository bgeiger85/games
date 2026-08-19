# Cutie Bear

An iPad web app designed by Addison, age 8. Her dad Brian builds it with her.
Live: https://melodious-sunshine-3f8692.netlify.app/

**Addison is the designer. Brian is the client. You are the builder.** When a
design question comes up, the answer is hers, not yours. Ask her in plain kid
language with concrete options, then build exactly what she picks.

---

## The single hardest rule

**`src/index.html` is the entire app. One file. No exceptions.**

No npm packages in the app, no CDN links, no external fonts, no image files, no
build step that bundles anything. Every pixel is SVG generated in JS, every
sound is a Web Audio oscillator. After the first page load the app makes zero
network requests.

This is not preciousness. It is why the app opens instantly on an iPad over bad
hotel wifi, why it cannot break when someone else's CDN changes, and why "Add to
Home Screen" makes it behave like a native app. If you are about to add a
dependency, you are about to break the thing that makes this work.

`npm` is used only for Playwright, which runs the tests. It never ships.

---

## Commands

```bash
npm install          # Playwright only, for tests
npm run build        # validate src/index.html, copy to dist/, make the deploy zip
npm test             # all three suites (about 4 minutes)

npm run test:screens # every screen at iPad viewport, save/reload, canvas paths
npm run test:games   # bots that actually PLAY Star Steps, Treat Chase, Star Song
npm run test:care    # bots that feed, scrub, tuck in, and play all four Play games
npm run test:levels  # a bot plays all eight Star Steps levels and the battles
npm run test:garden  # planting, the slow clock, harvesting
npm run test:dance   # an on-beat bot and a deliberately sloppy one dance all nine routines
npm run test:learn   # re-derives 1800+ generated maths answers, checks the star rate
npm run test:playtest # bugs Addison found by playing: sound controls, friends in photos
npm run test:safari  # storage, audio, SVG-to-canvas, offline (ENGINE=webkit for the real one)

npm run options      # re-render tools/character-options.html to a PNG for Addison
npm run outfits head # contact sheet of every outfit in a slot, WORN (head/body/feet/extra)
```

Tests write screenshots to `tests/shots/` (gitignored). **Look at them.** A test
that passes and a screen that looks wrong are both real outcomes, and only your
eyes catch the second one.

---

## Deploying

Netlify, site `melodious-sunshine-3f8692`. Two ways:

1. **Manual (current):** drag `dist/index.html` into the site's Deploys tab, or
   drag `dist/cutie-bear-site.zip` onto netlify.com/drop.
2. **API (preferred, not set up):** if `NETLIFY_AUTH_TOKEN` is in the env,
   `npx netlify-cli deploy --prod --dir=dist`. Brian keeps credential entry
   manual, so ask before wiring anything that stores a token.

Always run `npm test` before deploying. Always.

---

## Where things live in `src/index.html`

The file is one `<style>` block then one `<script>` block, sectioned with
comment banners in the order the code runs. Search for the banner text.

| Section | What it holds |
|---|---|
| CSS 1-12 | reset, stage scaling, screens, decor, top bar, home, rooms, closet, care, care activities (9b), games, photo, popup |
| A | stage scaling |
| B | save / load (`localStorage`, key `cutiebear.save`, versioned inside the payload) |
| C | sound: `rawTone`, `tone`, music loop, `sfx*` helpers |
| D | **`bearSVG()`** — the character. `ear()`, `SLOT_TX`, `wearing()` |
| E | `ITEMS` — every outfit, by slot |
| F | `ICONS` — small pictures used all over |
| G | `decorate()` — clouds, rainbows, twinkles |
| H | router: `go()`, `ROOM_ENTER`, `ROOM_LEAVE`, `refreshStars`, `addStars`, `popup` |
| I | home screen doors, room unlock costs |
| J | closet / dress up |
| K | `FRIENDS`, `meetFriend()`, `maybeVisit()` |
| L | `celebrate()` — confetti and fireworks |
| M | **Take Care** — the four hands-on activities |
| N | Star Song (copy the pattern) |
| O | Treat Chase |
| P | Star Steps: `STEP_LEVELS`, the seeded layout builder, and the rescue battle |
| P2 | Cloud Garden: `SEEDS`, the growth clock, `gardenSun` |
| P3 | Dance Studio: `DANCE_STYLES`, `DANCE_ROUTINES`, the beat loop, the pads |
| P4 | Learning Lab: `LEARN_MATH` generators, the reading and science banks, `learnGrade` |
| Q | `bearImage()` — rasterise the SVG bear to a canvas image |
| R | Photo Booth |
| S | boot |

---

## The four load-bearing abstractions

Understand these four and the rest of the file is easy. Break one and something
far away stops working.

### 1. The stage is CSS-scaled, so every input must be unscaled

The whole app is laid out on a fixed **960 x 720** board (iPad 4:3) and one CSS
transform scales it to fit the device. Nothing is ever re-laid-out responsively.

The catch: a raw touch coordinate is in screen pixels, not board pixels.
Anything that compares a pointer position to a `left`/`top` value **must** go
through `stageXY(e)` first. Every drag, scrub, and drop in Take Care depends on
this. Skip it and things drift further from the finger the bigger the screen.

### 2. `SLOT_TX` maps outfits onto the body

The 18 outfits were drawn against an earlier body plan. `SLOT_TX` holds one
transform per slot (head, body, feet, extra) that maps outfit coordinates onto
the current bear. **If you change the bear's proportions, change those four
transforms, not the 18 outfits.** `SLOT_VIEW` does the same job for the closet
thumbnails.

### 3. `bearImage()` is how the bear reaches a canvas

Star Steps and the Photo Booth need a bitmap. `bearImage()` serialises the
current SVG to a data URL and loads it as an `Image`. That means art changes
propagate to the canvas games for free, and it means the SVG must stay fully
self-contained (no external refs, no `foreignObject`, or iOS Safari will refuse
to load it).

### 3b. Star Steps levels are seeded, not random

`STEP_LEVELS` is a table of eight named levels plus an endless one. Each entry
is a handful of dials (speed, gap, cloud width, height spread, and the chance of
a rainbow slide, a bouncy cloud, a drifting cloud or a star to collect) and the
distance needed to clear it.

Layouts are built from `stepsRng(seed)`, seeded by the level index, so **level 5
is the same level 5 every time**. That is what makes a level learnable, lets a
level be tuned once and stay tuned, and stops a bad roll spawning a gap nobody
can cross. Only the endless level uses real randomness.

Three levels are `rescue: true`. Reaching the goal there does not clear the
level: it starts a battle. A Gloom Cloud sweeps back and forth holding one of
the friends, and three bumps from below frees her. She is pinned at screen x 180
with the world stopped, so **the cloud has to come to her** — anything that
parks the boss off to one side is unreachable by construction.

Two rules the battle keeps: the cloud never touches her, never chases her and
cannot take anything away, and falling short still pays stars, so a retry is
progress rather than punishment.

`npm run test:levels` plays every level with a plain hopping bot and reports how
far it got. **If a level is not clearable by that bot, the level is wrong, not
the player.** It retries up to three times per level, because the bot's timing
is not deterministic even though the layout is.

### 3c. The Dance Studio is judged on its hit window, not its feel

Nine routines, three each of hip-hop, jazz and ballet, seeded from the routine
index the same way Star Steps levels are. Four pads, and **the four shapes never
move between styles**: pad 1 is always the up shape, pad 4 always the burst.
Only the words and colours change, so timing learned in hip-hop carries into
ballet.

The hit window is capped in real milliseconds as well as in beats (`good` 300ms,
`tight` 150ms). A fast routine therefore never gets stricter than a child's
reaction time, and a slow one never gets so loose that timing stops mattering.

`npm run test:dance` runs two bots. The on-beat one proves every routine is
danceable. **The sloppy one is the test that matters**: it taps up to 350ms off
the beat and hits the wrong pad one time in twelve, and it still has to open the
next routine. If that bot starts failing, the window is too tight, however good
the game feels to someone who already knows where the beat is.

Missing a move costs nothing. The bear dances it anyway, there is no sound and no
mark, and the routine always finishes and always celebrates. Hits only decide
stars and whether the next routine opens.

### 3d. The Learning Lab must stay the fastest stars in the app

Free from the first launch, three subjects, one level each from 1 to 10. The
level is the whole of the adapting: three right in a row moves her up, three
wrong eases her back, and it is saved per subject. Level 1 is the start of third
grade, level 10 reaches into fifth.

**The star rate is a design constraint, not a detail.** Treat Chase pays about 8
stars a minute, the Dance Studio about 9, a strong Star Steps level about 15. A
clean ten question round here pays 31 (2 per correct, 3 more every fifth in a
row, 5 for finishing), which lands well above all of them. If that stops being
true, the room becomes homework with a bear on it and she will stop choosing it.
`npm run test:learn` asserts the measured rate.

**Maths is generated, reading and science are written banks.** Generated means
there is nothing to memorise, and it also means a bad generator ships a wrong
answer to a child who will believe it. The test samples 3000 questions across
all ten levels, checks each is well formed with four unique options, and
independently re-derives every arithmetic answer it can parse. That check found
six real bugs on the first run, all of them in questions whose answers are text
rather than numbers: fraction comparisons with only two wrong answers, two
identical distractors, and a remainder question whose wrong answer was
sometimes right. Any new generator must keep that test green.

A wrong answer shows the right one with a one sentence reason, still counts
toward the ten, and costs nothing. The round always ends in stars.

### 4. Care activities are a stage overlay, not a screen

`openCare(mode)` hides `#careroom`, shows `#carestage`, and calls one builder.
`closeCare()` tears down every listener registered with `onStage()`.
`careDone(key, amount, stars, title, msg)` handles meters, stars, celebration
and navigation. **A new activity is just a builder that fills a div.** It should
never touch meters or navigation directly.

---

## Design rules that are not negotiable

- **No fail states.** Nothing chases her, nothing scares her, nothing punishes
  her. The only way to end Star Steps early is falling, and that ends in
  confetti and a score, never a loss.
- **Care meters floor at 15.** A virtual pet that can be neglected into misery
  is not appropriate for an 8 year old. She can always improve things, never
  fail them.
- **Forgiving beats challenging.** Star Steps has coyote time, a double jump,
  and a wide starting platform because the first playtest bot died in two
  seconds. When in doubt, make it easier.
- **Every reward celebrates.** `celebrate()` on anything completed. She picked
  confetti *and* fireworks and she gets both.
- **Touch only.** No keyboard anywhere. Minimum 48px targets.

---

## Gotchas that have already bitten

- **The popup blocks everything.** `#pop` is `z-index: 30` and covers the board.
  If a tap does nothing, check whether a popup is still open. `go()` closes it;
  activity code must not assume it is closed.
- **Delayed popups after leaving a room.** Anything on a `setTimeout` that
  shows a popup must re-check `current` (or `careMode`) before firing, or a
  result from Star Steps pops up while she is in the closet.
- **iOS needs a gesture before audio.** The audio context unlocks on the first
  `pointerdown`. Do not try to start music earlier.
- **Do not `Date.now()` your way into a broken save.** Care decay reads
  `S.care.t`. Always update it when you change a meter.
- **Anything rasterised must carry `xmlns`.** Inline in the page the HTML parser
  forgives a missing one, so it looks right on screen. Through a data: URI into
  an `Image` it is parsed as XML, where it is required, and the image silently
  never decodes. This is why the Photo Booth quietly refused to put friends in
  pictures for weeks. Everything now goes through `svgToImage()`, which adds it.
- **No `<text>` in an outfit.** It depends on a font being available at raster
  time, so a jersey number can vanish in the Photo Booth. Draw shapes.
- **The popup does not cover the top bar**, on purpose. It used to, which meant
  the music button could not be pressed while any popup was open, and a popup
  appears after every game. Sound controls are added to every bar by
  `buildSoundBtns()`, not written into the markup.
- **Adding an outfit:** one entry in `ITEMS[slot]` with name, cost, svg. Nothing
  else. Then run `npm run outfits <slot>` and LOOK at it on the bear. **Adding a friend:** one entry in `FRIENDS`. The photo booth, hiding
  logic, and castle strip all read from that array. **Adding a room:** one entry
  in `ROOMS`, one `.screen` div, one `ROOM_ENTER` handler.

---

## Still unverified

The app has never been tested on real iOS Safari. It is verified in Chromium at
iPad viewport, portrait and landscape. Four things behave differently on iOS and
are all written defensively, so the failure mode is a missing feature rather
than a broken app:

1. Web Audio unlocking on first tap
2. SVG-to-canvas in the Photo Booth (`bearImage`)
3. `localStorage` surviving across Safari sessions
4. `pointermove` drag, which drives the sponge, the blanket, and tickling

If Brian reports one of these is dead on the iPad, that is the first place to
look.

---

## House style for this repo

- Plain ES5-flavoured JS. `var`, function declarations, no build step, no
  transpiler. It has to run as-is in Safari.
- Comments explain **why**, especially where a number was tuned by playtesting.
- Kid-facing copy is short, warm, and never negative. "Good try!" not "You lost."
- Brian's writing style for anything he will read: no em dashes, plain ASCII,
  short declaratives, no filler. Pressure test his decisions in one pass:
  the load-bearing assumption, the one thing that breaks it, what evidence
  settles it. Say whether it is taste or risk.

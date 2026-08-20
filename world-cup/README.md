# Yamal's World Cup

An iPad soccer game built for Jaxson, age 6.

You are **#19 Lamine Yamal**, playing for Spain, through a whole campaign:

```
  QUALIFYING   six matches against Norway, Scotland and Greece, home and away
  PLAYOFF      only if you finish outside the top two
  GROUP STAGE  Japan, Morocco, Uruguay
  KNOCKOUTS    round of 16, quarter, semi, and the final
```

Qualifying and the group are decided on **points** - three for a win, one for a
draw - so you can lose a match and still go through. A drawn knockout goes to
penalties, same as the real thing. The rivals play each other on the same
matchdays, and the team you just played takes your real scoreline on the chin,
so the table always agrees with the match you finished.

**Nothing can end the campaign.** Lose every qualifier and the playoff is
waiting; lose that and you play it again. The road to the World Cup only ever
gets longer, never closed.

Losing costs nothing. Your goals still count either way, and you can replay any
match as often as you like.

Before each new round there is a **warm-up**: five quick questions, his pick of
numbers or words, about a minute. Doing it earns the match. Getting them right
is not required and never has been: a warm-up answered entirely wrong still
kicks off, and `test:warmup` exists mostly to keep that true. Five out of five
puts a **gold ball** on the pitch for that match.

The whole thing is **one HTML file** with no dependencies. Every drawing is SVG
or canvas generated in JavaScript, every sound is a Web Audio oscillator, and
after the first page load it never touches the network.

---

## How you play it

Two thumbs.

- **Touch anywhere and drag** to steer. Wherever you touch becomes a stick, and
  you pull away from it to run. Your hand stays in the corner instead of
  covering the goal.
- **Press the big red SHOOT button.**

**How far you push is how fast he runs, and how far the ball sits from his
feet.** Flat out you cover ground but the ball is out in front where a defender
can nick it. Ease off and it is tucked in where he cannot. Close control versus
running into space, which is the one real bit of soccer in here.

The dotted line shows exactly where the shot will go, and the ring on the goal
line turns gold when you are on target. The keeper guards the middle, so the
way to score is to pull him one way and finish the other.

If a defender takes it off you, chase him down and run into him to win it back.
He is slower with the ball than you are without it.

Once or twice a match **the other team breaks away** and you keep goal: dive
left, stay, or dive right, the same three choices as the shootout. Guess right
and you always save it. Guess wrong and you might still get a fingertip to it.

From the fifth qualifier on, **Nico Williams (#17) plays alongside you** and a
blue PASS button appears. A pass always reaches him, so the question is only when
and where. The move to learn is the **one-two**: pass, run past the defender
you could not beat, then tap PASS again to get it back on the other side.

---

## The warm-up

**Numbers** is addition with three big answers to choose from. Sums to 10 draw
the balls above the sum so counting is always available. **Words** is a
sentence about the game with a word missing, and the wrong choices are
look-alikes on purpose, because was/saw and want/went are the pairs a first
grader actually trips on. A speaker button reads the sentence aloud using the
voice already in Safari, with the gap spoken as "blank".

A wrong tap never skips the question. That button fades, the right one pulses,
and he taps it himself, so every question ends on the correct answer.

The unlock lasts until he **wins** the round, so replaying a knockout he lost is
free. Penalty Practice, Passing Practice and replaying a match he has already
won are free too.

**For grown-ups:** press and hold the boots badge on the home screen for two
seconds and answer 7 x 8. That panel has the on/off switch, the number of
questions, the two difficulty levels, and a readout of which sums and which
words he is getting wrong, which is the part worth reading.

---

## Passing Practice

A free mode from the home screen, like Penalty Practice. No clock, no score,
nothing that touches the tournament. Pass to Nico, run, get it back, and the
counter at the top right ticks up. It is where the one-two is learned before it
matters.

---

## Quick start

```bash
npm install        # Playwright, for tests only. Nothing ships.
npm run serve      # open http://localhost:8081, or the printed LAN address on an iPad
npm test           # all ten suites, about ten minutes
npm run build      # validate and produce dist/
```

To put it on an iPad: open the URL in **Safari**, tap Share, then Add to Home
Screen. It gets its own icon and launches full screen.

---

## Layout

```
src/index.html      the entire game. this is the source of truth
dist/               build output: index.html, sw.js, and a zip for netlify.com/drop
tests/              Playwright suites, and the screenshots they produce
tests/bot.js        the playtest bot the match difficulty is tuned against
tools/build.js      validate + copy. refuses to ship a file with a dependency
tools/make-sw.js    generates the offline cache worker
tools/make-icon.js  regenerates the home screen PNG (iOS refuses SVG for this)
tools/serve.js      dependency-free static server for testing on a real device
docs/STATE.md       where the project stands right now. start here to orient
docs/               design notes and what is worth doing next
CLAUDE.md           read this before changing code
```

---

## Tests

Ten suites, testing different things on purpose.

| Command | What it proves |
|---|---|
| `test:screens` | every screen renders at iPad size; a **real mouse drag** moves Yamal, which is the only way to catch a broken `stageXY`; the save survives a reload; zero console errors |
| `test:stick` | the floating stick driven with a real mouse: it moves him, it stays where the thumb landed, easing off pulls the ball in, and there is a real range where that saves it |
| `test:warmup` | the warm-up played with real taps. The centrepiece is a warm-up answered **entirely wrong**, which still has to reach the pitch: nothing he answers can lock him out of his own game |
| `test:match` | a bot plays a full Group Match and has to **win** it, and losing the ball then chasing it down has to work |
| `test:keeper` | the other team's break away: a right guess always saves, a wrong one and freezing are never certain goals, the clock freezes while he chooses, and it cannot outlive its match |
| `test:passing` | Nico and the give-and-go: a pass fired through a wall of defenders has to connect every time, the one-two is counted and named, and Passing Practice never touches the ladder |
| `test:campaign` | the season: qualifying on points, the playoff skipped when he goes through on the table, a league draw scoring a point instead of a shootout, and a v1 save migrating without losing a single trophy. It audits every standings table for the arithmetic that says **each match was counted once from each side**, and it loses **every match** and asserts the campaign still reaches the knockouts |
| `test:penalties` | the shootout is played with real taps, always terminates, and is in the player's favour on every round |
| `test:tournament` | the bot plays the **whole campaign** and has to lift the trophy, printing a score table that is the difficulty tuning signal |
| `test:safari` | localStorage across a reload and after corruption, Web Audio only after a gesture, canvas 2d actually painting, service worker and an offline reload |

Run `npm run test:webkit` for the version that matters. The game is played on
an iPad and WebKit is the closest thing CI has to iPad Safari.

Screenshots land in `tests/shots/`. Look at them.

---

## Deploying

CI publishes to Netlify after a green run on `main`.

Live at **https://yamals-world-cup.netlify.app**. The site name is in the
repository variable `NETLIFY_SITE_SOCCER`; if it is ever unset the deploy step
skips with a warning rather than failing, and `dist/world-cup-site.zip` can be
dropped on netlify.com/drop by hand.

**The URL must never change.** The save lives in `localStorage`, which is
scoped per origin, so renaming the site costs Jaxson every trophy, every career
goal, and everything the warm-up has learned about him.

---

## Working on it

Read `CLAUDE.md`. It covers the one hard rule (single file, no dependencies),
the ideas the game hangs on, the design rules that are not negotiable, and
the gotchas that have already bitten once.

The short version: **Jaxson is six.** When in doubt, make it easier, make it
bigger, and make it celebrate.

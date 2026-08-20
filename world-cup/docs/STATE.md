# Where this project stands

Last updated 2026-08-20, after the standings fix went live.

This is the orientation page. It says what exists, what is live, and what is
open. It does not explain *why* anything was built the way it was - that is
`CLAUDE.md`, and you should read that before changing code.

---

## What this is

An iPad soccer game built for Jaxson, age 6. He plays as Lamine Yamal for Spain
through a fourteen match World Cup campaign. It is one self-contained HTML file
with no dependencies, no CDN, and no network traffic after the first load.

**Live at https://yamals-world-cup.netlify.app** - and that URL must never
change. The save lives in `localStorage`, which is scoped per origin, so
renaming the site costs him every trophy and everything the warm-up has learned
about him.

## Where it lives

There is no project container outside git. The repository **is** the project.

```
github.com/bgeiger85/games      public, and the only thing that publishes
├── world-cup/        this game
├── cutie-bear/       an earlier game, same architecture
└── chess-quest/      a third, same architecture
```

It used to live in `bgeiger85/bgeiger`, alongside work tooling. The games were
split out into their own public repo so the work code could go private, and
`bgeiger` no longer deploys anything. If you find that repo, it is the old
address.

Each is an independent npm package with its own tests and its own CI job. CI
runs only the games a commit actually touched, then publishes all three to
Netlify after a green run on `main`.

## Reading order

| Read | For |
|---|---|
| `CLAUDE.md` | **first.** The one hard rule, twelve load-bearing ideas, the non-negotiable design rules, and the gotchas that have already bitten |
| `README.md` | what the game is and how it is played |
| `docs/DESIGN.md` | why each decision was made, including the ones that were reversed and why |
| `docs/NEXT.md` | what is worth building next, ranked by how much a six year old would notice |
| `src/index.html` | the entire game. The source of truth. Sections are lettered A-N |

## What is built

| | |
|---|---|
| **The campaign** | 6 qualifiers → playoff (only if needed) → 3 group matches → 4 knockout rounds. Qualifying and the group run on points, so a defeat costs something without costing everything |
| **The match** | canvas + rAF, fixed-step physics, zonal defenders, a keeper who guards the middle |
| **The floating stick** | touch anywhere and pull. How far you push is how fast he runs *and* how far the ball sits from his feet - close control versus running into space, the one real bit of soccer in here |
| **Nico and the pass** | a Spain teammate from the fifth qualifier on. A pass always connects, so the question is only when. The move to learn is the one-two |
| **The keeper moment** | once or twice a match the other team breaks away and he keeps goal |
| **The warm-up** | five questions before each new round, his pick of numbers or words. A toll paid by turning up, not by being right - answered entirely wrong it still kicks off. Five out of five earns a gold ball |
| **Penalty and Passing Practice** | free modes, no clock, nothing that touches the campaign |
| **The grown-ups panel** | hold the boots badge two seconds, answer 7 x 8. Shows which sums and which words he is missing |
| **Offline** | service worker, cache-first. Works on a plane |

Ten Playwright suites, run on Chromium and WebKit. `npm test` is about ten
minutes. **WebKit is the one that matters** - the game is played on an iPad and
WebKit in CI is the closest thing to iPad Safari. It cannot be installed in the
dev sandbox (the download host is blocked by network policy), so CI is the only
WebKit proof.

## Current state

- `main` is green and deployed. The standings fix is live: the table now
  mirrors the match he actually played.
- Nothing of this project's is open or in flight.
- The save schema is at **v2**. A v1 save migrates on load: everything *earned*
  survives (cups, career goals, boots, penalties, one-twos, and everything the
  warm-up learned), and the campaign restarts. See idea 12 in `CLAUDE.md`
  before changing the campaign shape again.

## What is open

Nothing is blocked. These are decisions waiting on watching Jaxson play, not on
engineering:

1. **The sliding stick origin.** Brian watched him and reported that he touches
   the player itself and drags rather than parking a thumb in a corner: *"it
   works because as soon as the player moves, the joystick is still pretty far
   left."* It does work. A sliding origin would suit that instinct better - four
   lines in `stickMove` - but it moves the centre, so returning the thumb to
   where it started would no longer mean stop. Deliberately not built. Full
   trade-off in `docs/NEXT.md`.
2. **Group position should seed the knockouts.** Real football, gives the group
   table teeth, cannot end anything. Left out of the campaign build only to keep
   that change reviewable.
3. **The questions in `docs/NEXT.md` under "Ask Jaxson first."** Nothing in the
   backlog matters more than the answers to those.

## Things that must stay true

Short version, all expanded in `CLAUDE.md`:

- **One file, zero dependencies.** `tools/build.js` refuses to ship a file that
  reaches the network.
- **The URL never changes.** It would cost him the save.
- **Nothing can be lost.** No expiring lives, no leaderboard he can fall down,
  no arrangement of results that ends the campaign. Losing every single match
  still reaches the knockouts, and `test:campaign` proves it.
- **A wrong answer in the warm-up never locks him out of his own game.**
- **The table must agree with the match he just played.** It did not once, and
  he noticed within two matches.
- **He is six.** When in doubt: easier, bigger, and make it celebrate.

# Cutie Bear

An iPad web app designed by Addison, age 8, built with her dad.

**Live:** https://melodious-sunshine-3f8692.netlify.app/

Six rooms in a Cloud Castle. Dress Up, Take Care, Star Song, Treat Chase, Photo
Booth, and Star Steps. Stars earned in the games buy outfits and unlock rooms.
Six friends hide inside the games waiting to be found.

The whole thing is **one HTML file** with no dependencies. Every drawing is SVG
generated in JavaScript, every sound is a Web Audio oscillator, and after the
first page load it never touches the network.

---

## Quick start

```bash
npm install        # Playwright, for tests only. Nothing ships.
npm run serve      # open http://localhost:8080, or the printed LAN address on an iPad
npm test           # all three suites, about 4 minutes
npm run build      # validate and produce dist/
```

To put it on an iPad: open the live URL in **Safari**, tap Share, then Add to
Home Screen. It gets its own icon and launches full screen.

---

## Layout

```
src/index.html      the entire app. this is the source of truth
dist/               build output: index.html plus a zip for netlify.com/drop
tests/              Playwright suites, and the screenshots they produce
tools/build.js      validate + copy. refuses to ship a file with a dependency
tools/serve.js      dependency-free static server for testing on a real device
tools/character-options.html   the sheet Addison picked the character from
docs/               design doc, character spec, session wrap-ups
CLAUDE.md           read this first
```

---

## Tests

Three suites, and they test different things on purpose.

| Command | What it proves |
|---|---|
| `npm run test:screens` | every screen renders at iPad size, portrait and landscape; saves survive a reload; the SVG-to-canvas path works; zero console errors |
| `npm run test:games` | bots that actually **play** Star Steps, Treat Chase and Star Song, proving they are winnable rather than merely running |
| `npm run test:care` | bots that feed her, scrub every dirty spot, pull the blanket up, turn all four story pages, and play all four Play games |

Screenshots land in `tests/shots/`. Look at them. A passing test and a broken
layout are both real outcomes and only your eyes catch the second.

---

## Deploying

```bash
npm test && npm run build
```

Then drag `dist/index.html` into the Netlify site's Deploys tab, or drop
`dist/cutie-bear-site.zip` onto netlify.com/drop.

---

## Working on it

Read `CLAUDE.md`. It covers the one hard rule (single file, no dependencies),
the four abstractions that hold the app together, the design rules that are not
negotiable, and the gotchas that have already bitten once.

The short version: **Addison decides.** When there is a design question, ask her
with concrete options and build what she picks, even when it is not what you
would have chosen. She has been right every time so far.

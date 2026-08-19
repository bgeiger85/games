# games

Three browser games, built for my kids. **This repository is public.**

| | |
|---|---|
| `world-cup/` | Yamal's World Cup — soccer, for Jaxson |
| `cutie-bear/` | Cutie Bear |
| `chess-quest/` | Wildcat Chess |

Each is a self-contained npm package: one HTML file, no runtime dependencies,
its own tests, its own Netlify site. Start with the `CLAUDE.md` inside whichever
one you are working on.

---

## Nothing that is not a kids' game goes in here

This repo is public, and public is permanent — deleting a file does not remove
it from history. Work tooling, customer data, exports from work systems,
equipment inventories, anything with a colleague's or a customer's name on it:
none of it belongs here, not even briefly, not even in a branch.

Work tooling lives in a separate private repository. Anything of that kind
that lands here by mistake must be removed by making this repo private, not
by deleting the file — see above.

Public also buys something real, which is why the games stay: unlimited GitHub
Actions minutes. These three run a Playwright matrix across Chromium and WebKit
on every push, which would exhaust a private repo's monthly allowance in about
a week.

## The URLs must never change

Every game keeps its save in `localStorage`, which is scoped per origin.
Renaming a Netlify site costs a child every trophy, every star and every level
they have earned. The site names are in `.github/workflows/deploy-netlify.yml`;
treat them as fixed.

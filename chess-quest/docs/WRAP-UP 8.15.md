# Chess Quest, wrap-up 8.15.26

## Status

Shipped and live at https://timely-kringle-f0a2df.netlify.app. Packaged as a git repo with a reproducible build and 4 test suites. Nothing is blocked.

## What it is

A single HTML file, 73 KB, no CDN, no framework, no network calls after first load. Runs offline. Installs to an iPhone or iPad home screen through Safari, Share, Add to Home Screen.

Three systems inside it:

1. **Ladder.** 10 named bots, Pip the Pawn (random mover) to Queen Regina (depth 6). Win, climb a level. Lose, stay put.
2. **Coach.** Interrupts before a hanging piece gets taken and offers a do over, 3 per game. After a loss, replays the 3 worst moves with red and green arrows plus one habit to practice. Optional danger goggles ring pieces that can be taken free.
3. **Puzzles.** 34 machine verified tactics puzzles plus every clear cut blunder from her own games, on a Leitner spaced repetition schedule.

## Outputs

| Artifact | Where |
|---|---|
| `dist/index.html` | Deployed to Netlify. Also in the zip |
| `chess-quest.zip` | Full repo, git history included. Delivered in chat |
| `README.md` | Drive project home |
| `BUILD-NOTES.md` | Drive project home. 14 sections, the reference doc |
| `_PROJECT HOME.md` | Drive project home. Index plus known gaps |

Drive project home: `Claude Files/Chess Quest/`

## Method worth reusing

**Verify the mechanism, not just the outcome.** Chess is easy to be confidently wrong about, so nothing here was spot checked.

- Move generation is proven by perft, counting leaf nodes from 7 standard positions to depth 5 and comparing against published totals. 4,865,609 nodes from the opening position. One wrong castling or en passant case and the count diverges. 30 of 30 exact.
- The puzzle set is generated and double verified, never hand written. Every puzzle survives a depth 5 check that its answer beats the runner up by 250 plus, then an independent depth 6 recheck. This was a direct response to evidence: 5 of my first 6 test failures were hand written chess positions of mine that were simply wrong.
- Ladder strength is measured by self play, not assumed. L3 beat L1 6 to 0, L6 beat L3 6 to 0, L8 beat L5 4 to 0.
- The browser suite runs against the minified file that actually ships, not a build nobody deploys.

**The coaching pattern generalizes.** Correct model, scored comparison, named pattern, one habit, spaced repetition. The engine is the model. `best minus actual` is the comparison. A classifier turns the number into a named mistake. A tip turns the pattern into one action. The Leitner box turns the action into a habit. Swap the engine for a pricing model or a compliance ruleset and the other 4 layers hold their shape.

Two things transfer beyond chess. The number is never the deliverable, the named pattern and single next action are. And `clarity` matters as much as `loss`: before telling someone they got something wrong, check the right answer was actually findable. A system that flags problems with no clear fix trains people to ignore it.

## What went wrong, and what it cost

10 test failures across the build. 7 were my tests being wrong, not the code. 3 were real defects.

The expensive one shipped. White's pawns rendered black on the iPad while 76 of 76 automated checks passed. Cause was U+265F, the only chess codepoint Unicode gave emoji presentation, which iOS draws as a color image that ignores CSS color. Linux Chromium resolves that character to a text font, so the bug is not reproducible on the machine running the tests. Fixed by removing the font dependency entirely and drawing pieces as SVG.

The lesson is not "test on more platforms". It is that a passing test proves the code works in the test environment, and when the whole point of a deliverable is that it runs on someone else's device, prefer designs that remove the environment as a variable. I had already made that call once on this build with no CDN and no framework, then reintroduced an environmental dependency through the font stack without noticing.

A second one slipped past for a different reason. The queen rendered as a crown on a detached tray. No automated check can tell you a shape looks wrong, that needs eyes, and I had reviewed the piece set at a size I picked for convenience rather than the size a piece appears on a real board.

## Next step

Nothing required. Optional, in value order:

1. **Watch whether the coaching lands.** Every flagged move is recorded with a mistake tag. After about 20 games, check whether her "left it hanging" count per game is falling. Flat while she still climbs levels means the ladder is doing the work and the coaching is not transferring, which makes puzzles the place to invest.
2. **Opening book.** All 10 bots open identically from a deterministic search. A dozen lines, 6 moves deep, is the biggest realism gap.
3. **Progress view.** The per move data is already recorded, only the reporting is missing.
4. **Endgame drills.** She will win material long before she can convert it.

## Open items for Brian

1. Drop `chess-quest.zip` into `Claude Files/Chess Quest/` to complete the record. A 1.6 MB binary upload was past the session's tool limits.
2. Delete "Chess Quest, Build Notes (v1, superseded)" from Drive root. Two trash attempts returned a permission error.
3. If you want this as a GitHub repo, `gh` is not installed in the sandbox. Git history is in the zip. From your machine: `git remote add origin <url> && git push -u origin main`.

## Process note

I did not read `/preferences.md` until you said wrap up. Two consequences ran the whole session. Every response used em dashes, against the Clarity is King rule. And the Drive files landed in root instead of `Claude Files/Chess Quest/`, against the project home rule. Both are corrected now. The correct behavior is to read preferences before the first substantive action, not at the end.

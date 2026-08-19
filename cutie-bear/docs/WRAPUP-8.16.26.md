# Cutie Bear: Wrap-up 8.16.26

## Status

Cutie Bear v1 is built, tested, and delivered as files. It is not yet live on Netlify because this session has no Netlify credentials. Next step is deploying it and opening it on the iPad.

## Outputs

| Output | Where |
|---|---|
| `index.html` (the game, 80KB) | Delivered in chat, saved to `Claude Files/Cutie Bear/` |
| `cutie-bear-site.zip` | Delivered in chat, saved to Drive |
| `CUTIE_BEAR_DESIGN.md` | Drive, and the Claude project |
| `test.js`, `playtest.js` | Drive |
| `_PROJECT HOME.md` | Drive |

## What Addison decided

Three rounds of multiple-choice questions, twelve questions total. She was given real authority and used it. Her answers, verbatim in effect:

- Not one game but an app with all of them: dress up, care, jumping, puzzles, collecting
- Cloud Castle, with rainbows and stars, extra cute
- Combine the control schemes rather than pick one
- Puzzles over timers or chasing
- Soft pink bear
- Care means feeding, bathing, bedtime, playing, **and taking pictures of her** (she added the fifth herself)
- Copy-the-pattern puzzle
- Stars buy outfits AND unlock rooms
- Friends are not a single sidekick, you meet them along the way, some hide and some just visit
- The rainbow cupcake is a speed boost, not just a treat
- "Hi! I missed you!"
- Photos need sparkly frames, backgrounds, and stickers you place yourself
- Hop on floating clouds and rainbow slides
- Confetti AND fireworks
- Music and sound effects, both, with separate on/off buttons

Two of those (the boost cupcake, and friends found rather than chosen) are better ideas than the options offered. Worth noting: the multiple-choice format is a floor, not a ceiling, and the free-text escape hatch is where the good answers came from.

## Method (the repeatable part)

1. **Interview before building.** Three rounds of four questions, each option written as a concrete outcome she could picture ("Bees fly around and you have to stay away from them"), not an abstraction. Multi-select where choices were not exclusive.
2. **Let the answers change the architecture.** "All of them plus more" turned a single game into a hub-and-rooms app. That is a bigger change than it sounds and it was the right call, because shallow-but-complete beats deep-but-missing for a kid.
3. **Fixed stage, CSS-scaled.** 960x720 board, one transform to fit any screen. Removes an entire class of layout work.
4. **SVG character, not image files.** Sharp on Retina, outfits are layered shapes, rasterizable to canvas when a game needs a bitmap.
5. **Generate audio, do not ship it.** Oscillators. Nothing to download, nothing to license.
6. **Bots, not just screenshots.** Screenshots prove it renders. Bots that play prove it is winnable. The Star Steps bot is what caught that the difficulty was wrong.
7. **Tune toward the player.** Softened Star Steps after the bot died in 2 seconds. Floored the care meters so the pet can never be neglected into misery.

## Pressure test

**Load-bearing assumption:** that six shallow activities hold an 8 year old's attention better than two deep ones.

**The one thing that breaks it:** if she plays each room once, sees the whole thing in fifteen minutes, and the star economy is not compelling enough to bring her back. Breadth buys the first session. Only progression buys the second.

**Evidence that settles it:** watch which room she opens *second* on day two. If she goes straight back to one room and ignores the others, the answer is to deepen that one, not add a seventh. If she cycles, the hub model is working and the right move is more outfits and more friends.

**Risk, not taste.** The mitigation is already partly in: locked rooms, a 6-friend collection, and 18 purchasable outfits give a progression spine. Whether it is enough is an empirical question that one weekend answers.

Second, smaller: this is unverified on real Safari. Two things could behave differently there than in Chromium (Web Audio unlock timing, and SVG-to-canvas in the Photo Booth). Both are written defensively with fallbacks, so the failure mode is a missing feature, not a broken app. Confirm on the actual iPad before declaring it done.

## Next step

Deploy to Netlify, then open it on the iPad and watch her play without helping. Note what she reaches for first and what she ignores.

## v2 backlog (from things she said, not yet built)

- More friends and more outfits, since the collection is the progression spine
- Give each found friend a small presence in the castle rather than only in photos
- A jigsaw puzzle mode (she picked copy-the-pattern, but jigsaw was a close second)
- Let her name Cutie Bear, or name the friends herself
- Share a photo out of the album to the iPad camera roll

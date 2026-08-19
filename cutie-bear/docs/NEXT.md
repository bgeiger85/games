# What to do next

Written 2026-08-16, at the handoff into Claude Code. Read this after `CLAUDE.md`.

## Waiting on Addison: pick a logo

Four logo options are drawn and ready in `tools/logo-options.html`. Render the
sheet with `npm run logo-options` and it writes `tools/logo-options.png`, which
is committed so it can just be opened and shown to her.

1. **Bubble Letters** - fat two-line wordmark, coral over purple, gold star on the i
2. **Rainbow Arch** - rainbow-coloured letters sitting on a rainbow
3. **Bear Badge** - her face above CUTIE BEAR in a rounded badge
4. **Cloud Sign** - the words resting inside a cloud

Ask her which number she likes, then drop that SVG into the app. All four are
pure SVG with the system font, so whichever she picks needs no new files and no
downloaded font, and it works as-is on the start screen.

The app icon is a separate thing and is already done: a real 180x180 PNG that
iOS will accept. Do not confuse the two.


## The open question that matters most

**Does the six-room shape hold her attention past day one?**

The load-bearing assumption of the whole app is that six shallow activities beat
two deep ones for an 8 year old. That has never been tested, because she has not
sat down with it yet.

**The evidence that settles it: watch which room she opens *second*.**

- Straight back to one room, ignoring the rest → the shape is wrong. Deepen that
  one room. Do not add a seventh.
- Cycling through several → the hub model works. The right move is more outfits
  and more friends, because the collection is the progression spine.

Take Care is now much deeper than the other five, which sharpens this. If Take
Care wins by a mile, that is a real signal about what she actually wants, not a
sign the others need to be arcade-ier.

Everything below is downstream of that answer. Do not start any of it before you
have watched her play.

## Verify on the real device first

Never tested on real iOS Safari. Four things behave differently there, all
written defensively so the failure mode is a missing feature rather than a
broken app:

1. Web Audio unlocking on the first tap (music and sound effects)
2. `bearImage()` SVG-to-canvas in the Photo Booth
3. `localStorage` surviving across Safari sessions (her stars and outfits)
4. `pointermove` drag, which drives the bath sponge, the bedtime blanket, and
   tickling

Check all four in about a minute: tap something and listen, take a photo and see
if it lands in the album, close and reopen and check her star count, then drag
the sponge in the bath.

## Backlog, from things she said but that are not built

- **More friends and more outfits.** The collection is the progression spine and
  it is currently six friends and eighteen outfits.
- **Friends in the castle.** Found friends only appear in the friends strip and
  the Photo Booth. She imagined them living there.
- **Jigsaw puzzle mode.** She picked copy-the-pattern, but jigsaw was a close
  second and she wanted both.
- **Let her name things.** Naming Cutie Bear, or naming each friend as she finds
  them.
- **Save a photo to the camera roll.** Currently photos live only in the in-app
  album.

## Known small issues

- **Crown tuft under a bow** reads slightly like two small horns. She has not
  flagged it. One-line fix: skip the tuft when `w.head` is set.
- **Deploys are manual.** No Netlify token stored, so every change is a trip to
  the browser. With a lot of small changes coming, wiring
  `NETLIFY_AUTH_TOKEN` + `npx netlify-cli deploy --prod --dir=dist` would pay
  for itself quickly. Ask Brian before storing a credential.

## How to run a design round with Addison

This has worked three times, and it is the reason the app is good:

1. **Show, do not describe.** Render the options as an actual picture and put it
   in front of her. `npm run options` does this for character variants. When she
   was asked in words she said yes to the wrong thing; when she was shown six
   bears she found the real answer immediately.
2. **Concrete options, kid language.** "Bees fly around and you have to stay away
   from them," not "an obstacle mechanic." Four options maximum per question.
3. **Leave the escape hatch open.** Her best ideas (the rainbow boost cupcake,
   friends you find rather than choose, taking pictures of her) all came from
   free-text answers, not from the menu.
4. **Build what she picks even when you disagree.** She reverted two of the three
   fixes made in response to her own critique and was right both times.

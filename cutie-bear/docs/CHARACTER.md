# Cutie Bear: Character Spec

Designed from a reference image by Addison, then art-directed by her over three
revision rounds on 2026-08-16.

## Final spec

| Feature | Decision |
|---|---|
| Fur | Coral pink `#F0837C`, outline `#D3625C`, shading `#E0685F` |
| Cream areas | `#F9D8C0` on muzzle, belly, inner ears. Outline `#E9BFA0` |
| Eyes | Warm brown. Rim `#4A2A0C`, iris `#8A5417` over `#C08B32`, pupil `#2E1B0A`, two white highlights |
| Nose | Rounded, `#CB7F86`, with a highlight |
| Mouth | Small open smile, upper teeth strip, hint of tongue |
| Head | Crown tuft: three fur curls, drawn behind the head so only the tips show |
| Ears | Tall egg shape with a cream cup inside, `scale(0.85)` |
| Arms | Plain rounded ellipses, angled 12 degrees out. No pads, no thumbs |
| Feet | One solid colour. No sole pads, no toe beans |
| Pose | Standing, normal head size |
| Always worn | Cream collar with a gold heart tag reading CUTIE BEAR |

## Her critique, in order

1. **"The feet and the ears look too identical."** Correct. Both were circles
   with a cream oval inside. Fixed by making the ear tall with a cream cup and
   the foot wide and solid.
2. **"The hands are in the wrong direction."** Also correct. The arms were bare
   ellipses with no orientation at all.
3. Six poses were drawn. She rejected the mitten paws with pads and thumbs:
   *"she wants it how it was before on the arms."* Reverted.
4. **"The feet to just be one color."** Sole pads and toe beans came back off.
   The ear change alone was enough to separate ears from feet, which was her
   instinct and it was right.
5. Rejected the hug, ballerina, and chibi poses. Kept standing and the new ears.
6. **"Make the ears like 15% smaller."** Applied as `scale(0.85)` on the ear group.

She reverted two of the three changes made in response to her own critique and
still ended up with the problem solved. The lesson: **the fix someone asks for
is often not the fix they want, and showing options is the only way to find that
out.** Describing the change in words would have got a yes and shipped the wrong
bear.

## Why redrawing her is cheap

- `ear(x, y, rot)` draws one ear. Ear shape changes in one place.
- `SLOT_TX` holds one transform per outfit slot that maps outfit coordinates
  onto the current body. Move the body, change four numbers, all 18 outfits
  follow.
- `bearImage()` rasterises whatever the SVG currently is, so the runner game and
  the Photo Booth pick up art changes with no separate work.
- `SLOT_VIEW` reframes the closet thumbnails automatically.

A full redesign plus three revision rounds cost four edits to one function and
four numbers elsewhere.

## Open item

The crown tuft sits behind the head, so with a bow on it reads a little like two
small horns poking through. Not flagged by Addison. If she mentions it, either
shorten the tuft or skip it when `w.head` is set. One line.

## Regenerating the options sheet

`npm run options` re-renders `tools/character-options.html` to a PNG. Edit the
`V` array in that file to offer her new variants. Give her four at a time so the
whole set fits one question.

# Cutie Bear: The Design Plan

Designed by Addison (age 8). Built 2026-08-16.

---

## Part 1: Addison's Plan

This is the game you designed. Every single thing on this list came from an answer you gave.

**What is it?**
Cutie Bear is not just one game. It is a whole app with six different things to do, and they all live inside a Cloud Castle in the sky with rainbows and stars.

**Who is Cutie Bear?**
A soft pink bear with rosy cheeks and a bow. When you open the app she says "Hi! I missed you!"

**The six rooms**

| Room | What you do there |
|---|---|
| Dress Up | Try on bows, crowns, dresses, shoes, sunglasses, a magic wand |
| Take Care | Feed her, give her a bath, tuck her into bed, play with her |
| Star Song | Watch the stars light up, then tap them back in the same order |
| Treat Chase | Slide your finger to catch falling treats before they fall |
| Photo Booth | Take her picture with backgrounds, sparkly frames, and stickers |
| Star Steps | Tap to hop across fluffy clouds and rainbow slides |

**Stars**
You earn stars by playing. Stars buy outfits AND unlock new rooms, just like you wanted. Photo Booth costs 25 stars. Star Steps costs 50 stars.

**The rainbow cupcake**
This is your special idea. It is the rarest treat in Treat Chase, it is worth 5 points instead of 1, and when you catch it you get a RAINBOW BOOST for six seconds where every treat is worth double and Cutie Bear glows.

**Friends**
There are six friends hiding in the game: Hoppy the bunny, Puff the baby dragon, Mittens the kitten, Sparkle the unicorn, Waddles the duckling, and Biscuit the puppy. Sometimes one hides inside a game and you have to spot it and tap it. Sometimes one just comes to visit when you finish playing. Once you find a friend they live in the castle with you and you can put them in your photos.

**Celebrating**
When you win, confetti rains down AND fireworks pop in the sky. Both, because you picked both.

**Music**
Gentle music plays, and there are fun sound effects too. There is a music button and a bell button at the top so you can turn each one off by itself.

---

## Part 2: Build Spec (the grown-up version)

### Shape of the thing

One HTML file. No frameworks, no libraries, no fonts or images downloaded from anywhere. Everything (art, sounds, game logic) is generated in the browser. This matters for three reasons:

1. It loads instantly on an iPad even on bad wifi
2. It cannot break because some CDN changed
3. Adding it to the iPad home screen makes it behave like a real app

Same pattern as Chess Quest.

### The scaling trick

The entire game is laid out on a fixed 960 x 720 board (iPad's 4:3 ratio). One CSS transform scales that board to whatever screen it lands on:

```js
var s = Math.min(window.innerWidth / 960, window.innerHeight / 720);
stage.style.transform = 'scale(' + s + ')';
```

Every element is positioned once, in board coordinates, and never has to be re-laid-out for a different screen. This is the single highest-leverage decision in the file. Responsive CSS for a game with absolute-positioned sprites is a maintenance sinkhole; a scaled fixed stage is not.

### How the bear is drawn

Cutie Bear is SVG shapes with numbers, not a picture file. Consequences:

- Perfectly sharp at any size on a Retina iPad
- Outfits are just extra shapes layered in the right z-order, so a new outfit is roughly 3 lines of code
- She can be rasterized to a canvas image on demand (`bearImage()`), which is how she appears in the Star Steps runner and in Photo Booth pictures

Layer order matters and is fixed: back accessories, legs, shoes, body, clothes, arms, ears, head, face, face accessories, head items.

### Touch controls, per activity

Addison asked whether the control schemes could be combined. They can, and should: each activity gets the control that suits it.

| Activity | Control |
|---|---|
| Dress Up, Take Care, Photo Booth | Tap buttons and items |
| Treat Chase | Drag a finger, catcher eases toward it |
| Star Steps | Tap anywhere to jump (double jump allowed) |
| Star Song | Tap the stars |
| Photo Booth stickers | Tap to add, drag to reposition, double-tap to remove |

No keyboard anywhere. Minimum touch target 48px. `touch-action: manipulation`, pinch-zoom and double-tap-zoom suppressed, tap highlight removed.

### Saving

`localStorage` under key `cutiebear.save.v1`, wrapped in try/catch so private browsing degrades to "plays fine, does not remember" rather than a crash. Saved: stars, owned and worn outfits, unlocked rooms, care meters with a timestamp, friends found, photo album, sound toggles, best scores.

Care meters decay against real elapsed time (about 7 points per hour) but **floor at 15**. Deliberate: a virtual pet that can be neglected into misery is not appropriate for an 8 year old. She can always improve things, never fail them.

### Sound

Web Audio oscillators, no audio files. Notes are generated. iOS requires a user gesture before audio starts, so the audio context unlocks on the first `pointerdown`. Music and effects are separate toggles because Addison asked for separate toggles.

### Star economy

| Source | Stars |
|---|---|
| Treat Chase | 1 per 6 treats |
| Star Steps | 1 per 30 steps |
| Star Song | 2 per round cleared |
| Care actions | 1 each, only when that meter was below 70 |

| Cost | Stars |
|---|---|
| Outfits | 10 to 34 |
| Photo Booth room | 25 |
| Star Steps room | 50 |

Tuned by bot playtest: a competent round of Treat Chase yields roughly 8 to 12 stars for a child, so the first room unlock is about three rounds away. Close enough to feel earned, far enough from a grind.

### Difficulty stance

Star Steps was deliberately softened after the first playtest: slower scroll, gentler height variance, wider platforms, smaller gaps, a wide starting platform so she never begins mid-fall, plus coyote time (a short grace window to jump after walking off an edge) and a double jump. Nothing in the game can chase, hurt, or scare her. The only failure state is falling in Star Steps, and it ends in a celebration and a score, not a loss.

### Test approach

Two Playwright scripts, both reusable:

- `test.js`: loads every screen at iPad viewport in both orientations, screenshots each, asserts zero console errors, verifies the SVG-to-canvas path, verifies a photo actually serializes into the album, and verifies save state survives a reload
- `playtest.js`: three bots that actually play. The Star Steps bot jumps when it detects no ground ahead, the Treat Chase bot chases the lowest treat, the Star Song bot replays the sequence. This is what proves the games are winnable rather than merely running

Result: 475 steps survived over 25 seconds, 164 treats caught, Star Song round 5, no errors.

### Deploying

Netlify. Drop `cutie-bear-site.zip` at netlify.com/drop, or drop `index.html` into an existing site's Deploys tab. Then on the iPad: open the URL in Safari, Share, Add to Home Screen. The `apple-mobile-web-app-capable` meta tag and the inline SVG touch icon make it launch full screen with its own icon, no Safari chrome.

### Where to extend

Adding an outfit: one entry in `ITEMS[slot]` with a name, cost, and SVG string. Nothing else.
Adding a friend: one entry in `FRIENDS`. The photo booth, hiding logic, and castle strip all read from that array.
Adding a room: one entry in `ROOMS`, one `.screen` div, one `ROOM_ENTER` handler.

The file is sectioned A through S with comments, in the order the code runs.

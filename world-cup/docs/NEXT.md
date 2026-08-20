# What is worth doing next

In rough order of how much a six year old would notice.

---

## Ask Jaxson first

Nothing below matters more than what he says after playing it. Watch him play
one match before building anything. In particular:

- Does he find the SHOOT button, or does he try to tap the goal?
- Does he understand the dotted aim line, or does he shoot at nothing?
- Does he notice he can chase a defender to win the ball back?
- Is 45 seconds too long, or over too fast?

And now, for the warm-up:

- Does he pick numbers or words, and does he always pick the same one? If he
  only ever picks one of them, that is worth knowing.
- Is five questions the right number, or does he sigh at question four?
- Does he use the speaker button, or ignore it?
- Does the gold ball actually register when the match starts?

And for the campaign:

- Thirteen matches is roughly forty minutes of play. Does he come back to it
  across several sittings, or lose the thread halfway through qualifying?
- Does the table mean anything to him, or is it grown-up furniture? If he
  ignores it, the phase strip and the next-match button are doing all the work.
- Does losing a qualifier and still going through land as fair, or as confusing?
- Does the table now match the matches he played? It did not at first: he beat
  Norway 2-1 and the table gave Norway the win as well, because rival records
  were invented rather than read off his results. Fixed, and `test:campaign`
  audits every table for it, but it is worth a glance.

And for Nico and the pass:

- Does he use PASS at all, or does he forget it is there? If he forgets, the
  first fix is a nudge toast the first time he gets cornered with Nico free.
- Does he understand that tapping PASS again gets it back? That is the whole
  one-two and it is the least obvious part.
- Does Passing Practice hold him for more than a minute?
- Is Nico in the right place? He aims for 210px ahead and 190px to the side.

And for the keeper moment:

- Does he understand what is being asked the first time it appears, or does he
  freeze? Freezing is handled - it counts as a wrong guess, not a free goal -
  but if he freezes every time, the four second window is too short.
- Does conceding upset him? If it does, turn `forgive` up before anything else.
- Once or twice a match: too often, too rare?

The grown-ups panel (hold the boots badge for two seconds, answer 7 x 8) shows
which sums and which words he is missing. If it says he is under 70%, drop a
level; over 90%, put him up one. The panel says so too.

The tuning table in `docs/DESIGN.md` is calibrated against a bot, not a child.
Expect to have to make it easier.

---

## Nearly certain wins

- **His own name on the shirt.** A choice at first launch between playing as
  Yamal and playing as himself, with the number he picks. Costs one entry in
  `TEAMS` and a text field.
- **A sliding stick origin.** Brian watched Jaxson play and reported that he
  touches the player itself and drags, rather than parking a thumb in a corner:
  "he tends to fall back to using the player, but it works because as soon as
  the player moves, the joystick is still pretty far left." It does work, which
  is why this is a maybe and not a fix. The change would be four lines in
  `stickMove`: once the thumb passes `STICK_MAX`, drag the origin along behind
  it so it stays exactly `STICK_MAX` away, which is what every mobile game with
  a floating stick does. It costs one thing, and the cost is why it was not
  just done: the centre moves, so putting the thumb back where it started no
  longer means stop. Lifting the finger already stops him dead, so a six year
  old probably never notices - but `test:stick` section 3 would have to be
  rewritten around the moved origin rather than the original touch point, and
  that test is the honest signal here. Watch him once more before deciding.
- **A pass nudge.** If he is cornered with Nico free and has not passed in a
  while, flash the PASS button once. A control he forgets about is a control he
  does not have.
- **Nico calls for it.** A small "!" over his head when he is genuinely open
  would teach the timing without any words.
- **Their attack shown on the pitch.** The break away is currently an overlay
  over a frozen pitch. Drawing the opponent actually running at our goal for a
  second before the buttons appear would make it feel like a match rather than
  a quiz. Worth doing only if he likes the mechanic.
- **A crowd that reacts.** The crowd dots are decoration. Making them jump on a
  goal is a few lines and it is the sort of thing a six year old points at.
- **Celebration picker.** Spend golden boots on a goal celebration. Boots are
  already earned and counted, and they currently buy nothing at all, which he
  will notice. More so now: the warm-up pays a boot per correct answer, so the
  counter climbs faster and buys even less.
- **More sentences.** The words bank is about 45 sentences. That is a few weeks
  before he starts seeing repeats. Adding one is a single line in `WORDS`, and
  new ones should keep the rule that the two wrong choices are look-alikes.
- **Subtraction, when he is ready.** `mathPool` takes a level and returns
  items; a level 4 that returns `{kind: 'sub'}` needs one branch there and one
  in `renderQuestion`. Do not add it until he asks or until the panel shows him
  at 90% on missing numbers.

## Worth trying

- **Difficulty that adapts.** If he loses the same round three times, quietly
  drop the defender speed for that round. Never tell him.
- **A second campaign.** ROUNDS is a table; a "Champions Cup" with different
  opponents is one array. Now that qualifying exists there is a natural shape
  for it.
- **Group position should seed the knockouts.** Finishing top of the group
  ought to earn an easier Round of 16 than scraping through second. It is real
  football, it gives the group table teeth, and it cannot end anything. Left
  out of the campaign build only to keep that change reviewable.
- **Free play.** A pitch with no clock and no score, just him and a goal. Good
  for the first five minutes with a new game.
- **Save the best goal.** Record the last few seconds of positions and replay
  it. `bearImage()` in Cutie Bear shows the canvas-to-picture path if a
  shareable still is wanted.

## Housekeeping

- **Play it on a real iPad.** Everything is verified in Chromium and WebKit at
  iPad viewport, and WebKit in CI is close to iPad Safari but is not it. Four
  things behave differently on the real device and all are written defensively
  so the failure mode is a missing feature rather than a broken game:
  Web Audio unlocking, `localStorage` across Safari sessions, the service
  worker, and `pointermove` drag.
- **The trophy handles** in `trophySVG()` render more like horns than handles.
  Cosmetic, but it is the reward screen.

## Deliberately not doing

- **Offside, fouls, throw-ins, corners.** He is six.
- **Auto-aim on the shot.** It would remove the only skill in the game.
- **A stronger keeper.** He is already the hardest thing in the game. If
  anything he should get weaker.
- **Anything that can be lost.** No expiring lives, no leaderboard he can fall
  down, nothing taken away for losing.

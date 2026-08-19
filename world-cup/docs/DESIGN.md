# Design notes

Why the game is shaped the way it is. Written while building it, so the
reasoning survives the next session.

---

## The brief

A soccer game Jaxson (6) can control, starring Spain and #19 Lamine Yamal, in a
World Cup tournament. Built on the same footing as Cutie Bear: one self
contained HTML file, Playwright suites, CI, Netlify.

The player is a stylised cartoon footballer in a Spain #19 shirt. It is a
personal game for one six year old, not a likeness and not a product.

---

## Two thumbs, and the hand off the play

The first version said "a six year old cannot run a virtual stick", and steered
by sending Yamal to the finger. That assumption was never tested and it was
wrong in a way that mattered: Brian played it and said his hand was in the way
and he could not see what he was shooting at.

It was structural. Sending Yamal TO the finger puts the finger on the exact
spot he is running at, and attacking rightward that spot is the goalmouth. The
hand covers the target by construction. Nothing could be tuned to fix it.

So steering is a floating stick. Touch anywhere, that point becomes the centre,
drag away from it to run. The hand parks in a corner and the play stays
visible.

- **Touch and drag to steer**, from wherever the thumb lands.
- **One enormous SHOOT button**, 158px, bottom right.

Everything else that a soccer game normally has - passing, tackling on a
button, sprinting, through balls - is gone. Winning the ball back happens by
running into the man who has it, which needs no button at all.

## The skill in running

How far the stick is pushed sets his speed and how far the ball sits from his
feet, and a defender reaches for the ball rather than for Yamal. Sprint and you
cover ground with the ball loose in front of you. Ease off and it is tucked in
where nobody can reach it.

That is close control versus running into space, which is a genuine thing about
soccer and one a six year old can feel through his thumb rather than be taught.
It also answers a real complaint: the rounds used to get harder without ever
asking anything new, so the game had nothing left to teach after about three
minutes.

Two numbers had to move with it. Top speed went from 4.3 to 5.2, because at 4.3
the stick was pure downside: flat out was no quicker than the old game and the
ball was now loose, so the risk bought nothing. And the ball reach curve is
squared rather than linear, because linear put the ball two thirds of the way
out at a half push and left no comfortable cruising speed at all.

## Where the shot goes

`shoot()` fires along the direction Yamal is facing, which is the direction of
the last steer. The alternatives were both worse:

- *Aim at the goal automatically* removes the only skill in the game.
- *A separate aim control* is a third thing to learn.

Facing works because it is drawn. A dotted line runs out from his feet every
frame, and a ring on the goal line marks where the ball would cross, going gold
when it is on target. Nothing about the shot is hidden, so nothing about it is
unfair. **The aim line is the contract.**

## The keeper, and the one real skill

The keeper holds the middle of the goal and can only reach a corner by diving.
So the skill of the game, stated in one sentence a six year old can hear:
**pull him one way, shoot the other way.**

Getting that to actually be true took four tries. The failures are recorded in
`CLAUDE.md`, because each one looked completely reasonable:

1. The keeper tracked the ball across the whole mouth, so he was standing on
   the shot before it was struck.
2. His save reach covered nearly half the goal from a standing start.
3. His dive target was clamped inside the posts, so a corner-bound prediction
   got pushed back onto the corner and aiming there was worse than aiming down
   the middle.
4. His dive speed scaled with the round, which over a long flight meant the
   speed cap decided the outcome and his guess did not matter at all.

Nineteen shots, no goals, across all five rounds. All four had to go.

## Defenders: zonal, and beaten stays beaten

Every defender chasing Yamal directly is the obvious model and it is wrong.
Three or more of them converge from different angles and corner him no matter
how well he dodges, and a defender he has already skinned turns round and
catches him again while he is lining up a shot.

Instead each one guards a patch of grass, comes out only when Yamal is within
`range`, and jogs home once Yamal is past him. He meets them one at a time.
That is a thing a six year old can see and plan around.

## Losing the ball is a moment, not a punishment

Get tackled and the defender runs it toward Spain's goal. Chase him and run
into him to win it back. He carries it slower than Yamal chases, and every
other defender clears out, so it is a one on one you can always win.

If he does reach the goal, our keeper saves it outright in the group stage and
increasingly often does not by the final. It is legible: you can watch the whole
thing happen. It is also rare, by construction - see "Letting the other team
score" below for why that turned out to be a problem and what was added.

## No fail states

Straight from Cutie Bear, and it applies harder at six than at eight.

- Losing a match does not move the ladder backwards.
- Goals scored in a lost match still count on the career total.
- The losing popup says "Good try!" and offers a replay.
- Nothing chases him off the pitch, nothing is confiscated, nothing expires.

The tournament can be replayed from the start whenever he wants, and doing so
keeps every trophy and every career goal.

## The warm-up

Brian wanted Jaxson to earn the next match with a bit of maths or reading. The
risk in that idea is obvious: a gate in front of the fun is the one thing that
could turn this game into a chore, and a gate you can fail is a fail state
bolted onto a game whose whole design is that it has none.

So the gate is not one he can fail.

**It is framed as a warm-up, not a test.** Real players warm up before kick
off, so the drill is part of the match rather than a tax on it. The screen is
the same stadium, same crowd, same big soft buttons.

**Doing it is what earns the match.** Five questions, then he plays, whatever
he answered. There is no score at the end and no pass mark. The failure mode
worth designing against was never "he guesses his way through", it was "he gets
four wrong, feels stupid, and does not want to open the game tomorrow".

**Every question ends on the right answer.** A wrong tap does not advance and
does not buzz. That button fades out, the correct one pulses, and he taps the
correct one himself. This is kinder and it is also the version that teaches:
the last thing he does on every single question is the correct thing.

**A loss does not re-charge it.** The unlock lasts until he wins the round.
Asking a six year old to do maths again because he just lost a match would
punish losing, which is precisely what the rest of the page says never to do.

**He picks the drill every time.** Numbers or words, his choice, which is the
only real agency available in a one minute exercise and costs nothing to give.

The reward for five out of five is a gold ball, and it is **cosmetic**. A real
gameplay bonus would have made the tournament easier exactly when he was doing
well, and it would have given the warm-up stakes. A visible gold detail is more
motivating to a six year old than a hidden ten percent anyway.

### Difficulty

The bank tracks right and wrong per fact and serves mostly things he has, with
one or two he is shaky on, aiming at about four out of five correct. That ratio
is the difference between a warm-up that builds him up and one that grinds him
down. A run of five things he cannot do would do the second, so no more than
two shaky items land in any one warm-up, whatever the weights say.

Distractors are near misses on purpose. For sums they are off by one or two, so
a right answer means he added rather than picked the only plausible size of
number. For words they are look-alikes: was/saw, want/went, run/ran, to/two.
Those are the pairs first graders actually confuse, and discriminating between
them in print is the entire skill.

## Letting the other team score

The first version could not really concede. There *was* a path - a defender who
tackles Yamal carries the ball toward our goal, and a per round `counter` rolls
the dice if he arrives - but three separate decisions stacked up to make it
almost unreachable:

- the Group Match had `counter: 0.00`, deliberately, so his first ever match
  could not be lost
- the carrier moves at 90% of defender speed while Yamal chases at 4.3px a
  frame, because "getting the ball back is always possible" is a rule here
- the walk back is up to 1800px

So conceding required ignoring the ball for ten seconds and then losing a dice
roll that did not exist on round one. In practice the opposition never scored.
Brian played one match and asked about it, which is exactly the sort of thing
a bot cannot tell you: every test passed, and the game was still wrong. A
scoreboard that only moves one way is not a match, and 3-0 every time makes
winning mean nothing.

The fix is to make Jaxson the keeper for a moment. Once or twice a match the
other team breaks away, the match freezes, and the same three buttons from the
penalty shootout appear. He picks a side.

Three things made this the right shape rather than simulating it in the
background:

**He already knows the move.** Dive left / stay / dive right is the shootout
interaction, so the most tense new moment in the game needs no teaching.

**The save is his.** A simulated attack that resolves on its own reads as luck.
A guess that pays off reads as goalkeeping. A right guess *always* saves, so
his choice really is what decides it.

**It cannot be a fail state.** Conceding costs one goal, the match stays
winnable, a draw goes to the shootout where the odds are in his favour, and
losing costs nothing at all.

Two dials per round: `gap`, the seconds of play between break aways, and
`forgive`, the chance of a fingertip save when he dives the wrong way.
Effective save rate is `1/3 + 2/3 * forgive`, running from 70% in the group
match down to 57% in the final.

`gap` is a rate rather than a count on purpose. As a count it made the final
much harder under test than in the real game, because `tournament.test`
compresses matches to 25 seconds and a fixed two break aways then landed inside
38% of the playing time.

Not choosing at all counts as a wrong guess, never as a free goal. Freezing is
exactly what a six year old does the first time an unfamiliar screen appears,
and being slow to react must not be punished harder than guessing.

## Nico, and giving the game somewhere to go

Brian's read after a few days: the game would lose interest, and the later
rounds had no real skill in them. Both true, and the second explains the first.
More defenders, faster defenders, a better keeper and a longer clock are
difficulty, not progression. The player does exactly the same thing in the
final as in the group match. A six year old masters that one thing quickly and
then the game has nothing left to teach.

So the ladder became a curriculum: shoot, beat a man, pass around a man you
cannot beat, combine, then all of it under pressure. Nico Williams arrives at
the quarter-final, which also gives a six year old something to look forward to
rather than just something harder.

**The pass always connects.** This was the important call. An interceptable
pass makes passing a gamble, and a gamble that loses possession is a
punishment - which is exactly what the rest of this game refuses to do. Making
it certain moves the skill to where it belongs: a good pass finds Nico in space
and puts you past two defenders, a lazy one finds him marked and he is closed
down immediately. Better position or worse position, never a turnover.

**The one-two is the actual skill.** Pass, run past the man, get it back on the
other side. It is the fundamental idea in soccer, it is genuinely satisfying
when it comes off, and it solves the one position in the game that was properly
frustrating - cornered, with nothing to do but run into someone. It announces
itself by name, because that is how a six year old learns what the move is
called.

**Nico does not shoot.** He carries it a little and gives it back. The game is
called Yamal's World Cup and Jaxson should score the goals.

One number worth recording: the one-two is counted on its own and deliberately
pays no golden boots. A playtest with the bot combining freely turned 26 boots
a tournament into 68, which devalues every boot earned by scoring. A new skill
gets a new counter rather than inflating an old one.

## A season instead of an evening

Five matches was too short, and Brian said so as soon as the passing work made
the matches worth playing: "the season is now too short... we need a longer
version." He also asked the right technical question first - whether memory
would be the limit on a full World Cup with qualifiers.

It is not, and it is worth writing the numbers down so nobody has to wonder
again. A full campaign save is about 3.6 KB against Safari's roughly 5 MB per
origin, which is under a tenth of one percent. A flag costs a median 172 bytes,
so going from six teams to forty eight would add about 7 KB to a 150 KB file.
Nothing here is close to a limit.

The real limit is a six year old's attention. Thirteen matches at a minute
each, plus a warm-up before each new one, is around forty minutes of play. That
is several sittings, not one, so the design has to assume he stops halfway -
which the save already handles - and it has to make the middle of the campaign
feel like progress rather than a treadmill.

That is why qualifying and the group are **tables** rather than a straight
ladder. A table shows him where he stands after every match, and points mean a
defeat costs something without costing everything. He can lose to Greece and
still go to the World Cup, which is both true to the sport and the kindest
possible way to run a long season for a child.

The playoff is what lets qualifying have real stakes without a real ending.
Finish top two and you are through. Finish below and there is one more match,
and if you lose that one, you play it again. There is no arrangement of results
that stops him reaching the World Cup - only arrangements that make him take
the long way round. `test:campaign` loses every single match to prove it.

## The ladder

Five rounds, hand tuned rather than random, so a round plays the same way every
time and can be tuned once and stay tuned.

| Round | Opponent | Seconds | Defenders | Speed | Range | Keeper | Counter |
|---|---|---|---|---|---|---|---|
| Group Match | Japan | 45 | 2 | 2.0 | 240 | 0.26 | 0.00 |
| Round of 16 | Nigeria | 50 | 2 | 2.4 | 270 | 0.40 | 0.18 |
| Quarter-Final | Germany | 55 | 3 | 2.7 | 300 | 0.50 | 0.32 |
| Semi-Final | Brazil | 60 | 3 | 2.9 | 320 | 0.58 | 0.42 |
| The Final | Argentina | 65 | 4 | 3.1 | 340 | 0.64 | 0.50 |

Defender speed is always below Yamal's 4.3. He can outrun anybody; the
difficulty is in the angles, never in the pace. The group match cannot be lost
by conceding, because `counter` is zero.

A match is 45 to 65 real seconds and the clock always reads 0' to 90'. Short
enough to hold a six year old's attention, long enough to come back from a
goal down.

## The shootout

Six big targets in the goal for your kick, three big buttons for your dive.
Best of five then sudden death.

The odds are set so the player is favoured on every round: he scores 79% in the
group stage falling to 68% in the final, against their 59%. `test:penalties`
asserts that from the values in `ROUNDS`, so a future difficulty tweak cannot
quietly make the final unwinnable.

The first version had the keeper guess a zone and save on a match, which reads
as fair and is not: he also saves by coincidence one time in six when he
guesses wrong, and it worked out at 52% saved. A six year old picking a corner
and being denied every other kick stops playing.

The other team blazes one over the bar 12% of the time. It is true to life and
it is what tips a tight shootout the player's way.

## Why a canvas for the match and DOM for everything else

The match needs a scrolling pitch and twenty-odd moving things at 60fps, which
is canvas work. Every other screen is a handful of large tap targets, which the
DOM does better: real buttons, real hit testing, real text rendering, and CSS
handles the layout at any scale.

The penalty shootout is DOM zones over an inline SVG goal for the same reason.
The targets need to be reliably tappable by a six year old more than they need
to be pretty.

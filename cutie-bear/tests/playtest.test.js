/* Bugs Addison found by playing, which the whole rest of the suite missed.

   Both are worth understanding, because both are the same kind of mistake:
   a test that checks a thing exists rather than a thing works.

   1. "The music cannot be turned off even when I click the off button."
      The button and the toggle were both fine. The popup was on top of them.
      #pop covered the entire board at z-index 30 while the bar sat at 6, and a
      popup appears after every single game, which is exactly the moment a
      child reaches for the music button. On top of that the button only ever
      existed on the home screen, so during a game there was nothing to press.

   2. "The Photo Booth is not allowed to take pictures with her friends."
      The six friend SVGs had no xmlns. Inline in the page that does not
      matter, because the HTML parser is forgiving, so friends looked right
      everywhere on screen. Rasterised through a data: URI they are parsed as
      standalone XML, where xmlns is required, so the image never decoded. The
      error handler was missing too, so the friend just silently was not in the
      picture.

   So these tests press the button while a popup is up, and count the pixels
   that actually reach the photo. Not "does the element exist". */
const { launch, site, engineName } = require('./harness');

let fails = 0;
const log = (s) => process.stdout.write(s + '\n');
function check(name, cond, extra) {
  if (!cond) { fails++; log('FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
  else log('pass  ' + name);
}
function info(name, value) { log('info  ' + name + ': ' + value); }

(async () => {
  const browser = await launch();
  const SITE = await site();
  log('engine: ' + engineName() + '    target: ' + SITE.target + '\n');

  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  /* Count every note the app actually plays, by wrapping the oscillator the
     moment it is created. Asking whether S.music is false proves nothing: the
     complaint was that sound kept coming out. */
  await page.addInitScript(() => {
    window.__notes = 0;
    const Orig = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = function () {
      const ac = new Orig();
      const create = ac.createOscillator.bind(ac);
      ac.createOscillator = function () {
        const o = create();
        const start = o.start.bind(o);
        o.start = function (t) { window.__notes++; return start(t); };
        return o;
      };
      return ac;
    };
  });

  await page.goto(SITE.url);
  await page.waitForTimeout(700);

  /* ================= 1. THE MUSIC BUTTON ================= */

  const bars = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.screen').forEach(s => {
      const bar = s.querySelector('.bar');
      out.push({ screen: s.id, music: !!(bar && bar.querySelector('.musicbtn')), sfx: !!(bar && bar.querySelector('.sfxbtn')) });
    });
    return out;
  });
  const missing = bars.filter(b => !b.music || !b.sfx).map(b => b.screen);
  check('every screen has a music and a sound button, not just home',
    missing.length === 0, 'missing on: ' + missing.join(', '));
  info('screens with sound controls', bars.length);

  // A real first tap unlocks audio and starts the music.
  await page.mouse.click(512, 700);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
  await page.waitForTimeout(1500);
  const started = await page.evaluate(() => ({ music: S.music, notes: window.__notes }));
  check('music is playing before she asks for quiet', started.music === true && started.notes > 0,
    JSON.stringify(started));

  // THE BUG: press it with a popup open, which is how the game always ends.
  await page.evaluate(() => popup('Time is up!', 'You caught 12 treats.', 'Yay!'));
  await page.waitForTimeout(250);
  const covering = await page.evaluate(() => {
    const b = document.querySelector('#scr-home .musicbtn').getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit.className.indexOf('musicbtn') >= 0 ? 'the button' : (hit.id || hit.className);
  });
  check('with a popup open, a finger on the music button hits the button',
    covering === 'the button', 'it hits: ' + covering);

  await page.click('#scr-home .musicbtn');
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => window.__notes);
  await page.waitForTimeout(2400);
  const after = await page.evaluate(() => window.__notes);
  const off = await page.evaluate(() => ({ music: S.music, icon: document.querySelector('#scr-home .musicbtn').textContent }));
  check('tapping it while the popup is up really does turn the music off',
    off.music === false && after - before === 0, JSON.stringify(off) + ' notes after: ' + (after - before));
  check('and the button shows it is off', off.icon === '🔇', off.icon);

  // It must also work from inside a game, which is where she actually is.
  await page.evaluate(() => {
    document.getElementById('pop').classList.remove('on');
    S.music = true; persist(); musicStart(); go('song');
  });
  await page.waitForTimeout(1200);
  await page.click('#scr-song .musicbtn');
  await page.waitForTimeout(150);
  const b2 = await page.evaluate(() => window.__notes);
  await page.waitForTimeout(2400);
  const a2 = await page.evaluate(() => window.__notes);
  check('the music can be turned off from inside a game too',
    await page.evaluate(() => S.music) === false && a2 - b2 === 0, 'notes after: ' + (a2 - b2));

  // Off has to survive the app being closed, or it comes back tomorrow.
  await page.reload();
  await page.waitForTimeout(700);
  await page.mouse.click(512, 700);
  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
  const n3 = await page.evaluate(() => window.__notes);
  await page.waitForTimeout(2400);
  const n4 = await page.evaluate(() => window.__notes);
  check('the music stays off after closing and reopening the app',
    await page.evaluate(() => S.music) === false && n4 - n3 === 0, 'notes after reload: ' + (n4 - n3));

  await page.evaluate(() => { S.music = true; S.sfx = true; persist(); });

  /* ================= 2. FRIENDS IN THE PHOTO BOOTH ================= */

  // Every friend must survive being turned into a picture. This is the check
  // that was missing: they all rendered fine on screen the whole time.
  const raster = await page.evaluate(() => Promise.all(FRIENDS.map(f => new Promise(res => {
    svgToImage(f.svg, 200, 200, img => res({ name: f.name, ok: !!img }));
  }))));
  const broken = raster.filter(r => !r.ok).map(r => r.name);
  check('all six friends can be turned into a picture',
    broken.length === 0, 'these cannot: ' + broken.join(', '));

  await page.evaluate(() => {
    S.rooms.photo = true;
    S.friends = FRIENDS.map(f => f.id);
    persist(); go('photo');
  });
  await page.waitForTimeout(900);

  const picker = await page.evaluate(() => document.querySelectorAll('#friendpick .bgc').length);
  check('every friend she has met is offered in the Photo Booth', picker === 6, picker);

  /* Does the friend actually reach the picture? Count the pixels in the corner
     of the canvas where she is drawn, before and after choosing her. "No error
     was thrown" would have passed all through the bug. */
  const friendArea = () => page.evaluate(() => {
    const d = pctx.getImageData(500, 430, 170, 170).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  const empty = await friendArea();
  await page.evaluate(() => document.querySelectorAll('#friendpick .bgc')[0].click());
  await page.waitForTimeout(700);
  const withFriend = await friendArea();
  check('choosing a friend actually puts her in the picture',
    Math.abs(withFriend - empty) > 20000, 'pixel change: ' + Math.abs(withFriend - empty));
  check('and no shy-friend warning appeared',
    await page.evaluate(() => !document.getElementById('pop').classList.contains('on')));

  // And she has to survive being saved to the album.
  const albumBefore = await page.evaluate(() => S.album.length);
  await page.click('#snapbtn');
  await page.waitForTimeout(1200);
  const snap = await page.evaluate(() => ({ n: S.album.length, first: (S.album[0] || '').slice(0, 22) }));
  check('taking the picture saves it with the friend in it',
    snap.n === albumBefore + 1 && snap.first.indexOf('data:image') === 0, JSON.stringify(snap));

  await page.evaluate(() => document.getElementById('pop').classList.remove('on'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/shots/photo-with-friend.png' });

  check('no JS errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  await SITE.close();
  log(fails === 0
    ? '\nALL PLAYTEST BUG TESTS PASSED (' + engineName() + ')'
    : '\n' + fails + ' FAILURE(S) (' + engineName() + ')');
  process.exit(fails ? 1 : 0);
})();

const { launch, site, engineName } = require('./harness');
const path = require('path');

const shot = n => path.resolve(__dirname, 'shots', n);

(async () => {
  const browser = await launch();
  const SITE = await site();
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto(SITE.url);
  await page.waitForTimeout(700);

  // give her some stars so locked rooms can be inspected
  await page.evaluate(() => { S.stars = 200; S.rooms.photo = true; S.rooms.steps = true; S.friends = ['bunny','dragon']; persist(); buildDoors(); refreshStars(); buildFriendStrip(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot('1-home.png') });

  const rooms = ['closet', 'care', 'song', 'chase', 'steps', 'photo'];
  for (let i = 0; i < rooms.length; i++) {
    await page.evaluate(r => go(r), rooms[i]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot(`${i + 2}-${rooms[i]}.png`) });
  }

  // exercise the games
  await page.evaluate(() => go('chase'));
  await page.click('#chasego');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shot('9-chase-running.png') });
  const chaseState = await page.evaluate(() => ({ on: chase.on, items: chase.items.length }));

  await page.evaluate(() => go('steps'));
  await page.click('#stepsgo');
  await page.waitForTimeout(400);
  await page.mouse.click(500, 400);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: shot('10-steps-running.png') });
  const stepsState = await page.evaluate(() => ({ on: steps.on, dist: steps.dist, img: !!steps.bearImg }));

  await page.evaluate(() => go('song'));
  await page.click('#songgo');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: shot('11-song-running.png') });

  // photo booth: add a sticker, snap a picture
  await page.evaluate(() => go('photo'));
  await page.waitForTimeout(800);
  await page.evaluate(() => { photo.stickers.push({id:'heart',x:200,y:200}); photo.stickers.push({id:'rainbow',x:520,y:180}); photoDraw(); });
  await page.click('#snapbtn');
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot('12-photo.png') });
  const photoState = await page.evaluate(() => ({ album: S.album.length, len: (S.album[0]||'').length, bearImg: !!photo.img }));

  // persistence check
  await page.reload();
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => ({ stars: S.stars, friends: S.friends.length, album: S.album.length }));

  // portrait iPad
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('13-portrait.png') });

  console.log('chase   ', JSON.stringify(chaseState));
  console.log('steps   ', JSON.stringify(stepsState));
  console.log('photo   ', JSON.stringify(photoState));
  console.log('reloaded', JSON.stringify(saved));
  console.log('errors  ', errs.length ? errs.join('\n') : 'NONE');
  await browser.close();
  await SITE.close();
  if (errs.length) {
    console.error('\n' + errs.length + ' page error(s) on ' + engineName() + ' - failing.');
    process.exit(1);
  }
  console.log('\nOK (' + engineName() + ')  target=' + SITE.target);
})();

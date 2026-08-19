const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1300, height: 620 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, 'character-options.html'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(__dirname, 'character-options.png'), fullPage: true });
  console.log('errors:', errs.length ? errs.join('; ') : 'NONE');
  await b.close();
})();

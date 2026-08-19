/* Renders tools/logo-options.html to a PNG to show Addison.
   Same job as shot-character-options.js, for the logo instead of the bear.
   Run with `npm run logo-options`. */
const fs = require('fs');
const playwright = require('playwright');
const path = require('path');

(async () => {
  const baked = '/opt/pw-browsers/chromium';
  const b = await playwright.chromium.launch(fs.existsSync(baked) ? { executablePath: baked } : {});
  const ctx = await b.newContext({ viewport: { width: 1240, height: 700 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, 'logo-options.html'));
  await p.waitForTimeout(500);
  const out = path.resolve(__dirname, 'logo-options.png');
  await p.screenshot({ path: out, fullPage: true });
  console.log('wrote ' + out);
  console.log('errors:', errs.length ? errs.join('; ') : 'NONE');
  await b.close();
})();

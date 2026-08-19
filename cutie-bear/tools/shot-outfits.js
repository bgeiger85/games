/* Contact sheet of every outfit, worn.
   The closet thumbnails are cropped, so a hat can look fine there and sit two
   inches above her head in the game. This draws the whole bear wearing each
   item, one slot per sheet, which is the only way to actually see them.
   Run with `npm run outfits`, then LOOK at tools/outfits-*.png. */
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const slot = process.argv[2] || 'head';

(async () => {
  const baked = '/opt/pw-browsers/chromium';
  const b = await playwright.chromium.launch(fs.existsSync(baked) ? { executablePath: baked } : {});
  const page = await (await b.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'index.html'));
  await page.waitForTimeout(500);

  const html = await page.evaluate((slot) => {
    const keys = Object.keys(ITEMS[slot]);
    let out = '<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;'
            + 'background:linear-gradient(#BFE6FF,#FFE3F3);padding:14px;'
            + 'font:13px system-ui,-apple-system,sans-serif;color:#5B3F73">';
    keys.forEach(k => {
      const worn = { head: null, body: null, feet: null, extra: null };
      worn[slot] = k;
      out += '<div style="background:#fff;border-radius:14px;padding:4px;text-align:center">'
           + '<div style="height:150px">' + bearSVG({ mood: 'happy', worn: worn })
               .replace('<svg ', '<svg style="width:100%;height:100%" ') + '</div>'
           + '<div style="font-weight:800">' + ITEMS[slot][k].name + '</div>'
           + '<div style="color:#B8860B;font-weight:900">' + ITEMS[slot][k].cost + '</div></div>';
    });
    return out + '</div>';
  }, slot);

  await page.setContent('<body style="margin:0">' + html + '</body>');
  await page.waitForTimeout(300);
  const out = path.resolve(__dirname, 'outfits-' + slot + '.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote ' + out);
  console.log('errors: ' + (errs.length ? errs.join('; ') : 'NONE'));
  await b.close();
})();

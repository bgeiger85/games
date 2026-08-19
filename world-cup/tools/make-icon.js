#!/usr/bin/env node
/*
 * Regenerates the home screen icon in src/index.html.
 *
 * iOS will not accept SVG for apple-touch-icon. It silently ignores it and
 * puts a screenshot of the page on the home screen instead, so an SVG here
 * means no icon at all on the one device this game is built for. tools/build.js
 * fails the build if the icon is not a PNG data URI.
 *
 * Full bleed and 180x180 on purpose: iOS applies its own squircle mask, so
 * pre-rounded corners show up wrong inside that mask.
 *
 * Run: npm run icon      (needs Playwright, already a dev dependency)
 */
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const SRC = path.resolve(__dirname, '..', 'src', 'index.html');
const SIZE = 180;

/* The icon art: a ball on grass under a Spain-red sky, with the 19 on it.
   Kept here rather than read back out of the file so that regenerating never
   depends on parsing a data URI that may already be a PNG. */
const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#E23744"/><stop offset="1" stop-color="#B00D1E"/>
  </linearGradient></defs>
  <rect width="180" height="180" fill="url(#sky)"/>
  <path d="M0 132h180v48H0z" fill="#2E9E4F"/>
  <path d="M0 132h180v6H0z" fill="#43BC66"/>
  <ellipse cx="90" cy="150" rx="46" ry="9" fill="#000" opacity=".18"/>
  <circle cx="90" cy="86" r="52" fill="#fff"/>
  <circle cx="90" cy="86" r="52" fill="none" stroke="#0F1B33" stroke-width="4"/>
  <path d="M90 52l17 12-6 20H79l-6-20z" fill="#0F1B33"/>
  <path d="M46 74l14 10-5 17-16 1zM134 74l-14 10 5 17 16 1zM66 122l8-15h32l8 15-9 12H75z" fill="#0F1B33"/>
  <path d="M156 24l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" fill="#FFC400"/>
  <path d="M24 30l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFC400" opacity=".85"/>
</svg>`;

(async () => {
  const baked = '/opt/pw-browsers/chromium';
  const browser = await playwright.chromium.launch(
    fs.existsSync(baked) ? { executablePath: baked } : {}
  );
  const page = await browser.newPage();
  await page.setContent('<body style="margin:0">');

  const dataUri = await page.evaluate(async ({ art, size }) => {
    const img = new Image();
    const svgUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svgUri; });
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    // Paint an opaque base first. iOS composites the icon over black, so any
    // transparency in the corners would show as dark edges inside its mask.
    x.fillStyle = '#C6101F';
    x.fillRect(0, 0, size, size);
    x.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  }, { art: ART, size: SIZE });

  await browser.close();

  if (dataUri.indexOf('data:image/png') !== 0) {
    console.error('ICON FAILED: canvas did not return a PNG');
    process.exit(1);
  }

  let html = fs.readFileSync(SRC, 'utf8');
  const before = html;
  html = html.replace(/(<link rel="apple-touch-icon" href=")[^"]*(">)/, '$1' + dataUri + '$2');
  if (html === before) {
    console.error('ICON FAILED: could not find the apple-touch-icon link in src/index.html');
    process.exit(1);
  }
  fs.writeFileSync(SRC, html);
  console.log('apple-touch-icon rewritten: PNG, ' + SIZE + 'x' + SIZE + ', ' +
    Math.round(dataUri.length / 1024) + 'KB data URI');
})();

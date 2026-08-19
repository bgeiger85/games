#!/usr/bin/env node
/*
 * Regenerates the home screen icon in src/index.html.
 *
 * Why this exists: the icon was an SVG data URI, and iOS will not accept SVG
 * for apple-touch-icon. It silently ignores it and puts a screenshot of the
 * page on the home screen instead, so the app had no icon on the one device it
 * is built for. Chess Quest hit this and has a test for it; this app did not.
 *
 * Two things this fixes beyond the format:
 *   - Full bleed. The art had rounded corners baked in, but iOS applies its own
 *     squircle mask, so a pre-rounded icon shows wrong corners inside the mask.
 *
 * Addison chose the "Bear Badge" logo, which is her bear's face and the words
 * CUTIE BEAR inside a coral rounded frame with two gold sparkles. The home
 * screen wears that badge whole. The ICON takes the face and both sparkles but
 * drops the frame and the words on purpose, for two reasons that are about the
 * device rather than the design: iOS masks the icon into its own squircle, so
 * her frame would read as a border inside a border, and at the size an icon is
 * actually shown the words would be about six pixels tall while iOS already
 * prints the app name underneath. Put them back if she would rather have them.
 *   - 180x180, the size iOS actually asks for.
 *
 * Run: npm run icon      (needs Playwright, which is already a dev dependency)
 *
 * The output is a base64 PNG data URI written straight back into the file, so
 * the app stays one HTML file with zero network requests.
 */
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const SRC = path.resolve(__dirname, '..', 'src', 'index.html');
const SIZE = 180;

/* The icon art. Kept here rather than read back out of the file so that
   regenerating never depends on parsing a data URI that may already be a PNG. */
const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#BFE6FF"/><stop offset="1" stop-color="#FFE3F3"/>
  </linearGradient></defs>
  <rect width="180" height="180" fill="url(#sky)"/>
  <circle cx="30" cy="152" r="20" fill="#fff" opacity=".7"/>
  <circle cx="152" cy="34" r="13" fill="#fff" opacity=".55"/>
  <circle cx="52" cy="58" r="25" fill="#F0837C"/>
  <circle cx="128" cy="58" r="25" fill="#F0837C"/>
  <circle cx="52" cy="61" r="15" fill="#F9D8C0"/>
  <circle cx="128" cy="61" r="15" fill="#F9D8C0"/>
  <ellipse cx="90" cy="96" rx="57" ry="53" fill="#F0837C"/>
  <ellipse cx="90" cy="113" rx="35" ry="27" fill="#F9D8C0"/>
  <ellipse cx="67" cy="89" rx="12" ry="14" fill="#2E1B0A"/>
  <ellipse cx="113" cy="89" rx="12" ry="14" fill="#2E1B0A"/>
  <circle cx="63" cy="84" r="4.5" fill="#fff"/>
  <circle cx="109" cy="84" r="4.5" fill="#fff"/>
  <ellipse cx="90" cy="105" rx="11" ry="7.5" fill="#CB7F86"/>
  <path d="M90 120q-8 8-14 1M90 120q8 8 14 1" stroke="#CB7F86" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M26 42l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#FFD362"/>
  <path d="M152 128l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#FFD362"/>
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
    x.fillStyle = '#BFE6FF';
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

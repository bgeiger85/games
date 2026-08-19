/* ============================================================
   PIECE ARTWORK — original SVG silhouettes on a 45x45 grid.
   Drawn as vectors rather than Unicode glyphs on purpose: U+265F
   (BLACK CHESS PAWN) carries Emoji_Presentation=Yes, so iOS renders
   it as a colour emoji that ignores CSS colour, turning White's pawns
   black. Vectors cannot be reinterpreted by a device font.
   Colour comes from CSS via fill/stroke on .pc.w / .pc.b.
   ============================================================ */

var PIECE_PATHS = {
  /* pawn: round head, waisted body, flared base */
  1: 'M22.5 9a5 5 0 0 1 3 9c2.2 1.5 3.5 3.6 3.5 5.8 0 1.7-.8 3.2-2 4.4 3.4 2.2 5.6 5.6 6.3 9.8H11.7c.7-4.2 2.9-7.6 6.3-9.8-1.2-1.2-2-2.7-2-4.4 0-2.2 1.3-4.3 3.5-5.8a5 5 0 0 1 3-9z',

  /* knight: horse head with muzzle to the left and a pricked ear */
  2: 'M14 36.5C13.4 30 14.8 25.4 18 22.4L12.8 21.2C13.2 18 15 15.3 18.2 13.2C21 11.4 23.9 10.3 26.4 9.8L26.9 5.6L30.2 9.1L33 7.6L32.3 12.1C35 15 36.2 18.7 36.2 23C36.2 28.4 35.6 32.9 34.6 36.5Z',
  /* knight eye is drawn separately so it stays visible in both colours */

  /* bishop: mitre with a slit, collar, base */
  3: 'M22.5 7.5a2.6 2.6 0 0 1 1.8 4.5c3.9 2.9 6 6.4 6 10.2 0 2.4-1 4.5-2.8 6.1l1.4 1.6c1.9 1.4 3.2 3.6 3.9 6.6h-20c.7-3 2-5.2 3.9-6.6l1.4-1.6c-1.8-1.6-2.8-3.7-2.8-6.1 0-3.8 2.1-7.3 6-10.2a2.6 2.6 0 0 1 1.2-4.5z',

  /* rook: crenellated tower */
  4: 'M12 36.5v-3l2.6-1.8V21.5H12v-6h4.4v2.8h3.5v-2.8h5.2v2.8h3.5v-2.8H33v6h-2.6v10.2l2.6 1.8v3z',

  /* queen: five-point coronet flaring into a full body that meets the base */
  5: 'M8.6 15.8l3.3 7 2.2-8.8 4 7.6 4.4-9.8 4.4 9.8 4-7.6 2.2 8.8 3.3-7C35.6 21.8 33.4 25.4 29.9 27.5C33.2 29.8 35.3 33 36.2 36.7H8.8C9.7 33 11.8 29.8 15.1 27.5C11.6 25.4 9.4 21.8 8.6 15.8Z',

  /* king: cross above a crown and body */
  6: 'M21 6h3v3.2h3.2v3H24v4.6c4.7 1.6 7.6 4.5 8.6 8.6.7 3 .2 6.4-1.6 10.1H14c-1.8-3.7-2.3-7.1-1.6-10.1 1-4.1 3.9-7 8.6-8.6v-4.6h-3.2v-3H21z'
};

/* small extras that make a piece readable at 30px */
var BASE = '<rect x="10.5" y="36" width="24" height="4.6" rx="1.5"/>';
var PIECE_EXTRAS = {
  1: BASE,
  2: BASE + '<circle cx="25.4" cy="15.2" r="1.2" class="eye"/>',
  3: BASE + '<path d="M22.5 17v8.5M18.6 21.2h7.8" class="slit"/>',
  4: BASE,
  5: BASE + '<circle cx="8.5" cy="14.2" r="2.1"/><circle cx="14.1" cy="12.4" r="2.1"/>' +
     '<circle cx="22.5" cy="10.1" r="2.4"/><circle cx="30.9" cy="12.4" r="2.1"/><circle cx="36.5" cy="14.2" r="2.1"/>',
  6: BASE
};

/* Returns a complete <svg> string for one piece. */
function pieceSvg(type, isWhite) {
  return '<svg class="pc ' + (isWhite ? 'w' : 'b') + '" viewBox="0 0 45 45" ' +
         'aria-hidden="true" focusable="false">' +
         (PIECE_EXTRAS[type] || '') +
         '<path d="' + PIECE_PATHS[type] + '"/>' +
         '</svg>';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PIECE_PATHS: PIECE_PATHS, PIECE_EXTRAS: PIECE_EXTRAS, pieceSvg: pieceSvg };
}

#!/usr/bin/env python3
"""
Build Chess Quest.

  build/combined.js        CommonJS bundle of the pure-logic layers, for Node tests
  dist/chess-quest.html    the readable single-file build
  (run tools/minify.js afterwards to produce dist/index.html)

Everything is path-relative to the repo root, so it works from any cwd.
"""
import os, json, base64, urllib.parse, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'src')
ASSETS = os.path.join(ROOT, 'assets')
DIST = os.path.join(ROOT, 'dist')
BUILD = os.path.join(ROOT, 'build')

# Layers that are pure logic: no DOM, testable in Node.
CORE_FILES = ['engine.js', 'ai.js', 'coach.js']

EXPORTS = """
module.exports = {
  loadFen, toFen, START_FEN, newState, cloneState, pc, KNIGHT_D, KING_D, genLegal, genPseudo, genLegalCaptures,
  makeMove, unmakeMove, isAttacked, inCheck, gameResult, posKey, toSan, materialCount,
  searchRoot, evaluate, chooseBotMove, BOTS, seeSquare, hangingPieces, attackersTo, analyseBest, shouldResign,
  reviewMove, makeHint, dangerSquares, buildReport, describeMove,
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, VAL, KIDVAL, MATE,
  FROM, TO, PROMO, FLAG, MOVE, sqName, nameToSq, rankOf, fileOf, typeOf, colorOf, SQ
};
"""

MANIFEST = {
    "name": "Wildcat Chess - Woodland Springs Wildcats",
    "short_name": "Wildcat Chess",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#1b1233",
    "theme_color": "#1b1233",
    "description": "Climb ten levels to grandmaster, with a coach that shows you every mistake.",
}


def src(name):
    """A source file with its trailing CommonJS export block stripped."""
    s = open(os.path.join(SRC, name), encoding='utf-8').read()
    i = s.find("if (typeof module !== 'undefined'")
    return (s[:i] if i > 0 else s).rstrip() + "\n"


def build_core():
    return "\n".join(src(f) for f in CORE_FILES)


def build_combined():
    os.makedirs(BUILD, exist_ok=True)
    out = build_core() + EXPORTS
    open(os.path.join(BUILD, 'combined.js'), 'w', encoding='utf-8').write(out)
    return out


def build_html():
    os.makedirs(DIST, exist_ok=True)
    shell = open(os.path.join(SRC, 'shell.html'), encoding='utf-8').read()

    icon_b64 = open(os.path.join(ASSETS, 'icon.b64'), encoding='utf-8').read().strip()
    icon_uri = 'data:image/png;base64,' + icon_b64

    # A compact SVG mark for the manifest and favicon: readable text rather than
    # a second base64 blob. iOS still needs the PNG apple-touch-icon above.
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
           "<rect width='64' height='64' rx='14' fill='%23009A44'/>"
           "<g fill='%23ffffff'>"
           "<ellipse cx='32' cy='42' rx='14' ry='11.5'/>"
           "<ellipse cx='15.5' cy='28' rx='6.2' ry='8'/>"
           "<ellipse cx='26' cy='19.5' rx='6' ry='8.5'/>"
           "<ellipse cx='38' cy='19.5' rx='6' ry='8.5'/>"
           "<ellipse cx='48.5' cy='28' rx='6.2' ry='8'/>"
           "</g></svg>")
    svg_uri = 'data:image/svg+xml,' + svg

    m = dict(MANIFEST)
    m['icons'] = [{"src": svg_uri, "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]
    manifest_uri = ('data:application/manifest+json,'
                    + urllib.parse.quote(json.dumps(m, separators=(',', ':')), safe=''))

    html = (shell
            .replace('/*__CORE__*/', build_core())
            .replace('/*__THEME__*/', src('theme.js'))
            .replace('/*__PIECES__*/', src('pieces.js'))
            .replace('/*__PUZZLES__*/', open(os.path.join(SRC, 'puzzles.js'), encoding='utf-8').read())
            .replace('/*__UI__*/', open(os.path.join(SRC, 'ui.js'), encoding='utf-8').read())
            .replace('__ICON__', icon_uri)
            .replace('__FAVICON__', svg_uri)
            .replace('__MANIFEST__', manifest_uri))

    dest = os.path.join(DIST, 'chess-quest.html')
    open(dest, 'w', encoding='utf-8').write(html)
    return dest


def puzzle_count():
    p = os.path.join(SRC, 'puzzles.js')
    if not os.path.exists(p):
        return 0
    m = re.search(r'var BUILTIN_PUZZLES = (\[[\s\S]*?\]);', open(p, encoding='utf-8').read())
    return len(json.loads(m.group(1))) if m else 0


if __name__ == '__main__':
    build_combined()
    dest = build_html()
    print('build/combined.js written')
    print('%s  %d bytes, %d built-in puzzles'
          % (os.path.relpath(dest, ROOT), os.path.getsize(dest), puzzle_count()))

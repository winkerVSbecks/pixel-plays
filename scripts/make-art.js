// Draws the site's pixel art as code and writes it into public/ (run with `npm run art`).
// Every picture is authored on a small grid and scaled up by a whole number, so each art pixel is a hard-edged block.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid, png, svg } from './png.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (file, data) => { mkdirSync(dirname(join(ROOT, file)), { recursive: true }); writeFileSync(join(ROOT, file), data); console.log('wrote', file); };

/* ---------- the favicon: a red leather cricket ball on 16×16 ----------
   k ink outline, r leather, d the shaded underside, h a small highlight, w the pale stitched seam
   (two rows of stitching with the cross stitches between them). */
const BALL_16 = [
  '................',
  '.....kkkkkk.....',
  '...kkrrrwwwkk...',
  '..krhhrrwrwrrk..',
  '..khhrrrwwwrrk..',
  '.krhrrrwrwrrrrk.',
  '.krrrrrwwwrrrrk.',
  '.krrrrwrwrrrrrk.',
  '.krrrrwwwrrrrdk.',
  '.krrrwrwrrrrrdk.',
  '.krrrwwwrrrrddk.',
  '..krwrwrrrrddk..',
  '..kwwwrrrddddk..',
  '...kkrrrdddkk...',
  '.....kkkkkk.....',
  '................',
];
const CRICKET_BALL = { k: '#1c1b19', r: '#b8232b', d: '#7c1820', h: '#ec7a62', w: '#f4e6c8' };
const favicon = new Grid(16, 16);
favicon.sprite(BALL_16, CRICKET_BALL);
out('public/favicon.svg', svg(favicon));

/* ---------- the touch icon: the same ball ×9 (144px) centred on 180×180 paper ---------- */
const PAPER = '#f6f4ec';
const touch = new Grid(20, 20, PAPER);
touch.draw(favicon, 2, 2);
out('public/apple-touch-icon.png', png(touch, 9));

/* ---------- the link preview: 240×126 art scaled ×5 to 1200×630 ----------
   Two compositions; OG_PICK chooses which one is published as public/og.png. Both are also kept in art-candidates/. */
const OG_PICK = 'a';
const OG_W = 240, OG_H = 126, OG_SCALE = 5, SAFE = 12;   // SAFE: 60px at full size, kept clear for apps that crop

// the palette, from the game (src/game/constants.js): ink, chalk paper, the tennis ball, brick, the lane's asphalt, the willow blade
const P = {
  ink: '#1c1b19', paper: '#f6f4ec', chalkDim: '#d6d2cc',
  ball: '#d8ec48', ballShade: '#a8b838',
  brick: '#a6523c', brickDark: '#86402e', mortar: '#c4b29c',
  asphalt: '#7c7675', asphaltDark: '#666266',
  blade: '#f2d694', bladeShade: '#d4ac6c',
  plaster: '#e2c48c', plasterShade: '#c8a46c', shutter: '#3e7468', door: '#3a6096',
  skin: '#c4926e', skinShade: '#9a6a4c', shirt: '#f6f4ec', shirtShade: '#d6d2cc',
};

// a tiny deterministic hash, for brick variety and chalk texture
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* Hand-drawn capitals, 5 wide and 7 tall, drawn as pixel shapes (no font). */
const GLYPHS = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};
const BOUNCE = [0, -1, 0, 1, 0, -1, 1, 0, -1, 0, 1, 0, -1];   // each letter sits a pixel up or down, like hand lettering
const textWidth = (text, s, gap) => [...text].reduce((w, ch, i) => w + (ch === ' ' ? 3 * s : GLYPHS[ch][0].length * s) + (i ? gap : 0), 0);
/* Paper letters with an ink outline and a deeper ink shadow below. Returns the drawn box. */
function title(g, text, x, y, s, gap, { fill = P.paper, edge = P.ink, drop = 2 } = {}) {
  const w = textWidth(text, s, gap), t = new Grid(w + 2, 7 * s + 4);
  let cx = 1;
  [...text].forEach((ch, i) => {
    if (ch === ' ') { cx += 3 * s + gap; return; }
    const rows = GLYPHS[ch], dy = 2 + BOUNCE[i % BOUNCE.length];
    rows.forEach((row, j) => [...row].forEach((b, k) => { if (b === '#') t.rect(cx + k * s, dy + j * s, s, s, fill); }));
    cx += rows[0].length * s + gap;
  });
  t.outline(edge, true);
  for (let d = drop; d >= 1; d--) g.draw(new Grid(t.w, t.h).draw(t).map(() => edge), x - 1, y - 2 + d);
  g.draw(t, x - 1, y - 2);
  return { x0: x - 2, y0: y - 3, x1: x - 1 + t.w, y1: y - 2 + t.h + drop };
}

/* The tennis ball seen at radius R: lit from the upper left, shaded underside, a white S-seam, ink outline.
   Returns a grid with the ball centred in it. */
function tennisBall(R, spin = .5, tilt = .55) {
  const n = Math.ceil(R) * 2 + 4, c = n / 2, g = new Grid(n, n);
  const L = [-.5, -.62, .6], len = Math.hypot(...L);
  g.each((x, y) => {
    const nx = (x - c) / R, ny = (y - c) / R, q = 1 - nx * nx - ny * ny;
    if (q < 0) return false;
    const lit = (nx * L[0] + ny * L[1] + Math.sqrt(q) * L[2]) / len;
    return lit < .1 ? P.ballShade : P.ball;
  });
  // the seam: the classic tennis-ball curve on the unit sphere, turned, front half only
  const a = .7, b = .3, ca = Math.cos(spin), sa = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let k = 0; k < 4000; k++) {
    const t = k / 4000 * Math.PI * 2;
    let x = a * Math.cos(t) + b * Math.cos(3 * t), y = a * Math.sin(t) - b * Math.sin(3 * t), z = 2 * Math.sqrt(a * b) * Math.sin(2 * t);
    [x, y] = [x * ca - y * sa, x * sa + y * ca];
    [y, z] = [y * ct - z * st, y * st + z * ct];
    if (z < .05) continue;
    const px = Math.floor(c + x * R * .97), py = Math.floor(c + y * R * .97);
    for (const [dx, dy] of R > 8 ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) if (g.get(px + dx, py + dy) !== null) g.set(px + dx, py + dy, P.paper);
  }
  // a small highlight, upper left
  g.each((x, y) => { const d = Math.hypot(x - (c - R * .45), y - (c - R * .5)); return d < R * .17 && g.get(Math.floor(x), Math.floor(y)) === P.ball; }, P.paper);
  return g.outline(P.ink);
}

/* A stepped motion trail: blocks of shrinking height behind the ball, each a step smaller than the last.
   (x, y) is the ball's centre, r its radius, dir the direction it travels (+1 right, -1 left). */
function trail(g, x, y, r, dir = 1) {
  const steps = [[.78, 7], [.56, 6], [.34, 5], [.16, 4]];
  let edge = x - dir * (r - 3);
  steps.forEach(([k, w], i) => {
    const h = Math.round(r * 2 * k), top = Math.round(y - h / 2), gap = 3;
    const x0 = dir > 0 ? edge - w : edge;
    const block = new Grid(g.w, g.h);
    block.rect(x0, top, w, h, i % 2 ? P.ballShade : P.ball);
    block.rect(x0, top + h - Math.max(1, Math.round(h / 4)), w, Math.max(1, Math.round(h / 4)), P.ballShade);
    if (i === 0) block.rect(x0, top + 1, w, 1, P.paper);
    g.draw(block.outline(P.ink));
    edge -= dir * (w + gap);
  });
}

/* A brick wall filling the box, bricks 13×5 with mortar between, every other course offset. */
function brickWall(g, x0, y0, w, h) {
  g.rect(x0, y0, w, h, P.mortar);
  for (let row = 0; row * 6 < h; row++) {
    const off = row % 2 ? -7 : 0;
    for (let bx = off; bx < w; bx += 14) {
      const tone = hash(bx + 300, row) < .22 ? P.brickDark : P.brick;
      g.rect(x0 + Math.max(0, bx), y0 + row * 6, Math.min(13, 13 + bx - Math.max(0, bx), w - Math.max(0, bx)), Math.min(5, h - row * 6), tone);
      if (hash(bx, row + 50) < .3) g.set(x0 + bx + 12, y0 + row * 6 + 4, P.brickDark);   // a worn corner
    }
  }
}

/* Chalk on a rough wall: a stroke that skips a few pixels so the bricks show through. */
function chalkLine(g, ax, ay, bx, by, wdt, col = P.paper, rough = true) {
  const t = new Grid(g.w, g.h);
  t.capsule(ax, ay, bx, by, wdt / 2, col);
  t.map((c, x, y) => hash(x * 3, y * 7) < .14 ? P.chalkDim : c);
  if (rough) t.p = t.p.map((c, i) => c && hash(i % g.w, (i / g.w) | 0) < .07 ? null : c);
  g.draw(t);
}

/* A cricket bat from the top of the handle (hx, hy) towards the toe (tx, ty): taped handle, willow blade, ink edge. */
function bat(hx, hy, tx, ty, wide = 5.5) {
  const g = new Grid(OG_W, OG_H), L = Math.hypot(tx - hx, ty - hy), ux = (tx - hx) / L, uy = (ty - hy) / L, nx = -uy, ny = ux;
  const at = (s, w) => [hx + ux * s + nx * w, hy + uy * s + ny * w];
  const hl = L * .32, hw = Math.max(1.6, wide * .2);      // handle length and half-width
  g.poly([at(0, -hw), at(0, hw), at(hl + 1, hw), at(hl + 1, -hw)], P.asphaltDark);  // the rubber grip
  g.each((x, y) => {                                        // its ridges: ink bands across it
    const s = (x - hx) * ux + (y - hy) * uy, w = (x - hx) * nx + (y - hy) * ny;
    return s > 0 && s < hl && Math.abs(w) <= hw && Math.floor(s / 3) % 2 === 1;
  }, P.ink);
  const shoulder = 3;
  g.poly([at(hl, -hw - .2), at(hl + shoulder, -wide / 2), at(L - 1.5, -wide / 2), at(L, -wide / 2 + 1.5), at(L, wide / 2 - 1.5), at(L - 1.5, wide / 2), at(hl + shoulder, wide / 2), at(hl, hw + .2)], P.blade);
  g.map((c, x, y) => {                                      // the blade's far edge in shade
    if (c !== P.blade) return c;
    const w = (x + .5 - hx) * nx + (y + .5 - hy) * ny;
    return w > wide / 2 - 1.6 ? P.bladeShade : c;
  });
  return g.outline(P.ink);
}

function compositionA() {
  const g = new Grid(OG_W, OG_H), groundY = 86;
  brickWall(g, 0, 0, OG_W, groundY);
  // the lane in front of the wall: a kerb line, then asphalt with a few patched squares
  g.rect(0, groundY, OG_W, OG_H - groundY, P.asphalt);
  g.rect(0, groundY, OG_W, 2, P.asphaltDark);
  g.each((x, y) => hash(x >> 2, y >> 2) < .05, P.asphaltDark, 0, groundY + 3, OG_W, OG_H);
  // chalk stumps on the wall, left of centre: three stumps and two bails, a little uneven
  const sx = 34, top = 40;
  [[sx, top + 1], [sx + 9, top], [sx + 18, top + 1]].forEach(([x, t], i) => chalkLine(g, x + (i - 1) * .4, t, x, groundY - 1, 3));
  chalkLine(g, sx - 1, top - 3, sx + 8, top - 3.5, 2.2);
  chalkLine(g, sx + 10, top - 3.5, sx + 19, top - 3, 2.2);
  chalkLine(g, sx - 6, groundY - 1, sx + 24, groundY - 1, 2);            // the crease scuffed along the foot of the wall
  // a chalk tally of runs above the stumps: two gates of five
  [0, 16].forEach(ox => {
    for (let k = 0; k < 4; k++) chalkLine(g, 20 + ox + k * 3, 10 + (k % 2), 20.5 + ox + k * 3, 24, 2, P.paper, false);
    chalkLine(g, 18 + ox, 21, 31 + ox, 13, 2, P.paper, false);
  });
  // the bat leaning on the wall at the right
  const b = bat(210, 22, 188, groundY + 1, 10);
  g.draw(b);
  g.rect(176, groundY + 2, 26, 2, P.asphaltDark);                          // its shadow
  // the ball in flight, centre right, with its trail back towards the stumps
  const R = 19, bx = 132, by = 42, ball = tennisBall(R, 1.75, .1);
  trail(g, bx, by, R, 1);
  g.draw(ball, bx - ball.w / 2, by - ball.h / 2);
  // the title along the bottom
  const s = 3, gap = 2, w = textWidth('GULLY CRICKET', s, gap), x0 = Math.round((OG_W - w) / 2);
  title(g, 'GULLY', x0, 94, s, gap, { fill: P.ball });
  title(g, 'CRICKET', x0 + textWidth('GULLY ', s, gap) + gap, 94, s, gap);
  return g;
}

const candidates = { a: compositionA() };
for (const [k, g] of Object.entries(candidates)) out(`art-candidates/og-${k}.png`, png(g, OG_SCALE));
out('public/og.png', png(candidates[OG_PICK], OG_SCALE));

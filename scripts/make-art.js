// Draws the site's pixel art as code and writes it into public/ (run with `npm run art`).
// Every picture is authored on a small grid and scaled up by a whole number, so each art pixel is a hard-edged block.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid, png, svg } from './png.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (file, data) => { mkdirSync(dirname(join(ROOT, file)), { recursive: true }); writeFileSync(join(ROOT, file), data); console.log('wrote', file); };

/* ---------- the favicon: a red leather cricket ball on 16×16 ----------
   k ink outline, r leather, d the shaded underside, h a small highlight, s the seam (a thin darker-red line)
   and w its pale stitches, one per row on alternating sides, with red leather between every stitch. */
const BALL_16 = [
  '................',
  '.....kkkkkk.....',
  '...kkrrrrrrkk...',
  '..krhhrrrwsrrk..',
  '..khhrrrrswrrk..',
  '.krhrrrrwsrrrrk.',
  '.krrrrrrswrrrrk.',
  '.krrrrwsrrrrrrk.',
  '.krrrrrswrrrrdk.',
  '.krrrwsrrrrrrdk.',
  '.krrrrswrrrrddk.',
  '..krwsrrrrrddk..',
  '..krswrrrddddk..',
  '...kkrrrdddkk...',
  '.....kkkkkk.....',
  '................',
];
const CRICKET_BALL = { k: '#1c1b19', r: '#b8232b', d: '#7c1820', s: '#7c1820', h: '#ec7a62', w: '#f4e6c8' };
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
  blade: '#f2d694', bladeShade: '#e2c48c',   // the blade's shade is the plaster tone, to keep the palette small
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
  const b = inked(t);
  return { x0: x - 1 + b.x0, y0: y - 2 + b.y0, x1: x - 1 + b.x1, y1: y - 2 + b.y1 + drop };
}
// the box around a grid's drawn pixels (x1, y1 exclusive)
function inked(t) {
  let x0 = t.w, y0 = t.h, x1 = 0, y1 = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.get(x, y) !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  return { x0, y0, x1, y1 };
}
// stop the build if a title or the ball strays into the margin that some apps crop
function inSafe(name, b) {
  if (b.x0 < SAFE || b.y0 < SAFE || b.x1 > OG_W - SAFE || b.y1 > OG_H - SAFE) throw new Error(`${name} leaves the safe area: ${JSON.stringify(b)}`);
}
function placeBall(g, ball, bx, by, name) {
  const x = Math.round(bx - ball.w / 2), y = Math.round(by - ball.h / 2), b = inked(ball);
  g.draw(ball, x, y);
  inSafe(name, { x0: x + b.x0, y0: y + b.y0, x1: x + b.x1, y1: y + b.y1 });
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
function trail(g, x, y, r, dir = 1, n = 4) {
  const steps = [[.78, 7], [.56, 6], [.34, 5], [.16, 4]].slice(0, n);
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

const TITLE_A_Y = 89;
function compositionA() {
  const g = new Grid(OG_W, OG_H), groundY = 81;
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
  placeBall(g, ball, bx, by, 'A ball');
  // the title along the bottom
  const s = 3, gap = 2, w = textWidth('GULLY CRICKET', s, gap), x0 = Math.round((OG_W - w) / 2);
  inSafe('A title', title(g, 'GULLY', x0, TITLE_A_Y, s, gap, { fill: P.ball }));
  inSafe('A title', title(g, 'CRICKET', x0 + textWidth('GULLY ', s, gap) + gap, TITLE_A_Y, s, gap));
  return g;
}


/* One body part: shapes drawn by fn into a fresh layer, an optional shade on one side of an axis, then an ink outline. */
function part(w, h, fn) { const t = new Grid(w, h); fn(t); return t.outline(P.ink); }
// a limb from (ax, ay) to (bx, by), shaded on the side the normal (sx, sy) points to
function limb(t, ax, ay, bx, by, r, col, shade, side = 1, k = .3) {
  t.capsule(ax, ay, bx, by, r, col);
  const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L * side, ny = (bx - ax) / L * side;
  t.map((c, x, y) => c === col && ((x + .5 - ax) * nx + (y + .5 - ay) * ny) > r * k ? shade : c);
}

/* The batter, facing right, just after a lofted drive: weight on the bent front leg, back heel up,
   arms through and the bat climbing over the front shoulder. Drawn on its own grid; flip it to face left. */
function batter() {
  const W = 120, H = 122, g = new Grid(W, H);
  const add = layer => g.draw(layer);
  // back leg: hip, knee, ankle, then the shoe on its toes
  add(part(W, H, t => { limb(t, 47, 66, 35, 89, 5.5, P.door, P.ink, -1, .62); limb(t, 35, 89, 22, 108, 4.5, P.door, P.ink, -1, .62); }));
  add(part(W, H, t => t.poly([[17, 105], [25, 109], [29, 116], [20, 117], [14, 112]], P.ink)));
  // back arm, behind the body
  add(part(W, H, t => { limb(t, 48, 39, 63, 48, 3.6, P.shirt, P.shirtShade, 1); limb(t, 63, 48, 81, 40, 3.2, P.skin, P.skinShade, 1); }));
  // the body: shirt, leaning a little forward, belt line at the hips
  add(part(W, H, t => {
    t.poly([[44, 33], [62, 31], [66, 40], [63, 66], [43, 67], [41, 50]], P.shirt);
    t.map((c, x, y) => x < 46 + (y - 33) * -.05 || (x < 50 && y > 50) ? P.shirtShade : c);
    t.rect(43, 63, 21, 4, P.door);
    t.poly([[50, 31], [61, 30], [57, 38]], P.shirtShade);                 // open collar
    t.poly([[52.5, 31], [59, 30.5], [56.5, 35]], P.skinShade);
    for (let y = 40; y < 62; y += 7) t.set(57 + Math.round((y - 40) * .1), y, P.shirtShade);   // buttons
  }));
  // neck and head: the batter looks up after the ball
  add(part(W, H, t => {
    t.rect(52, 26, 6, 7, P.skinShade);
    t.disc(57, 19, 8.5, P.skin);
    t.each((x, y) => Math.hypot(x - 55, y - 17) < 9 && (x < 56 || y < 13.5 - (x - 56) * .25), P.ink, 44, 6, 68, 28);   // hair: back and top
    t.set(62, 16, P.ink); t.set(62, 17, P.ink);                                                         // the eye, looking up at the ball
    t.rect(61, 14, 3, 1, P.ink);                                                                         // brow
    t.set(66, 19, P.skin); t.set(66, 20, P.skinShade);                                                   // nose
    t.rect(61, 23, 3, 1, P.skinShade);                                                                   // mouth
    t.rect(55, 20, 2, 3, P.skinShade);                                                                  // ear
  }));
  // front leg: a long stride, knee over the toes, the shoe flat
  add(part(W, H, t => { limb(t, 58, 66, 84, 82, 5.8, P.door, P.ink, -1, .62); limb(t, 84, 82, 82, 109, 4.6, P.door, P.ink, -1, .62); }));
  add(part(W, H, t => t.poly([[77, 107], [87, 108], [94, 113], [94, 117], [76, 117]], P.ink)));
  // the bat, then the front arm and both hands over its handle
  g.draw(batOn(W, H, 77, 44, 112, 7, 10));
  add(part(W, H, t => { limb(t, 61, 37, 73, 44, 3.8, P.shirt, P.shirtShade, 1); limb(t, 73, 44, 84, 37, 3.3, P.skin, P.skinShade, 1); }));
  add(part(W, H, t => { t.disc(83.5, 37.5, 3.6, P.skin); t.disc(80.5, 41, 3.4, P.skin); t.set(84, 39, P.skinShade); t.set(81, 42, P.skinShade); }));
  return g;
}
// the bat drawn onto a w×h layer (bat() draws on the og grid)
function batOn(w, h, hx, hy, tx, ty, wide) { const b = bat(hx, hy, tx, ty, wide); const g = new Grid(w, h); g.draw(b); return g; }
const mirror = g => { const m = new Grid(g.w, g.h); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) m.set(g.w - 1 - x, y, g.get(x, y)); return m; };

function compositionB() {
  const g = new Grid(OG_W, OG_H), laneY = 84;
  // sky, then a run of plastered house fronts with a parapet
  g.rect(0, 0, OG_W, laneY, P.plaster);
  g.rect(0, 0, OG_W, 6, P.paper);
  g.rect(0, 6, OG_W, 3, P.blade);
  g.rect(0, 9, OG_W, 1, P.ink);
  for (const x of [78, 168]) g.rect(x, 10, 2, laneY - 10, P.asphalt);                           // drainpipes between houses
  // a shuttered window and a blue door
  const win = (x, y) => { g.rect(x - 1, y - 1, 30, 26, P.ink); g.rect(x, y, 28, 24, P.door); g.rect(x + 8, y + 2, 12, 20, P.ink); g.rect(x + 13, y + 2, 2, 20, P.door); for (let k = 0; k < 6; k++) { g.rect(x + 1, y + 3 + k * 3, 6, 1, P.ink); g.rect(x + 21, y + 3 + k * 3, 6, 1, P.ink); } };
  win(30, 22);
  g.rect(195, 30, 26, laneY - 30, P.ink); g.rect(197, 32, 22, laneY - 32, P.door); g.rect(207, 32, 2, laneY - 32, P.ink);
  // footpath, kerb and the lane
  g.rect(0, laneY, OG_W, 5, P.chalkDim);
  g.rect(0, laneY + 5, OG_W, 1, P.asphaltDark);
  g.rect(0, laneY + 6, OG_W, OG_H - laneY - 6, P.asphalt);
  g.each((x, y) => hash(x >> 2, y >> 2) < .05, P.asphaltDark, 0, laneY + 8, OG_W, OG_H);
  // the brick stumps up the lane behind the batter: four bricks stacked
  for (let k = 0; k < 4; k++) { g.rect(224, 98 - k * 4, 11, 4, P.ink); g.rect(225, 99 - k * 4, 9, 2, P.brick); }
  g.rect(140, 119, 100, 2, P.paper);                                                              // chalk crease
  g.rect(136, 120, 92, 3, P.asphaltDark); g.rect(146, 123, 70, 1, P.asphaltDark);                // his shadow on the lane
  // the batter, flipped to face left
  const fig = mirror(batter());
  g.draw(fig, 236 - fig.w, 125 - fig.h + 2);
  // the ball, just off the bat and climbing away to the left, trail back towards the bat
  const R = 13, bx = 98, by = 29, ball = tennisBall(R, 1.75, .1);
  trail(g, bx, by, R, -1, 3);
  placeBall(g, ball, bx, by, 'B ball');
  // the title, stacked at the lower left
  const s = 3, gap = 2;
  inSafe('B title', title(g, 'GULLY', SAFE + 2, 60, s, gap, { fill: P.ball }));
  inSafe('B title', title(g, 'CRICKET', SAFE + 2, 88, s, gap));
  return g;
}

const candidates = { a: compositionA(), b: compositionB() };
for (const [k, g] of Object.entries(candidates)) out(`art-candidates/og-${k}.png`, png(g, OG_SCALE));
out('public/og.png', png(candidates[OG_PICK], OG_SCALE));

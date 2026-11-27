// Makes the site's pixel art and writes it into public/ (run with `npm run art`).
// The favicon and touch icon are authored on a small grid; the link preview is a frame drawn by the game's own engine.
// Every picture is scaled up by a whole number, so each art pixel is a hard-edged block.
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
const TOUCH_PAPER = '#f6f4ec';
const touch = new Grid(20, 20, TOUCH_PAPER);
touch.draw(favicon, 2, 2);
out('public/apple-touch-icon.png', png(touch, 9));

/* ---------- the link preview: a frame drawn by the game's own engine ----------
   The real engine, scene and figures run in Node (engine-node.js stands in for the browser), and the Storybook
   scenario harness stages a moment: one seeded delivery and a swing, played to a time. The 360×280 frame is cropped
   and scaled up by a whole number to exactly 1200×630, and the title is laid over the sky and the rooftops. */
const OG_W = 1200, OG_H = 630, SAFE = 60;   // SAFE: kept clear around the title and the batter, for apps that crop

await import('./engine-node.js');
const { moment, play, render } = await import('../src/stories/harness/scenario.js');
const { G } = await import('../src/game/state.js');
const { BAYER, project } = await import('../src/engine.js');
const { BATTER } = await import('../src/game/constants.js');

const INK = '#1c1b19', PAPER = '#ffffff';
const hex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

/* the game at time t of scenario sc, as the engine draws it: a 360×280 grid. The phase is set to 'pick' (the welcome
   screen) just for the draw, so the aim guide, the landing ring and the swing cue are left out */
function frame(sc, t) {
  play(sc, t);
  const phase = G.phase;
  G.phase = 'pick';
  const { image } = render().getContext('2d');
  G.phase = phase;
  const g = new Grid(image.width, image.height), d = image.data;
  for (let i = 0; i < g.p.length; i++) g.p[i] = d[i * 4 + 3] ? hex(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) : PAPER;
  return g;
}

/* ---------- the title: GULLY CRICKET as a game logo ----------
   Pixel capitals, 6×7 with two-pixel stems, are built on a logo grid at CELL logo pixels a glyph pixel, and the logo
   grid lands on the preview at LOGO px a pixel, the same ×5 as the scene, so its blocks line up with the scene's.
   Each letter is filled with the tennis ball's yellow-green, lit along the top of every stroke and Bayer-dithered
   darker towards its foot; a solid olive side is extruded DEPTH logo pixels down and to the right, and an ink outline
   runs round the lot so it holds up over the rooftops as well as the sky. */
const GLYPHS = {
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.#####'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
  Y: ['##..##', '##..##', '##..##', '.####.', '..##..', '..##..', '..##..'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
};
const GAP = 1;
const LOGO = 5, CELL = 3, DEPTH = 3;
const BALL_RAMP = ['#f2fbb0', '#d8ec48', '#b2c92c', '#86a01e'];   // lit edge, the ball's own colour, two shades down
const SIDE = '#4f6216';

/* the title's fill mask, one line per entry: [text, left, top, hop] in logo pixels, where hop raises every other
   letter by that much so the line bounces a little */
function titleMask(w, h, lines) {
  const fill = new Grid(w, h), rowOf = new Grid(w, h);
  for (const [text, left, top, hop] of lines) {
    let cx = left;
    [...text].forEach((ch, n) => {
      const y0 = top - (n % 2 ? hop : 0);
      GLYPHS[ch].forEach((row, j) => [...row].forEach((b, k) => {
        if (b !== '#') return;
        for (let v = 0; v < CELL; v++) for (let u = 0; u < CELL; u++) {
          fill.set(cx + k * CELL + u, y0 + j * CELL + v, 'f');
          rowOf.set(cx + k * CELL + u, y0 + j * CELL + v, String((j * CELL + v) / (7 * CELL - 1)));
        }
      }));
      cx += (GLYPHS[ch][0].length + GAP) * CELL;
    });
  }
  return { fill, rowOf };
}
function logo(w, h, lines) {
  const { fill, rowOf } = titleMask(w, h, lines), g = new Grid(w, h);
  const isFill = (x, y) => fill.get(x, y) !== null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isFill(x, y)) continue;
    for (let k = 1; k <= DEPTH; k++) if (isFill(x - k, y - k)) { g.set(x, y, SIDE); break; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isFill(x, y)) continue;
    const t = +rowOf.get(x, y);
    const lit = !isFill(x, y - 1) || !isFill(x - 1, y);
    g.set(x, y, lit ? BALL_RAMP[0] : BALL_RAMP[1 + Math.max(0, Math.min(2, Math.floor(t * 3.2 - .9 + (BAYER[(y & 3) * 4 + (x & 3)] - .5) * 1.2)))]);
  }
  return g.outline(INK, true);
}
// the box of everything drawn on a logo grid, in preview pixels
function boxOf(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: x0 * LOGO, y0: y0 * LOGO, x1: (x1 + 1) * LOGO, y1: (y1 + 1) * LOGO };
}
function inSafe(name, b) {
  if (b.x0 < SAFE || b.y0 < SAFE || b.x1 > OG_W - SAFE || b.y1 > OG_H - SAFE) throw new Error(`${name} comes within ${SAFE}px of an edge: ${JSON.stringify(b)}`);
}

/* the frame's (x0, y0) corner at `scale` px a pixel, padded with paper wherever the crop runs past the frame */
function crop(src, x0, y0, scale) {
  const g = new Grid(OG_W, OG_H, PAPER);
  for (let y = 0; y < OG_H; y++) for (let x = 0; x < OG_W; x++) {
    const c = src.get(x0 + Math.floor(x / scale), y0 + Math.floor(y / scale));
    if (c) g.p[y * OG_W + x] = c;
  }
  return g;
}
// the batter's box on the output grid, for the safe-area check (his head to his feet, bat included)
function batterBox(x0, y0, scale) {
  const a = project(BATTER.x, BATTER.y, 2.3), b = project(BATTER.x, BATTER.y, 0);
  return { x0: (a.sx - 9 - x0) * scale, y0: (a.sy - y0) * scale, x1: (a.sx + 9 - x0) * scale, y1: (b.sy + 2 - y0) * scale };
}

/* the moment: Australia (yellow) batting against Zimbabwe (red), fast bowling, a ball on the stumps, lofted for six
   into the house fronts. The frame is 0.16 s after the ball reaches the bat: the bat up and the ball climbing towards
   the houses. (The bowler's follow-through is over about 0.15 s after he lets go, and the ball takes 0.55 s to reach
   the bat, so no frame has both.) */
const TITLE_LINES = [['GULLY', 104, 14, 1], ['CRICKET', 80, 40, 1]];
const TITLE_KEEP_OFF = [
  { x0: 380, y0: 400, x1: 420, y1: 440 },   // the ball
  { x0: 430, y0: 325, x1: 500, y1: 470 },   // the fielder by the scooter
  { x0: 550, y0: 390, x1: 615, y1: 525 },   // the fielder at the door
  { x0: 505, y0: 465, x1: 580, y1: 600 },   // the fielder behind the batter
];
const SIX = { seed: 1, you: 'aus', rival: 'zim', type: 'fast', line: 'stumps', move: 'none', length: 3.6, swing: { dir: 'NE', shot: 'air', timing: 'perfect' } };
const AFTER = .16, X0 = 162, Y0 = 70, SCALE = 5;   // close on the batter at ×5

const og = crop(frame(SIX, moment(SIX, 'contact', AFTER)), X0, Y0, SCALE);
inSafe('batter', batterBox(X0, Y0, SCALE));

/* the title at the upper right, stepped: GULLY over the rooftops and indented, CRICKET below it reaching further left. It must keep
   off the people: KEEP_OFF holds the boxes (preview pixels) of the fielder at the scooter, his team-mates and the
   ball, besides the batter's own box */
const title = logo(OG_W / LOGO, OG_H / LOGO, TITLE_LINES);
const tb = boxOf(title);
inSafe('title', tb);
const KEEP_OFF = [batterBox(X0, Y0, SCALE), ...TITLE_KEEP_OFF];
for (const k of KEEP_OFF) if (tb.x0 < k.x1 && k.x0 < tb.x1 && tb.y0 < k.y1 && k.y0 < tb.y1)
  for (let y = k.y0; y < k.y1; y += LOGO) for (let x = k.x0; x < k.x1; x += LOGO)
    if (title.get(Math.floor(x / LOGO), Math.floor(y / LOGO)) !== null) throw new Error(`the title covers ${JSON.stringify(k)}`);
for (let y = 0; y < title.h; y++) for (let x = 0; x < title.w; x++) { const c = title.get(x, y); if (c !== null) og.rect(x * LOGO, y * LOGO, LOGO, LOGO, c); }
out('public/og.png', png(og));

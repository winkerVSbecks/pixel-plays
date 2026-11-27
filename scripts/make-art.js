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

const PAPER = '#ffffff';
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
   Pixel capitals drawn from 6×7 masks, where every mask column and row is given its own width and height in logo
   pixels: that is how GULLY is set broad and heavy and CRICKET condensed, from the same letters. The logo grid lands
   on the preview at LOGO px a pixel, the same ×5 as the scene, so its blocks line up with the scene's.
   Every colour is one the engine paints in this very frame. GULLY_FILL / CRICKET_FILL below name where each was
   sampled; each word is lit along the top of every stroke and Bayer-dithered darker towards its foot, the way the
   engine shades a wall. Both have a side extruded DEPTH logo pixels down and to the right and an outline EDGE logo
   pixels thick round the lot, in the scene's darkest shadow tone, so the title holds over the busy street. */
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
const LOGO = 5, DEPTH = 3, LEAD = 1, EDGE = 2;   // logo pixel in preview px; the side, the space under a line and the outline, in logo px
/* sampled from the rendered scene (see the note above the title) */
const INK = '#1e1c2b';                                     // the darkest shadow: the window openings and doorways
const SAND = ['#e2c48c', '#b69e73'], SAND_LIT = '#f0e6d3';  // the sand house: its lit wall, its wall in shade, the window sills
const BRICK = ['#c6795b', '#a6523c'];                       // the brick wall: the bricks catching the light, its brick
const PINK_LIT = '#deb2aa';                                 // the pink house's lit wall, as the brick's highlight
/* GULLY in the sand of the house it starts beside, CRICKET in the brick of the wall next to it */
const GULLY_FILL = { ramp: SAND, lit: SAND_LIT }, CRICKET_FILL = { ramp: BRICK, lit: PINK_LIT };
/* the lines, top to bottom. cols and rows: each mask column's width and each row's height (icols for the narrower I);
   gap: logo pixels between letters. GULLY: 120×125 px letters with 45 px stems; CRICKET: 60×90 px with 25 px stems */
const TITLE = [
  { text: 'GULLY', cols: [5, 4, 3, 3, 4, 5], rows: [5, 3, 3, 3, 3, 3, 5], gap: 5, ...GULLY_FILL },
  { text: 'CRICKET', cols: [3, 2, 1, 1, 2, 3], icols: [2, 3, 2, 2], rows: [3, 3, 2, 2, 2, 3, 3], gap: 3, ...CRICKET_FILL },
];
const sum = a => a.reduce((s, v) => s + v, 0);
const edges = a => a.reduce((e, v) => (e.push(e.at(-1) + v), e), [0]);
const colsOf = (line, ch) => (ch === 'I' && line.icols) || line.cols;
const lineWidth = line => sum([...line.text].map(ch => sum(colsOf(line, ch)))) + line.gap * (line.text.length - 1);

/* the title flush right: every line's outline ends `right` preview px from the left edge, the first line's outline
   starts `top` px down, and each line sits LEAD logo px under the side of the one above */
function logo(right, top) {
  const w = OG_W / LOGO, h = OG_H / LOGO, fill = new Grid(w, h), at = new Grid(w, h), g = new Grid(w, h);
  const r = right / LOGO - 1 - DEPTH - EDGE;   // the last fill column: the side and the outline lie to its right
  let y0 = top / LOGO + EDGE;
  for (const line of TITLE) {
    const ry = edges(line.rows), hgt = ry.at(-1);
    let x0 = r + 1 - lineWidth(line);
    for (const ch of line.text) {
      const cx = edges(colsOf(line, ch));
      GLYPHS[ch].forEach((row, j) => [...row].forEach((b, k) => {
        if (b === '#') for (let y = ry[j]; y < ry[j + 1]; y++) for (let x = cx[k]; x < cx[k + 1]; x++) { fill.set(x0 + x, y0 + y, 'f'); at.set(x0 + x, y0 + y, { line, t: y / (hgt - 1) }); }
      }));
      x0 += cx.at(-1) + line.gap;
    }
    y0 += hgt + DEPTH + LEAD;
  }
  const isFill = (x, y) => fill.get(x, y) !== null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isFill(x, y)) continue;
    for (let k = 1; k <= DEPTH; k++) if (isFill(x - k, y - k)) { g.set(x, y, INK); break; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isFill(x, y)) continue;
    const { line, t } = at.get(x, y), n = line.ramp.length;
    g.set(x, y, !isFill(x, y - 1) ? line.lit : line.ramp[Math.max(0, Math.min(n - 1, Math.floor(t * n - .3 + (BAYER[(y & 3) * 4 + (x & 3)] - .5) * 1.2)))]);
  }
  for (let k = 0; k < EDGE; k++) g.outline(INK, true);
  // ink any pocket the outline closes off (one sits in the E), so no speck of the scene shows through the letters
  const open = new Set(), todo = [0];
  while (todo.length) {
    const i = todo.pop();
    if (open.has(i) || g.p[i] !== null) continue;
    open.add(i);
    const x = i % w, y = (i - x) / w;
    if (x > 0) todo.push(i - 1); if (x < w - 1) todo.push(i + 1); if (y > 0) todo.push(i - w); if (y < h - 1) todo.push(i + w);
  }
  for (let i = 0; i < g.p.length; i++) if (g.p[i] === null && !open.has(i)) g.p[i] = INK;
  return g;
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
const SIX = { seed: 1, you: 'aus', rival: 'zim', type: 'fast', line: 'stumps', move: 'none', length: 3.6, swing: { dir: 'NE', shot: 'air', timing: 'perfect' } };
const AFTER = .16, X0 = 162, Y0 = 70, SCALE = 5;   // close on the batter at ×5

const og = crop(frame(SIX, moment(SIX, 'contact', AFTER)), X0, Y0, SCALE);
inSafe('batter', batterBox(X0, Y0, SCALE));

/* the ball on the output grid: the engine's ball, a few pixels either way, for the check that the title leaves it clear */
function ballBox(x0, y0, scale) {
  const b = project(G.ball.x, G.ball.y, G.ball.z), r = 3;
  return { x0: (b.sx - r - x0) * scale, y0: (b.sy - r - y0) * scale, x1: (b.sx + r - x0) * scale, y1: (b.sy + r - y0) * scale };
}
const ball = ballBox(X0, Y0, SCALE), batter = batterBox(X0, Y0, SCALE);

/* the title big and across the middle, as in the mockup the art was drawn to: GULLY from the brick wall over the pink
   house's roof and out onto the white, CRICKET under it over the fielders by the scooter, both lines ending on the
   white at the right. It may lie over the scene, but not over the batter or the ball, and keeps SAFE clear of every edge */
const title = logo(1105, 210), titleBox = boxOf(title);
inSafe('title', titleBox);
for (const [name, b] of [['batter', batter], ['ball', ball]])
  for (let y = 0; y < title.h; y++) for (let x = 0; x < title.w; x++) {
    if (title.get(x, y) === null) continue;
    if (x * LOGO < b.x1 && (x + 1) * LOGO > b.x0 && y * LOGO < b.y1 && (y + 1) * LOGO > b.y0) throw new Error(`the title covers the ${name} at (${x * LOGO}, ${y * LOGO})`);
  }
for (let y = 0; y < title.h; y++) for (let x = 0; x < title.w; x++) { const c = title.get(x, y); if (c !== null) og.rect(x * LOGO, y * LOGO, LOGO, LOGO, c); }
console.log('title box', JSON.stringify(titleBox), 'batter', JSON.stringify(batter), 'ball', JSON.stringify(ball));
out('public/og.png', png(og));

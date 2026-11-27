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
   GULLY is a dark indigo taken from the scene's shadows, lit along the top of every stroke and Bayer-dithered darker
   towards its foot; CRICKET is the favicon's cricket-ball red, flat, with the ball's highlight along its tops. Both
   have an ink side extruded DEPTH logo pixels down and to the right and an ink outline round the lot. */
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
const LOGO = 5, DEPTH = 2, LEAD = 1;   // logo pixel in preview px; the extruded side and the space under a line, in logo px
const INDIGO = ['#504a6b', '#423d59', '#35314a'], INDIGO_LIT = '#958eb3', TITLE_INK = '#1e1c2b';
/* the lines, top to bottom. cols and rows: each mask column's width and each row's height (icols for the narrower I);
   gap: logo pixels between letters. GULLY: 80×80 px letters with 25 px stems; CRICKET: 40×60 px with 15 px stems */
const TITLE = [
  { text: 'GULLY', cols: [3, 3, 2, 2, 3, 3], rows: [3, 2, 2, 2, 2, 2, 3], gap: 3, ramp: INDIGO, lit: INDIGO_LIT },
  { text: 'CRICKET', cols: [2, 1, 1, 1, 1, 2], icols: [1, 2, 1, 1], rows: [2, 2, 1, 2, 1, 2, 2], gap: 2, ramp: [CRICKET_BALL.r], lit: CRICKET_BALL.h },
];
const sum = a => a.reduce((s, v) => s + v, 0);
const edges = a => a.reduce((e, v) => (e.push(e.at(-1) + v), e), [0]);
const colsOf = (line, ch) => (ch === 'I' && line.icols) || line.cols;
const lineWidth = line => sum([...line.text].map(ch => sum(colsOf(line, ch)))) + line.gap * (line.text.length - 1);

/* the title flush right: every line's outline ends `right` preview px from the left edge, the first line's outline
   starts `top` px down, and each line sits LEAD logo px under the side of the one above */
function logo(right, top) {
  const w = OG_W / LOGO, h = OG_H / LOGO, fill = new Grid(w, h), at = new Grid(w, h), g = new Grid(w, h);
  const r = right / LOGO - 2 - DEPTH;   // the last fill column: the side and the outline lie to its right
  let y0 = top / LOGO + 1;
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
    for (let k = 1; k <= DEPTH; k++) if (isFill(x - k, y - k)) { g.set(x, y, TITLE_INK); break; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isFill(x, y)) continue;
    const { line, t } = at.get(x, y), n = line.ramp.length;
    g.set(x, y, !isFill(x, y - 1) ? line.lit : line.ramp[Math.max(0, Math.min(n - 1, Math.floor(t * n - .3 + (BAYER[(y & 3) * 4 + (x & 3)] - .5) * 1.2)))]);
  }
  return g.outline(TITLE_INK, true);
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

/* the title in the white at the upper right, the same SAFE margin to the top and the right edges. Set flush right, the
   broad GULLY over the narrower CRICKET steps in towards the corner, as the roofline below it does, so the title
   follows the diagonal edge of the scene with a band of white between. It must sit wholly on white: it may not
   touch a single pixel of the scene (the rooftop water tank sits just below the C of CRICKET) */
const title = logo(OG_W - SAFE, SAFE);
inSafe('title', boxOf(title));
for (let y = 0; y < title.h; y++) for (let x = 0; x < title.w; x++) {
  if (title.get(x, y) === null) continue;
  for (let v = 0; v < LOGO; v++) for (let u = 0; u < LOGO; u++)
    if (og.get(x * LOGO + u, y * LOGO + v) !== PAPER) throw new Error(`the title touches the scene at (${x * LOGO + u}, ${y * LOGO + v})`);
}
for (let y = 0; y < title.h; y++) for (let x = 0; x < title.w; x++) { const c = title.get(x, y); if (c !== null) og.rect(x * LOGO, y * LOGO, LOGO, LOGO, c); }
out('public/og.png', png(og));

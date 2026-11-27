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
   and scaled up by a whole number to exactly 1200×630, and the title is lettered on in ink. */
const OG_W = 1200, OG_H = 630, SAFE = 60;   // SAFE: kept clear around the title and the batter, for apps that crop

await import('./engine-node.js');
const { moment, play, render } = await import('../src/stories/harness/scenario.js');
const { G } = await import('../src/game/state.js');
const { project } = await import('../src/engine.js');
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

/* Pixel capitals for the title: 6×7 with two-pixel stems, drawn in ink on the 1200×630 grid at `unit` px a pixel */
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
const GAP = 1, SPACE = 3;
const textW = text => [...text].reduce((w, ch, i) => w + (ch === ' ' ? SPACE : GLYPHS[ch][0].length) + (i ? GAP : 0), 0);
// letter `text` with its top left at (x, y); returns its box on the output grid
function letter(g, text, x, y, unit, colour = INK) {
  let cx = 0;
  for (const ch of text) {
    if (ch === ' ') { cx += SPACE + GAP; continue; }
    GLYPHS[ch].forEach((row, j) => [...row].forEach((b, k) => { if (b === '#') g.rect(x + (cx + k) * unit, y + j * unit, unit, unit, colour); }));
    cx += GLYPHS[ch][0].length + GAP;
  }
  return { x0: x, y0: y, x1: x + textW(text) * unit, y1: y + 7 * unit };
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
const AFTER = .16, X0 = 162, Y0 = 70, SCALE = 5, UNIT = 8;   // close on the batter at ×5, the title in 8px pixels

const og = crop(frame(SIX, moment(SIX, 'contact', AFTER)), X0, Y0, SCALE);
inSafe('batter', batterBox(X0, Y0, SCALE));
// the title in two lines at the upper right, in the sky over the houses
const lineH = 7 * UNIT, lead = 3 * UNIT, right = OG_W - SAFE;
inSafe('title', letter(og, 'GULLY', right - textW('GULLY') * UNIT, SAFE, UNIT));
inSafe('title', letter(og, 'CRICKET', right - textW('CRICKET') * UNIT, SAFE + lineH + lead, UNIT));
out('public/og.png', png(og));

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
   and scaled up by a whole number to exactly 1200×630, and the title is lettered on in ink.
   Three candidates go to art-candidates/; OG_PICK chooses the one published as public/og.png. */
const OG_PICK = 1;
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

/* the scenarios: Australia (yellow) batting against Zimbabwe (red), fast bowling, a ball on the stumps */
const BALL = { seed: 1, you: 'aus', rival: 'zim', type: 'fast', line: 'stumps', move: 'none', length: 3.6 };
const SIX = { ...BALL, swing: { dir: 'NE', shot: 'air', timing: 'perfect' } };          // lofted into the house fronts
const CATCH = { ...BALL, swing: { dir: 'E', shot: 'air', timing: 'good' } };            // caught behind at fine

/* a candidate: scenario sc at `after` seconds past the ball reaching the bat, the frame's (x0, y0) corner at `scale`,
   and the title in ink on the paper around the lane: 'below' (one line, centred), 'left' (two lines at the lower
   left) or 'right' (two lines at the upper right) */
function candidate(name, { sc, after, x0, y0, scale, unit, title }) {
  const g = crop(frame(sc, moment(sc, 'contact', after)), x0, y0, scale);
  inSafe(name + ' batter', batterBox(x0, y0, scale));
  const lineH = 7 * unit, lead = 3 * unit, boxes = [];
  if (title === 'below') {
    const w = textW('GULLY CRICKET') * unit;
    boxes.push(letter(g, 'GULLY CRICKET', Math.round((OG_W - w) / 2 / scale) * scale, OG_H - SAFE - lineH, unit));
  } else if (title === 'left') {
    const top = OG_H - SAFE - 2 * lineH - lead;
    boxes.push(letter(g, 'GULLY', SAFE, top, unit), letter(g, 'CRICKET', SAFE, top + lineH + lead, unit));
  } else {
    const right = OG_W - SAFE;
    boxes.push(letter(g, 'GULLY', right - textW('GULLY') * unit, SAFE, unit), letter(g, 'CRICKET', right - textW('CRICKET') * unit, SAFE + lineH + lead, unit));
  }
  for (const b of boxes) inSafe(name + ' title', b);
  return g;
}
/* (The bowler's follow-through is over about 0.15 s after he lets go, and the ball takes 0.55 s to reach the bat, so
   no frame has both; these show the shot and what it led to.) */
const CANDIDATES = {
  // 1: the batter just after lofting the six, the bat up and the ball climbing towards the houses; the title in the sky
  1: () => candidate('og-1', { sc: SIX, after: .16, x0: 162, y0: 70, scale: 5, unit: 8, title: 'right' }),
  // 2: the same moment, the whole lane as the game shows it, floating on the page; the title at the lower left
  2: () => candidate('og-2', { sc: SIX, after: .16, x0: -28, y0: 33, scale: 3, unit: 9, title: 'left' }),
  // 3: a catch at fine: the ball in the fielder's hands and the fielding side's arms going up
  3: () => candidate('og-3', { sc: CATCH, after: .5, x0: 60, y0: 92, scale: 4, unit: 8, title: 'left' }),
};

for (const [k, make] of Object.entries(CANDIDATES)) {
  const g = make();
  out(`art-candidates/og-${k}.png`, png(g));
  if (+k === OG_PICK) out('public/og.png', png(g));
}

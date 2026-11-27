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

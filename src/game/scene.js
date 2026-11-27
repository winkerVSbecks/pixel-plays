// The lane baked once into the target's background buffers: ground, houses, props, trees and grass.
import {
  applyShadows, bakedPix, bakedZ, bakeOcclusion, bayerAt, box, capsule, capture, castShadow, clamp, COS, ctx,
  drawLeaves, drawTufts, flushShadows, GRASS, ground, groundZ, growGrass, growTree, H, hash, image, KIND_GRASS,
  kinds, leaves, lerp, noise, pendingShadows, pix, plot, R2, rampOf, rgb, setCapture, shadeEdges, shadowMask,
  sphere, staticShadow, STILL, unproject, W, WIND_FPS, zb,
} from '../engine.js';
import {
  ASPHALT, BACKSTOP, BOWL_LINE_X, BRICK, BRICK_X, BRICKWORK, CHALK, CHALK_DIM, CHALK_X, CHALK_Y, CREASE_X,
  DOOR_BLUE, DOOR_WOOD, EARTH, EDGE_X, EDGE_Y, GLASS, HOUSE_D, KIND_PATH, KIND_ROAD, MORTAR, PARAPET, PATCH,
  PATH_W, PITCH_Y, PLASTER_A, PLASTER_C, PLASTER_D, POT, POT_LEAF, RIM, ROOF, SHUTTER, SLAB, STONE, STUMPS_X,
  WALL_H_BACK, WALL_H_LEFT, WALL_X, WALL_Y,
} from './constants.js';

/* ---------- bake ---------- */
function chalky(i, fine) { return fine > .16 ? (fine > .8 ? CHALK_DIM : CHALK) : 0; }
function groundColor(x, y, ix, iy, i) {
  if (x < WALL_X || y < WALL_Y) return 0;
  // only the two near sides dissolve: a ragged, dithered edge into the white page
  const out = Math.max(x - EDGE_X, y - EDGE_Y) + (noise(x * 1.1, y * 1.1) - .5) * 1.3;
  const fine = hash(ix, iy);
  if (out > .9) return 0;
  if (out > -.5 && fine < (out + .5) / 1.4) return 0;
  if (out > -1.1) {
    // a crumbling verge of earth and weeds where the paving gives out
    kinds[i] = KIND_GRASS;
    const t = noise(x * 2, y * 2) * .9 + (fine - .5) * .4;
    if (t > .55) return rgb(...GRASS[clamp(Math.floor(t * 3), 1, 3)]);
    return rampOf(EARTH)[clamp(Math.floor(2 + t * 2 + (bayerAt(ix, iy) - .5) * .8), 1, 3)];
  }
  const ax = x - WALL_X, ay = y - WALL_Y;
  if (ax < PATH_W || ay < PATH_W) {
    kinds[i] = KIND_PATH;
    if (ax < .22 || ay < .22) {
      // weeds at the foot of the walls
      if (noise(x * 1.7, y * 1.7) > .5) kinds[i] = KIND_GRASS;
      return rgb(...SLAB[0]);
    }
    if (Math.abs(ax - PATH_W) < .08 && ay > PATH_W - .08 || Math.abs(ay - PATH_W) < .08 && ax > PATH_W - .08) return rgb(...PATCH[1]); // kerb edge
    const along = ax < PATH_W ? y : x, joint = (along + 40) % 1.4 < .07;
    if (joint) return rgb(...SLAB[0]);
    const t = .5 + (hash(Math.floor((along + 40) / 1.4), ax < PATH_W ? 1 : 2) - .5) * .5 + (noise(x * 1.4, y * 1.4) - .5) * .35;
    return rgb(...SLAB[clamp(Math.floor(t * 4 + (bayerAt(ix, iy) - .5) * .5), 0, 3)]);
  }
  kinds[i] = KIND_ROAD;
  // chalk: the batter's crease, the bowler's line, and the boundary along the open sides
  const py = Math.abs(y - PITCH_Y);
  if (Math.abs(x - CREASE_X) < .085 && py < 1.6) { const c = chalky(i, fine); if (c) return c; }
  if (Math.abs(x - BOWL_LINE_X) < .085 && py < 1.3) { const c = chalky(i, fine); if (c) return c; }
  if (Math.abs(x - CHALK_X) < .085 && y < CHALK_Y + .05 || Math.abs(y - CHALK_Y) < .085 && x < CHALK_X + .05) {
    const c = chalky(i, fine * (noise(x * 3, y * 3) > .2 ? 1 : .3)); if (c) return c;
  }
  // a scrawled hopscotch-style score box beside the drain
  const dx = x - 1.6, dy = y - 4.6;
  if (Math.abs(dx) < .6 && Math.abs(dy) < .6 && (Math.abs(Math.abs(dx) - .55) < .07 || Math.abs(Math.abs(dy) - .55) < .07)) return null;
  // iron drain cover
  if (Math.abs(dx) < .45 && Math.abs(dy) < .45) {
    const rim = Math.abs(dx) > .36 || Math.abs(dy) > .36, slot = (dx + 40) % .18 < .07;
    return rampOf([84, 80, 86])[rim ? 3 : slot ? 0 : 2];
  }
  // a chalk hopscotch grid off to the side of the bowler's end
  const hx = x + 9.6, hy = y - 3.6;
  if (hx > -.5 && hx < 3.1 && Math.abs(hy) < .5) {
    const cell = (hx + .5) / .9, edge = Math.abs(cell - Math.round(cell)) * .9 < .06 || Math.abs(Math.abs(hy) - .45) < .06;
    if (edge && fine > .25) return CHALK_DIM;
  }
  // a few fallen leaves blown in from the trees
  if (hash(ix * 5 + 1, iy * 3) > .996 && (x < -6 || y < -5)) return rgb(...(fine > .5 ? [168, 132, 62] : [120, 128, 64]));
  // cracks with weeds growing in them
  const crack = Math.abs(noise(x * .45 + 11, y * .45 + 3) - .5);
  if (crack < .014 && noise(x * .3 + 5, y * .3) > .42) {
    if (fine < .2) kinds[i] = KIND_GRASS;
    return rgb(...PATCH[0]);
  }
  // patches of newer, darker tarmac in a few cells
  const cx = Math.floor((x + 40) / 3.2), cy = Math.floor((y + 40) / 2.6);
  const fx = (x + 40) / 3.2 - cx, fy = (y + 40) / 2.6 - cy;
  const patched = hash(cx, cy) > .76 && fx > .15 && fx < .15 + hash(cx, cy + 9) * .7 && fy > .2 && fy < .85;
  // the strip down the pitch is worn smooth and pale
  const wear = Math.max(0, 1 - py / 1.3) * (x > BOWL_LINE_X - 1 && x < STUMPS_X + .5 ? .45 : 0);
  const t = .48 + (noise(x * .35, y * .35) - .5) * .55 + (fine - .5) * .14 + wear;
  if (fine > .992) return rgb(...ASPHALT[3]);
  return rgb(...(patched ? PATCH : ASPHALT)[clamp(Math.floor(t * 4 + (bayerAt(ix, iy) - .5) * .5), 0, 3)]);
}
// colour functions for a wall face, given position a along the wall and height z
function plaster(color, stain = 0) {
  const ramp = rampOf(color);
  return (a, z, base) => {
    let tone = base;
    if (noise(a * .6 + stain, z * .9) > .79) tone -= 1;            // weathered blotches
    if (z < .55 + noise(a * 1.4 + stain, 3) * .35) tone -= 1;      // damp line along the foot
    return ramp[clamp(tone, 0, 4)];
  };
}
function brickwork(a, z, base) {
  const fz = z / .34, course = Math.floor(fz), fa = a / .72 + (course % 2) * .5, block = Math.floor(fa);
  if (fz - course < .3 || fa - block < .14) return rampOf(MORTAR)[clamp(base - 1, 0, 4)];
  return rampOf(BRICKWORK)[clamp(base + (hash(block, course) > .75 ? 1 : 0) - (hash(block, course + 50) > .85 ? 1 : 0), 0, 4)];
}
// paint a rectangle on a wall face. side 'y' is the face at y = at (a runs along x); side 'x' is the face at x = at (a runs along y)
function paint(side, at, a0, a1, z0, z1, colorAt, base) {
  const step = .045;
  for (let a = a0; a <= a1; a += step) for (let z = z0; z <= z1; z += step) {
    const c = colorAt(a, z, base);
    if (c == null) continue;
    if (side === 'y') plot(a, at, z, c); else plot(at, a, z, c);
  }
}
function house(side, a0, a1, h, colorAt, seed, paintEnd) {
  const d0 = (side === 'y' ? WALL_Y : WALL_X) - HOUSE_D, d1 = d0 + HOUSE_D;
  const slab = (b0, b1, c0, c1, z0, z1, c, k) => side === 'y' ? box(b0, c0, z0, b1, c1, z1, c, k) : box(c0, b0, z0, c1, b1, z1, c, k);
  slab(a0, a1, d0, d1, 0, h, ROOF, seed);
  paint(side, d1 + .01, a0, a1, 0, h, colorAt, side === 'y' ? 3 : 2);
  // the open end of the row shows the same plaster
  if (paintEnd) paint(side === 'y' ? 'x' : 'y', a1 + .01, d0, d1, 0, h, colorAt, side === 'y' ? 2 : 3);
  // a low parapet round the flat roof, overhanging the front a little
  const rim = RIM;
  slab(a0, a1, d1 - .26, d1 + .1, h, h + PARAPET, rim, seed + 1);
  slab(a0, a1, d0, d0 + .22, h, h + PARAPET, rim, seed + 2);
  slab(a0, a0 + .22, d0, d1, h, h + PARAPET, rim, seed + 3);
  slab(a1 - .22, a1, d0, d1, h, h + PARAPET, rim, seed + 4);
}
function windowAt(side, c, z0, z1, shutters) {
  const at = (side === 'y' ? WALL_Y : WALL_X) + .06, hw = .5;
  paint(side, at - .03, c - hw - .1, c + hw + .1, z0 - .12, z1 + .1, () => rampOf(STONE)[side === 'y' ? 4 : 3]);
  paint(side, at, c - hw, c + hw, z0, z1, (a, z) => {
    const bar = Math.abs(a - c) < .03 || (z - z0) % .36 < .045;
    return rampOf(GLASS)[bar ? 3 : 1];
  });
  if (shutters) for (const s of [-1, 1]) paint(side, at + .02, c + s * hw + (s < 0 ? -.55 : 0), c + s * hw + (s > 0 ? .55 : 0), z0, z1, (a, z) => rampOf(SHUTTER)[(Math.floor((z - z0) / .14) % 2 ? 3 : 2) - (side === 'x' ? 1 : 0)]);
  // the sill
  if (side === 'y') box(c - hw - .15, WALL_Y, z0 - .2, c + hw + .15, WALL_Y + .18, z0 - .1, STONE, c | 0);
  else box(WALL_X, c - hw - .15, z0 - .2, WALL_X + .18, c + hw + .15, z0 - .1, STONE, c | 0);
}
function doorAt(side, c, color, stepColor) {
  const at = (side === 'y' ? WALL_Y : WALL_X) + .05, hw = .55, top = 2.25, ramp = rampOf(color);
  paint(side, at - .02, c - hw - .12, c + hw + .12, 0, top + .12, () => rampOf(STONE)[side === 'y' ? 3 : 2]);
  paint(side, at, c - hw, c + hw, .25, top, (a, z) => {
    const panel = Math.abs(a - c) < .04 || Math.abs(z - 1.3) < .04 || Math.abs(Math.abs(a - c) - hw) < .06;
    return ramp[(panel ? 1 : 3) - (side === 'x' ? 1 : 0)];
  });
  plot(side === 'y' ? c + hw - .18 : at + .02, side === 'y' ? at + .02 : c + hw - .18, 1.15, rgb(232, 196, 96)); // handle
  // the step out onto the footpath
  if (side === 'y') box(c - hw - .25, WALL_Y, 0, c + hw + .25, WALL_Y + .62, .26, stepColor, c | 0);
  else box(WALL_X, c - hw - .25, 0, WALL_X + .62, c + hw + .25, .26, stepColor, c | 0);
}
function wallShadow(side, a0, a1, h) {
  for (let a = a0; a <= a1; a += .45) for (let z = .3; z < h + PARAPET; z += .55) {
    if (side === 'y') castShadow(a, WALL_Y - .5, z, .5);
    else castShadow(WALL_X - .5, a, z, .5);
  }
}
function buildHouses() {
  // left side on screen: one pale green house with a shuttered window, a door and a chalked tally
  house('x', WALL_Y - HOUSE_D, 6.6, WALL_H_LEFT, plaster(PLASTER_D, 7), 1, true);
  windowAt('x', -3.6, 1.35, 2.75, true);
  doorAt('x', 2.6, DOOR_WOOD, STONE);
  paint('x', WALL_X + .07, -1.5, -.5, 1.2, 1.7, (a, z) => {
    const mark = (a + 1.5) % .16 < .05 || (Math.abs((z - 1.2) - (a + 1.5) * .45) < .04 && a < -.85);
    return mark && hash(a * 40 | 0, z * 40 | 0) > .2 ? CHALK : null;
  });
  // right side on screen: an ochre house, a bare brick house and a pink one
  house('y', WALL_X, -1.4, WALL_H_BACK, plaster(PLASTER_A, 2), 3);
  house('y', -1.4, 5.4, WALL_H_BACK - .3, brickwork, 5);
  house('y', 5.4, 12.8, WALL_H_BACK + .2, plaster(PLASTER_C, 4), 7, true);
  windowAt('y', -8.4, 1.35, 2.75, true);
  doorAt('y', -4, DOOR_BLUE, STONE);
  windowAt('y', 1.4, 1.5, 2.6, false);
  windowAt('y', 3.8, 1.5, 2.6, false);
  doorAt('y', 7.2, DOOR_WOOD, STONE);
  windowAt('y', 10.2, 1.35, 2.75, true);
  // a black water tank on the pink house's roof and a meter box on the brick
  for (let a = 0; a < 6.283; a += .03) for (let z = WALL_H_BACK + .55; z <= WALL_H_BACK + 1.5; z += .04) {
    const nx = Math.cos(a), ny = Math.sin(a), lit = clamp(Math.round(2.4 - .7 * nx + .9 * ny), 0, 4);
    plot(9.4 + nx * .6, -8.6 + ny * .6, z, rampOf([58, 60, 66])[lit]);
  }
  for (let a = 0; a < 6.283; a += .05) for (let q = 0; q < .6; q += .04) plot(9.4 + Math.cos(a) * q, -8.6 + Math.sin(a) * q, WALL_H_BACK + 1.5, rampOf([58, 60, 66])[3]);
  castShadow(9.4, -8.6, WALL_H_BACK + 1, .65);
  box(.1, WALL_Y, 1.9, .6, WALL_Y + .2, 2.6, [200, 196, 186], 11);
  wallShadow('x', WALL_Y, 6.6, WALL_H_LEFT);
  wallShadow('y', WALL_X, 12.8, WALL_H_BACK);
}
// a terracotta pot whose leaves sway with the wind (their sway height is lifted so low pots still move)
function potPlant(x, y, r, seed) {
  box(x - r * .75, y - r * .75, 0, x + r * .75, y + r * .75, r * 1.3, POT, seed);
  castShadow(x, y, r * .7, r * .9);
  for (let n = 0; n < 16; n++) {
    const a = hash(n, seed) * 6.283, d = Math.sqrt(hash(n, seed + 1)) * r * 1.05, z = r * 1.55 + hash(n, seed + 2) * r * 1.2;
    setCapture([]);
    sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, z, .17 + hash(n, seed + 3) * .1, POT_LEAF[(hash(n, seed + 4) * 3) | 0], 'rough');
    leaves.push({ x, y, z: 4.4, k: 2 * n + 1, r: .2, pixels: capture });
    setCapture(null);
    castShadow(x + Math.cos(a) * d, y + Math.sin(a) * d, z, .2);
  }
}
function drum(x, y, r, h, color, ribs) {
  const ramp = rampOf(color), step = .04;
  for (let a = 0; a < 6.283; a += .025) for (let z = 0; z <= h; z += step) {
    const nx = Math.cos(a), ny = Math.sin(a);
    let tone = Math.round(2.3 + .9 * nx + .7 * ny - .4);
    if (ribs && ribs.some(rz => Math.abs(z - rz) < .045)) tone += 1;
    plot(x + nx * r, y + ny * r, z, ramp[clamp(tone, 0, 4)]);
  }
  for (let a = 0; a < 6.283; a += .05) for (let q = 0; q < r; q += step) plot(x + Math.cos(a) * q, y + Math.sin(a) * q, h, ramp[q > r - .08 ? 4 : 3]);
  for (let z = .2; z <= h; z += .3) castShadow(x, y, z, r);
}
function scooter(x, y) {
  const body = [190, 64, 52], dark = [44, 42, 48], chrome = [206, 206, 200];
  for (const wx of [x - .55, x + .62]) capsule([wx, y - .1, .24], [wx, y + .1, .24], .24, .24, () => dark, 'solid');
  capsule([x - .65, y, .55], [x + .2, y, .5], .3, .26, () => body, 'solid');
  box(x - .75, y - .2, .78, x - .05, y + .2, .9, [52, 46, 44], 21);
  capsule([x + .2, y, .28], [x + .5, y, .3], .2, .2, () => body, 'solid');
  capsule([x + .62, y, .3], [x + .72, y, 1.15], .16, .12, () => body, 'solid');
  capsule([x + .74, y - .38, 1.22], [x + .74, y + .38, 1.22], .05, .05, () => chrome, 'solid');
  sphere(x + .82, y, 1.12, .1, [250, 238, 196], 'gloss');
  for (let k = -.7; k <= .8; k += .25) castShadow(x + k, y, .55, .35);
  castShadow(x + .72, y, 1, .2);
}
// a stray asleep against the brick house, curled up out of the way
function dog(x, y) {
  const coat = () => [196, 150, 96];
  capsule([x - .45, y, .26], [x + .3, y + .05, .24], .26, .22, coat, 'solid');
  sphere(x + .55, y + .16, .22, .17, [196, 150, 96], 'solid');
  capsule([x + .62, y + .26, .2], [x + .78, y + .3, .16], .07, .06, () => [150, 108, 70], 'solid');
  capsule([x - .6, y + .05, .16], [x - .5, y + .4, .08], .06, .05, coat, 'solid');
  for (let k = -.5; k <= .5; k += .25) castShadow(x + k, y, .25, .28);
}
function bicycle(y, lean) {
  const steel = rgb(226, 82, 64), tyre = rgb(40, 38, 44), x0 = WALL_X + .3;
  const X = z => x0 + (1.1 - z) * lean;
  const ring = (cy) => {
    for (let a = 0; a < 6.283; a += .02) {
      const z = .38 + Math.sin(a) * .38;
      plot(X(z), cy + Math.cos(a) * .38, z, tyre);
    }
  };
  ring(y - .58); ring(y + .58);
  const line = (y0, z0, y1, z1) => { for (let t = 0; t <= 1; t += .015) { const z = lerp(z0, z1, t); plot(X(z), lerp(y0, y1, t), z, steel); plot(X(z), lerp(y0, y1, t), z + .04, steel); } };
  line(y - .58, .38, y - .05, .38); line(y - .05, .38, y + .3, .95); line(y + .3, .95, y - .3, .95); line(y - .3, .95, y - .05, .38);
  line(y - .3, .95, y - .58, .38); line(y + .3, .95, y + .58, .38); line(y + .3, .95, y + .32, 1.18);
  line(y + .2, 1.18, y + .45, 1.18); line(y - .4, 1.05, y - .15, 1.05);
  for (let k = -.8; k <= .8; k += .3) castShadow(x0, y + k, .5, .35);
}
// a slack line strung between the two houses with a few pieces of washing pegged to it
function washingLine() {
  const a = [WALL_X, -.6, 3.65], b = [-6.8, WALL_Y, 3.75], rope = rgb(234, 230, 220);
  const at = t => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - Math.sin(t * Math.PI) * .32];
  for (let t = 0; t <= 1; t += .004) { const p = at(t); plot(p[0], p[1], p[2], rope); }
  for (let t = 0; t <= 1; t += .04) { const p = at(t); castShadow(p[0], p[1], p[2], .05, 1, 0); }
  const cloths = [[.2, .32, .9, [238, 120, 92]], [.36, .22, .6, [246, 244, 232]], [.52, .3, 1.05, [92, 148, 176]], [.7, .2, .5, [246, 204, 92]]];
  const dir = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...dir), ux = dir[0] / len, uy = dir[1] / len;
  for (const [t, half, drop, color] of cloths) {
    const p = at(t), ramp = rampOf(color);
    for (let s = -half * len / 10; s <= half * len / 10; s += .035) for (let d = 0; d <= drop; d += .035) {
      const wave = Math.sin(s * 5 + t * 9) * .06;
      plot(p[0] + ux * s - uy * wave, p[1] + uy * s + ux * wave, p[2] - d, ramp[clamp(3 + Math.round(Math.cos(s * 5 + t * 9)), 2, 4)]);
    }
    for (let s = -half * len / 10; s <= half * len / 10; s += .3) castShadow(p[0] + ux * s, p[1] + uy * s, p[2] - drop / 2, .3);
  }
}
export function bake() {
  zb.fill(-1e9);
  pix.fill(rgb(255, 255, 255));
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const g = unproject(ix + .5, iy + .5), i = iy * W + ix;
    let c = groundColor(g.x, g.y, ix, iy, i);
    if (c === null) c = chalky(i, hash(ix, iy)) || rgb(...ASPHALT[1]);
    if (!c) continue;
    pix[i] = c; ground[i] = 1;
    zb[i] = (g.x + g.y) / R2 * COS;
  }
  growGrass();
  groundZ.set(zb);

  growTree(-5.6, -10.7, 1.1, 320);
  growTree(-14.9, 3.8, .95, 260, 500);
  buildHouses();
  washingLine();
  potPlant(-10.6, WALL_Y + .45, .38, 3);
  potPlant(-9.7, WALL_Y + .42, .32, 5);
  potPlant(-2.8, WALL_Y + .95, .3, 7);
  potPlant(WALL_X + .45, 4.4, .4, 9);
  potPlant(11.6, WALL_Y + .45, .36, 11);
  drum(WALL_X + .75, WALL_Y + .75, .5, 1.15, [64, 118, 172], [.3, .85]);
  scooter(2.4, WALL_Y + .7);
  bicycle(-1.1, .12);
  dog(4.7, WALL_Y + .62);
  drum(BACKSTOP.x, BACKSTOP.y, BACKSTOP.r, BACKSTOP.h, [150, 70, 48], [.25, .75]);
  box(BRICK_X - BRICK.w / 2, PITCH_Y - BRICK.l / 2, 0, BRICK_X + BRICK.w / 2, PITCH_Y + BRICK.l / 2, BRICK.h, BRICKWORK, 40);
  castShadow(BRICK_X, PITCH_Y, .08, .3);
  // the two kids watching from the blue door's step are drawn per frame (they cheer boundaries), see drawKids()
  pendingShadows.length = 0;
  flushShadows();
  bakeOcclusion();
  staticShadow.set(shadowMask);
  applyShadows(groundZ);

  bakedPix.set(pix);
  bakedZ.set(zb);
}
/* the baked lane on its own, with no figures or ball: the frame draw() starts from, with the wind at time t (seconds)
   and the same shadow and edge passes. For a canvas that only shows the ground, such as a story */
export function drawGround(t = 0) {
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;
  const windT = STILL ? 0 : Math.floor(t * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  flushShadows();
  applyShadows(bakedZ);
  shadeEdges();
  ctx.putImageData(image, 0, 0);
}

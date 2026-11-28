// "How the engine draws a frame": a 120×90 miniature of engine.js's pipeline (depth buffer, light ramp, Bayer
// dither, cast shadows, depth edges), each pass switchable, with views of the depth buffer and the shadow mask.
// It re-implements the passes at a small size so they can be toggled; it does not call the game's engine.
import { player, widget } from './dom.js';
import './renderer.css';

const MARKUP = `
<div class="visual-controls">
  <label class="visual-field" style="min-width:180px">View
    <select data-role="view">
      <option value="color">Final colour</option>
      <option value="depth">Depth buffer</option>
      <option value="shadow">Shadow mask</option>
    </select>
  </label>
  <label class="visual-field" style="min-width:200px">Ball height
    <input data-role="height" type="range" min="0" max="3" step="0.05" value="1.2">
  </label>
  <button data-role="play" class="play" type="button">Play</button>
</div>
<div class="stage">
  <canvas data-role="canvas" width="120" height="90" role="img" aria-label="Mini version of the game's renderer: paving, a brick stack, a batter and a tennis ball"></canvas>
  <div>
    <div class="steps" role="group" aria-label="Pipeline passes (click to switch off)">
      <button type="button" data-k="depth" aria-pressed="true"><b>1</b>Depth buffer</button>
      <button type="button" data-k="ramp" aria-pressed="true"><b>2</b>Light ramp (5 tones)</button>
      <button type="button" data-k="dither" aria-pressed="true"><b>3</b>Bayer dither</button>
      <button type="button" data-k="shadow" aria-pressed="true"><b>4</b>Cast shadows</button>
      <button type="button" data-k="edges" aria-pressed="true"><b>5</b>Depth edges</button>
    </div>
    <p class="visual-note explain" data-role="why" aria-live="polite">Click a pass to switch it off and see what it does.</p>
  </div>
</div>`;

const WHY = {
  depth: 'Off: no z-test, so draw order wins. The bricks are drawn last and now cover the ball even when it is in front of them. On: each pixel keeps the nearest depth d = v·cos30° + z·sin30°.',
  ramp: 'Off: one flat colour per object, no form. On: light from upper-left picks one of 5 tones; darks drift violet, lights drift warm yellow.',
  dither: 'Off: hard bands between tones. On: a 4×4 Bayer threshold breaks band edges into a pixel pattern. Figures skip it so they stay crisp.',
  shadow: 'Off: objects float. On: every part is projected along the sun (x+0.9z, y−0.6z) onto the ground into a mask, then ground pixels under it are tinted violet.',
  edges: 'Off: shapes blur into each other. On: pixels next to the ground darken (a silhouette); pixels in front of something farther get a warm rim.',
};

const W = 120, H = 90, S = 12, SIN = .5, COS = Math.sqrt(3) / 2, R2 = Math.SQRT2, OX = W / 2, OY = H / 2 - 6, SX = .9, SY = -.6;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16), bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const COOL = [46, 38, 84], WARM = [255, 232, 180];
const rgb = (r, g, b) => (255 << 24 | Math.min(255, b | 0) << 16 | Math.min(255, g | 0) << 8 | Math.min(255, r | 0)) >>> 0;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const proj = (x, y, z) => { const u = (x - y) / R2, v = (x + y) / R2; return { sx: OX + u * S, sy: OY + (v * SIN - z * COS) * S, d: v * COS + z * SIN }; };
const ramps = new Map();
function ramp(c) {
  const k = c.join();
  if (ramps.has(k)) return ramps.get(k);
  const m = (s, t, f) => rgb(lerp(c[0] * s, t[0], f), lerp(c[1] * s, t[1], f), lerp(c[2] * s, t[2], f));
  const r = [m(.4, COOL, .34), m(.62, COOL, .18), m(.84, COOL, .05), m(1, WARM, 0), m(1.1, WARM, .22)];
  ramps.set(k, r);
  return r;
}

export function rendererWidget() {
  const { root, $ } = widget('eng', MARKUP);
  const cv = $('canvas'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), pix = new Uint32Array(img.data.buffer);
  const zb = new Float32Array(W * H), gz = new Float32Array(W * H), mask = new Uint8Array(W * H);
  const on = { depth: true, ramp: true, dither: true, shadow: true, edges: true };
  let ballZ = 1.2, t = 0;

  const tone = (r, l, ix, iy, solid) => {
    if (!on.ramp) return r[3];
    let v = l * 4.4 + .2;
    if (on.dither && !solid) v += (bay(ix, iy) - .5) * .7;
    return r[clamp(Math.floor(v), solid ? 1 : 0, 4)];
  };
  function put(i, d, c) { if (on.depth && d <= zb[i]) return; zb[i] = d; pix[i] = c; }
  function sphere(x, y, z, r, c, solid) {
    const R = ramp(c), p = proj(x, y, z), rp = Math.max(r * S, .75);
    for (let iy = Math.max(0, Math.floor(p.sy - rp)); iy <= Math.min(H - 1, Math.ceil(p.sy + rp)); iy++) {
      for (let ix = Math.max(0, Math.floor(p.sx - rp)); ix <= Math.min(W - 1, Math.ceil(p.sx + rp)); ix++) {
        const dx = (ix + .5 - p.sx) / rp, dy = (iy + .5 - p.sy) / rp, nn = dx * dx + dy * dy;
        if (nn > 1) continue;
        const nz = Math.sqrt(1 - nn), l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
        put(iy * W + ix, p.d + r * nz, tone(R, l, ix, iy, solid));
      }
    }
  }
  function capsule(a, b, r, c) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (r * .45));
    for (let k = 0; k <= n; k++) { const u = k / n; sphere(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u), r, c, true); }
  }
  function box(x0, y0, z0, x1, y1, z1, c) {
    const R = ramp(c), st = .05;
    const paint = (x, y, z, base) => {
      const p = proj(x, y, z), ix = p.sx | 0, iy = p.sy | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
      const v = on.ramp ? base + (on.dither ? (bay(ix, iy) - .5) * .5 : 0) : 3;
      put(iy * W + ix, p.d, R[clamp(Math.floor(v), 0, 4)]);
    };
    for (let a = x0; a <= x1; a += st) for (let b = y0; b <= y1; b += st) paint(a, b, z1, 3.4);
    for (let a = x0; a <= x1; a += st) for (let b = z0; b <= z1; b += st) paint(a, y1, b, 2.3);
    for (let a = y0; a <= y1; a += st) for (let b = z0; b <= z1; b += st) paint(x1, a, b, 1.2);
  }
  function shadow(x, y, z, r) {
    if (!on.shadow) return;
    const p = proj(x + SX * z, y + SY * z, 0), rx = r * S * 1.05, ry = rx * SIN + 1;
    for (let iy = Math.max(0, Math.floor(p.sy - ry)); iy <= Math.min(H - 1, Math.ceil(p.sy + ry)); iy++) {
      for (let ix = Math.max(0, Math.floor(p.sx - rx)); ix <= Math.min(W - 1, Math.ceil(p.sx + rx)); ix++) {
        const dx = (ix + .5 - p.sx) / rx, dy = (iy + .5 - p.sy) / ry;
        if (dx * dx + dy * dy + (on.dither ? (bay(ix, iy) - .5) * .4 : 0) > 1) continue;
        mask[iy * W + ix] = 1;
      }
    }
  }
  const tint = (i, r, g, b) => { const c = pix[i]; pix[i] = rgb((c & 255) * r, (c >> 8 & 255) * g, (c >> 16 & 255) * b); };

  function render() {
    const AS = ramp([128, 122, 120]);
    mask.fill(0);
    // the paving: one pixel at a time, unprojected to the ground, with its depth kept as the ground depth
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix, u = (ix + .5 - OX) / S, v = (iy + .5 - OY) / (S * SIN), x = (u + v) / R2, y = (v - u) / R2;
      const edge = Math.max(Math.abs(x) / 3.3, Math.abs(y) / 3.3) + (hash(ix, iy) - .5) * .12;
      if (edge > 1) { pix[i] = 0xffffffff; zb[i] = -1e9; gz[i] = -1e9; continue; }
      const n = hash(Math.floor(x * 3), Math.floor(y * 3));
      let tt = on.ramp ? 2.6 + (n - .5) * .9 : 3;
      if (on.ramp && on.dither) tt += (bay(ix, iy) - .5) * .6;
      pix[i] = AS[clamp(Math.floor(tt), 0, 4)];
      zb[i] = gz[i] = v * COS;
    }
    const KIT = [232, 196, 64], SKIN = [196, 146, 110], BRICK = [166, 82, 60], BALL = [216, 236, 72], LEGS = [60, 60, 80];
    // draw order: figure, ball, bricks. With no depth buffer, whatever is drawn last wins
    const fx = 1.3, fy = -.9;
    capsule([fx, fy - .18, 0], [fx, fy - .12, .9], .17, LEGS);
    capsule([fx, fy + .18, 0], [fx, fy + .12, .9], .17, LEGS);
    capsule([fx, fy, 1], [fx, fy, 1.75], .3, KIT);
    sphere(fx, fy, 2.15, .26, SKIN, true);
    capsule([fx, fy + .3, 1.6], [fx - .5, fy + .5, 1.1], .12, KIT);
    shadow(fx, fy, .2, .35); shadow(fx, fy, 1.2, .38); shadow(fx, fy, 2.1, .28);
    const bx = -.75 + Math.sin(t) * .9, by = 1.05;
    sphere(bx, by, ballZ + .22, .22, BALL, false);
    shadow(bx, by, ballZ, .22);
    box(-1.7, -.2, 0, -1.0, .5, 1.3, BRICK);
    for (let z = 0; z <= 1.3; z += .2) shadow(-1.35, .15, z, .5);
    // shadows tint only pixels that still show the ground
    if (on.shadow) for (let i = 0; i < W * H; i++) if (mask[i] && zb[i] === gz[i]) tint(i, .54, .52, .72);
    if (on.edges) for (let iy = 1; iy < H - 1; iy++) for (let ix = 1; ix < W - 1; ix++) {
      const i = iy * W + ix, d = zb[i];
      if (d < -1e8 || d === gz[i]) continue;
      const a = i - W, b = i + W, c = i - 1, e = i + 1;
      if (zb[a] === gz[a] || zb[b] === gz[b] || zb[c] === gz[c] || zb[e] === gz[e]) tint(i, .62, .6, .72);
      else if (d - zb[a] - COS / (S * SIN) > .28 || d - zb[c] > .28) {
        const p = pix[i];
        pix[i] = rgb(lerp(p & 255, 255, .3), lerp(p >> 8 & 255, 232, .3), lerp(p >> 16 & 255, 180, .22));
      }
    }
    const view = $('view').value;
    if (view === 'depth') {
      let lo = 1e9, hi = -1e9;
      for (const d of zb) if (d > -1e8) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
      for (let i = 0; i < W * H; i++) {
        const d = zb[i];
        if (d < -1e8) { pix[i] = 0xffffffff; continue; }
        const g = 20 + (d - lo) / (hi - lo || 1) * 220;
        pix[i] = rgb(g * .55, g * .75, g);
      }
    }
    if (view === 'shadow') for (let i = 0; i < W * H; i++) pix[i] = mask[i] ? rgb(70, 60, 130) : zb[i] < -1e8 ? 0xffffffff : rgb(225, 222, 215);
    ctx.putImageData(img, 0, 0);
  }

  root.querySelectorAll('.steps button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    on[k] = !on[k];
    b.setAttribute('aria-pressed', on[k]);
    $('why').textContent = WHY[k];
    render();
  }));
  $('view').addEventListener('change', render);
  $('height').addEventListener('input', e => { ballZ = +e.target.value; render(); });
  player(root, $('play'), dt => { t += dt; render(); });
  render();
  return root;
}

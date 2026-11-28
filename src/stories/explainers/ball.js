// "How the ball and fielders work": a hit ball stepped like ball.js stepBall() (gravity, bounce, skid, roll, the
// verge past the chalk, the house fronts) and a look-ahead like fielding.js planChase(), on the lane seen from the
// game's camera, with a height-over-time chart and the outcome. A simplification: no props, no wall rebounds (the
// first wall ends the ball, as in the game), no scatter and no drops. It does not call the game's modules.
import { player, widget } from './dom.js';
import './ball.css';

const MARKUP = `
<div class="visual-controls" role="group" aria-label="Shot type">
  <button type="button" data-p="ground" aria-pressed="false">Grounded shot</button>
  <button type="button" data-p="air" aria-pressed="true">Aerial shot</button>
</div>
<div class="visual-grid">
  <label class="visual-field">Aim <output data-role="aimv" class="readout"></output>
    <input data-role="aim" type="range" min="-80" max="80" step="1" value="-45" aria-label="Aim, degrees from straight"></label>
  <label class="visual-field">Speed off the bat <output data-role="spdv" class="readout"></output>
    <input data-role="spd" type="range" min="4" max="18" step=".1" value="10.5" aria-label="Speed off the bat"></label>
  <label class="visual-field">Climb <output data-role="liftv" class="readout"></output>
    <input data-role="lift" type="range" min="-10" max="55" step="1" value="30" aria-label="Climb, degrees"></label>
</div>
<svg class="map" data-role="map" viewBox="-310 -144 620 328" role="img" aria-label="The lane seen from the game camera, with the ball's path and the fielders"></svg>
<div class="legend"><span><i style="background:var(--chart-1)"></i>on the full (catchable)</span><span><i style="background:var(--chart-3)"></i>after a bounce, or a clean grounded shot (only fielded)</span><span><i style="background:var(--chart-2)"></i>fielder who gets there</span></div>
<svg class="side" data-role="side" viewBox="0 0 620 120" role="img" aria-label="Ball height over time"></svg>
<div class="visual-controls">
  <button data-role="play" class="play" type="button">Play</button>
  <input data-role="t" class="scrub" type="range" min="0" max="1" step=".001" value="1" aria-label="Time after the hit">
  <output data-role="tv" class="readout"></output>
</div>
<p class="res" data-role="res" aria-live="polite"></p>
<p class="visual-note why" data-role="why"></p>`;

const NS = 'http://www.w3.org/2000/svg';
// from src/game/constants.js (and the 1-star values in difficulty.js)
const G = 12, R = .2, DT = 1 / 240, BOUNCE = .45, SKID = .8, BMIN = 1.2, ROLL = 3.2, VERGE = 14;
const WX = -12.6, WY = -7.6, CX = 11.6, CY = 5.9, EX = 13.4, EY = 7.5;
const REACT = .25, RUN = 5, GR = .6, GZ = 1.5, CREACT = .3, CRUN = 4.6, CR = .85, CZ = 2.7, RUNS = [4, 6, 8.5];
const BOWLER_R = .4, BOWLER_Z = 1.1, BOWLER_HOT = 7;
const wallTop = (s, a) => (s === 'x' ? 4.55 : a < -1.4 ? 4.55 : a < 5.4 ? 4.25 : 4.75);
const BAT = { x: 7.5, y: -.8 };
// the "ring" placing, named for the left-handed batter the game uses
const sp = (n, k, r) => { const a = (225 + 45 * k) * Math.PI / 180; return { n, x: BAT.x + Math.cos(a) * r, y: BAT.y + Math.sin(a) * r }; };
const FIELD = [sp('midwicket', .5, 4.5), sp('backward square', 1.5, 4.5), { n: 'fine', x: 11.1, y: -2 }, sp('point', 5, 6), sp('deep cover', 6, 6.5), { n: 'bowler', x: -3, y: -.55, bowler: true }];
// screen projection, as engine.js project(): u across, v down, z up
const P = (x, y, z = 0) => [(x - y) / Math.SQRT2, ((x + y) / Math.SQRT2) * .5 - z * .866];
const pl = arr => arr.map(q => P(...q).join(',')).join(' ');

function simulate(shot, aim, spd, lift) {
  const a = Math.PI + aim * Math.PI / 180, l = lift * Math.PI / 180;
  const b = { x: BAT.x, y: BAT.y, z: .9, vx: Math.cos(a) * Math.cos(l) * spd, vy: Math.sin(a) * Math.cos(l) * spd, vz: Math.sin(l) * spd, t: 0, touched: false };
  const pts = [], bounces = [];
  let ev = null, catcher = null;
  while (b.t < 8) {
    b.t += DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.vz -= G * DT;
    const past = b.x > CX || b.y > CY;
    if (b.z < R) {
      b.z = R;
      if (b.vz < -BMIN) { b.vz *= -BOUNCE; b.vx *= SKID; b.vy *= SKID; b.touched = true; bounces.push({ x: b.x, y: b.y }); }
      else {
        b.vz = 0; b.touched = true;
        const s = Math.hypot(b.vx, b.vy), n = Math.max(0, s - (past ? VERGE : ROLL) * DT);
        if (s > 0) { b.vx *= n / s; b.vy *= n / s; }
      }
    }
    // a clean grounded shot is gathered as if it had bounced, even on the full
    const full = !b.touched && shot === 'air';
    pts.push({ x: b.x, y: b.y, z: b.z, t: b.t, full });
    for (const side of ['x', 'y']) {
      const pos = side === 'x' ? b.x : b.y, face = side === 'x' ? WX : WY;
      if (pos > face + R) continue;
      const top = wallTop(side, side === 'x' ? b.y : b.x);
      ev = { how: b.z - R > top && shot === 'air' ? 'over' : 'wall', touched: b.touched };
      break;
    }
    if (!ev && past) ev = { how: 'chalk', touched: b.touched };
    if (ev) break;
    // planChase: who can be there by now? After the reaction delay a fielder's reach grows at his running speed
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    for (const f of FIELD) {
      let run, reach, zMax;
      if (f.bowler) {
        // the bowler stops only a ball slower than 7, and never runs for one on the full
        if (speed > BOWLER_HOT) continue;
        run = full ? 0 : Math.max(0, b.t - REACT) * RUN; reach = full ? BOWLER_R : GR; zMax = full ? BOWLER_Z : GZ;
      } else {
        run = full ? Math.max(0, b.t - CREACT) * CRUN : Math.max(0, b.t - REACT) * RUN; reach = full ? CR : GR; zMax = full ? CZ : GZ;
      }
      if (b.z > zMax) continue;
      if (Math.hypot(f.x - b.x, f.y - b.y) <= run + reach) {
        catcher = { f, t: b.t, x: b.x, y: b.y, full, touched: b.touched, react: full ? (f.bowler ? b.t : CREACT) : REACT, speed: full ? CRUN : RUN, reach };
        break;
      }
    }
    if (catcher) break;
    if (b.vx === 0 && b.vy === 0 && b.vz === 0) break;
  }
  let out;
  if (catcher) {
    const dist = Math.hypot(catcher.x - BAT.x, catcher.y - BAT.y), r = RUNS.findIndex(x => dist < x), runs = r < 0 ? 3 : r;
    const runsWhy = `Runs depend on how far from the bat it was stopped: ${dist.toFixed(1)} m (under 4 m is 0, then 1, 2, and 3 beyond 8.5 m).`;
    if (catcher.full && !catcher.f.bowler) {
      out = { txt: `Caught by ${catcher.f.n}`, out: true, why: 'It reached him on the full, below 2.7 m and within 0.85 m of where he could run to: a catch. (A catch faster than 10 m/s is dropped 15% of the time.)' };
    } else {
      const lead = catcher.full ? 'The bowler stops it where he stands; below 3 stars he never catches one off his own bowling. '
        : shot === 'ground' && !catcher.touched ? 'A clean grounded shot can never be caught, so he only fields it. ' : '';
      out = { txt: `Fielded by ${catcher.f.n}: ${runs} run${runs === 1 ? '' : 's'}`, why: lead + runsWhy };
    }
  } else if (ev) {
    if (ev.how === 'over') out = { txt: 'Over the wall: out', out: true, why: 'It cleared the parapet of a house front without touching anything first: lost in the neighbour’s yard, so the batter is out.' };
    else {
      const six = !ev.touched && shot === 'air';
      out = { txt: six ? 'Six' : 'Four', why: `Reached the ${ev.how === 'wall' ? 'house wall' : 'chalk line'} ${ev.touched ? 'after a bounce' : 'on the full'}${shot === 'ground' ? ' (a grounded shot is worth at most 4)' : ''} before anyone could get there.` };
    }
  } else out = { txt: 'Stopped', why: 'The ball rolled to a stop.' };
  return { pts, bounces, catcher, out };
}

export function ballWidget() {
  const { root, $ } = widget('bp', MARKUP);
  let shot = 'air', aim = -45, spd = 10.5, lift = 30, tn = 1;
  function el(n, a, p) {
    const e = document.createElementNS(NS, n);
    for (const k in a) e.setAttribute(k, a[k]);
    p.appendChild(e);
    return e;
  }
  function draw() {
    const S = simulate(shot, aim, spd, lift), root2 = $('map'), side = $('side');
    root2.replaceChildren(); side.replaceChildren();
    const map = el('g', { transform: 'scale(20)' }, root2);
    const label = (x, y, txt) => { el('text', { x: x * 20, y: y * 20, class: 'lbl', 'font-size': 11 }, root2).textContent = txt; };
    const T = S.pts.length ? S.pts[S.pts.length - 1].t : 0, tt = tn * T;
    // the lane: house fronts along the two far sides, the chalk line across the open near sides
    el('polygon', { points: pl([[WX, WY], [EX, WY], [EX, EY], [WX, EY]]), fill: 'currentColor', opacity: .06 }, map);
    el('polyline', { points: pl([[EX, WY], [WX, WY], [WX, EY]]), fill: 'none', stroke: 'currentColor', 'stroke-width': .18, opacity: .5 }, map);
    el('polyline', { points: pl([[CX, WY], [CX, CY], [WX, CY]]), fill: 'none', stroke: 'currentColor', 'stroke-width': .06, 'stroke-dasharray': '.25 .2', opacity: .6 }, map);
    const lw = P(WX + .2, WY + 5), lc = P(CX - 4.2, CY + .1);
    label(lw[0], lw[1], 'house fronts (walls)');
    label(lc[0], lc[1] + .9, 'chalk line');
    // the ball's path up to now, with its shadow on the ground
    const shown = S.pts.filter(p => p.t <= tt);
    for (let i = 0; i < shown.length; i += 6) {
      const p = shown[i], g = P(p.x, p.y, 0), q = P(p.x, p.y, p.z);
      el('circle', { cx: g[0], cy: g[1], r: .06, fill: 'currentColor', opacity: .18 }, map);
      el('circle', { cx: q[0], cy: q[1], r: .11, fill: p.full ? 'var(--chart-1)' : 'var(--chart-3)' }, map);
    }
    for (const bb of S.bounces) { const q = P(bb.x, bb.y); el('circle', { cx: q[0], cy: q[1], r: .22, fill: 'none', stroke: 'var(--chart-3)', 'stroke-width': .06 }, map); }
    // the fielders; the one who gets there moves after his reaction delay
    for (const f of FIELD) {
      let x = f.x, y = f.y;
      const c = S.catcher && S.catcher.f === f ? S.catcher : null;
      if (c) {
        const go = Math.max(0, Math.min(tt, c.t) - c.react) * c.speed, dx = c.x - f.x, dy = c.y - f.y, d = Math.hypot(dx, dy), m = Math.max(0, Math.min(go, d - c.reach * .6));
        if (d > 0) { x = f.x + dx / d * m; y = f.y + dy / d * m; }
        const a = P(f.x, f.y), b = P(c.x, c.y);
        el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--chart-2)', 'stroke-width': .07, 'stroke-dasharray': '.2 .15' }, map);
        // how far he can have got by the moment of the gather: the reaction delay, then running, plus his reach
        const rr = Math.max(0, c.t - c.react) * c.speed + c.reach, o = P(f.x, f.y);
        el('ellipse', { cx: o[0], cy: o[1], rx: rr, ry: rr * .5, fill: 'var(--chart-2)', opacity: .08, stroke: 'var(--chart-2)', 'stroke-width': .04 }, map);
      }
      const p = P(x, y);
      el('circle', { cx: p[0], cy: p[1] - .35, r: .3, fill: c ? 'var(--chart-2)' : 'currentColor', opacity: c ? 1 : .55 }, map);
      label(p[0] + .45, p[1] - .15, f.n);
    }
    const bp = P(BAT.x, BAT.y);
    el('rect', { x: bp[0] - .25, y: bp[1] - 1, width: .5, height: 1, rx: .2, fill: 'var(--chart-4)' }, map);
    label(bp[0] + .45, bp[1] + .45, 'batter');
    const cur = shown[shown.length - 1];
    if (cur) { const q = P(cur.x, cur.y, cur.z); el('circle', { cx: q[0], cy: q[1], r: .22, fill: '#d8ec48', stroke: '#000', 'stroke-width': .04 }, map); }
    // side view: height over time, with the gather and catch heights and the wall tops
    const W = 620, H = 120, x0 = 34, y0 = 104, sx = (W - x0 - 10) / Math.max(T, .5), sz = 88 / 5;
    const gl = (z, txt, dash) => {
      el('line', { x1: x0, x2: W - 10, y1: y0 - z * sz, y2: y0 - z * sz, stroke: 'currentColor', opacity: .35, 'stroke-dasharray': dash }, side);
      el('text', { x: 4, y: y0 - z * sz + 3, class: 'slbl' }, side).textContent = txt;
    };
    gl(0, '0 m', ''); gl(GZ, '1.5', '3 3'); gl(CZ, '2.7', '3 3'); gl(4.5, 'wall', '1 3');
    el('text', { x: x0 + 6, y: y0 - GZ * sz - 3, class: 'slbl' }, side).textContent = 'gather height (bounced)';
    el('text', { x: x0 + 6, y: y0 - CZ * sz - 3, class: 'slbl' }, side).textContent = 'catch height (on the full)';
    const pts = S.pts.filter((_, i) => i % 3 === 0), xy = p => `${x0 + p.t * sx},${y0 - Math.min(p.z, 5.8) * sz}`;
    el('polyline', { points: pts.map(xy).join(' '), fill: 'none', stroke: 'currentColor', opacity: .25, 'stroke-width': 1.5 }, side);
    el('polyline', { points: pts.filter(p => p.t <= tt).map(xy).join(' '), fill: 'none', stroke: 'var(--chart-1)', 'stroke-width': 2 }, side);
    if (cur) el('circle', { cx: x0 + cur.t * sx, cy: y0 - Math.min(cur.z, 5.8) * sz, r: 4, fill: '#d8ec48', stroke: '#000' }, side);
    el('text', { x: W - 60, y: H - 2, class: 'slbl' }, side).textContent = T.toFixed(2) + ' s';
    $('tv').textContent = tt.toFixed(2) + ' s';
    const r = $('res');
    r.textContent = tn >= 1 ? S.out.txt : '…';
    r.className = 'res' + (tn >= 1 && S.out.out ? ' out' : '');
    $('why').textContent = tn >= 1 ? S.out.why : 'Scrub or play to the end to see the result.';
    $('aimv').textContent = (aim > 0 ? '+' : '') + aim + '°';
    $('spdv').textContent = spd.toFixed(1) + ' m/s';
    $('liftv').textContent = lift + '°';
    $('t').value = tn;
  }
  const setPreset = p => {
    shot = p;
    if (p === 'ground') { spd = 13; lift = -4; } else { spd = 10.5; lift = 30; }
    $('spd').value = spd; $('lift').value = lift;
    root.querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
    tn = 1; draw();
  };
  root.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.p)));
  $('aim').addEventListener('input', e => { aim = +e.target.value; tn = 1; draw(); });
  $('spd').addEventListener('input', e => { spd = +e.target.value; tn = 1; draw(); });
  $('lift').addEventListener('input', e => { lift = +e.target.value; tn = 1; draw(); });
  $('t').addEventListener('input', e => { tn = +e.target.value; draw(); });
  player(root, $('play'), dt => {
    tn = Math.min(1, tn + dt / 2.2);
    draw();
    return tn < 1;
  }, { beforeStart: () => { if (tn >= 1) tn = 0; } });
  draw();
  return root;
}

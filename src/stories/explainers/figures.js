// "How figures are posed and animated": a side view of a jointed figure. Body specs are keyed and blended (like
// figures.js keyed() and mixBody()), then two-bone IK rebuilds the knees and elbows, as drawBody() does. The walk
// is a cycle driven by distance walked, like bowler.js gaitBody(). A 2D simplification: it does not call the game.
import { player, widget } from './dom.js';
import './figures.css';

const MARKUP = `
<div class="visual-controls" role="group" aria-label="Animation">
  <button type="button" data-m="shot" aria-pressed="true">Batter shot</button>
  <button type="button" data-m="walk" aria-pressed="false">Walk cycle</button>
  <span class="group" data-role="loftbox">
    <button type="button" data-l="air" aria-pressed="true">Aerial finish</button>
    <button type="button" data-l="ground" aria-pressed="false">Grounded finish</button>
  </span>
  <label><input type="checkbox" data-role="ik" checked> Show IK targets</label>
</div>
<svg data-role="svg" viewBox="-1.9 -2.85 3.9 3.0" role="img" aria-label="Side view of a jointed figure posed by keyframes and two-bone IK"></svg>
<div class="visual-controls">
  <button data-role="play" class="play" type="button">Play</button>
  <div class="scrub">
    <input data-role="t" type="range" min="0" max="1" step="0.001" value="0.55" aria-label="Animation time">
    <div class="tl" data-role="ticks" aria-hidden="true"></div>
  </div>
  <output data-role="tv" class="readout">0.55</output>
</div>
<p class="visual-note readout why" data-role="why" aria-live="polite"></p>`;

const NS = 'http://www.w3.org/2000/svg';
const ease = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = a => Math.hypot(a[0], a[1]), mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
// figures.js bone lengths
const THIGH = .58, SHIN = .58, UPPER = .46, FORE = .5;
// two-bone IK in the side plane: from a towards t, the joint bends to the pole side (+1 forward, -1 back)
function ik(a, t, l1, l2, pole) {
  let d = sub(t, a), n = len(d);
  const mx = (l1 + l2) * .9995;
  if (n > mx) { d = mul(d, mx / n); n = mx; }
  const u = mul(d, 1 / n), x = (l1 * l1 - l2 * l2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)), p = [-u[1] * pole, u[0] * pole];
  return { mid: add(add(a, mul(u, x)), mul(p, h)), end: add(a, d) };
}
// a body spec: pelvis, spine lean, both feet, the hands and the bat angle. Everything else is derived
const S = (pelvis, lean, footF, footB, hand, bat) => ({ pelvis, lean, footF, footB, hand, bat });
const AIR = [
  [0, 'stance', S([0, 1.18], .22, [.38, .12], [-.28, .12], [.28, 1.0], -1.95)],
  [.3, 'backlift', S([-.05, 1.2], .2, [.38, .12], [-.28, .12], [-.12, 1.5], -3.98)],
  [.55, 'contact', S([.18, 1.12], .38, [.8, .12], [-.28, .12], [.5, .9], -1.35)],
  [.8, 'finish', S([.22, 1.18], -.02, [.8, .12], [-.22, .18], [.05, 1.95], 3.78)],
  [1, 'hold', S([.22, 1.18], -.02, [.8, .12], [-.22, .18], [.05, 1.95], 3.78)],
];
const SHOT = {
  air: AIR,
  ground: AIR.map(k => (k[1] === 'finish' || k[1] === 'hold' ? [k[0], k[1], S([.3, 1.1], .42, [.8, .12], [-.24, .16], [.95, 1.05], .45)] : k)),
};
// keyed(): eased interpolation between neighbouring keys, every field of the spec at once
function keyed(keys, s) {
  if (s <= keys[0][0]) return { b: keys[0][2], i: 0, u: 0 };
  for (let i = 1; i < keys.length; i++) {
    if (s > keys[i][0]) continue;
    const [t0, , a] = keys[i - 1], [t1, , b] = keys[i], u = (s - t0) / (t1 - t0), e = ease(u), o = {};
    for (const k in b) o[k] = Array.isArray(b[k]) ? mix(a[k], b[k], e) : lerp(a[k], b[k], e);
    return { b: o, i, u, e };
  }
  return { b: keys[keys.length - 1][2], i: keys.length - 1, u: 1 };
}
// gaitBody(): a cycle driven by distance walked. Each foot is planted (stance), then swings forward on an arc
function gait(s) {
  const cycle = 1.7, stance = .56, L = stance * cycle * .55, ph = s * 2;
  const foot = p => {
    const q = ((p + stance / 2) % 1 + 1) % 1;
    let a, z = .12, st = true;
    if (q < stance) a = L / 2 - q / stance * L;
    else { const w = (q - stance) / (1 - stance); a = lerp(-L / 2, L / 2, ease(w)); z += .13 * Math.sin(Math.PI * w); st = false; }
    return { p: [a, z], st };
  };
  const f1 = foot(ph), f2 = foot(ph + .5), sw = Math.cos(2 * Math.PI * ph), bob = .03 * Math.cos(4 * Math.PI * ph);
  return { b: { pelvis: [0, 1.25 + bob], lean: .06, footF: f1.p, footB: f2.p, handF: [.1 + sw * .34, 1.32], handB: [.1 - sw * .34, 1.32] }, st: [f1.st, f2.st], ph: ph % 1 };
}
const KIT = 'var(--chart-1)', LEG = 'var(--chart-3)', TARGET = 'var(--chart-2)', SKIN = '#c4926e', BAT = '#e9cf8a', SHOE = '#ddd8cc', HAIR = '#3a2c24';
const Y = v => -v[1];

export function figuresWidget() {
  const { root, $ } = widget('fig', MARKUP);
  const svg = $('svg');
  let mode = 'shot', loft = 'air', t = .55;

  function el(n, a, p = svg) {
    const e = document.createElementNS(NS, n);
    for (const k in a) e.setAttribute(k, a[k]);
    p.appendChild(e);
    return e;
  }
  const line = (a, b, w, c, p = svg) => el('line', { x1: a[0], y1: Y(a), x2: b[0], y2: Y(b), 'stroke-width': w, stroke: c, class: 'limb' }, p);
  const showIk = () => $('ik').checked;
  function cross(p) {
    const r = .06;
    el('circle', { cx: p[0], cy: Y(p), r, class: 'tgt' });
    el('line', { x1: p[0] - r * 1.6, y1: Y(p), x2: p[0] + r * 1.6, y2: Y(p), 'stroke-width': .015, stroke: TARGET });
  }
  function render() {
    svg.replaceChildren();
    el('line', { x1: -1.9, y1: 0, x2: 2, y2: 0, class: 'ground' });
    let b, info;
    if (mode === 'shot') {
      const keys = SHOT[loft], k = keyed(keys, t);
      b = { ...k.b, handF: k.b.hand, handB: add(k.b.hand, [-.05, .12]) };
      const a = keys[Math.max(0, k.i - 1)], c = keys[k.i];
      info = k.i === 0 || k.u >= 1 || c[1] === 'hold' ? `Holding key “${c[1] === 'hold' ? 'finish' : c[1]}”.`
        : `Between keys “${a[1]}” → “${c[1]}”: linear ${k.u * 100 | 0}%, eased ${k.e * 100 | 0}%. Every field of the body spec is blended this way, then IK rebuilds the knees and elbows.`;
    } else {
      const g = gait(t);
      b = g.b;
      info = `Gait phase ${g.ph * 100 | 0}%. Front foot ${g.st[0] ? 'planted (stays still)' : 'swinging'}, back foot ${g.st[1] ? 'planted (stays still)' : 'swinging'}. The cycle is driven by distance walked, so planted feet never slide.`;
    }
    const spine = [Math.sin(b.lean), Math.cos(b.lean)], neck = add(b.pelvis, mul(spine, 1.03)), head = add(neck, mul(spine, .3)), sh = add(b.pelvis, mul(spine, .9));
    const legB = ik(b.pelvis, b.footB, THIGH, SHIN, 1), legF = ik(b.pelvis, b.footF, THIGH, SHIN, 1);
    const armB = ik(sh, b.handB, UPPER, FORE, -1), armF = ik(sh, b.handF, UPPER, FORE, -1);
    // far side first (paler), then the body, then the near side over it
    const far = el('g', { class: 'far' });
    line(b.pelvis, legB.mid, .24, LEG, far); line(legB.mid, legB.end, .18, LEG, far); line(legB.end, add(legB.end, [.16, -.03]), .14, SHOE, far);
    line(sh, armB.mid, .16, KIT, far); line(armB.mid, armB.end, .12, SKIN, far);
    line(b.pelvis, neck, .46, KIT); line(neck, head, .16, SKIN);
    el('circle', { cx: head[0], cy: Y(head), r: .2, fill: SKIN });
    el('circle', { cx: head[0] - .05, cy: Y(head) - .07, r: .16, fill: HAIR });
    line(b.pelvis, legF.mid, .26, LEG); line(legF.mid, legF.end, .19, LEG); line(legF.end, add(legF.end, [.16, -.03]), .15, SHOE);
    if (mode === 'shot') line(b.hand, add(b.hand, [Math.cos(b.bat) * .95, Math.sin(b.bat) * .95]), .12, BAT);
    line(sh, armF.mid, .17, KIT); line(armF.mid, armF.end, .13, SKIN);
    if (showIk()) {
      for (const j of [legF.mid, legB.mid, armF.mid, armB.mid]) el('circle', { cx: j[0], cy: Y(j), r: .035, fill: TARGET });
      [b.footF, b.footB, b.handF].forEach(cross);
    }
    $('why').textContent = info;
    $('tv').textContent = t.toFixed(2);
    $('t').value = t;
  }
  function ticks() {
    const tl = $('ticks');
    tl.replaceChildren();
    if (mode !== 'shot') return;
    for (const [k, n] of SHOT[loft]) {
      if (n === 'hold') continue;
      const d = document.createElement('span');
      d.className = 'tick';
      d.style.left = k * 100 + '%';
      if (k === 0) d.style.transform = 'none';
      d.textContent = '▲ ' + n;
      tl.appendChild(d);
    }
  }
  const press = (sel, on) => root.querySelectorAll(sel).forEach(x => x.setAttribute('aria-pressed', x === on));
  root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.m;
    press('[data-m]', b);
    $('loftbox').hidden = mode !== 'shot';
    ticks(); render();
  }));
  root.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    loft = b.dataset.l;
    press('[data-l]', b);
    ticks(); render();
  }));
  $('ik').addEventListener('change', render);
  $('t').addEventListener('input', e => { t = +e.target.value; render(); });
  player(root, $('play'), dt => {
    t += dt * (mode === 'shot' ? .45 : .35);
    if (t > 1) t -= 1;
    render();
  });
  ticks(); render();
  return root;
}

// The bowler's run-up, delivery stride and walk back, planned as footfalls so a planted foot never slides.
import { clamp, ease, lerp } from '../engine.js';
import { ARM_RELEASE, BOWLER, BOWLER_YAW, BOWLERS, FIG_SCALE, RELEASE_X } from './constants.js';
import { armAt, bodyFrame, keyed, LEG_LEN, vAdd, vMix, vMul, vSub } from './figures.js';

/* ---------- the bowler ----------
   Planned once per bowler type, as a list of footfalls, so a planted foot never slides:
   - the run starts from standing and builds up (fast: a sprint; spin: a stroll, then two quicker steps). Strides
     lengthen with speed, and each foot is planted under the body at mid-stance, on the ground it actually covers;
   - fast: the last left foot takes off into a bound, the right (back) foot lands side-on, the front foot plants
     just behind the chalk, the arm comes over, and he follows through for two steps. Spin: the same, smaller;
   - the follow-through ends exactly where the old one did (it matters: the bowler fields from there).
   The release frame puts the bowling hand on the planned release point d.R, so the ball leaves from the hand. */
const RUNUP = {
  fast: { take: .3, back: .13, front: .045, ftD: 1.3, leap: .36, side: 1.3, lean: .38, base: 1.2, lateral: .1, stance: .32, pump: 1.05, wind: -.6, finish: -5.7, relLean: .18, plant: .3 },
  spin: { take: .26, back: .12, front: .045, ftD: .6, leap: .12, side: .8, lean: .1, base: 1.24, lateral: .13, stance: .5, pump: .45, wind: -1.7, finish: -5.3, relLean: .04, plant: .08 },
};
const RELEASE_AHEAD = .15;                         // at release his hips are a little ahead of his planned x
export const strideLen = v => .42 + .12 * v;              // one step's length at speed v: longer strides when faster
const plans = {};
function runPlan(type) {
  if (plans[type]) return plans[type];
  const B = BOWLERS[type], R = RUNUP[type], mark = B.mark, T = (RELEASE_X - mark) / B.run, N = 600;
  const shape = type === 'fast'
    ? s => ease(clamp(s / (.45 * T), 0, 1)) * lerp(1, .82, ease(clamp((s - (T - .3)) / .3, 0, 1)))
    : s => (.45 * ease(clamp(s / (.18 * T), 0, 1)) + .55 * ease(clamp((s - .45 * T) / (.25 * T), 0, 1))) * lerp(1, .85, ease(clamp((s - (T - .25)) / .25, 0, 1)));
  const X = [0], Psi = [0];
  for (let i = 1; i <= N; i++) X.push(X[i - 1] + (shape(T * (i - .5) / N)) * T / N);
  const scale = (RELEASE_X - mark) / X[N];
  for (let i = 1; i <= N; i++) { const v = shape(T * (i - .5) / N) * scale; Psi.push(Psi[i - 1] + v / strideLen(v) * T / N); }
  const at = (arr, s) => { const f = clamp(s / T, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)); return lerp(arr[i], arr[i + 1], f - i); };
  const vRel = shape(T) * scale, power = vRel * .4 / R.ftD;
  const runX = s => mark + at(X, s) * scale;
  const psi = s => at(Psi, s);
  const timeOfPsi = p => { let lo = 0, hi = T; for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (psi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  // after release: carry on at the release speed and slow down, then exactly the old follow-through from v = .75
  const ftX = s => {
    const v = clamp((s - T) / .4, 0, 1);
    if (v >= .75) return RELEASE_X + ease(v) * R.ftD;
    return RELEASE_X + R.ftD * lerp(1 - (1 - v) ** power, ease(v), ease(clamp((v - .5) / .25, 0, 1)));
  };
  const bodyX = s => s <= T ? runX(s) : ftX(s);
  const y = BOWLER.y, side = f => y + (f === 'L' ? -1 : 1) * R.lateral;
  const tTake = T - R.take, last = psi(tTake) - .25, run = [];
  for (let j = 0; last - j > .2; j++) {
    const tm = timeOfPsi(last - j), v = Math.max(.5, (runX(tm + .01) - runX(tm - .01)) / .02), half = R.stance * strideLen(v) / v / 2;
    const f = j % 2 ? 'R' : 'L';
    run.unshift({ foot: f, t0: tm - half, t1: j === 0 ? tTake : tm + half, x: runX(tm), y: side(f), toe: 0, lift: .16 + .025 * v });
  }
  const first = f => run.find(p => p.foot === f);
  const stand = f => ({ foot: f, t0: -1e9, t1: first(f) ? Math.max(0, first(f).t0 - .2) : 0, x: mark + (f === 'L' ? .2 : -.12), y: side(f), toe: 0, lift: 0 });
  const fin = ftX(T + .4);
  const steps = [stand('L'), stand('R'), ...run,
    { foot: 'R', t0: T - R.back, t1: T - .035, x: runX(T - R.back) + .05, y: y + .03, toe: 1.25, lift: R.leap * 1.1 },
    { foot: 'L', t0: T - R.front, t1: T + .19, x: RELEASE_X + RELEASE_AHEAD + R.plant, y: y - .1, toe: .3, lift: R.leap * .8 },
    { foot: 'R', t0: T + .21, t1: 1e9, x: fin - .144, y: y + .2, toe: 0, lift: .3 },
    { foot: 'L', t0: T + .35, t1: 1e9, x: fin + .24, y: y - .2, toe: 0, lift: .22 },
  ];
  const feet = { L: steps.filter(p => p.foot === 'L'), R: steps.filter(p => p.foot === 'R') };
  return (plans[type] = { T, tTake, feet, bodyX, psi, last, R, vRel, power });
}
// where one foot is at time s: planted, or swinging between two footfalls along an arc. w is how far through the
// swing it is (1 when planted), for the pelvis to sink onto a landing leg
export function footAt(list, s) {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (s < p.t0) {
      const a = list[i - 1], w = clamp((s - a.t1) / (p.t0 - a.t1), 0, 1), e = ease(w);
      return { pos: [lerp(a.x, p.x, e), lerp(a.y, p.y, e), .12 + p.lift * Math.sin(Math.PI * w)], toe: lerp(a.toe, p.toe, e), w, planted: false };
    }
    if (s <= p.t1) return { pos: [p.x, p.y, .12], toe: p.toe, w: 1, planted: true };
  }
  const p = list[list.length - 1];
  return { pos: [p.x, p.y, .12], toe: p.toe, w: 1, planted: true };
}
// the highest the pelvis can be with both legs reaching their feet (a foot about to land counts as it comes down)
export function reachZ(pelvis, hipYaw, feet, k) {
  const hr = [-Math.sin(hipYaw), Math.cos(hipYaw), 0];
  let z = pelvis[2];
  feet.forEach((f, i) => {
    const hip = vAdd(pelvis, vMul(hr, .15 * k * (i ? 1 : -1))), dx = f.pos[0] - hip[0], dy = f.pos[1] - hip[1];
    const top = f.pos[2] + Math.sqrt(Math.max(0, (LEG_LEN * k * .985) ** 2 - dx * dx - dy * dy));
    const w = f.planted ? 1 : ease(clamp((f.w - .65) / .35, 0, 1));
    z = Math.min(z, lerp(pelvis[2], Math.min(pelvis[2], top), w));
  });
  return z;
}
// the bowler s seconds after the run-up started: { x, yaw, body }
export function bowlerAt(d, s) {
  const P = runPlan(d.type), R = P.R, T = P.T, k = FIG_SCALE, yaw = BOWLER_YAW, x = P.bodyX(s);
  const tTake = P.tTake, tBack = T - R.back, tFront = T - R.front;
  const fL = footAt(P.feet.L, s), fR = footAt(P.feet.R, s);
  // run: arms and hips swing against the legs, one cycle every two steps
  const psi = P.psi(Math.min(s, tTake)), swing = Math.cos(Math.PI * (psi - P.last + .5)) * (s < .05 ? s / .05 : 1);
  const toRun = clamp(s / .25, 0, 1);
  const lean = keyed(s, [[0, .02], [.3, R.lean], [tTake - .1, R.lean], [tTake, -.02], [tBack, -.14], [T, R.relLean], [T + .13, .55], [T + .4, .14]]);
  const roll = keyed(s, [[tBack, 0], [tFront, .04], [T, -.08], [T + .22, 0]]);
  const chest = keyed(s, [[tTake - .1, 0], [tBack, R.side], [T - .02, -.05], [T + .2, -.75], [T + .4, -.2]]) - (s < tTake ? swing * .14 * toRun : 0);
  const hips = keyed(s, [[tTake - .1, 0], [tBack, R.side * .62], [T, .1], [T + .2, -.45], [T + .4, -.1]]) + (s < tTake ? swing * .12 * toRun : 0);
  const ahead = keyed(s, [[tFront, 0], [T, RELEASE_AHEAD], [T + .4, 0]]);
  // height: a bob on each stride (high in the air, low over the planted foot), and a real leap into the bound
  let z = R.base + (s < .2 ? (1.28 - R.base) * (1 - s / .2) : 0);
  if (!fL.planted && !fR.planted) {
    const a = s < tTake ? Math.max(...[...P.feet.L, ...P.feet.R].filter(p => p.t1 <= s).map(p => p.t1)) : tTake;
    const b = s < tTake ? Math.min(...[...P.feet.L, ...P.feet.R].filter(p => p.t0 > s).map(p => p.t0)) : tBack;
    z += (s >= tTake && s < tBack ? R.leap : .06) * Math.sin(Math.PI * clamp((s - a) / (b - a), 0, 1));
  } else if (s < tTake) z -= .04 * toRun;
  z += keyed(s, [[tFront, 0], [T - .01, .07], [T + .1, -.04], [T + .4, .06]]);
  const hipYaw = yaw + hips;
  let pelvis = [x + ahead, BOWLER.y, z * k];
  pelvis[2] = reachZ(pelvis, hipYaw, [fL, fR], k);
  const body = { kind: 'run', k, pelvis, hipYaw, chestYaw: yaw + chest, lean, roll, footL: fL.pos, footR: fR.pos, toeL: yaw + fL.toe, toeR: yaw + fR.toe };
  const f = bodyFrame(body), dir = [Math.cos(yaw), Math.sin(yaw), 0], left = [Math.sin(yaw), -Math.cos(yaw), 0], down = [0, 0, -1];
  // run pose: elbows bent, hands pumping fore and aft
  const runHand = (sh, a) => armAt(sh, f.fwd, a, .72);
  let hR = runHand(f.shR, swing * R.pump), hL = runHand(f.shL, -swing * R.pump);
  // gather: both hands come together in front of the chest, the ball held in both
  const chin = side => vAdd(vAdd(f.neck, vAdd(vMul(f.fwd, .34 * k), vMul(down, .3 * k))), vMul(f.right, side * .06 * k));
  const g = ease(clamp((s - (tTake - .16)) / .16, 0, 1));
  hR = vMix(hR, chin(1), g); hL = vMix(hL, chin(-1), g);
  // bound: front arm reaches up at the batter, bowling arm drops down and back (coiled) by the back-foot landing
  const coil = ease(clamp((s - tTake) / (tBack - tTake), 0, 1));
  const frontUp = armAt(f.shL, dir, -2.55, .9 * k), bowlBack = armAt(f.shR, dir, R.wind, .92 * k, vMul(left, -.08 * k));
  if (s > tTake) { hR = vMix(chin(1), bowlBack, coil); hL = vMix(chin(-1), frontUp, coil); }
  // delivery: the bowling arm comes over the top in a full circle, accelerating; the front arm pulls down to the hip
  if (s > tBack) {
    const u = clamp((s - tBack) / (T - tBack), 0, 1), th = lerp(R.wind, ARM_RELEASE, u * u * (1.6 - .6 * u));
    hR = armAt(f.shR, dir, th, .92 * k);
    hL = vMix(frontUp, armAt(f.shL, dir, -.15, .85 * k, vMul(left, .3 * k)), ease(u));
  }
  // follow-through: the arm carries on down and across to the far hip, then both hang as he slows
  if (s > T) {
    const u = clamp((s - T) / .26, 0, 1), th = lerp(ARM_RELEASE, R.finish, 1 - (1 - u) ** 2);
    const across = vMul(left, .45 * k * ease(u));
    hR = armAt(f.shR, dir, th, .92 * k, across);
    hL = armAt(f.shL, dir, lerp(-.15, .55, ease(u)), .85 * k, vMul(left, .3 * k * (1 - u)));
    const relax = ease(clamp((s - T - .26) / .14, 0, 1));
    hR = vMix(hR, armAt(f.shR, f.fwd, .2, .9 * k), relax); hL = vMix(hL, armAt(f.shL, f.fwd, .1, .88 * k), relax);
  }
  // the release frame puts the hand exactly on the planned release point; the arm's whole circle bends towards it
  // from the back-foot landing, and lets go of it through the follow-through
  if (d.R && s > tBack && s < T + .2) {
    const w = s <= T ? ease((s - tBack) / (T - tBack)) : 1 - ease((s - T) / .2);
    hR = vAdd(hR, vMul(vSub([d.R.x, d.R.y, d.R.z], releaseArc(d.type)), w));
  }
  body.handR = hR; body.handL = hL;
  // elbows point back while running, then out to the side for the bowling action, turning across smoothly
  const back = vAdd(vMul(f.fwd, -1), [0, 0, -.4]);
  body.poleR = vMix(back, vAdd(left, [0, 0, -.2]), ease(clamp((s - tTake) / (tBack - tTake), 0, 1)));
  body.poleL = vMix(back, vAdd(left, vMul(f.fwd, -.3)), ease(clamp((s - (tTake - .16)) / (tBack - tTake + .16), 0, 1)));
  return { x, yaw, body };
}
// the bowling hand at the release frame before it is pinned to d.R (the same for every ball of a type)
const arcs = {};
function releaseArc(type) {
  if (arcs[type]) return arcs[type];
  const P = runPlan(type), b = bowlerAt({ type }, P.T).body, f = bodyFrame(b);
  return (arcs[type] = armAt(f.shR, [Math.cos(BOWLER_YAW), Math.sin(BOWLER_YAW), 0], ARM_RELEASE, .92 * FIG_SCALE));
}
// walking back to the mark: a cyclic gait driven by the distance walked, so the planted foot keeps still
export function gaitBody(x, y, yaw, dist, k = FIG_SCALE) {
  const cycle = 1.7, stance = .56, L = stance * cycle, fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  const foot = (ph, b) => {
    const q = ((ph + stance / 2) % 1 + 1) % 1;
    let a, z = .12;
    if (q < stance) a = L / 2 - q / stance * L;
    else { const w = (q - stance) / (1 - stance); a = lerp(-L / 2, L / 2, ease(w)); z += .13 * Math.sin(Math.PI * w); }
    return [x + (fx * a + sx * b) * k, y + (fy * a + sy * b) * k, z * k];
  };
  const ph = dist / cycle, sw = Math.cos(2 * Math.PI * ph), bob = .03 * Math.cos(4 * Math.PI * ph);
  const body = { kind: 'walk', k, pelvis: [x, y, (1.25 + bob) * k], hipYaw: yaw + .1 * sw, chestYaw: yaw - .1 * sw, lean: .06, roll: 0,
    footL: foot(ph, -.13), footR: foot(ph + .5, .13), toeL: yaw, toeR: yaw };
  const f = bodyFrame(body);
  body.handR = armAt(f.shR, f.fwd, -sw * .5, .9 * k); body.handL = armAt(f.shL, f.fwd, sw * .5, .9 * k);
  body.poleR = body.poleL = vAdd(vMul(f.fwd, -1), [0, 0, -.3]);
  return body;
}
// the release pose of the original run-up. The release point d.R is still worked out from it, so every ball
// leaves the hand from exactly the same place as before the run-up was redrawn
export const releasePose = type => ({ scale: FIG_SCALE, stance: .3, lean: BOWLERS[type].lean + .1, armR: ARM_RELEASE, armL: .4 });

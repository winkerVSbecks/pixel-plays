// The game: boot, the pause rule, the frame loop and the test controls (window.__cricket).
import './game/screen.js';
import {
  applyShadows, bakedPix, bakedZ, box, canvas, capsule, capture, castShadow, clamp, ctx, drawDots, drawLeaves,
  drawTufts, dynamicAdd, ease, figure, fit, flushShadows, H, hash, image, INK, lerp, pendingShadows, pix,
  project, rampOf, rgb, setCapture, shadeEdges, SHOE, SIGNAL, sphere, STILL, W, WIND_FPS, zb,
} from './engine.js';
import {
  AIM_X, ARM_RELEASE, BACKSTOP, BALL_COLOR, BALL_R, BATTER, BLADE, BOUNCE, BOUNCE_MIN, BOWL_LINE_X, BOWLED_HALF,
  BOWLER, BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT, BOWLER_YAW, BOWLERS, BRICK, BRICK_X, BRICKWORK, CATCH_HOT,
  CATCH_R, CATCH_REACT, CATCH_RUN, CATCH_Z, CHALK_X, CHALK_Y, CONTACT_X, CREASE_X, CROSS, crossOf, CUE_GAP,
  CUE_NOW, CUE_T, CUE_TICK, DIR_WORLD, DIRS, DONE_T, DROP, EDGE_X, EDGE_Y, FIELD_BOUNDS, FIELD_NAMES, FIELDERS,
  FIELDS, FIG_SCALE, GATHER_R, GATHER_Z, GLANCE, GLANCE_LIFT, GLANCE_PACE, GRADES, GRAVITY, HAND, HOLD_T, JOG,
  LEG, LEG_SIDE, LINE_ODDS, LINES, LIVE_MAX, OFF_SIDE, OVERS, PARAPET, PHYS_DT, PITCH_Y, PROP_BOUNCE, PROPS,
  REACT, RELEASE_X, REPLAY_T, ROLL, ROSE_IN, ROSE_OUT, RUN_DIST, RUN_SPEED, SHOTS, SKID, STRAIGHT, STUMP_BRICKS,
  STUMPS_FACE, STUMPS_X, STUMPS_Z, TARGET, TEAMS, VERGE_ROLL, WALL_BOUNCE, WALL_H_BACK, WALL_H_LEFT, WALL_X,
  WALL_Y, wallTop, WICKETS,
} from './game/constants.js';
import { bake } from './game/scene.js';
import {
  CHEER_T, facing, G, KIDS, POSE_BOWLER, POSE_CATCH, POSE_CHEER, POSE_FIELDER, POSE_HOLD, setTeams,
} from './game/state.js';
import { nodes, setStatus, setSwungYet, setTouchInput, showHint, swungYet, touchInput } from './game/hud.js';
import { lineOf, nextType, pickOne, range, reseed, rng, walkPose } from './game/rng.js';

/* ---------- jointed figures ----------
   The engine's figure() has one symmetric stance, arms that only swing fore and aft, and knees and elbows it
   places itself. The bowler and the batter need more than that, so they are drawn here from a body spec: the
   pelvis, how the hips and chest are turned and tilted, and where the feet and hands are in the world. Knees and
   elbows are found by two-bone IK. Bone lengths, radii and colours are figure()'s, so they match the fielders.
   Spec fields: k (scale), pelvis [x, y, z], hipYaw, chestYaw, lean (forward), roll (towards the right side),
   footL/footR (ankles, z .12 on the ground), toeL/toeR (angles), handL/handR, poleL/poleR (which way the elbows
   point). "Right" is the figure's own right as seen on screen, the same side as figure()'s armR. */
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vLen = a => Math.hypot(a[0], a[1], a[2]);
const vNorm = a => vMul(a, 1 / (vLen(a) || 1));
const vMix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const angMix = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * t;
const LEG_LEN = 1.16, THIGH = .58, SHIN = .58, UPPER_ARM = .46, FOREARM = .5, ARM_LEN = .96;
// a two-bone limb from a towards t, bending towards pole; out of reach it straightens and points at t
function ik(a, t, l1, l2, pole) {
  let d = vSub(t, a), n = vLen(d);
  const max = (l1 + l2) * .9995, min = Math.abs(l1 - l2) + 1e-4;
  if (n > max) { d = vMul(d, max / n); n = max; }
  else if (n < min) { d = vMul(d, min / (n || 1)); n = min; }
  const u = vMul(d, 1 / n), x = (l1 * l1 - l2 * l2 + n * n) / (2 * n), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = vSub(pole, vMul(u, vDot(pole, u)));
  if (vLen(p) < 1e-6) p = Math.abs(u[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
  p = vNorm(p);
  return { mid: vAdd(vAdd(a, vMul(u, x)), vMul(p, h)), end: vAdd(a, d) };
}
// the chest frame of a spec: spine direction, the chest's right and forward, the neck, head and both shoulders
function bodyFrame(b) {
  const k = b.k, roll = b.roll || 0, cy = b.chestYaw;
  const cf = [Math.cos(cy), Math.sin(cy), 0], cr = [-Math.sin(cy), Math.cos(cy), 0];
  const spine = vNorm([cf[0] * Math.sin(b.lean) + cr[0] * Math.sin(roll), cf[1] * Math.sin(b.lean) + cr[1] * Math.sin(roll), Math.cos(b.lean) * Math.cos(roll)]);
  const right = vNorm(vSub(cr, vMul(spine, vDot(cr, spine)))), fwd = vCross(right, spine);
  const neck = vAdd(b.pelvis, vMul(spine, 1.03 * k)), base = vSub(neck, vMul(spine, .11 * k));
  // bow (optional): the head drops forward on the neck (negative tips it back)
  const head = b.bow ? vAdd(vAdd(neck, vMul(vAdd(vMul(spine, Math.cos(b.bow)), vMul(fwd, Math.sin(b.bow))), .28 * k)), vMul(fwd, .05 * k * Math.cos(b.bow)))
    : vAdd(vAdd(neck, vMul(spine, .28 * k)), vMul(fwd, .05 * k));
  return { spine, right, fwd, neck, head, shL: vAdd(base, vMul(right, -.36 * k)), shR: vAdd(base, vMul(right, .36 * k)) };
}
function drawBody(b, t, add = dynamicAdd) {
  const k = b.k, f = bodyFrame(b), hr = [-Math.sin(b.hipYaw), Math.cos(b.hipYaw), 0];
  const legs = () => t.legs, skin = () => t.skin, shirt = () => t.shirt;
  for (const side of [-1, 1]) {
    const hip = vAdd(b.pelvis, vMul(hr, .15 * k * side)), ta = side < 0 ? b.toeL : b.toeR, toe = [Math.cos(ta), Math.sin(ta), 0];
    const leg = ik(hip, side < 0 ? b.footL : b.footR, THIGH * k, SHIN * k, [toe[0], toe[1], .15]);
    add(hip, leg.mid, .17 * k, .13 * k, legs);
    add(leg.mid, leg.end, .13 * k, .1 * k, legs);
    add(leg.end, vAdd(leg.end, [toe[0] * .16 * k, toe[1] * .16 * k, -.04 * k]), .1 * k, .09 * k, () => SHOE);
  }
  add(b.pelvis, f.neck, .3 * k, .32 * k, shirt);
  add(f.neck, f.head, .11 * k, .12 * k, skin);
  add(f.head, f.head, .24 * k, .24 * k, skin);
  // (a bowed head shows its crown: the hair moves round to the top and front)
  const hair = b.bow ? vAdd(vAdd(f.head, vMul(f.fwd, (-.06 * Math.cos(b.bow) + .08 * Math.sin(b.bow)) * k)), [0, 0, .08 * k * Math.cos(b.bow)])
    : vAdd(vSub(f.head, vMul(f.fwd, .06 * k)), [0, 0, .08 * k]);
  add(hair, hair, .205 * k, .205 * k, () => t.hair);
  const out = { frame: f };
  for (const side of [-1, 1]) {
    const sh = side < 0 ? f.shL : f.shR, arm = ik(sh, side < 0 ? b.handL : b.handR, UPPER_ARM * k, FOREARM * k, side < 0 ? b.poleL : b.poleR);
    add(sh, arm.mid, .12 * k, .1 * k, shirt);
    add(arm.mid, arm.end, .09 * k, .08 * k, skin);
    out[side < 0 ? 'handL' : 'handR'] = arm.end;
  }
  return out;
}
// figure()'s geometry for an ordinary pose, as a spec, so a jointed figure can blend to and from it
function poseBody(x, y, yaw, pose, k = FIG_SCALE) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, base = pose.z || 0;
  const P = (a, b, c) => [x + (fx * a + sx * b) * k, y + (fy * a + sy * b) * k, c * k + base];
  const crouch = pose.crouch || 0, lean = pose.lean || 0, stance = pose.stance == null ? .2 : pose.stance;
  const hipZ = 1.28 - crouch * .4, hipA = -crouch * .15, shA = hipA + Math.sin(lean) * .95, shZ = hipZ + Math.cos(lean) * .95;
  const armR = pose.armR == null ? 0 : pose.armR, armL = pose.armL == null ? .08 : pose.armL;
  const handR = P(shA + Math.sin(armR + .18) * .95, .42, shZ - .03 - Math.cos(armR + .18) * .95);
  const handL = P(shA + Math.sin(armL + .2) * .9, -.43, shZ - .03 - Math.cos(armL + .2) * .9);
  const elbowR = P(shA + Math.sin(armR) * .46, .4, shZ - .03 - Math.cos(armR) * .46), elbowL = P(shA + Math.sin(armL) * .46, -.42, shZ - .03 - Math.cos(armL) * .46);
  const shR = P(shA, .36, shZ - .03), shL = P(shA, -.36, shZ - .03);
  return {
    kind: pose, k, pelvis: P(hipA, 0, hipZ), hipYaw: yaw, chestYaw: yaw, lean, roll: 0,
    footL: P(stance * 2, -.2, .12), footR: P(-stance * 1.2, .2, .12), toeL: yaw, toeR: yaw,
    handL, handR, poleL: vSub(elbowL, vMix(shL, handL, .5)), poleR: vSub(elbowR, vMix(shR, handR, .5)),
  };
}
function mixBody(a, b, t) {
  const out = { kind: b.kind, k: b.k };
  for (const key in b) {
    if (key === 'kind' || key === 'k') continue;
    const va = a[key] == null ? b[key] : a[key], vb = b[key];
    out[key] = Array.isArray(vb) ? vMix(va, vb, t) : /yaw|toe/i.test(key) ? angMix(va, vb, t) : lerp(va, vb, t);
  }
  return out;
}
// smooth keyframes: [[time, value], ...], eased in and out between neighbours, held flat outside
function keyed(s, keys) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s > keys[i][0]) continue;
    const [t0, a] = keys[i - 1], [t1, b] = keys[i];
    return lerp(a, b, ease((s - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
// a hand on a circle round the shoulder in the vertical plane along `dir`: figure()'s arm angle (0 down, -pi up,
// -2pi down in front), plus a sideways push towards `side`
const armAt = (sh, dir, theta, reach, side = [0, 0, 0]) => vAdd(vAdd(sh, vMul(dir, Math.sin(theta) * reach)), vAdd([0, 0, -Math.cos(theta) * reach], side));

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
const strideLen = v => .42 + .12 * v;              // one step's length at speed v: longer strides when faster
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
function footAt(list, s) {
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
function reachZ(pelvis, hipYaw, feet, k) {
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
function bowlerAt(d, s) {
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
function gaitBody(x, y, yaw, dist, k = FIG_SCALE) {
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
const releasePose = type => ({ scale: FIG_SCALE, stance: .3, lean: BOWLERS[type].lean + .1, armR: ARM_RELEASE, armL: .4 });
// start a delivery now. opts (and G.force) may fix: type 'fast'|'spin', line 'stumps'|'off'|'leg', move 'in'|'away'|'none',
// amount (sideways movement at the stumps), offset (aim at the stumps relative to PITCH_Y), length (pitching x)
function bowl(opts = {}) {
  if (G.phase !== 'idle' || G.match && G.match.result) return null;
  const f = { ...G.force, ...opts };
  // what this ball changes before it is settled, so a delivery cut short by a dialog can be taken back (see pause)
  const undo = { rng: rng.state(), over: G.over, ballInOver: G.ballInOver, overType: G.overType, thisOver: G.match && G.match.thisOver, status: nodes.status.textContent };
  if (G.ballInOver >= 6) {
    G.over++; G.ballInOver = 0;
    if (G.match) G.match.thisOver = [];
    G.overType = G.overType === 'fast' ? 'spin' : 'fast';
    setStatus(G.overType === 'fast' ? 'fast bowler this over' : 'spinner this over');
  }
  showHint();
  const type = f.type || G.overType, B = BOWLERS[type];
  const line = f.line || pickOne(LINE_ODDS);
  const move = f.move || pickOne(B.moves);
  const amount = move === 'none' ? 0 : f.amount != null ? f.amount : range(B.move);
  const aim = PITCH_Y + (f.offset != null ? f.offset : range(LINES[line]));
  const px = f.length != null ? f.length : range(B.pitch);
  G.balls++; G.ballInOver++;
  const d = { stage: 'runup', n: G.balls, type, line, move, amount, aim, t0: G.time, mark: B.mark, runT: (RELEASE_X - B.mark) / B.run, swing: null, hitAt: null, bounced: false, undo };
  // the ball leaves the bowling hand at the top of the delivery stride
  const hand = figure(RELEASE_X, BOWLER.y, BOWLER_YAW, releasePose(type), G.bowler.palette, () => {});
  d.R = { x: hand[0], y: hand[1], z: hand[2] };
  // it pitches on the straight line from the hand to its aim at the stumps
  d.P = { x: px, y: lerp(d.R.y, aim, (px - d.R.x) / (AIM_X - d.R.x)) };
  d.t1 = Math.hypot(d.P.x - d.R.x, d.P.y - d.R.y) / B.speed;
  d.vz1 = (BALL_R - d.R.z + GRAVITY * d.t1 * d.t1 / 2) / d.t1;
  // off the pitch it heads for its moved line at the stumps
  d.end = aim + (move === 'in' ? LEG * amount : move === 'away' ? -LEG * amount : 0);
  const ex = AIM_X - d.P.x, ey = d.end - d.P.y, el = Math.hypot(ex, ey);
  d.u = { x: ex / el, y: ey / el };
  d.v2 = B.speed * B.after;
  const after = x => (x - d.P.x) / (d.v2 * d.u.x), tS = after(AIM_X);
  d.vz2 = (B.bounce - BALL_R + GRAVITY * tS * tS / 2) / tS;
  d.tRelease = d.t0 + d.runT;
  d.tPitch = d.tRelease + d.t1;
  d.tContact = d.tPitch + after(CONTACT_X);
  d.tStumps = d.tPitch + after(STUMPS_FACE - BALL_R);
  G.del = d;
  G.ball = null;
  G.stumps.down = false;
  G.bowler.x = d.mark; G.bowler.y = BOWLER.y;
  setField(fieldFor(G.over), true);
  return d;
}
function ballAt(d, t) {
  const s = t - d.tRelease;
  if (s < d.t1) {
    const k = s / d.t1;
    return { x: lerp(d.R.x, d.P.x, k), y: lerp(d.R.y, d.P.y, k), z: d.R.z + d.vz1 * s - GRAVITY * s * s / 2 };
  }
  const q = s - d.t1, v = d.v2 * q, q2 = 2 * d.vz2 / GRAVITY;
  const at = { x: d.P.x + d.u.x * v, y: d.P.y + d.u.y * v, vx: d.u.x * d.v2, vy: d.u.y * d.v2 };
  // a slow ball can come down again before it reaches the bricks: it bounces a second time, lower
  if (q <= q2) return { ...at, z: BALL_R + d.vz2 * q - GRAVITY * q * q / 2, vz: d.vz2 - GRAVITY * q };
  const r = q - q2, vz3 = d.vz2 * BOUNCE;
  return { ...at, z: BALL_R + vz3 * r - GRAVITY * r * r / 2, vz: vz3 - GRAVITY * r };
}
function gradeOf(dt, win) {
  const a = Math.abs(dt);
  return a <= win[0] ? 0 : a <= win[1] ? 1 : a <= win[2] ? 2 : 3;
}
/* one swing per ball, in direction dir (0-7, see DIRS), pressed at time t. The press is graded against the ball's
   arrival at the bat; the timing alone decides whether the bat meets the ball. Hitting against the line costs one
   grade, and so does a ball that moved off the pitch unless the timing was perfect, but neither (nor both) can
   take a connecting swing past mistimed. Returns the swing, or null when there is nothing to swing at. */
function swingAt(dir, t = G.time) {
  const d = G.del;
  if (G.phase === 'pick' || d.stage !== 'flight' || d.swing || t >= d.tStumps) return null;
  const B = BOWLERS[d.type], lineY = ballAt(d, d.tContact).y, line = lineOf(lineY);
  const against = line === 'off' && LEG_SIDE.includes(dir) || line === 'leg' && OFF_SIDE.includes(dir);
  const dt = t - d.tContact, moved = d.move !== 'none';
  let grade = gradeOf(dt, B.window);
  const timed = grade;
  if (grade < 3 && (against || moved && grade > 0)) grade = Math.min(grade + 1, 2);
  const hitAt = Math.max(t, d.tContact);
  if (hitAt >= d.tStumps) grade = 3;
  d.swing = { dir, t, dt, grade, timed, side: grade === 0 ? null : dt < 0 ? 'early' : 'late', against, moved, line };
  if (grade < 3) d.hitAt = hitAt;
  // the batter's swing (drawing only): it meets the ball where it really is at hitAt, or swings through its line
  G.batter.swing = null;
  const meet = grade < 3 ? hitAt : d.tContact, cp = ballAt(d, meet), from = batterAt(t);
  G.batter.swing = { t0: t, dir, lineY, grade, from, tc: Math.max(grade < 3 ? hitAt : t + BAT_SWING, t + .035), C: { x: cp.x, y: cp.y, z: cp.z } };
  planSwing(G.batter.swing, d);
  if (!swungYet) { setSwungYet(); setStatus(G.you.name + ' need ' + (G.match ? G.match.target - G.match.runs : '') + ' to win'); }
  return d.swing;
}
/* the swing met the ball: it leaves the bat in the chosen direction, give or take the grade's scatter, at a speed
   and climb drawn for the grade. G.force may fix speed, lift (degrees) and scatter (degrees, signed) for tests */
function strike(d) {
  const at = ballAt(d, d.hitAt), sw = d.swing, S = SHOTS[sw.grade], f = G.force;
  const w = DIR_WORLD[sw.dir], aim = Math.atan2(w[1], w[0]);
  const scatter = f.scatter != null ? f.scatter : (rng() * 2 - 1) * S.scatter;
  let lift = f.lift != null ? f.lift : range(S.lift), speed = f.speed != null ? f.speed : range(S.speed);
  let yaw = aim + scatter * Math.PI / 180, flat = Math.cos(lift * Math.PI / 180) * speed;
  if (sw.dir === GLANCE) {
    // aim a ball's width and more past the far side of the bricks and the drum, at the chalk
    const clearY = Math.min(BACKSTOP.y - BACKSTOP.r, PITCH_Y - BRICK.l) - 1;
    yaw = Math.atan2(clearY - at.y, CHALK_X - at.x) + scatter * Math.PI / 180;
    if (f.lift == null) lift = Math.min(lift, GLANCE_LIFT);
    if (f.speed == null) speed *= GLANCE_PACE;
    flat = Math.cos(lift * Math.PI / 180) * speed;
  }
  // played across a ball that moved: pushed towards the movement and slower, or a thin edge (see CROSS)
  const cross = f.cross != null ? f.cross : crossOf(d, sw.dir) * CROSS.timing[Math.min(sw.timed, 2)], side = Math.sign(d.end - d.aim);
  let edge = false;
  if (cross > 0) {
    edge = f.edge != null ? f.edge : rng() < clamp((cross - CROSS.edgeFrom) * CROSS.edgeRate, 0, CROSS.edgeMax);
    if (edge) {
      yaw = Math.atan2(side, range(CROSS.fine));
      speed = range(CROSS.edgeSpeed);
      lift = rng() < CROSS.loops ? range(CROSS.loop) : range(CROSS.low);
    } else {
      const turn = Math.atan2(Math.sin(Math.atan2(side, 0) - yaw), Math.cos(Math.atan2(side, 0) - yaw));
      yaw += Math.sign(turn) * Math.min(Math.abs(turn), cross * CROSS.push * Math.PI / 180);
      speed *= 1 - CROSS.pace * cross;
    }
    flat = Math.cos(lift * Math.PI / 180) * speed;
  }
  d.cross = cross; d.edge = edge;
  G.ball = {
    x: at.x, y: at.y, z: Math.max(at.z, .35), vx: Math.cos(yaw) * flat, vy: Math.sin(yaw) * flat, vz: Math.sin(lift * Math.PI / 180) * speed,
    t: 0, touched: false, bounces: 0, event: null, from: { x: at.x, y: at.y },
  };
  d.shot = { speed, lift, scatter };
  d.stage = 'live';
  d.tHit = d.hitAt;
  d.tReact = REACT;
  d.chase = planChase(G.ball, REACT);
  sfx('hit', sw.grade);
  for (const f of G.fielders) f.routeFor = null;  // they will walk back from wherever the chase takes them
  // off the middle it sparks; off the edge it scuffs up dust
  if (sw.grade < 2 && !edge) burst(at, sw.grade ? 6 : 10, SPARK, sw.grade ? 2.2 : 3.4, 2.5, .3);
  else burst(at, 7, DUST, 1.1, 1.5, .4);
}
// where the loose ball is resting or bouncing: the paving, or the top of a prop it is above
function floorUnder(b) {
  let floor = 0;
  for (const p of PROPS) {
    if (b.z - BALL_R < p.h - .05) continue;
    const inside = p.r != null ? Math.hypot(b.x - p.x, b.y - p.y) < p.r : b.x > p.x0 && b.x < p.x1 && b.y > p.y0 && b.y < p.y1;
    if (inside) floor = Math.max(floor, p.h);
  }
  return floor;
}
// push the ball out of a prop's side and send it back off the face it hit
function hitProps(b) {
  for (const p of PROPS) {
    if (b.z - BALL_R >= p.h - .05) continue;
    let nx, ny, gap;
    if (p.r != null) {
      const dx = b.x - p.x, dy = b.y - p.y, dist = Math.hypot(dx, dy) || 1e-6;
      gap = dist - p.r - BALL_R; nx = dx / dist; ny = dy / dist;
    } else {
      const cx = clamp(b.x, p.x0, p.x1), cy = clamp(b.y, p.y0, p.y1), dx = b.x - cx, dy = b.y - cy, dist = Math.hypot(dx, dy);
      if (dist > 0) { gap = dist - BALL_R; nx = dx / dist; ny = dy / dist; }
      else {
        // the centre got inside: leave by the nearest face
        const faces = [[b.x - p.x0, -1, 0], [p.x1 - b.x, 1, 0], [b.y - p.y0, 0, -1], [p.y1 - b.y, 0, 1]].sort((a, c) => a[0] - c[0]);
        gap = -faces[0][0] - BALL_R; nx = faces[0][1]; ny = faces[0][2];
      }
    }
    if (gap >= 0) continue;
    b.x -= nx * gap; b.y -= ny * gap;
    const vn = b.vx * nx + b.vy * ny;
    const e = p.bounce != null ? p.bounce : PROP_BOUNCE;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
    if (p.bounce == null && !b.event) b.event = { how: 'wall', side: b.x - WALL_X < b.y - WALL_Y ? 'x' : 'y', touched: b.touched, prop: true, at: { x: b.x, y: b.y, z: b.z } };
    b.touched = true;
  }
}
/* one fixed step of the loose ball. It notes the first thing that ends the ball as b.event: 'wall' (a house front,
   below its top), 'over' (clear over a house), or 'chalk' (over the boundary line on an open side), each with
   b.touched telling whether it had bounced (or hit something) on the way */
function stepBall(b, dt) {
  b.t += dt;
  if (b.gone) return;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= GRAVITY * dt;
  const floor = floorUnder(b), past = b.x > CHALK_X || b.y > CHALK_Y;
  if (b.z < floor + BALL_R) {
    b.z = floor + BALL_R;
    if (b.vz < -BOUNCE_MIN) {
      b.vz *= -BOUNCE; b.vx *= SKID; b.vy *= SKID;
      if (!b.touched) b.first = { x: b.x, y: b.y };
      b.touched = true; b.bounces++;
    } else {
      b.vz = 0; b.touched = true;
      const sp = Math.hypot(b.vx, b.vy), next = Math.max(0, sp - (past ? VERGE_ROLL : ROLL) * dt);
      if (sp > 0) { b.vx *= next / sp; b.vy *= next / sp; }
    }
  }
  hitProps(b);
  // the house fronts: a ball clear above the parapet sails over; anything lower thumps the wall and comes back
  if (!b.over) for (const side of ['x', 'y']) {
    const pos = side === 'x' ? b.x : b.y, face = side === 'x' ? WALL_X : WALL_Y;
    if (pos > face + BALL_R) continue;
    const top = wallTop(side, side === 'x' ? b.y : b.x);
    if (b.z - BALL_R > top) {
      b.over = side;
      if (!b.event) b.event = { how: 'over', side, touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
      break;
    }
    if (!b.event) b.event = { how: 'wall', side, touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
    b.touched = true;
    if (side === 'x') { b.x = face + BALL_R; b.vx = Math.abs(b.vx) * WALL_BOUNCE; }
    else { b.y = face + BALL_R; b.vy = Math.abs(b.vy) * WALL_BOUNCE; }
    b.vx *= .7; b.vy *= .7;
  }
  if (past && !b.event) b.event = { how: 'chalk', touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
  // out of sight: dropped behind a house, or off the edge of the lane into the white
  if (b.over && b.z < wallTop(b.over, b.over === 'x' ? b.y : b.x) - .3) b.gone = true;
  if (b.x > EDGE_X - .4 || b.y > EDGE_Y - .4) {
    if (b.z <= BALL_R + .01) { b.vx = b.vy = 0; } // settles in the weeds
    if (b.x > EDGE_X + 3 || b.y > EDGE_Y + 3) b.gone = true;
  }
  b.still = !b.gone && b.vz === 0 && b.vx === 0 && b.vy === 0;
}
/* ---------- fielding ----------
   At the hit the ball's whole path is replayed ahead of time (same fixed steps, so it is exact) to find the first
   moment any fielder can be at it: that fielder chases to that spot, the others stay set and watch. A boundary
   reached first beats them all. If the chase somehow falls through, it is planned again from where things are. */
const team = () => [G.bowler, ...G.fielders];
const canCatch = b => !b.touched && b.z <= CATCH_Z;
const canGather = (b, f) => f === G.bowler && Math.hypot(b.vx, b.vy, b.vz) > BOWLER_HOT ? false
  : b.touched ? b.z <= GATHER_Z : b.z <= (f === G.bowler ? BOWLER_CATCH_Z : CATCH_Z);
const reachOf = (b, f) => b.touched ? GATHER_R : f === G.bowler ? BOWLER_CATCH_R : CATCH_R;
function planChase(ball, react) {
  const sim = { ...ball }, players = team();
  while (sim.t < LIVE_MAX) {
    stepBall(sim, PHYS_DT);
    if (sim.event || sim.gone) break;
    const air = !sim.touched, run = air ? Math.max(0, sim.t - ball.t - react * CATCH_REACT / REACT) * CATCH_RUN : Math.max(0, sim.t - ball.t - react) * RUN_SPEED;
    // (the bowler cannot run for a catch: he only takes one that comes to him; once it lands he chases like anyone)
    for (const f of players) if (canGather(sim, f) && Math.hypot(f.x - sim.x, f.y - sim.y) <= (f === G.bowler && air ? 0 : run) + reachOf(sim, f)) return { f, t: sim.t, x: sim.x, y: sim.y, air, react };
    if (sim.still) break;
  }
  // nobody gets there in time: the nearest runs to where the ball ends up (it may be a boundary)
  const f = players.reduce((a, c) => Math.hypot(c.x - sim.x, c.y - sim.y) < Math.hypot(a.x - sim.x, a.y - sim.y) ? c : a);
  return { f, t: Infinity, x: sim.x, y: sim.y };
}
const RUN_POSE = { lean: .3 };
function stepFielders(d, dt) {
  const b = G.ball, c = d.chase;
  for (const f of team()) {
    if (f === c.f && b.t - d.tReact - (c.air ? c.react * (CATCH_REACT / REACT - 1) : 0) >= 0) {
      const dx = c.x - f.x, dy = c.y - f.y, gap = Math.hypot(dx, dy), go = Math.min(gap, (c.air ? CATCH_RUN : RUN_SPEED) * dt);
      if (gap > 1e-6) { f.x += dx / gap * go; f.y += dy / gap * go; f.yaw = Math.atan2(dy, dx); }
      f.running = gap > .02;
    } else if (f !== G.bowler || b.t > .3) f.yaw = facing(f, b);
  }
}
// the fielder who can reach the ball now, if any
function gatherer(b) {
  for (const f of team()) if (canGather(b, f) && Math.hypot(f.x - b.x, f.y - b.y) <= reachOf(b, f)) return f;
  return null;
}
const runsFor = dist => RUN_DIST.findIndex(r => dist < r) < 0 ? 3 : RUN_DIST.findIndex(r => dist < r);
// step the live ball and the chase up to the delivery's clock, and settle the ball as soon as something ends it
function stepLive(d) {
  const b = G.ball, due = G.time - d.tHit;
  while (b.t + PHYS_DT <= due + 1e-9) {
    const bounces = b.bounces, vz = b.vz;
    stepBall(b, PHYS_DT);
    if (b.bounces > bounces) sfx('bounce', -vz / 7);
    stepFielders(d, PHYS_DT);
    const e = b.event;
    if (e && e.how === 'wall') { burst(e.at, 8, DUST, 1.4, 1.2, .45); sfx('wall', e.prop ? .7 : 1); }
    if (e) {
      // clean over a house front: lost in the neighbour's, and the batter is out
      if (e.how === 'over') return finish(d, 'hit', { runs: 0, out: true, how: 'over the wall' });
      return finish(d, 'hit', { runs: e.touched ? 4 : 6, out: false, how: e.how });
    }
    const f = gatherer(b);
    if (f) {
      const dist = Math.hypot(b.x - b.from.x, b.y - b.from.y);
      const dropped = canCatch(b) && Math.hypot(b.vx, b.vy, b.vz) > CATCH_HOT && rng() < DROP, caught = canCatch(b) && !dropped;
      b.held = f; b.vx = b.vy = b.vz = 0; b.caught = caught;
      if (caught) return finish(d, 'hit', { runs: 0, out: true, how: 'caught', by: f.name || 'bowler', dist });
      return finish(d, 'hit', { runs: runsFor(dist), out: false, how: 'fielded', by: f.name || 'bowler', dist, dropped });
    }
    if (b.gone) return finish(d, 'hit', { runs: 0, out: false, how: 'lost' });
    // the planned gather did not happen: plan again from here, with no reaction delay
    if (b.t > d.chase.t + .25 || d.chase.t === Infinity && b.still) { d.chase = planChase(b, 0); d.tReact = b.t; }
  }
  if (due >= LIVE_MAX) {
    G.timeouts++;
    const dist = Math.hypot(b.x - b.from.x, b.y - b.from.y);
    finish(d, 'hit', { runs: runsFor(dist), out: false, how: 'fielded', by: null, dist, timeout: true });
  }
}
// the ball reached the bricks without being hit: it either knocks them over or carries on into the drum
function passStumps(d) {
  const b = ballAt(d, d.tStumps);
  // judged on its line at the bricks, after any movement
  if (Math.abs(b.y - PITCH_Y) <= BOWLED_HALF) {
    G.stumps = { down: true, t: d.tStumps, seed: d.n };
    sfx('bricks');
    G.ball = { x: b.x, y: b.y, z: b.z, vx: -1.4, vy: (b.y - PITCH_Y) * 3, vz: 1.2 };
    return finish(d, 'bowled');
  }
  // there is no keeper: it skips on and thuds into the oil drum behind the stumps
  const ty = clamp(b.y, BACKSTOP.y - BACKSTOP.r * .6, BACKSTOP.y + BACKSTOP.r * .6);
  const dx = BACKSTOP.x - b.x, dy = ty - b.y, n = Math.hypot(dx, dy), v = d.v2 * .8;
  G.ball = { x: b.x, y: b.y, z: b.z, vx: dx / n * v, vy: dy / n * v, vz: Math.max(b.vz, .8) };
  sfx('wall', .5);
  finish(d, 'backstop');
}
/* settle the ball. outcome = { runs, out, how } where how is 'wall' or 'chalk' (4 or 6), 'fielded' (0 to 3, with
   by and dist), 'caught' (out, with by), 'over the wall' (out), 'bowled' (out), or 'beaten' (missed or left, into
   the drum, no run) */
const OUTCOME_TEXT = o => o.dropped ? 'dropped! ' + (o.runs ? o.runs + (o.runs > 1 ? ' runs' : ' run') : 'no run') : o.how === 'bowled' || o.how === 'caught' ? o.how : o.how === 'over the wall' ? 'over the wall, out' : o.runs === 4 ? 'four' : o.runs === 6 ? 'six' : o.runs ? o.runs + (o.runs > 1 ? ' runs' : ' run') : 'no run';
function finish(d, result, outcome) {
  d.stage = 'done';
  d.timer = DONE_T;
  const sw = d.swing;
  G.last = {
    n: d.n, type: d.type, line: d.line, move: d.move, amount: d.amount, pitch: { ...d.P }, end: d.end,
    dir: sw ? DIRS[sw.dir] : null, grade: sw ? GRADES[sw.grade] : null, side: sw ? sw.side : null,
    dt: sw ? sw.dt : null, against: sw ? sw.against : false, result,
  };
  const b = G.ball;
  if (result === 'hit') Object.assign(G.last, { shot: d.shot, cross: d.cross, edge: d.edge, touched: b.event ? b.event.touched : b.touched, bounces: b.bounces, at: { x: b.x, y: b.y, z: b.z }, t: b.t });
  const o = outcome || (result === 'bowled' ? { runs: 0, out: true, how: 'bowled' } : { runs: 0, out: false, how: 'beaten' });
  Object.assign(G.last, o, { field: G.field });
  G.history.push(G.last);
  G.react = o.out ? { kind: 'wicket', t0: G.time } : o.runs >= 4 ? { kind: 'boundary', t0: G.time } : null;
  if (G.react) sfx(o.out ? 'groan' : 'cheer');
  setStatus((result === 'hit' && d.edge ? 'edged! ' : '') + OUTCOME_TEXT(o));
  scoreBall(o);
  // the ball that decides the match: the winners start celebrating now, as the result goes up
  if (G.match && G.match.result && !G.cele) startCelebration();
}

/* ---------- the match ----------
   Every ball counts (there are no extras). The chase is won as soon as the runs reach the target; it is lost when
   the wickets or the balls run out first, and tied if it stops exactly one short. The ball that decides it still
   plays out; the result goes up when its DONE_T is over (see update) */
function newMatch(target) {
  G.match = { target: target || Math.round(range(TARGET)), runs: 0, wkts: 0, balls: 0, thisOver: [], result: null, how: null, endT: null };
  G.phase = 'idle';
  const celebrated = !!G.cele;
  G.cele = null;
  for (const p of [G.batter, G.bowler, ...G.fielders]) p.cele = null;
  resetDelivery();
  // after a celebration everyone is straight back at his mark (resetDelivery has put the fielders on theirs)
  if (celebrated) {
    const bw = G.bowler;
    Object.assign(bw, { x: BOWLERS[nextType()].mark, y: BOWLER.y, yaw: BOWLER_YAW, pose: POSE_BOWLER, body: null, drawn: null, fade: null, walk: 0 });
    G.batter.fit = null;
  }
  setStatus(G.you.name + ' need ' + G.match.target + ' to win');
  showHint();
  renderHud();
}
const ballMark = o => o.out ? 'W' : o.runs ? String(o.runs) : '·';
function scoreBall(o) {
  const m = G.match;
  if (!m || m.result) return;
  m.runs += o.runs; m.wkts += o.out ? 1 : 0; m.balls++;
  m.thisOver.push(ballMark(o));
  if (m.runs >= m.target) { m.result = 'win'; m.how = 'target'; }
  else if (m.wkts >= WICKETS || m.balls >= OVERS * 6) {
    m.result = m.runs === m.target - 1 ? 'tie' : 'lose';
    m.how = m.wkts >= WICKETS ? 'all out' : 'overs';
  }
  renderHud();
}
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
function resultText(m) {
  const you = G.you.name, rival = G.rival.name, left = OVERS * 6 - m.balls;
  if (m.result === 'win') return you + ' win by ' + plural(WICKETS - m.wkts, 'wicket') + (left ? ', ' + plural(left, 'ball') + ' to spare' : ' off the last ball');
  const score = m.how === 'all out' ? 'all out for ' + m.runs + ': ' : '';
  if (m.result === 'tie') return m.how === 'all out' ? 'all out for ' + m.runs + ', scores level: a tie' : 'a tie on ' + m.runs;
  return score + rival + ' win by ' + plural(m.target - 1 - m.runs, 'run');
}
// the ball that decided the match has played out: show the result and wait for a tap
function endMatch() {
  const m = G.match;
  G.phase = 'over';
  m.endT = G.time;
  // the result goes up in the scoreboard (renderHud); the status line only asks for the tap, so a long result never
  // runs into the credits at the foot of the page. It is still read out from the status line
  const text = resultText(m);
  G.status = text + ' · tap to play again';
  const sr = document.createElement('span');
  sr.className = 'sr';
  sr.textContent = text + ' · ';
  nodes.status.replaceChildren(sr, 'tap to play again');
  renderHud();
}
// after the result, a tap, click or key goes back to the team picker with your team already picked
function replay() {
  if (G.phase !== 'over' || G.time - G.match.endT < REPLAY_T) return false;
  openPicker();
  return true;
}
// the scoreboard: runs/wickets, overs as 2.4, this over's balls, the target, and what is still needed
const oversText = balls => Math.floor(balls / 6) + '.' + balls % 6;
function renderHud() {
  const m = G.match;
  if (!m) return;
  nodes.runs.textContent = m.runs + '/' + m.wkts;
  nodes.overs.textContent = oversText(m.balls) + ' ov';
  nodes.thisOver.replaceChildren(...m.thisOver.map(c => {
    const s = document.createElement('span');
    s.textContent = c;
    if (c === 'W') s.className = 'w';
    return s;
  }));
  nodes.overRow.hidden = !m.thisOver.length;
  nodes.target.textContent = 'target ' + m.target;
  const need = m.target - m.runs, left = OVERS * 6 - m.balls;
  const over = m.result && G.phase === 'over';
  // from the deciding ball until its result is up, the match is decided but not yet shown: no change of team
  nodes.team.disabled = !!m.result && G.phase !== 'over' && G.phase !== 'pick';
  nodes.need.classList.toggle('result', !!over);
  nodes.need.textContent = over ? resultText(m) : m.result ? '' : 'need ' + need + ' from ' + plural(left, 'ball');
}
// a loose ball: gravity, bounces off the paving, and the drum stops it dead
function stepLoose(b, dt) {
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= GRAVITY * dt;
  if (b.z < BALL_R) {
    b.z = BALL_R;
    if (b.vz < -1) { b.vz *= -.45; b.vx *= .8; b.vy *= .8; }
    else {
      b.vz = 0;
      const sp = Math.hypot(b.vx, b.vy), next = Math.max(0, sp - 4 * dt);
      if (sp > 0) { b.vx *= next / sp; b.vy *= next / sp; }
    }
  }
  const dx = b.x - BACKSTOP.x, dy = b.y - BACKSTOP.y, dist = Math.hypot(dx, dy), reach = BACKSTOP.r + BALL_R;
  if (dist < reach && b.z < BACKSTOP.h + BALL_R) {
    b.x = BACKSTOP.x + dx / dist * reach; b.y = BACKSTOP.y + dy / dist * reach;
    b.vx = dx / dist * .5; b.vy = dy / dist * .5; b.vz = Math.min(b.vz, 0);
  }
  if (b.x < WALL_X + BALL_R) { b.x = WALL_X + BALL_R; b.vx = Math.abs(b.vx) * .3; }
  if (b.y < WALL_Y + BALL_R) { b.y = WALL_Y + BALL_R; b.vy = Math.abs(b.vy) * .3; }
  if (b.life != null) b.life -= dt;
}
function resetDelivery() {
  G.del = { stage: 'wait', timer: .6 };
  G.ball = null; G.batter.swing = null;
  G.stumps.down = false; G.react = null; G.fx = [];
  G.balls = 0; G.over = 0; G.ballInOver = 0;
  G.overType = rng() < .5 ? 'fast' : 'spin';
  // a new order of field placings, never the same one two overs running
  const order = FIELD_NAMES.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  G.fieldOrder = order;
  setField(fieldFor(0), true);
}
// the placing for an over, and the one the next ball will be bowled to
const fieldFor = over => G.forceField || G.fieldOrder[over % G.fieldOrder.length];
const nextField = () => fieldFor(G.ballInOver >= 6 ? G.over + 1 : G.over);
// send the fielders to a placing (snap puts them straight there)
function setField(name, snap) {
  G.field = name;
  FIELDS[name].forEach((s, k) => {
    const f = G.fielders[k];
    f.name = s.name; f.home = { x: s.x, y: s.y };
    if (snap) { f.x = s.x; f.y = s.y; f.yaw = facing(f, BATTER); f.pose = POSE_FIELDER; f.running = false; f.via = null; f.routeFor = f.home; }
  });
}
const fieldSet = () => G.fielders.every(f => Math.hypot(f.x - f.home.x, f.y - f.home.y) < .05);
/* no fielder may stand in front of what you play by: the batter and his bat's reach, the bricks, the swing cue and
   the pitch from the landing ring down to the bat. These are sample points on them; a standing figure (about
   FIG_HALF pixels either side of his feet and FIG_TALL units high) hides one if he is nearer the camera and his
   screen box covers it */
const FIG_HALF = 6, FIG_TALL = 2.4;
const VIEW = (() => {
  const pts = [];
  for (let x = 1.4; x <= CONTACT_X + .4; x += .25) for (const dy of [-.9, 0, .9]) for (const z of [0, .6]) pts.push([x, PITCH_Y + dy, z]);
  for (let z = 0; z <= 2.4; z += .3) for (const [dx, dy] of [[0, 0], [-.6, 0], [.6, 0], [0, -.9], [0, .9], [-.9, LEG * .6]]) pts.push([BATTER.x + dx, BATTER.y + dy, z]);
  for (let z = 0; z <= STUMPS_Z; z += .2) pts.push([STUMPS_X, PITCH_Y, z]);
  for (let dy = -1.6; dy <= 1.6; dy += .4) pts.push([CONTACT_X, PITCH_Y + dy, 0]);
  return pts.map(([x, y, z]) => project(x, y, z));
})();
function hidesView(x, y) {
  const feet = project(x, y, 0), top = project(x, y, FIG_TALL).sy - 2;
  return VIEW.some(q => q.d < feet.d && Math.abs(q.sx - feet.sx) < FIG_HALF && q.sy > top && q.sy < feet.sy + 2);
}
// clear with room to spare, so a fielder can walk off his spot without stepping into the view
const clearAround = (x, y) => !hidesView(x, y) && [0, 1, 2, 3, 4, 5, 6, 7].every(k => !hidesView(x + Math.cos(k * .785) * .4, y + Math.sin(k * .785) * .4));
// move any placing that would hide the view to the nearest clear spot inside the lane (it matters for HAND = 'left')
for (const list of Object.values(FIELDS)) for (const s of list) {
  // keep every spot off the footpaths and inside the chalk (mirroring for HAND can push one out)
  const B = FIELD_BOUNDS;
  s.x = clamp(s.x, B.x0, B.x1); s.y = clamp(s.y, B.y0, B.y1);
  if (clearAround(s.x, s.y)) continue;
  let best = null;
  for (let r = .2; r < 4 && !best; r += .2) for (let a = 0; a < 6.283; a += .2) {
    const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
    if (x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1 && clearAround(x, y)) { best = { x: +x.toFixed(2), y: +y.toFixed(2) }; break; }
  }
  if (best) Object.assign(s, best);
}
/* a walk from a to b keeps out of the view, if need be by way of turning points round the far end of the pitch or
   behind the bricks. A walk that starts inside the view (after a chase) may cross it only to get out, never back in */
const LANE_TURNS = [[0, -4.2], [0, 3.2], [-3, -.3], [3.4, -5.2], [3.4, 4.8], [10.8, -4.6], [10.6, 4.6], [-2.4, 4.6], [-2.4, -5.4],
  [7.5, -5.6], [7.5, 5.4], [11, -.3]].flatMap(([x, y]) => [{ x, y }, { x, y: 2 * PITCH_Y - y }])   // both sides, for either HAND
  .filter(p => p.y > FIELD_BOUNDS.y0 && p.y < FIELD_BOUNDS.y1 && !hidesView(p.x, p.y));
function clearWalk(a, b, leaving) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .08);
  let out = !leaving;
  for (let i = 1; i <= n; i++) {
    const h = hidesView(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n));
    if (h && out) return false;
    if (!h) out = true;
  }
  return true;
}
// the shortest such walk: the first turning point to head for (null for straight there)
function routeTo(f, home) {
  const leaving = f.out || hidesView(f.x, f.y);
  if (clearWalk(f, home, leaving)) return null;
  // (a turning point he is already standing on is no use: that would stall him there)
  const nodes = [...LANE_TURNS.filter(p => Math.hypot(p.x - f.x, p.y - f.y) > .3), home], dist = nodes.map(p => clearWalk(f, p, leaving) ? Math.hypot(p.x - f.x, p.y - f.y) : Infinity);
  const first = nodes.map((p, i) => i), done = nodes.map(() => false);
  for (;;) {
    let i = -1;
    for (let j = 0; j < nodes.length; j++) if (!done[j] && dist[j] < Infinity && (i < 0 || dist[j] < dist[i])) i = j;
    if (i < 0 || nodes[i] === home) break;
    done[i] = true;
    for (let j = 0; j < nodes.length; j++) {
      if (done[j]) continue;
      const l = dist[i] + Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      if (l < dist[j] && clearWalk(nodes[i], nodes[j])) { dist[j] = l; first[j] = first[i]; }
    }
  }
  const end = nodes.length - 1;
  if (dist[end] < Infinity) return nodes[first[end]];
  // hemmed in at the edge of the view: plan as if getting out of it
  return leaving ? null : routeTo({ x: f.x, y: f.y, out: true }, home);
}
// between balls the fielders jog back to their spots (a new over may bring new ones) and settle facing the bat,
// going round rather than across the batter's view
function walkFielders(dt) {
  for (const f of G.fielders) {
    if (f.routeFor !== f.home) { f.routeFor = f.home; f.via = routeTo(f, f.home); }
    const to = f.via || f.home;
    const dx = to.x - f.x, dy = to.y - f.y, gap = Math.hypot(dx, dy);
    if (f.via && gap < .1) { f.x = to.x; f.y = to.y; f.via = routeTo(f, f.home); continue; }
    if (gap > .05) {
      const go = Math.min(gap, JOG * dt);
      f.x += dx / gap * go; f.y += dy / gap * go; f.yaw = Math.atan2(dy, dx);
      f.pose = walkPose(9, .2);
    } else {
      f.x = f.home.x; f.y = f.home.y; f.yaw = facing(f, BATTER); f.pose = POSE_FIELDER;
    }
  }
}

/* ---------- the celebration ----------
   When the match is decided, the side that won celebrates and the other side takes it in, for two or three
   seconds; then everyone holds a pose until the next match. Every figure is drawn jointed, with the run-up's and
   the swing's machinery: feet move only by planned footfalls (a planted foot never slides, and running legs
   alternate), and each figure blends out of whatever it was doing.
   - win: the batter turns to the camera, raises his bat, jumps twice and pumps his fist; the kids on the step jump
     up; the fielders slump where they stand (hands on hips, on knees, on head), anyone in the batter's way first
     trudging back to his spot.
   - lose: the fielding side runs in to the bowler (round the batter's view, never across it), jumps with arms up
     and goes into a huddle; the batter's head drops and the bat hangs from one hand.
   - tie: nobody celebrates. A shrug from the batter and the bowler, and a stand-off.
   With reduced motion nobody runs or jumps: each figure eases straight into its held pose. This is drawing only:
   it never touches the ball, the score or the clock, and the next match (or a tap on the result) resets it */
const CELE = { run: 5.8, walk: 1.6, ring: 1.38, huddle: 1.26, air: .34, crouch: .16, jumpH: .3 };
const CELE_KIDS = 2.6;                             // how long the kids jump about after a win, before they stand cheering
const planted = (x, y, toe) => ({ t0: -1e9, t1: 1e9, x, y, toe, lift: 0 });
const lastPlant = list => list[list.length - 1];
// a foot leaves the ground at tOff and lands at (x, y) at tOn; the toe turns the short way round
function stepTo(list, tOff, tOn, x, y, toe, lift) {
  const a = lastPlant(list);
  a.t1 = Math.max(a.t0, tOff);
  list.push({ t0: tOn, t1: 1e9, x, y, toe: a.toe + Math.atan2(Math.sin(toe - a.toe), Math.cos(toe - a.toe)), lift });
}
// one figure's celebration: its footfalls, and phases that each give the body over those feet, each blending into
// the next over its own time (the first blends out of the pose the figure had when it started)
function actor(t0, from) {
  return { t0, from, feet: { L: [planted(from.footL[0], from.footL[1], from.toeL)], R: [planted(from.footR[0], from.footR[1], from.toeR)] }, phases: [], jumps: [] };
}
const phase = (A, t, blend, fn) => A.phases.push({ t, blend, fn });
function actorBody(A, s) {
  const fL = footAt(A.feet.L, s), fR = footAt(A.feet.R, s), ph = A.phases;
  let i = ph.length - 1;
  while (i > 0 && ph[i].t > s) i--;
  let body = ph[i].fn(s, fL, fR);
  const u = (s - ph[i].t) / ph[i].blend;
  if (u < 1) body = mixBody(i ? ph[i - 1].fn(s, fL, fR) : { bow: 0, ...A.from }, body, ease(clamp(u, 0, 1)));
  body.pelvis[2] = reachZ(body.pelvis, body.hipYaw, [fL, fR], body.k);
  return body;
}
// a body standing over its feet. o: yaw (facing), z (pelvis height), lean, bow (head), roll, hips / chest (turns
// on top of yaw). Leaning forward sits the hips back over the heels
function overFeet(fL, fR, o) {
  const k = FIG_SCALE, lean = o.lean || 0, back = Math.sin(lean) * .28 * k;
  const pelvis = [(fL.pos[0] + fR.pos[0]) / 2 - Math.cos(o.yaw) * back, (fL.pos[1] + fR.pos[1]) / 2 - Math.sin(o.yaw) * back, (o.z || 1.22) * k];
  const body = { kind: 'cele', k, pelvis, hipYaw: o.yaw + (o.hips || 0), chestYaw: o.yaw + (o.chest || 0), lean, roll: o.roll || 0, bow: o.bow || 0,
    footL: fL.pos, footR: fR.pos, toeL: fL.toe, toeR: fR.toe };
  pelvis[2] = reachZ(pelvis, body.hipYaw, [fL, fR], k);
  return body;
}
// where the hands go for a held gesture, and which way the elbows point: { L, R, pL, pR }
const hipAt = (b, side) => vAdd(b.pelvis, vMul([-Math.sin(b.hipYaw), Math.cos(b.hipYaw), 0], side * .15 * b.k));
function armsFor(kind, b, f, lift = .84) {
  const k = b.k, out = {};
  for (const side of [-1, 1]) {
    const sh = side < 0 ? f.shL : f.shR, r = vMul(f.right, side);
    let h, p;
    if (kind === 'up') {           // fists up over the head
      h = vAdd(sh, vAdd(vMul(r, .2 * k), vAdd(vMul(f.fwd, .1 * k), [0, 0, lift * k]))); p = vAdd(r, vMul(f.fwd, .3));
    } else if (kind === 'hips') {  // hands on hips, elbows out
      h = vAdd(hipAt(b, side), vAdd(vMul(r, .15 * k), vAdd(vMul(f.fwd, -.02 * k), [0, 0, .3 * k]))); p = vAdd(r, vMul(f.fwd, -.35));
    } else if (kind === 'head') {  // hands on the head, elbows out and up
      h = vAdd(f.head, vAdd(vMul(r, .19 * k), vAdd(vMul(f.fwd, -.03 * k), [0, 0, .08 * k]))); p = vAdd(r, [0, 0, .5]);
    } else if (kind === 'knees') { // bent over, hands on the knees
      const ft = side < 0 ? b.footL : b.footR, toe = side < 0 ? b.toeL : b.toeR;
      const knee = ik(hipAt(b, side), ft, THIGH * k, SHIN * k, [Math.cos(toe), Math.sin(toe), .15]).mid;
      h = vAdd(knee, vAdd(vMul(f.fwd, .08 * k), [0, 0, .07 * k])); p = vAdd(r, [0, 0, -.3]);
    } else if (kind === 'shrug') { // forearms out, palms up, elbows in at the sides
      h = vAdd(b.pelvis, vAdd(vMul(r, .48 * k), vAdd(vMul(f.fwd, .3 * k), [0, 0, .24 * k]))); p = vAdd(vMul(r, .3), [0, 0, -1]);
    } else {                       // hanging by the sides
      h = vAdd(sh, vAdd(vMul(r, .08 * k), vAdd(vMul(f.fwd, .05 * k), [0, 0, -.87 * k]))); p = vAdd(vMul(f.fwd, -1), [0, 0, -.3]);
    }
    out[side < 0 ? 'L' : 'R'] = h; out[side < 0 ? 'pL' : 'pR'] = p;
  }
  return out;
}
const mixArms = (a, b, u) => ({ L: vMix(a.L, b.L, u), R: vMix(a.R, b.R, u), pL: vMix(a.pL, b.pL, u), pR: vMix(a.pR, b.pR, u) });
const setArms = (b, a) => Object.assign(b, { handL: a.L, handR: a.R, poleL: a.pL, poleR: a.pR });

/* a run (or a walk) along a path, planned once as footfalls like the bowler's run-up: it speeds up from standing,
   slows to a stop at the end, strides lengthen with speed and each foot is planted under the body at mid-stance,
   a little to its own side. Then two closing steps put the feet side by side at the end, facing endYaw.
   Corners are rounded off. Returns { T (arrival), end (feet together), sign, at(s) } */
function planRun(A, pts, V, sGo, endYaw, walk) {
  let P = pts.map(p => [p.x, p.y]);
  for (let n = 0; n < 2 && P.length > 2; n++) {
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (i > 0) Q.push([lerp(a[0], b[0], .25), lerp(a[1], b[1], .25)]);
      if (i < P.length - 2) Q.push([lerp(a[0], b[0], .75), lerp(a[1], b[1], .75)]);
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  const D = [0];
  for (let i = 1; i < P.length; i++) D.push(D[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const len = D[D.length - 1];
  const posAt = d => {
    d = clamp(d, 0, len);
    let i = 1;
    while (i < D.length - 1 && D[i] < d) i++;
    const u = (d - D[i - 1]) / ((D[i] - D[i - 1]) || 1);
    return [lerp(P[i - 1][0], P[i][0], u), lerp(P[i - 1][1], P[i][1], u)];
  };
  const dirAt = d => { const a = posAt(d - .3), b = posAt(d + .3); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const ta = walk ? .3 : .35, td = walk ? .35 : .5, stride = walk ? v => .5 + .26 * v : strideLen;
  const T = Math.max(ta + td, len / V + (ta + td) / 2);
  const shape = u => Math.min(ease(clamp(u / ta, 0, 1)), ease(clamp((T - u) / td, 0, 1)));
  const N = 400, X = [0], Ps = [0];
  for (let i = 1; i <= N; i++) X.push(X[i - 1] + shape(T * (i - .5) / N) * T / N);
  const vmax = len / X[N], vAt = u => shape(u) * vmax;   // the top speed that covers exactly the path
  for (let i = 1; i <= N; i++) { X[i] *= vmax; const v = vAt(T * (i - .5) / N); Ps.push(Ps[i - 1] + v / stride(v) * T / N); }
  const at = (arr, u) => { const f = clamp(u / T, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)); return lerp(arr[i], arr[i + 1], f - i); };
  const timeOfPsi = p => { let lo = 0, hi = T; for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (at(Ps, m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  // the foot further back along the way he sets off takes the first step
  const d0 = dirAt(0), ahead = f => { const p = lastPlant(A.feet[f]); return (p.x - P[0][0]) * Math.cos(d0) + (p.y - P[0][1]) * Math.sin(d0); };
  const first = ahead('L') < ahead('R') ? 'L' : 'R', other = first === 'L' ? 'R' : 'L', stance = walk ? .62 : .36, lat = walk ? .13 : .1;
  let k = 0;
  for (; k + .5 <= Ps[N] - .6; k++) {
    // each foot is down for its share of the stride cycle, timed by the stride count itself (so the feet always
    // overlap when walking and both are off together when running, whatever the speed)
    const u = timeOfPsi(k + .5), v = vAt(u), foot = k % 2 ? other : first, side = foot === 'L' ? -1 : 1, dist = at(X, u), p = posAt(dist), dir = dirAt(dist);
    const list = A.feet[foot], prev = lastPlant(list);
    let tOn = sGo + timeOfPsi(Math.max(0, k + .5 - stance)), tOff = prev.tPlan != null ? prev.tPlan : sGo + timeOfPsi(Math.max(0, k + .5 + stance - 2));
    // a first step off the standing foot gets a whole swing, even if it starts a moment before he does
    if (prev.tPlan == null) { tOff = Math.max(.02, Math.min(tOff, tOn - .3)); tOn = Math.max(tOn, tOff + .25); }
    stepTo(list, Math.min(tOff, tOn - .05), tOn, p[0] - Math.sin(dir) * side * lat, p[1] + Math.cos(dir) * side * lat, dir, walk ? .08 : .14 + .025 * v);
    lastPlant(list).tPlan = sGo + timeOfPsi(k + .5 + stance);
  }
  // closing steps: the foot that is free lands first, then the other comes alongside
  const end = P[P.length - 1], cr = [-Math.sin(endYaw), Math.cos(endYaw)], w = .17;
  // (on the stride count's beat, like the steps before them, but never after the run has ended)
  const land = (foot, j, t) => {
    const list = A.feet[foot], prev = lastPlant(list), side = foot === 'L' ? -1 : 1;
    const tOff = prev.tPlan != null ? prev.tPlan : sGo + timeOfPsi(Math.max(0, j + .5 + stance - 2)), tOn = Math.max(t, tOff + .14);
    stepTo(list, Math.min(tOff, tOn - .1), tOn, end[0] + cr[0] * side * w, end[1] + cr[1] * side * w, endYaw, .1);
    return tOn;
  };
  const beat = j => sGo + Math.min(T - .04, timeOfPsi(j + .5 - stance));
  const t1 = land(k % 2 ? other : first, k, beat(k)), t2 = land(k % 2 ? first : other, k + 1, Math.max(t1 + .16, beat(k + 1)));
  return {
    T: sGo + T, end: t2 + .05, sign: first === 'L' ? 1 : -1,
    at(s) { const u = clamp(s - sGo, 0, T), d = at(X, u), p = posAt(d); return { x: p[0], y: p[1], yaw: dirAt(d), v: vAt(u), psi: at(Ps, u) }; },
  };
}
// the body while running (or trudging) along a planned path: leaning into it, arms pumping against the legs, a
// bob that is lowest over the planted foot; on arrival he turns to face endYaw
function runPhase(run, V, walk, endYaw) {
  return (s, fL, fR) => {
    const st = run.at(s), k = FIG_SCALE, vr = clamp(st.v / V, 0, 1);
    const yaw = angMix(st.yaw, endYaw, ease(clamp((s - run.T + .3) / .5, 0, 1)));
    const sw = Math.cos(Math.PI * st.psi) * run.sign * Math.min(1, st.v / 1.2);
    const z = (walk ? 1.25 : 1.21) - (walk ? .02 : .05) * vr * Math.cos(2 * Math.PI * (st.psi - .5));
    const body = { kind: 'cele', k, pelvis: [st.x, st.y, z * k], hipYaw: yaw + sw * .12 * vr, chestYaw: yaw - sw * .15 * vr,
      lean: (walk ? .1 : .08) + (walk ? .06 : .26) * vr, roll: 0, bow: walk ? .3 : 0, footL: fL.pos, footR: fR.pos, toeL: fL.toe, toeR: fR.toe };
    body.pelvis[2] = reachZ(body.pelvis, body.hipYaw, [fL, fR], k);
    const f = bodyFrame(body), pump = walk ? .4 : 1.05, reach = (walk ? .9 : .72) * k;
    body.handR = armAt(f.shR, f.fwd, sw * pump, reach); body.handL = armAt(f.shL, f.fwd, -sw * pump, reach);
    body.poleR = body.poleL = vAdd(vMul(f.fwd, -1), [0, 0, -.4]);
    return body;
  };
}
// a step or two on the spot, to stand at (x, y) facing yaw with the feet w either side; returns when it is done
function stepInto(A, x, y, yaw, t, w = .17) {
  const cr = [-Math.sin(yaw), Math.cos(yaw)], aim = f => [x + cr[0] * (f === 'L' ? -w : w), y + cr[1] * (f === 'L' ? -w : w)];
  const far = f => { const p = lastPlant(A.feet[f]), q = aim(f); return Math.hypot(q[0] - p.x, q[1] - p.y); };
  for (const foot of far('L') > far('R') ? ['L', 'R'] : ['R', 'L']) {
    const p = lastPlant(A.feet[foot]), q = aim(foot);
    if (far(foot) < .05 && Math.abs(Math.atan2(Math.sin(yaw - p.toe), Math.cos(yaw - p.toe))) < .25) continue;
    stepTo(A.feet[foot], t, t + .22, q[0], q[1], yaw, .1);
    t += .2;
  }
  return t + .05;
}
// jumps on the spot from t: a crouch, both feet off together, a soft landing. Returns when the last has settled
function addJumps(A, t, n, top = CELE.jumpH, air = CELE.air) {
  for (let i = 0; i < n; i++) {
    const off = t + CELE.crouch, on = off + air - .03 * i, h = top - .05 * i;
    for (const foot of ['L', 'R']) { const p = lastPlant(A.feet[foot]); stepTo(A.feet[foot], off, on, p.x, p.y, p.toe, h + .1); }
    A.jumps.push({ t, off, on, h });
    t = on + .2;
  }
  return t;
}
// the pelvis over the jumps (the feet rise with it, a little more, so the knees tuck), and how far up he is (0..1)
function jumpZ(A, s) {
  let z = 0;
  for (const j of A.jumps) {
    if (s > j.t && s < j.off) z -= .2 * Math.sin(Math.PI * (s - j.t) / (j.off - j.t));
    else if (s >= j.off && s <= j.on) z += j.h * Math.sin(Math.PI * (s - j.off) / (j.on - j.off));
    else if (s > j.on && s < j.on + .2) z -= .16 * Math.sin(Math.PI * (s - j.on) / .2);
  }
  return z;
}
const airOf = (A, s) => A.jumps.reduce((a, j) => s >= j.off && s <= j.on ? Math.sin(Math.PI * (s - j.off) / (j.on - j.off)) : a, 0);
// the walk from a to b that keeps out of the batter's view (see routeTo), as a list of points
function routePts(a, b) {
  const pts = [{ x: a.x, y: a.y }];
  let at = { x: a.x, y: a.y };
  for (let i = 0; i < 8; i++) {
    const v = routeTo(at, b);
    if (!v || Math.hypot(v.x - at.x, v.y - at.y) < .05) break;
    pts.push({ x: v.x, y: v.y });
    at = { x: v.x, y: v.y };
  }
  pts.push({ x: b.x, y: b.y });
  return pts;
}
const pathLen = pts => pts.reduce((a, p, i) => i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);

// a win or a tie: the fielding side stays put (out of the batter's way) and takes it in
function standCele(C, bwFrom, bwPos, froms) {
  const win = C.kind === 'win', kinds = win ? ['hips', 'knees', 'head', 'hips', 'knees'] : ['hips', 'hang', 'hips', 'hang', 'hips'];
  const all = [[G.bowler, actor(C.bowlerT0, bwFrom), bwPos, win ? 'head' : 'shrug'], ...G.fielders.map((f, k) => [f, actor(C.t0, froms[k]), f, kinds[k]])];
  all.forEach(([p, A, pos, kind], k) => {
    let yaw = Math.atan2(BATTER.y - pos.y, BATTER.x - pos.x), t1 = 0;
    if (STILL) phase(A, 0, .3, takeIn(A, yaw, kind, 0, win));
    else {
      if (p !== G.bowler && hidesView(pos.x, pos.y)) {
        // in front of the batter after a chase: back to his spot first, at a trudge
        yaw = facing(p.home, BATTER);
        const run = planRun(A, routePts(pos, p.home), CELE.walk, .2 + .1 * k, yaw, true);
        phase(A, 0, .4, runPhase(run, CELE.walk, true, yaw));
        t1 = run.end - .25;
      } else {
        phase(A, 0, .4, takeIn(A, yaw, 'hang', 0, false));   // straighten up, arms down
        t1 = stepInto(A, pos.x, pos.y, yaw, .12 + .09 * k) - .15;
      }
      phase(A, t1, .5, takeIn(A, yaw, kind, t1, win));
    }
    p.cele = A;
  });
}
function takeIn(A, yaw, kind, t1, win) {
  return (s, fL, fR) => {
    // a win sinks in: the shoulders drop a little too far, then settle
    const a = win ? keyed(s - t1, [[0, 0], [.45, 1.15], [.85, 1]]) : 1;
    const shrug = kind === 'shrug' ? (STILL ? 0 : keyed(s - t1, [[0, 0], [.3, 1], [.8, 1], [1.2, 0]])) : 0;
    const o = { yaw, z: 1.21, lean: .06, bow: .05 };
    if (kind === 'knees') Object.assign(o, { z: 1.21 - .24 * a, lean: .8 * a, bow: .05 });
    else if (kind === 'head') Object.assign(o, { lean: .04, bow: .35 * a, chest: .45 * a, hips: .25 * a });
    else if (kind === 'hips') Object.assign(o, { lean: .06 + (win ? .1 : 0) * a, bow: (win ? .5 : .12) * a });
    else if (kind === 'hang') Object.assign(o, { lean: .06 + (win ? .1 : 0) * a, bow: (win ? .3 : .08) * a });
    else Object.assign(o, { lean: .04 - .08 * shrug, bow: .1, roll: .07 * shrug });
    const b = overFeet(fL, fR, o), f = bodyFrame(b);
    return setArms(b, kind === 'shrug' ? mixArms(armsFor('hips', b, f), armsFor('shrug', b, f), shrug) : armsFor(kind, b, f));
  };
}
// a loss: the fielding side runs in to the bowler, jumps, and huddles. The huddle forms a step from the bowler
// towards his team mates, moved back from the batter until nobody in it would stand in front of what he sees
function huddlePlan(bwPos) {
  const fs = G.fielders, cx = fs.reduce((a, f) => a + f.x, 0) / fs.length, cy = fs.reduce((a, f) => a + f.y, 0) / fs.length;
  const n = Math.hypot(cx - bwPos.x, cy - bwPos.y) || 1, a0 = Math.atan2(bwPos.y - cy, bwPos.x - cx);
  const places = fs.length + 1, ring = (c, r) => Array.from({ length: places }, (_, i) => ({ x: c.x + Math.cos(a0 + i * 2 * Math.PI / places) * r, y: c.y + Math.sin(a0 + i * 2 * Math.PI / places) * r }));
  const B = FIELD_BOUNDS, ok = c => ring(c, CELE.ring).every(p => p.x > B.x0 && p.x < B.x1 && p.y > B.y0 && p.y < B.y1 && clearAround(p.x, p.y));
  let c = { x: bwPos.x + (cx - bwPos.x) / n * CELE.ring, y: bwPos.y + (cy - bwPos.y) / n * CELE.ring };
  for (let i = 0; i < 40 && !ok(c); i++) {
    const dx = c.x - BATTER.x, dy = c.y - BATTER.y, m = Math.hypot(dx, dy) || 1;
    c = { x: clamp(c.x + dx / m * .3, B.x0 + 1.2, B.x1 - 1.2), y: clamp(c.y + dy / m * .3, B.y0 + 1.2, B.y1 - 1.2) };
    if (i % 8 === 7) c.x -= .5;   // pinned in a corner: work along the lane, away from the bat
  }
  // the bowler takes the place nearest him; the fielders share the others the shortest way
  const spots = ring(c, CELE.ring);
  let best = null;
  const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));
  for (const p of perms(fs.map((f, i) => i + 1))) {
    const cost = p.reduce((a, j, i) => a + Math.hypot(spots[j].x - fs[i].x, spots[j].y - fs[i].y) ** 2, 0);
    if (!best || cost < best.cost) best = { cost, p };
  }
  return { c, ring: spots, huddle: ring(c, CELE.huddle), assign: best.p };
}
function loseCele(C, bwFrom, bwPos, froms) {
  const hud = huddlePlan(bwPos);
  const all = [[G.bowler, actor(C.bowlerT0, bwFrom), bwPos, 0], ...G.fielders.map((f, k) => [f, actor(C.t0, froms[k]), f, hud.assign[k]])];
  for (const [, A, pos, slot] of all) {
    const S = hud.ring[slot];
    A.slot = slot; A.yaw = Math.atan2(hud.c.y - S.y, hud.c.x - S.x);
    if (STILL) { phase(A, 0, .3, cheer(A, Math.atan2(hud.c.y - pos.y, hud.c.x - pos.x))); continue; }
    const pts = routePts(pos, S), r = .06 + .07 * slot;
    if (pathLen(pts) > .35) { A.run = planRun(A, pts, CELE.run, r, A.yaw, false); A.arrive = A.run.end; }
    else A.arrive = stepInto(A, S.x, S.y, A.yaw, r);
    // the first there jump twice, a long way out once, the last in not at all
    A.done = addJumps(A, A.arrive + .02, A.arrive < 1.6 ? 2 : A.arrive < 2.4 ? 1 : 0);
  }
  if (!STILL) {
    const th = Math.max(...all.map(([, A]) => A.t0 + A.done)) + .1;
    for (const [, A] of all) {
      const H = hud.huddle[A.slot], s = th - A.t0;
      stepInto(A, H.x, H.y, A.yaw, s, .16);
      if (A.run) { phase(A, 0, .3, runPhase(A.run, CELE.run, false, A.yaw)); phase(A, A.run.T - .15, .35, cheer(A, A.yaw)); }
      else phase(A, 0, .3, cheer(A, A.yaw));
      phase(A, s, .45, huddle(A, hud));
    }
  }
  for (const [p, A] of all) p.cele = A;
}
function cheer(A, yaw) {
  // once his jumps are done and he is waiting for the others: bouncing on his knees, fists pumping in turn
  const done = A.jumps.length ? A.jumps[A.jumps.length - 1].on + .2 : A.arrive || 0;
  return (s, fL, fR) => {
    const air = airOf(A, s), w = STILL || s < done ? 0 : Math.sin(2 * Math.PI * 2.2 * (s - done)) * ease(clamp((s - done) / .25, 0, 1));
    const b = overFeet(fL, fR, { yaw, z: 1.22 + jumpZ(A, s) - .05 * Math.abs(w), lean: -.04, bow: -.12 - .1 * air });
    const a = armsFor('up', b, bodyFrame(b), .78 + .1 * air);
    a.L = vAdd(a.L, [0, 0, -.16 * Math.max(0, w)]); a.R = vAdd(a.R, [0, 0, -.16 * Math.max(0, -w)]);
    return setArms(b, a);
  };
}
// the held pose: a loose ring facing in, upright, fists up at a slightly different height each, so at 1x every
// figure keeps his own head and arms instead of the six merging into one lump
function huddle(A, hud) {
  const lift = [.86, .72, .8, .68, .76][A.slot];
  return (s, fL, fR) => {
    const body = overFeet(fL, fR, { yaw: A.yaw, z: 1.21, lean: .08, bow: -.08 }), f = bodyFrame(body);
    return setArms(body, armsFor('up', body, f, lift));
  };
}

/* the batter, in his own frame (see batterAt), with his bat. A state is { body, bat, hand, poleL, poleR }: hand
   is where his top hand is once it has let go of the bat (null while it holds on) */
function batterCele(C) {
  const t0 = C.t0, from = batterPlay(t0), A = actor(t0, from.body), k = FIG_SCALE, yaw0 = from.body.hipYaw;
  A.batter = true;
  const FL = lastPlant(A.feet.L), FR = lastPlant(A.feet.R);
  if (C.kind === 'win') {
    // a pivot on the front foot round to face the camera, the back foot stepping round in front
    const yc = Math.atan2(myV([1, 1, 0])[1], 1), cr = [-Math.sin(yc), Math.cos(yc)], w = .19;
    if (!STILL) {
      stepTo(A.feet.R, .22, .56, FL.x + cr[0] * 2 * w, FL.y + cr[1] * 2 * w, yc, .16);
      stepTo(A.feet.L, .42, .62, FL.x, FL.y, yc, .02);
      addJumps(A, .82, 2, .85, .5);   // high and slow enough to read at 1x: his shadow stays put as he goes up
    }
    phase(A, 0, .45, (s, fL, fR) => {
      const turn = STILL ? .5 : ease(clamp((s - .15) / .5, 0, 1)), yaw = angMix(yaw0, yc, turn);
      const pump = STILL ? 0 : keyed(s, [[2.55, 0], [2.71, 1], [2.87, .2], [3.03, 1], [3.27, 0]]), air = airOf(A, s);
      const body = overFeet(fL, fR, { yaw, z: 1.22 + jumpZ(A, s) - .04 * pump, lean: .06 + .12 * pump, bow: -.1 - .1 * air + .15 * pump, hips: STILL ? -.3 : 0 });
      const f = bodyFrame(body);
      // the bat up high in the bottom hand, blade to the sky; the other fist up, pumped down twice
      const H = vAdd(f.shR, vAdd(vMul(f.right, .14 * k), vAdd(vMul(f.fwd, .06 * k), [0, 0, (.84 + .06 * air) * k])));
      const D = vNorm(vAdd([0, 0, 1], vAdd(vMul(f.right, .28), vMul(f.fwd, -.12))));
      const up = vAdd(f.shL, vAdd(vMul(f.right, -.12 * k), vAdd(vMul(f.fwd, .06 * k), [0, 0, (.9 + .03 * air) * k])));
      const down = vAdd(f.shL, vAdd(vMul(f.right, .04 * k), vAdd(vMul(f.fwd, .34 * k), [0, 0, -.2 * k])));
      return { body, bat: { G: vSub(H, vMul(D, BAT.bottom * k)), D, N: f.fwd }, hand: vMix(up, down, pump),
        poleL: vMix(vAdd(vMul(f.right, -1), vMul(f.fwd, .3)), [0, 0, -1], pump), poleR: vAdd(f.right, vMul(f.fwd, .2)) };
    });
  } else {
    // lose: he stands up out of his stance, the bat hanging from the bottom hand with its toe on the ground, and his
    // head goes down (and shakes). Tie: the same, head up, with a shrug of the free hand
    const lose = C.kind === 'lose', yl = SIDE_ON + .5, cr = [-Math.sin(yl), Math.cos(yl)], cx = (FL.x + FR.x) / 2, cy = (FL.y + FR.y) / 2;
    if (!STILL) {
      stepTo(A.feet.R, .3, .56, cx + cr[0] * .15, cy + cr[1] * .15, yl, .08);
      stepTo(A.feet.L, .52, .74, cx - cr[0] * .15, cy - cr[1] * .15, yl, .06);
    }
    phase(A, 0, .5, (s, fL, fR) => {
      const yaw = angMix(yaw0, yl, STILL ? .6 : ease(clamp((s - .2) / .7, 0, 1)));
      const drop = STILL ? 1 : ease(clamp((s - .4) / .8, 0, 1));
      const shake = lose && !STILL && s > 1.4 && s < 2.5 ? Math.sin(2 * Math.PI * (s - 1.4) / .55) * .09 * Math.sin(Math.PI * (s - 1.4) / 1.1) : 0;
      const shrug = lose || STILL ? 0 : keyed(s, [[.55, 0], [.8, 1], [1.3, 1], [1.7, 0]]);
      const body = overFeet(fL, fR, { yaw, z: 1.2, lean: lose ? .1 + .18 * drop : .08, bow: lose ? .62 * drop : .1, chest: shake, roll: .06 * shrug });
      const f = bodyFrame(body);
      const H = vAdd(f.shR, vAdd(vMul(f.right, .1 * k), vAdd(vMul(f.fwd, .1 * k), [0, 0, -.84 * k])));
      const h = flat(vAdd(vMul(f.fwd, .75), vMul(f.right, .5))), sa = clamp((H[2] - .1) / ((BAT.len - BAT.bottom) * k), 0, 1), ca = Math.sqrt(1 - sa * sa);
      const D = [h[0] * ca, h[1] * ca, -sa], arms = mixArms(armsFor('hang', body, f), armsFor('shrug', body, f), shrug);
      return { body, bat: { G: vSub(H, vMul(D, BAT.bottom * k)), D, N: f.right }, hand: arms.L, poleL: arms.pL, poleR: vAdd(vMul(f.fwd, -1), [0, 0, -.3]) };
    });
  }
  return A;
}
// his own play (the swing, the stance) as a state, on the celebration's planted feet
function batterLive(A, t, fL, fR) {
  const { body, bat } = batterPlay(t), f = bodyFrame(body);
  return { body: { bow: 0, ...body, footL: fL.pos, footR: fR.pos, toeL: fL.toe, toeR: fR.toe }, bat, hand: null,
    poleL: vAdd(vMul(f.fwd, .3), [-.6, 0, -.5]), poleR: vAdd(vMul(f.fwd, .45), [.1, 0, -.7]) };
}
function mixCele(a, b, u) {
  const top = st => st.hand || vAdd(st.bat.G, vMul(st.bat.D, BAT.top * FIG_SCALE));
  return { body: mixBody(a.body, b.body, u), bat: mixBat(a.bat, b.bat, u), hand: a.hand || b.hand ? vMix(top(a), top(b), u) : null,
    poleL: vMix(a.poleL, b.poleL, u), poleR: vMix(a.poleR, b.poleR, u) };
}
function batterCeleAt(A, t) {
  const s = t - A.t0, fL = footAt(A.feet.L, s), fR = footAt(A.feet.R, s), ph = A.phases;
  let i = ph.length - 1;
  while (i > 0 && ph[i].t > s) i--;
  let st = ph[i].fn(s, fL, fR);
  const u = (s - ph[i].t) / ph[i].blend;
  if (u < 1) st = mixCele(i ? ph[i - 1].fn(s, fL, fR) : batterLive(A, t, fL, fR), st, ease(clamp(u, 0, 1)));
  st.body.pelvis[2] = reachZ(st.body.pelvis, st.body.hipYaw, [fL, fR], st.body.k);
  return { body: st.body, bat: { G: st.bat.G, D: st.bat.D, N: st.bat.N, free: st.hand, poleL: st.poleL, poleR: st.poleR } };
}

// the deciding ball has just been settled: plan everyone's celebration from where they are now
function startCelebration() {
  const d = G.del, t0 = G.time, bw = G.bowler, C = G.cele = { kind: G.match.result, t0 };
  const s = d.t0 == null ? Infinity : t0 - d.t0, following = s < d.runT + .4;
  C.bowlerT0 = following ? d.t0 + d.runT + .4 : t0;
  const bwFrom = following ? bowlerAt(d, d.runT + .4).body : bw.body || poseBody(bw.x, bw.y, bw.yaw, bw.pose);
  const bwPos = { x: bwFrom.pelvis[0], y: bwFrom.pelvis[1] };
  const froms = G.fielders.map(f => poseBody(f.x, f.y, f.yaw, f.pose));
  G.batter.cele = batterCele(C);
  if (C.kind === 'lose') loseCele(C, bwFrom, bwPos, froms);
  else standCele(C, bwFrom, bwPos, froms);
}

/* ---------- feedback ----------
   Sparks off the bat for a timed shot, a puff of dust for a mistimed one and where the ball thumps a house front.
   Each bit is a single pixel thrown out from the spot under gravity, gone in a fraction of a second. */
const SPARK = [rgb(255, 240, 170), rgb(255, 214, 10), rgb(255, 255, 255)];
const DUST = [rgb(214, 200, 176), rgb(190, 176, 152), rgb(232, 222, 204)];
function burst(at, n, colors, speed, up, life) {
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.283 + hash(i, G.balls) * .8, v = speed * (.5 + hash(G.balls, i) * .7);
    G.fx.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up * (.4 + hash(i + 7, G.balls)), t: 0, life: life * (.6 + hash(i, 3) * .5), c: colors[i % colors.length] });
  }
}
function stepFx(dt) {
  for (const p of G.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= GRAVITY * .5 * dt; }
  G.fx = G.fx.filter(p => p.t < p.life);
}
function drawFx() {
  for (const p of G.fx) { const q = project(p.x, p.y, p.z); drawDots([[q.sx, q.sy]], p.c); }
}
// a little jump, out of step by k
const hop = (age, k) => age < CHEER_T ? .16 * Math.abs(Math.sin(age * 11 + k * 1.3)) * (1 - age / CHEER_T) : 0;
// one of figure()'s poses part way to another (its own defaults stand in for a missing field)
const POSE_DEFAULT = { z: 0, scale: 1, crouch: 0, lean: 0, stance: .2, armR: 0, armL: .08 };
function lerpPose(a, b, u) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? POSE_DEFAULT[key], b[key] ?? POSE_DEFAULT[key], u);
  return out;
}
function drawKids() {
  const r = G.react, cheer = r && r.kind === 'boundary' && G.time - r.t0 < CHEER_T, C = G.cele;
  KIDS.forEach((k, i) => {
    let pose = cheer ? { ...k.cheer, z: k.cheer.z + hop(G.time - r.t0, i) * 1.6 } : k.pose;
    // a win: up off the step and jumping about for CELE_KIDS, then standing with their arms up
    if (C && C.kind === 'win') {
      const age = G.time - C.t0;
      pose = lerpPose(k.pose, k.cheer, ease(clamp(age / .2, 0, 1)));
      if (!STILL) pose.z += .26 * Math.abs(Math.sin(age * 11 + i * 1.3)) * ease(clamp(age / .25, 0, 1)) * clamp(1 - age / CELE_KIDS, 0, 1);
    }
    figure(k.x, k.y, k.yaw, pose, k.palette, dynamicAdd);
  });
}

/* ---------- update ---------- */
function update(dt) {
  G.time += dt;
  if (G.phase === 'pick') return;
  const d = G.del;
  if (d.stage === 'runup' && G.time >= d.tRelease) d.stage = 'flight';
  if (d.stage === 'flight') {
    if (G.time >= d.tPitch && !d.bounced) { d.bounced = true; sfx('bounce', .8); }
    if (d.hitAt != null && G.time >= d.hitAt) { strike(d); stepLive(d); }
    else if (G.time >= d.tStumps) passStumps(d);
    else G.ball = ballAt(d, G.time);
  } else if (d.stage === 'live') {
    stepLive(d);
  } else if (d.stage === 'done') {
    const b = G.ball;
    if (b && b.held) b.t = G.time - d.tHit;
    else if (b && b.t != null) { const due = G.time - d.tHit; while (b.t + PHYS_DT <= due + 1e-9) stepBall(b, PHYS_DT); }
    else if (b) stepLoose(b, dt);
    if (b && b.gone) G.ball = null;
    if ((d.timer -= dt) <= 0) {
      d.stage = 'wait'; d.timer = .5; G.ball = null;
      if (G.match && G.match.result) endMatch();
      else setField(nextField());
    }
  } else if (d.stage === 'wait') {
    d.timer -= dt;
  }
  // the fielders: set while the ball comes down, chasing while it is live, then back to their spots. Once the match
  // is decided they (and the bowler) are moved only by the celebration, which is drawn from the clock
  if (G.cele) { /* see startCelebration */ }
  else if (d.stage === 'live' || d.stage === 'done' && d.timer > DONE_T - HOLD_T) {
    const cheer = d.stage === 'done' && G.react && G.react.kind === 'wicket';
    team().forEach((f, k) => {
      if (f === G.bowler && G.time - d.t0 < d.runT + .4) return;
      const held = G.ball && G.ball.held === f;
      f.pose = f.running && d.stage === 'live' ? { ...walkPose(14, .34), ...RUN_POSE } : held ? (G.ball.caught ? POSE_CATCH : POSE_HOLD) : cheer ? POSE_CHEER : f === G.bowler ? POSE_BOWLER : POSE_FIELDER;
      // a wicket: everyone jumps, a little out of step
      if (cheer) f.pose = { ...f.pose, z: hop(G.time - G.react.t0, k) };
    });
  } else if (d.stage === 'done' || d.stage === 'wait') walkFielders(dt);
  stepFx(dt);
  // the bowler: running in and following through, then walking back to his mark
  const bw = G.bowler, s = d.t0 == null ? Infinity : G.time - d.t0;
  bw.body = null;  // a jointed body when running in or walking back; otherwise he is drawn from bw.pose like a fielder
  if (G.cele) {
    // he finishes his follow-through before he joins in
    if (G.time < G.cele.bowlerT0 && d.t0 != null) { const at = bowlerAt(d, s); bw.x = at.x; bw.yaw = at.yaw; bw.body = at.body; }
  } else if (d.stage !== 'wait' && s < d.runT + .4) {
    const at = bowlerAt(d, s);
    bw.x = at.x; bw.yaw = at.yaw; bw.body = at.body;
  } else if (d.stage === 'done' && d.timer <= DONE_T - HOLD_T || d.stage === 'wait') {
    const mark = { x: BOWLERS[nextType()].mark, y: BOWLER.y }, gx = mark.x - bw.x, gy = mark.y - bw.y, gap = Math.hypot(gx, gy);
    if (gap > .05) {
      const go = Math.min(gap, 3.6 * dt);
      bw.x += gx / gap * go; bw.y += gy / gap * go;
      bw.yaw = Math.atan2(gy, gx);
      bw.walk = (bw.walk || 0) + go;
      bw.body = gaitBody(bw.x, bw.y, bw.yaw, bw.walk);
    } else {
      bw.x = mark.x; bw.y = mark.y;
      bw.yaw = BOWLER_YAW;
      bw.pose = POSE_BOWLER;
      if (d.stage === 'wait' && d.timer <= 0 && G.auto && fieldSet()) bowl();
    }
  }
  if (G.batter.swing && G.time - G.batter.swing.tc > BAT_BACK) G.batter.swing = null;
}

/* ---------- drawing ---------- */
/* the bowler is always drawn jointed: his run-up and walk come as bodies, fielding poses are converted. When the
   source changes (run-up to standing, walking to the mark), he blends across for FADE_T instead of snapping */
const FADE_T = .14;
function drawBowler() {
  const bw = G.bowler, C = bw.cele;
  let body = C && G.time >= C.t0 ? actorBody(C, G.time - C.t0) : bw.body || poseBody(bw.x, bw.y, bw.yaw, bw.pose);
  // (no blend across a jump, such as a test snapping him to his mark)
  if (bw.drawn && body.kind !== bw.drawn.kind) bw.fade = vLen(vSub(body.pelvis, bw.drawn.pelvis)) < 1 ? { from: bw.drawn, t0: G.time } : null;
  if (bw.fade) {
    const u = (G.time - bw.fade.t0) / FADE_T;
    if (u >= 1 || u < 0) bw.fade = null;
    else body = mixBody(bw.fade.from, body, ease(u));
  }
  bw.drawn = body;
  return drawBody(body, bw.palette).handR;
}
function drawFigure(p, pose) {
  return figure(p.x, p.y, p.yaw, { scale: FIG_SCALE, ...pose }, p.palette, dynamicAdd);
}
/* ---------- the batter ----------
   Drawn jointed like the bowler, as a right-hander (back to the camera, chest to -y, left shoulder to the bowler)
   in his own frame. A left-hander is the same batter mirrored across the stumps line, so HAND flips the stance and
   every shot without a second set of numbers. The bat is a short dark handle inside both hands (top hand left,
   bottom hand right, so both arms always move with it) and a big flat willow blade.
   The bat is placed by its grip (top of the handle), the direction D from handle to toe, and the face normal N.
   Waiting: side-on, bat grounded by the back foot and tapping. As the bowler lets go: backlift over the right
   shoulder. A swing: from the backlift the bat comes down the shot's own arc, through the point where it really
   meets the ball (wherever that is, a late hit included) at the moment the ball leaves it, and on to a finish
   that points where the ball goes, high for a lofted hit and low for a ground shot; then he settles back.
   Each shot is an arc: at contact the bat lies along Dc and its toe moves along vc (towards the ball's way), so
   before contact the toe is always on the far side and after it the bat follows the ball. */
const BAT = { len: 1.4, handle: .3, blade: .3, half: .085, r: .115, sweet: 1.02, top: .05, bottom: .19 };
const BAT_TAPE = [70, 62, 58];
const UP = [0, 0, 1];
const slerp = (a, b, t) => {
  const c = clamp(vDot(a, b), -1, 1), w = Math.acos(c);
  if (w < 1e-4) return vNorm(vMix(a, b, t));
  if (Math.PI - w < 1e-3) { const p = vNorm(vCross(a, Math.abs(a[2]) < .9 ? UP : [1, 0, 0])); return t < .5 ? slerp(a, p, t * 2) : slerp(p, b, t * 2 - 1); }
  return vAdd(vMul(a, Math.sin((1 - t) * w) / Math.sin(w)), vMul(b, Math.sin(t * w) / Math.sin(w)));
};
const rotate = (v, axis, a) => vAdd(vAdd(vMul(v, Math.cos(a)), vMul(vCross(axis, v), Math.sin(a))), vMul(axis, vDot(axis, v) * (1 - Math.cos(a))));
const flat = v => vNorm([v[0], v[1], 0]);
const SIDE_ON = -Math.PI / 2;                      // the right-hander's chest faces -y
const myY = y => HAND === 'right' ? y : 2 * PITCH_Y - y;       // world <-> the right-hander's frame (its own inverse)
const myV = v => HAND === 'right' ? v : [v[0], -v[1], v[2]];
const BAT_C = { x: BATTER.x, y: myY(BATTER.y) };   // where he stands, in his own frame
/* the eight shots in the right-hander's frame (index = DIRS). E is the way the ball goes. type: drive (vertical
   bat, front foot), cut / late (horizontal or angled, back and across), glance (wrists, bat angled down, ball
   fine), pull (horizontal across the body; a sweep on one knee if the ball is low). chest: shoulder turn from
   side-on at contact and at the finish (negative opens him up towards the bowler and round to leg) */
const SHOT_KIND = [
  { type: 'drive', chest: [-.25, -.6] },          // N: off drive, past mid-off
  { type: 'cut', chest: [-.1, .15] },             // NE: square cut
  { type: 'late', chest: [.2, .45] },             // E: late cut, down to third man
  { type: 'glance', chest: [-.25, -.45] },        // SE: fine glance, straight behind
  { type: 'glance', chest: [-.45, -.85] },        // S: leg glance, fine leg
  { type: 'pull', chest: [-.9, -1.6] },           // SW: pull or sweep, square leg
  { type: 'drive', chest: [-.6, -1.5] },          // W: on drive and flick, midwicket
  { type: 'drive', chest: [-.4, -.85] },          // NW: straight drive, back past the bowler
];
const mirrorDir = k => HAND === 'right' ? k : DIR_WORLD.findIndex(w => w[0] === DIR_WORLD[k][0] && w[1] === -DIR_WORLD[k][1]);
// the bat's line and toe motion at contact for a shot, given the ball's way E (unit, flat) and the contact height
function shotArc(kind, E, low) {
  const down = [0, 0, -1];
  switch (kind.type) {
    case 'drive': return { Dc: vNorm(vSub(down, vMul(E, .22))), vc: E };
    case 'cut': return { Dc: vNorm([-.75, -.3, -.55]), vc: vNorm([.05, -.65, -.75]) };
    case 'late': return { Dc: vNorm([-.25, -.55, -.8]), vc: vNorm([.75, -.25, -.35]) };
    case 'glance': return { Dc: vNorm([-.15 + E[0] * .1, .2, -1]), vc: vNorm([E[0], E[1], 0]) };
    default: return low ? { Dc: vNorm([-.85, -.05, -.5]), vc: [0, 1, 0], sweep: true } : { Dc: vNorm([-1, -.1, -.12]), vc: vNorm([0, 1, .12]) };
  }
}
// the waiting stance and the backlift, in his own frame
function standBody(lift, tap) {
  const x = BAT_C.x, y = BAT_C.y, k = FIG_SCALE;
  const body = { kind: 'bat', k, pelvis: [x + .03 * lift, y, (1.16 - .03 * lift) * k], hipYaw: SIDE_ON + .12, chestYaw: SIDE_ON - .12 - .1 * lift, lean: .34 - .06 * lift, roll: 0,
    footL: [x - .29 - .05 * lift, y + .03, .12 + .03 * lift * (1 - lift)], footR: [x + .3, y - .02, .12], toeL: SIDE_ON - .55, toeR: SIDE_ON + .1 };
  // grounded: hands at the waist in front of him, toe of the bat by the back foot, face to the bowler; tapping
  const gS = [x - .02, y - .36, 1.2 + .07 * tap], dS = vNorm([.3, -.62, -1.18 + .1 * tap]);
  // backlift: hands by the back hip, the toe up over the right shoulder, face open to the off side
  const gB = [x + .26, y - .36, 1.45], dB = vNorm([.62, -.08, .78]);
  const bat = { G: vMix(gS, gB, lift), D: slerp(dS, dB, lift), N: slerp([-1, 0, 0], vNorm([-.2, -1, 0]), lift) };
  return { body, bat };
}
function shotBody(kind, C, E, phase, sweep) {
  const x = BAT_C.x, y = BAT_C.y, k = FIG_SCALE, front = kind.type === 'drive' || kind.type === 'glance' && E[0] < 0 || sweep;
  const reachX = clamp(C.x + (front ? .55 : .9), CREASE_X + .18, x - .1);  // a front foot towards the ball, never out of the crease
  const chest = SIDE_ON + kind.chest[phase], hips = SIDE_ON + .12 + (kind.chest[phase] - .12) * .6;
  const lineSide = clamp(C.y - y, -.5, .1);
  let pelvis, footL, footR, lean, toeL = SIDE_ON - .5 + (phase ? kind.chest[1] * .4 : 0), toeR = SIDE_ON + .1 + (phase ? kind.chest[1] * .35 : 0);
  if (sweep) {        // down on the right knee, front leg out towards the ball
    footL = [reachX - .1, y + lineSide * .6, .12]; footR = [x + .72, y + .08, .12];
    pelvis = [x + .3, y + .04, .74 * k]; lean = phase ? .2 : .4;
  } else if (front) { // weight onto a front foot planted towards the ball
    footL = [reachX, y + lineSide * .7, .12]; footR = [x + .3, y - .02, .12];
    pelvis = [lerp(reachX, x + .3, .48), y + lineSide * .15, (phase ? 1.12 : 1.06) * k]; lean = phase ? .22 : .36;
  } else {            // back and across: the back foot goes towards the off side, the front foot comes back to it
    footR = [x + .38, y - .2, .12]; footL = [x - .22, y - .05, .12];
    pelvis = [x + .1, y - .12, 1.14 * k]; lean = kind.type === 'pull' ? .15 : .3;
  }
  return { kind: 'bat', k, pelvis, hipYaw: hips, chestYaw: chest, lean, roll: kind.type === 'cut' || kind.type === 'late' ? .12 : 0, footL, footR, toeL, toeR };
}
const BAT_SWING = .11, BAT_THROUGH = .08, BAT_FINISH = .3, BAT_HOLD = .55, BAT_BACK = 1.05;
const BAT_COMMIT = .09, BODY_IN = .14;                            // he starts the bat down this long before the ball arrives
// two bat keys: along the shot's arc when both are on it (so a finish can go right over the top), else the short way
const mixBat = (a, b, u) => a.arc && a.arc === b.arc
  ? { ...arcBat(a.sw, lerp(a.phi, b.phi, u), vMix(a.G, b.G, u)) }
  : { G: vMix(a.G, b.G, u), D: slerp(a.D, b.D, u), N: slerp(a.N, b.N, u) };
const mixState = (a, b, u) => ({ body: mixBody(a.body, b.body, u), bat: mixBat(a.bat, b.bat, u) });
const arcBat = (sw, phi, g) => ({ G: g, D: rotate(sw.arc.Dc, sw.arc.axis, phi), N: rotate(sw.arc.Nc, sw.arc.axis, phi), arc: sw.arc, sw, phi });
// the batter at time t with no shot played: tapping, the backlift, and the bat starting down as the ball comes;
// if no shot comes he checks it and lifts it away, then settles once the ball has gone
function waitingAt(t) {
  const d = G.del, idle = G.phase === 'pick' || !d.t0 || d.stage === 'wait';
  let lift = idle ? 0 : ease(clamp((t - (d.tRelease - .18)) / .3, 0, 1));
  if (!idle && d.tStumps && t > d.tStumps + .1) lift *= 1 - ease(clamp((t - d.tStumps - .1) / .45, 0, 1));
  const tap = idle ? Math.max(0, Math.sin(t * 7)) ** 3 * (Math.floor(t * 7 / Math.PI / 2) % 3 === 2 ? 0 : 1) : 0;
  const rest = standBody(lift, tap);
  if (idle || !d.tContact) return rest;
  const start = d.tContact - BAT_COMMIT, u = t < start ? 0 : t < d.tContact ? ease((t - start) / BAT_COMMIT) : 1 - ease(clamp((t - d.tContact - .03) / .25, 0, 1));
  if (u <= 0) return rest;
  if (!d.commit) {   // a straight bat coming down the ball's line
    const c = ballAt(d, d.tContact), sw = { dir: HAND === 'right' ? 7 : 7, grade: 1, C: { x: c.x, y: c.y, z: c.z } };
    planSwing(sw, d);
    d.commit = { body: mixBody(standBody(1, 0).body, shotBody(SHOT_KIND[7], sw.C, sw.E, 0, false), .45), bat: arcBat(sw, -1.75, vAdd(vAdd(sw.gC, vMul(sw.arc.vc, -.3)), [0, 0, .4])) };
  }
  return mixState(rest, d.commit, u * .9);
}
// the whole batter at time t, in his own frame: { body, bat }; once the match is decided, his celebration
const batterAt = t => G.batter.cele && t >= G.batter.cele.t0 ? batterCeleAt(G.batter.cele, t) : batterPlay(t);
function batterPlay(t) {
  const sw = G.batter.swing;
  if (!sw || t < sw.t0) return waitingAt(t);
  const s = t - sw.t0, tc = sw.tc - sw.t0, from = sw.from, kind = SHOT_KIND[sw.dirC], E = sw.E, gC = sw.gC, vc = sw.arc.vc;
  // from wherever the bat was at the press: round the shot's arc (less of it when there is less time), through the
  // ball at the moment it leaves the bat, on through, and up (or along) to the finish; then back to waiting
  const reach = clamp(tc / BAT_SWING, .35, 1);
  const pre = arcBat(sw, -1.15 * reach, vAdd(vAdd(gC, vMul(vc, -.5 * reach)), [0, 0, .3 * reach]));
  const con = arcBat(sw, 0, gC);
  const thr = arcBat(sw, .9, vAdd(vAdd(gC, vMul(vc, .45)), [0, 0, .25]));
  const sh = vMix(sw.frame.shL, sw.frame.shR, .5);
  const high = sw.high && kind.type !== 'glance';
  const fin = arcBat(sw, high ? 3.3 : 1.5, high ? vAdd(vAdd(sh, vMul(E, .25)), [0, 0, .3]) : vAdd(vAdd(gC, vMul(vc, .7)), [0, 0, .4]));
  const bodyC = shotBody(kind, sw.C, E, 0, sw.arc.sweep), bodyF = shotBody(kind, sw.C, E, 1, sw.arc.sweep);
  // the body steps into the shot over at least BODY_IN, even when the bat gets there sooner, then turns through
  const tIn = Math.max(tc, BODY_IN), bodyNow = s <= tIn ? mixBody(from.body, bodyC, ease(s / tIn)) : s <= tIn + BAT_FINISH ? mixBody(bodyC, bodyF, ease((s - tIn) / BAT_FINISH)) : bodyF;
  const tPre = Math.min(tc * .55, BAT_SWING * .6);
  if (s <= tPre) return { bat: mixBat(from.bat, pre, ease(s / tPre)), body: bodyNow };
  if (s <= tc) { const u = (s - tPre) / (tc - tPre); return { bat: mixBat(pre, con, u * u * .5 + u * .5), body: bodyNow }; }
  if (s <= tc + BAT_THROUGH) return { bat: mixBat(con, thr, ((s - tc) / BAT_THROUGH) * (2 - (s - tc) / BAT_THROUGH)), body: bodyNow };
  if (s <= tc + BAT_FINISH) return { bat: mixBat(thr, fin, ease((s - tc - BAT_THROUGH) / (BAT_FINISH - BAT_THROUGH))), body: bodyNow };
  if (s <= tc + BAT_HOLD) return { bat: fin, body: bodyNow };
  const u = ease(clamp((s - tc - BAT_HOLD) / (BAT_BACK - BAT_HOLD), 0, 1)), rest = waitingAt(t);
  return { bat: mixBat(fin, rest.bat, u), body: mixBody(bodyNow, rest.body, u) };
}
// plan the swing's arc when the button is pressed: the shot for the direction, and where it meets the ball
function planSwing(sw, d) {
  const C0 = sw.C, C = [C0.x, myY(C0.y), C0.z], dirC = mirrorDir(sw.dir), kind = SHOT_KIND[dirC];
  const w = DIR_WORLD[dirC], E = vNorm([w[0], w[1], 0]);
  const arc = shotArc(kind, E, C[2] < .75);
  // the shoulders he will have at contact; if the bat along Dc would leave the hands out of reach, the bat tilts
  // towards the ball until they can reach (a ball struck late, behind him, is played with the bat reaching back)
  const bodyC = shotBody(kind, { x: C[0], y: C[1], z: C[2] }, E, 0, arc.sweep), frame = bodyFrame(bodyC);
  const S = vMix(frame.shL, frame.shR, .5), toBall = vNorm(vSub(C, S));
  let Dc = arc.Dc;
  for (let i = 1; i <= 10; i++) {
    const g = vSub(C, vMul(Dc, BAT.sweet * FIG_SCALE));
    if (vLen(vSub(vAdd(g, vMul(Dc, BAT.bottom * FIG_SCALE)), frame.shR)) < ARM_LEN * .97 * FIG_SCALE && vLen(vSub(vAdd(g, vMul(Dc, BAT.top * FIG_SCALE)), frame.shL)) < ARM_LEN * .97 * FIG_SCALE) break;
    Dc = slerp(arc.Dc, toBall, i / 10);
  }
  let axis = vCross(Dc, arc.vc);
  if (vLen(axis) < .2) axis = vCross(Dc, UP);
  axis = vNorm(axis);
  // the face looks the way the toe is moving
  const vt = vNorm(vCross(axis, Dc));
  sw.dirC = dirC; sw.E = E; sw.C = { x: C[0], y: C[1], z: C[2] }; sw.frame = frame;
  sw.arc = { Dc, vc: arc.vc, Nc: vt, axis, sweep: arc.sweep };
  sw.gC = vSub(C, vMul(Dc, BAT.sweet * FIG_SCALE));
  sw.high = sw.grade === 3 || sw.grade === 0 || sw.grade === 2;  // lofted perfect, looping mistimed, and air shots finish high
}
/* the final batter at time t: both hands on the handle, and both within reach. If the bat is out of reach the body
   leans to it first (the hips shift, the feet stay; the legs bend to suit), and only what is left moves the bat */
function poseBatter(t, lean) {
  const { body, bat } = batterAt(t), k = FIG_SCALE, reach = ARM_LEN * .985 * k;
  // (bat.free: the top hand has let go of the bat and is there instead; only the bottom hand holds it)
  const hands = () => [bat.free || vAdd(bat.G, vMul(bat.D, BAT.top * k)), vAdd(bat.G, vMul(bat.D, BAT.bottom * k))];
  const excess = () => {
    const f = bodyFrame(body), [hl, hr] = hands();
    let push = [0, 0, 0], worst = 0;
    for (const [h, sh] of bat.free ? [[hr, f.shR]] : [[hl, f.shL], [hr, f.shR]]) {
      const v = vSub(h, sh), n = vLen(v), e = n - reach;
      if (e > 0) { push = vAdd(push, vMul(v, e / n)); worst = Math.max(worst, e); }
    }
    return { push, worst };
  };
  // the bat may not pass through him: where the handle or blade comes inside his chest, he leans away from it
  const clash = () => {
    const f = bodyFrame(body), a = body.pelvis, ab = vSub(f.neck, a);
    let push = [0, 0, 0], worst = 0;
    for (let q = 0; q <= BAT.len; q += .1) {
      const p = vAdd(bat.G, vMul(bat.D, q * k)), u = clamp(vDot(vSub(p, a), ab) / vDot(ab, ab), 0, 1), c = vAdd(a, vMul(ab, u));
      const v = vSub(c, p); v[2] = 0;
      const n = vLen(v), e = (q < BAT.blade ? .38 : .42) * k - vLen(vSub(c, p));
      if (e > 0 && n > 1e-6) { push = vAdd(push, vMul(v, e / n)); worst = Math.max(worst, e); }
    }
    return { push, worst };
  };
  let moved = [0, 0, 0];
  const base = body.pelvis;
  for (let i = 0; i < 6 && !lean; i++) {
    const c = clash();
    if (c.worst > 1e-3) {
      const room = .4 - vLen(moved), st = vLen(c.push) > room ? vMul(c.push, Math.max(0, room) / vLen(c.push)) : c.push;
      moved = vAdd(moved, st);
      body.pelvis = vAdd(body.pelvis, st);
      body.pelvis[2] = Math.min(body.pelvis[2], reachZ(body.pelvis, body.hipYaw, [{ pos: body.footL, planted: true }, { pos: body.footR, planted: true }], k));
    }
    const { push, worst } = excess();
    if (worst < 1e-4 && c.worst <= 1e-3) break;
    if (worst < 1e-4) continue;
    const step = vMul([push[0], push[1], push[2] * .5], .9), room = .45 - vLen(moved);
    if (room <= 0) break;
    const s = vLen(step) > room ? vMul(step, room / vLen(step)) : step;
    moved = vAdd(moved, s);
    body.pelvis = vAdd(body.pelvis, s);
    body.pelvis[2] = Math.min(body.pelvis[2], reachZ(body.pelvis, body.hipYaw, [{ pos: body.footL, planted: true }, { pos: body.footR, planted: true }], k));
  }
  // a given lean (smoothed over frames by drawBatter) replaces the one just worked out
  if (lean) { body.pelvis = vAdd(base, lean); body.pelvis[2] = Math.min(body.pelvis[2], reachZ(body.pelvis, body.hipYaw, [{ pos: body.footL, planted: true }, { pos: body.footR, planted: true }], k)); }
  else moved = vSub(body.pelvis, base);
  for (let i = 0; i < 4; i++) {
    const { push, worst } = excess();
    if (worst < 1e-4) break;
    bat.G = vSub(bat.G, vMul(push, i < 3 ? .6 : 1));
  }
  [body.handL, body.handR] = hands();
  const f = bodyFrame(body);
  body.poleL = bat.poleL || vAdd(vMul(f.fwd, .3), [-.6, 0, -.5]);
  body.poleR = bat.poleR || vAdd(vMul(f.fwd, .45), [.1, 0, -.7]);  // the bottom elbow tucks in under the hands, never out past his back
  return { body, bat, moved };
}
// the lean towards or away from the bat is eased over a few frames, so the body never jumps when the bat whips
const LEAN_T = .05;
/* the blade is a flat board, so it is lit as one: the engine shades each ball of a capsule by its own curve, and a
   blade leaning back (the stance, tapping the crease) shows only the unlit lower-right sides of its balls, so it
   went dull brown. Here its pixels are captured, then painted pale willow, with a lit upper-left rim and a
   darker lower-right edge, whichever way it leans. segs: [a, b, r] in world units */
function drawBlade(segs) {
  const ramp = rampOf(BLADE), front = new Map();
  setCapture([]);
  for (const [a, b, r] of segs) capsule(a, b, r, r, () => BLADE, 'solid');
  const got = capture;
  setCapture(null);
  for (let j = 0; j < got.length; j += 4) {
    const i = got[j + 1] * W + got[j], d = got[j + 2];
    if (!(front.get(i) >= d)) front.set(i, d);
  }
  for (const [i, d] of front) {
    if (d <= zb[i]) continue;
    const lit = !front.has(i - W) || !front.has(i - 1), shade = !front.has(i + W) || !front.has(i + 1);
    zb[i] = d;
    pix[i] = ramp[lit === shade ? 3 : lit ? 4 : 2];
  }
  for (const [a, b, r] of segs) pendingShadows.push(a, r, b, r);
}
function drawBatter() {
  const p = G.batter, target = poseBatter(G.time).moved, f0 = p.fit, dt = f0 ? G.time - f0.t : 1;
  const lean = dt > 0 && dt < .1 ? vMix(f0.lean, target, 1 - Math.exp(-dt / LEAN_T)) : target;
  p.fit = { t: G.time, lean };
  const { body, bat } = poseBatter(G.time, vLen(lean) > 1e-9 ? lean : [0, 0, 1e-12]), k = FIG_SCALE;
  const add = HAND === 'right' ? dynamicAdd : (a, b, r0, r1, c) => dynamicAdd([a[0], myY(a[1]), a[2]], [b[0], myY(b[1]), b[2]], r0, r1, c);
  drawBody(body, p.palette, add);
  // the bat: a short taped handle that ends inside the hands, then a wide flat blade: two capsules
  // side by side across the face, so it reads as a board and not a stick
  const D = bat.D, N = vNorm(vSub(bat.N, vMul(D, vDot(bat.N, D)))), Wd = vNorm(vCross(D, N));
  const pt = (s, w) => { const q = vAdd(vAdd(bat.G, vMul(D, s * k)), vMul(Wd, w * k)); return [q[0], q[1], Math.max(.04, q[2])]; };
  add(pt(.02, 0), pt(BAT.handle, 0), .055 * k, .06 * k, () => BAT_TAPE);
  const flip = q => HAND === 'right' ? q : [q[0], myY(q[1]), q[2]];
  drawBlade([-BAT.half, BAT.half].map(w => [flip(pt(BAT.blade + .06, w)), flip(pt(BAT.len - .05, w)), BAT.r * k]));
  // a whip: when the blade moves further than it can be followed in one frame (a press right on the ball), smear it
  // with in-between blades along its path, solid like the bat itself
  if (G.batter.swing) {
    const was = poseBatter(G.time - 1 / 60).bat, toe = b => vAdd(b.G, vMul(b.D, BAT.len * k)), gap = vLen(vSub(toe(bat), toe(was)));
    const smear = [];
    for (let i = 1, n = Math.min(3, Math.floor(gap / .55)); i <= n; i++) {
      const m = mixBat(was, bat, i / (n + 1)), q = s => vAdd(m.G, vMul(m.D, s * k));
      smear.push([flip(q(BAT.blade + .1)), flip(q(BAT.len - .1)), BAT.r * .8 * k]);
    }
    if (smear.length) drawBlade(smear);
  }
}
// the batter's stumps are a stack of bricks, staggered like a gully wicket. Bowled, they topple back off the stack:
// the higher a brick sat, the further it goes
function drawStumps() {
  const st = G.stumps, u = st.down ? ease(clamp((G.time - st.t) / .35, 0, 1)) : 0;
  for (let k = 0; k < STUMP_BRICKS; k++) {
    const off = k % 2 ? .05 : -.04;
    let x = STUMPS_X + off * .4, y = PITCH_Y + off, z = k * BRICK.h;
    if (u) {
      x += (.12 + k * .3) * u;
      y += (hash(k, st.seed) - .5) * .7 * u;
      z *= 1 - u;
    }
    box(x - BRICK.w / 2, y - BRICK.l / 2, z, x + BRICK.w / 2, y + BRICK.l / 2, z + BRICK.h - .02, BRICKWORK, 30 + k);
    castShadow(x, y, z + .1, .28);
  }
}
function drawBall(b) {
  sphere(b.x, b.y, b.z, BALL_R, BALL_COLOR, 'gloss');
  castShadow(b.x, b.y, b.z - BALL_R, BALL_R * .96, 1, 0);
  if (b.z < BALL_R + .3) castShadow(b.x, b.y, 0, BALL_R * .8, 2, 0);
}
// a signal shape: yellow fill with an ink outline, so it reads on any surface
function drawSignal(fill) {
  const inside = new Set(fill.map(([x, y]) => (Math.round(y) * W + Math.round(x))));
  const ink = [];
  for (const [x, y] of fill) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const j = (Math.round(y) + dy) * W + Math.round(x) + dx;
    if (!inside.has(j)) ink.push([Math.round(x) + dx, Math.round(y) + dy]);
  }
  drawDots(ink, INK);
  drawDots(fill, SIGNAL);
}
/* the landing marker: a target ring on the pitching spot. If the ball will move off the pitch, a
   wedge on the ring's rim points the way it will go, longer for more movement (about 4 px for the smallest swing to
   10 px for the biggest turn), since that is how much hitting across it costs (see CROSS); a ball that holds its
   line has none */
function drawMarker(d) {
  const p = project(d.P.x, d.P.y, 0), rx = 8, ry = 4;
  const ring = [], outer = [];
  for (let a = 0; a < 6.283; a += .12) {
    ring.push([p.sx + Math.cos(a) * rx, p.sy + Math.sin(a) * ry], [p.sx + Math.cos(a) * (rx - 1), p.sy + Math.sin(a) * (ry - 1)]);
    outer.push([p.sx + Math.cos(a) * (rx + 1), p.sy + Math.sin(a) * (ry + 1)]);
  }
  drawDots(outer, INK);
  drawDots(ring, SIGNAL);
  drawDots([[p.sx, p.sy], [p.sx - 1, p.sy], [p.sx + 1, p.sy], [p.sx, p.sy - 1], [p.sx, p.sy + 1]], SIGNAL);
  if (d.move === 'none') return;
  const q = project(d.P.x, d.P.y + Math.sign(d.end - d.aim), 0);
  let ux = q.sx - p.sx, uy = q.sy - p.sy;
  const n = Math.hypot(ux, uy);
  ux /= n; uy /= n;
  const edge = 1 / Math.hypot(ux / rx, uy / ry), base = edge + 2, tip = base + 2 + Math.max(0, d.amount - .5) * 18, half = 3;
  const bx = p.sx + ux * base, by = p.sy + uy * base, tx = p.sx + ux * tip, ty = p.sy + uy * tip;
  const fill = [];
  for (let iy = Math.floor(Math.min(by, ty) - half - 1); iy <= Math.ceil(Math.max(by, ty) + half + 1); iy++) {
    for (let ix = Math.floor(Math.min(bx, tx) - half - 1); ix <= Math.ceil(Math.max(bx, tx) + half + 1); ix++) {
      const ox = ix + .5 - bx, oy = iy + .5 - by, along = ox * ux + oy * uy, across = Math.abs(-ox * uy + oy * ux);
      if (along >= 0 && along <= tip - base && across <= half * (1 - along / (tip - base))) fill.push([ix, iy]);
    }
  }
  drawSignal(fill);
}
// a ground segment from (x0, y0) to (x1, y1) as whole screen pixels, `thick` pixels deep
function segPixels(x0, y0, x1, y1, thick, out = []) {
  const a = project(x0, y0, 0), b = project(x1, y1, 0), n = Math.ceil(Math.hypot(b.sx - a.sx, b.sy - a.sy) * 2) + 1;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(lerp(a.sx, b.sx, k / n)), y = Math.round(lerp(a.sy, b.sy, k / n));
    for (let j = 0; j < thick; j++) out.push([x, y + j]);
  }
  return out;
}
/* the swing cue: a hitting line on the ground across the ball's path where bat meets ball. Two ticks start wide
   apart either side of the ball's line and slide in as the ball comes; when they meet they become one solid bar:
   swing now. It shows for the last CUE_T seconds (the same for both bowlers, so it is one rhythm to learn) and goes
   as soon as you swing */
function drawCue(d) {
  const lead = d.tContact - G.time;
  if (d.swing || lead > CUE_T || lead < -CUE_NOW) return;
  const y = ballAt(d, d.tContact).y, x = CONTACT_X;
  let fill;
  if (Math.abs(lead) <= CUE_NOW) fill = segPixels(x, y - CUE_GAP[0] - CUE_TICK, x, y + CUE_GAP[0] + CUE_TICK, 2);
  else {
    const g = lerp(CUE_GAP[0], CUE_GAP[1], clamp(lead / CUE_T, 0, 1));
    fill = segPixels(x, y + g, x, y + g + CUE_TICK, 2, segPixels(x, y - g - CUE_TICK, x, y - g, 2));
  }
  // keep the ball itself in view: the cue never paints over it
  const b = G.ball, c = b && project(b.x, b.y, b.z), r = c && Math.abs(project(b.x, b.y, b.z + BALL_R).sy - c.sy) + 2;
  drawSignal(c ? fill.filter(([px, py]) => Math.hypot(px - c.sx, py - c.sy) > r) : fill);
}
// the direction guide: one faint dotted spoke from the batter, the way you aim (aimDir()); the other seven are not drawn
const roseCenter = () => project(BATTER.x, BATTER.y, 1.05);
const dirFromScreen = (dx, dy) => (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8;
function drawRose() {
  const c = roseCenter(), cx = Math.round(c.sx), cy = Math.round(c.sy), k = aimDir();
  const ux = Math.sin(k * Math.PI / 4), uy = -Math.cos(k * Math.PI / 4);
  for (let r = ROSE_IN; r <= ROSE_OUT; r += 2) {
    const ix = Math.round(cx + ux * r), iy = Math.round(cy + uy * r);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = iy * W + ix, v = pix[i];
    pix[i] = rgb(lerp(v & 255, 255, .5), lerp(v >> 8 & 255, 255, .5), lerp(v >> 16 & 255, 255, .5));
  }
}
function draw() {
  pix.set(bakedPix);
  zb.set(bakedZ);
  pendingShadows.length = 0;
  const d = G.del;
  const hand = drawBowler(), held = G.ball && G.ball.held;
  if (held === G.bowler) Object.assign(G.ball, { x: hand[0], y: hand[1], z: hand[2] });
  for (const f of G.fielders) {
    const h = f.cele ? drawBody(actorBody(f.cele, G.time - f.cele.t0), f.palette).handR : drawFigure(f, f.pose);
    if (held === f) Object.assign(G.ball, { x: h[0], y: h[1], z: h[2] });
  }
  drawKids();
  drawStumps();
  drawBatter();
  if (d.stage === 'runup') drawBall({ x: hand[0], y: hand[1], z: hand[2] });
  else if (G.ball) drawBall(G.ball);
  const windT = STILL ? 0 : Math.floor(G.time * WIND_FPS) / WIND_FPS;
  drawLeaves(windT);
  drawTufts(windT);
  flushShadows();
  applyShadows(bakedZ);
  shadeEdges();
  drawFx();
  if (G.phase !== 'pick') {
    drawRose();
    if ((d.stage === 'runup' || d.stage === 'flight') && !d.bounced) drawMarker(d);
    if (d.stage === 'flight') drawCue(d);
  }
  ctx.putImageData(image, 0, 0);
}

/* ---------- input ----------
   Aim, then hit: one swing per ball. Keyboard: hold the arrows (two for a diagonal, opposite ones cancel), or a
   numpad or Q W E / A D / Z X C key, and press Space or Enter to swing that way; with no direction key held the
   swing goes straight. Mouse: the pointer's direction from the batter, snapped to the nearest of the 8, and a click
   swings that way. Touch has no hover, so a tap aims and swings at once. A press is graded at the moment it was
   made (pressTime). Nothing reaches the game while the team picker (or any other dialog) is open. */
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const KEY_DIRS = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
  KeyW: 0, KeyE: 1, KeyD: 2, KeyC: 3, KeyX: 4, KeyZ: 5, KeyA: 6, KeyQ: 7,
};
const isHitKey = e => e.code === 'Space' || e.key === ' ' || e.key === 'Enter';
const heldArrows = new Set(), heldDirKeys = [];   // the direction keys held now; the last pressed letter key wins
/* what the highlight shows and which way each input swings. Every key press, pointer move and tap takes a number
   from inputSeq, so the guide can tell which came last */
let inputSeq = 0, keySeq = 0, moveSeq = 0, pointerOver = false, pointerDir = STRAIGHT, tapAim = null, hookAim = null;
function keyDir() {
  if (heldDirKeys.length) return KEY_DIRS[heldDirKeys[heldDirKeys.length - 1]];
  let sx = 0, sy = 0;
  for (const k of heldArrows) { sx += ARROWS[k][0]; sy += ARROWS[k][1]; }
  if (sx || sy) return dirFromScreen(sx, sy);
  return hookAim != null ? hookAim : STRAIGHT;
}
const keysHeld = () => heldArrows.size > 0 || heldDirKeys.length > 0 || hookAim != null;
function aimDir() {
  if (keysHeld()) return keyDir();
  if (tapAim && tapAim.del === G.del && tapAim.seq > Math.max(keySeq, moveSeq)) return tapAim.dir;
  if (pointerOver && moveSeq > keySeq) return pointerDir;
  return STRAIGHT;
}
const inputBlocked = () => G.phase === 'pick' || !!document.querySelector('dialog[open]');
/* the game time of an input event. G.time is the time of the last frame; the press happened e.timeStamp - lastFrame
   later on the same clock, so a press is graded at the moment it was made, not at the frame that handles it */
const pressTime = e => G.frozen ? G.time : G.time + clamp((e.timeStamp - last) / 1000, 0, .04);
/* one tap acts on one layer. A dialog opened by a press (the result tap opens the picker on its way down) ignores
   pointer clicks until that press is lifted and LAYER_GUARD ms have passed, so the same tap cannot pick the team
   under the finger; and the game ignores presses for LAYER_GUARD ms after any dialog closes, so the tap that closed
   it cannot swing. Keyboard clicks (detail 0) are never held back */
const LAYER_GUARD = 300;
let openPress = null, guardUntil = 0;
const guardFrom = () => { guardUntil = performance.now() + LAYER_GUARD; };
addEventListener('pointerup', e => { if (openPress === e.pointerId) { openPress = null; guardFrom(); } }, true);
addEventListener('pointercancel', e => { if (openPress === e.pointerId) { openPress = null; guardFrom(); } }, true);
addEventListener('click', e => {
  if (e.detail && e.target.closest('dialog[open]') && (openPress != null || performance.now() < guardUntil)) {
    e.preventDefault(); e.stopPropagation();
  }
}, true);
addEventListener('close', guardFrom, true);
// the screen direction from the batter to a pointer event, or null right on top of him
function pointerAim(e) {
  const r = canvas.getBoundingClientRect(), c = roseCenter();
  const dx = (e.clientX - r.left) * W / r.width - c.sx, dy = (e.clientY - r.top) * H / r.height - c.sy;
  return Math.hypot(dx, dy) < 3 ? null : dirFromScreen(dx, dy);
}
// a mouse aims as it moves; touch (and a pen) do not hover, so a tap aims and swings at once
const hovers = e => e.pointerType === 'mouse';
canvas.addEventListener('pointermove', e => {
  if (!hovers(e)) return;
  pointerOver = true;
  if (inputBlocked()) return;
  const dir = pointerAim(e);
  if (dir == null) return;
  pointerDir = dir;
  moveSeq = ++inputSeq;
});
canvas.addEventListener('pointerleave', e => { if (hovers(e)) pointerOver = false; });
canvas.addEventListener('pointerdown', e => {
  canvas.focus({ preventScroll: true });
  if (performance.now() < guardUntil) return;
  if (inputBlocked()) return;
  if (replay()) { openPress = e.pointerId; guardFrom(); return; }
  if (G.phase === 'over') return;
  const dir = pointerAim(e);
  if (dir == null) return;
  if (hovers(e)) { pointerOver = true; pointerDir = dir; moveSeq = ++inputSeq; }
  else tapAim = { dir, del: G.del, seq: ++inputSeq };
  swingAt(dir, pressTime(e));
});
/* keys work wherever focus is on the page (after the mute button, say), except in a text field or on a link.
   Space always belongs to the game outside a dialog: it never scrolls and never presses a focused button (the
   browser presses a button on Space's keyup, so that is cancelled too). Enter on a button still presses it */
let spaceTaken = false;
addEventListener('keydown', e => {
  if (inputBlocked() || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, a')) return;
  const dirKey = !!ARROWS[e.key] || KEY_DIRS[e.code] != null, hit = isHitKey(e);
  if (!dirKey && !hit) return;
  if (hit && e.key === 'Enter' && e.target.closest('button')) return;
  e.preventDefault();
  if (hit && e.key !== 'Enter') spaceTaken = true;
  keySeq = ++inputSeq;
  if (ARROWS[e.key]) heldArrows.add(e.key);
  else if (dirKey && !heldDirKeys.includes(e.code)) heldDirKeys.push(e.code);
  if (e.repeat) return;
  // after the result any key of the game (or Enter / Space) plays again
  if (G.phase === 'over') { replay(); return; }
  // a hit key swings in the keyboard's direction, timed as it goes down; a press before the ball is bowled does nothing
  if (hit) swingAt(keyDir(), pressTime(e));
});
addEventListener('keyup', e => {
  heldArrows.delete(e.key);
  const k = heldDirKeys.indexOf(e.code);
  if (k >= 0) heldDirKeys.splice(k, 1);
  if (spaceTaken && (e.code === 'Space' || e.key === ' ')) { spaceTaken = false; e.preventDefault(); }
});
addEventListener('blur', () => { heldArrows.clear(); heldDirKeys.length = 0; });
// the hint follows the input last used: a touch or pen press, or a mouse or key
addEventListener('pointerdown', e => { setTouchInput(e.pointerType !== 'mouse'); showHint(true); }, true);
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && touchInput) { setTouchInput(false); showHint(true); } }, true);
addEventListener('keydown', () => { if (touchInput) { setTouchInput(false); showHint(true); } }, true);

/* ---------- sound ----------
   Web Audio: short oscillator blips and filtered noise, no files. The context starts on the first
   press or key (browsers only allow sound after a gesture); headless and muted play stays silent */
let muted = false, audio = null, noiseBuf = null;
function ensureAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio = new AC();
  noiseBuf = audio.createBuffer(1, audio.sampleRate / 2, audio.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}
addEventListener('pointerdown', ensureAudio, true);
addEventListener('keydown', ensureAudio, true);
// filtered noise: a slap, a clatter, a crowd's breath
function hiss(at, length, level, freq, q = .8, type = 'bandpass') {
  const src = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
  src.buffer = noiseBuf;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + Math.min(.01, length / 4));
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(at, Math.random() * .2); src.stop(at + length + .02);
}
// a pitch glide from f0 to f1, fading out: a knock, a thud, a voice
function glide(at, f0, f1, length, level, type = 'sine', attack = .005) {
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + length);
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + attack);
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(at); osc.stop(at + length + .02);
}
// a struck body: noise through a narrow band-pass, hit in about a millisecond and dying away. A click, a pock, a clack
function knock(at, length, level, freq, q = 4, type = 'bandpass') {
  const src = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
  src.buffer = noiseBuf;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + .001);
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(at, Math.random() * .2); src.stop(at + length + .02);
}
const jit = (a, b) => a + Math.random() * (b - a);  // sound only: never the game's seeded rng
// the bat-on-ball sound is candidate 7, "Crisp but full", from the bat-sound audition, ported as is. These two helpers
// are the audition's mode() and burst(), renamed so they clash with no game function (strike() is the hit itself,
// ring and burst are taken too); `out` is the node they play into.
// a damped resonance: a sine held at one pitch, faded in over `attack` seconds and dying away over `decay` seconds.
// `bend` > 1 starts it that much flatter and lets it settle up to pitch in 20 ms (a rubbery "pop"; 1 = none)
function sfxRing(out, at, freq, decay, level, attack = .003, bend = 1) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq / bend, at);
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq, at + .02);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + attack + decay + .02);
}
// a burst of noise through a band-pass (a struck, rough body), with a gentle low-pass on top to keep it round.
// lp = 0 skips the low-pass
function sfxStrike(out, at, freq, q, decay, level, attack = .002, lp = 2500) {
  const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  let tail = f;
  if (lp) { const l = audio.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; l.Q.value = .5; f.connect(l); tail = l; }
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
  s.connect(f); tail.connect(g).connect(out);
  s.start(at, Math.random() * .2); s.stop(at + attack + decay + .02);
}
// the audition played louder than the game. The hit goes through one gain of this much, which brings a perfect hit's
// peak down to about 0.4 without changing its shape (scaling the levels inside would: their decays end at a fixed floor)
const HIT_LEVEL = .66;
function sfx(kind, amount = 1) {
  if (!audio || muted || audio.state !== 'running') return;
  const now = audio.currentTime + .005;
  if (kind === 'hit') {
    // bat on tennis ball: a small click on top of a strong, longer wooden body. Perfect (0) is fullest, good (1) a
    // little higher and shorter, mistimed (2 or more) higher, thinner and shorter with more click. Each hit varies
    // about 3% in pitch and 6% in level
    const g = amount >= 2 ? 2 : amount >= 1 ? 1 : 0;
    const p = jit(.97, 1.03) * [1, 1.04, 1.14][g], v = jit(.94, 1.06) * [1, .85, .6][g], len = 1.6 * [1, .85, .6][g];
    const out = audio.createGain();
    out.gain.value = HIT_LEVEL; out.connect(audio.destination);
    sfxStrike(out, now, 2600 * p, .8, .006, .65 * v * [1, 1, 1.3][g], .0007, 0);
    sfxRing(out, now, 470 * p, .07 * len, .3 * v, .0015);
    sfxRing(out, now, 200 * p, .1 * len, .4 * v * [1, .8, .5][g], .002);
    sfxStrike(out, now, 470 * p, 4, .06 * len, 1.2 * v, .0015, 3000);
  } else if (kind === 'bounce') {
    glide(now, 200, 90, .07, .04 + .16 * Math.min(1, amount), 'sine');
    hiss(now, .02, .03 * Math.min(1, amount), 1800);
  } else if (kind === 'wall') {
    // a thump on plaster (or the oil drum)
    glide(now, 120, 60, .16, .26 * amount, 'triangle');
    hiss(now, .08, .1 * amount, 500, 1.2);
  } else if (kind === 'bricks') {
    glide(now, 150, 70, .12, .2, 'triangle');
    for (let k = 0; k < 6; k++) {
      const at = now + .02 + k * jit(.05, .09);
      // each brick a stony clack: a click and a hard, short ring at one pitch, over grit
      const f = jit(1100, 1900);
      hiss(at, .05, jit(.06, .12), jit(900, 1700), 2);
      knock(at, .004, jit(.25, .4), jit(3000, 4200), .8);
      glide(at, f * 1.02, f, .03, jit(.04, .07), 'sine', .001);
      glide(at, f * 2.76, f * 2.7, .015, .02, 'sine', .001);
    }
  } else if (kind === 'cheer') {
    // a few kids: rising "yay"s with a wobble, over a breathy roar
    hiss(now, .9, .05, 1800, .5);
    for (let k = 0; k < 4; k++) {
      const at = now + jit(0, .18), f = jit(520, 760);
      glide(at, f, f * jit(1.25, 1.5), jit(.35, .55), .045, 'triangle', .04);
    }
    for (let k = 0; k < 6; k++) hiss(now + .1 + k * jit(.08, .13), .05, jit(.03, .06), jit(1500, 2600));
  } else if (kind === 'groan') {
    // the batting kids: a falling "ohh"
    for (let k = 0; k < 3; k++) {
      const at = now + jit(0, .08), f = jit(260, 340);
      glide(at, f, f * .62, jit(.6, .8), .06, 'sawtooth', .06);
    }
    hiss(now, .5, .03, 600, .7, 'lowpass');
  }
}
const muteButton = document.getElementById('mute');
muteButton.addEventListener('click', () => {
  muted = !muted;
  muteButton.textContent = muted ? 'sound off' : 'sound on';
  muteButton.setAttribute('aria-pressed', String(muted));
});

/* ---------- team picker ----------
   Shown before a match: nine kit swatches in a 3 x 3 grid. Click or tap a team, or move with the
   arrow keys and press Enter or Space. The rival is drawn at random from the other eight, less any kit too close
   to yours (KIT_CLASH). */
const picker = document.getElementById('picker'), teamGrid = document.getElementById('teams');
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const teamButtons = TEAMS.map(t => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.team = t.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<span class="swatch" aria-hidden="true"></span><span></span>';
  b.firstChild.style.setProperty('--body', hex(t.body));
  b.lastChild.textContent = t.name;
  b.addEventListener('click', () => chooseTeam(t.id));
  teamGrid.append(b);
  return b;
});
// one tab stop for the grid; the arrow keys move between teams
function focusTeam(k) {
  teamButtons.forEach((b, i) => { b.tabIndex = i === k ? 0 : -1; });
  teamButtons[k].focus();
}
teamGrid.addEventListener('keydown', e => {
  const k = teamButtons.indexOf(document.activeElement);
  if (k < 0) return;
  const cols = 3, n = teamButtons.length;
  const next = { ArrowRight: (k + 1) % n, ArrowLeft: (k + n - 1) % n, ArrowDown: (k + cols) % n, ArrowUp: (k + n - cols) % n, Home: 0, End: n - 1 }[e.key];
  if (next == null) return;
  e.preventDefault();
  focusTeam(next);
});
// before the first pick there is nothing to go back to, so Escape cannot close the picker
picker.addEventListener('cancel', e => { if (!picker.dataset.picked) e.preventDefault(); });
// once a team has been picked there is something to go back to: Escape, a tap outside the box or the back button
const pickerBack = document.getElementById('picker-back');
pickerBack.addEventListener('click', () => picker.close());
// (only a tap that also started outside: the tap after a result opens the picker on its way down, and its click must
// not land on the new backdrop and close it again)
const outsidePicker = e => {
  const r = picker.getBoundingClientRect();
  return e.target === picker && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
};
let downOutside = false;
picker.addEventListener('pointerdown', e => { downOutside = outsidePicker(e); });
picker.addEventListener('click', e => {
  if (downOutside && outsidePicker(e) && picker.dataset.picked) picker.close();
  downOutside = false;
});
picker.addEventListener('close', () => {
  // closed without a pick: go back to where it was opened from. After the result is up that starts the next match in
  // the same shirts; before then (the deciding ball still playing out) the match carries on and shows its result
  if (G.phase === 'pick') { if (picker.dataset.from === 'over') newMatch(); else G.phase = 'idle'; }
  canvas.focus({ preventScroll: true });
});
function openPicker() {
  // (not while the deciding ball plays out: the result and celebration are always seen first; see renderHud)
  if (G.match && G.match.result && G.phase !== 'over' && G.phase !== 'pick') return;
  // mid-match, picking a team throws the score away, so say so, and offer the way back to the match as it was
  const mid = !!(G.match && !G.match.result && G.phase !== 'pick');
  picker.dataset.from = G.phase;
  document.getElementById('picker-new').hidden = !mid;
  pickerBack.hidden = !mid;
  G.phase = 'pick';
  const k = Math.max(0, picker.dataset.picked ? TEAMS.indexOf(G.you) : 0);
  teamButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(!!picker.dataset.picked && i === k)));
  picker.showModal();
  focusTeam(k);
}
function chooseTeam(id) {
  setTeams(id);
  picker.dataset.picked = '1';
  nodes.match.textContent = G.you.name + ' v ' + G.rival.name;
  newMatch();
  picker.close();
  canvas.focus();
}
document.getElementById('team').addEventListener('click', openPicker);

/* ---------- boot ---------- */
addEventListener('resize', fit);
fit();
bake();
/* pause: while any dialog is open (the team picker or the shell's Rules) or the tab is hidden, the match clock
   stops, so nothing is bowled and no sound cue fires. Pausing never changes what a ball does:
   - a ball whose fate is still open (in the run-up, or in flight with no swing made and not yet at the bat) is taken
     back on the way out and the very same delivery is bowled again from the mark, so it cannot be re-rolled;
   - once the batter has swung or the ball is past the bat, everything stays frozen where
     it was and carries on from there, so the outcome stands and counts once */
const pausedNow = () => document.hidden || !!document.querySelector('dialog[open]');
function checkPause() {
  const p = pausedNow();
  if (p && !G.paused) G.paused = { del: G.del };
  else if (!p && G.paused) {
    const d = G.paused.del;
    G.paused = null;
    // (unless the picker started a new match meanwhile, which has its own fresh delivery)
    if (d === G.del && unplayed(d)) takeBack(d);
  }
  return !!G.paused;
}
const unplayed = d => d.stage === 'runup' || d.stage === 'flight' && !d.swing && G.time < d.tContact;
function takeBack(d) {
  const u = d.undo;
  // rewind the random sequence to where this ball was drawn from: the next bowl() repeats type, line, length, movement
  rng.state(u.rng);
  G.balls--; G.over = u.over; G.ballInOver = u.ballInOver; G.overType = u.overType;
  if (G.match && u.thisOver) G.match.thisOver = u.thisOver;
  G.del = { stage: 'wait', timer: .6 };
  G.ball = null; G.batter.swing = null; G.stumps.down = false; G.react = null;
  heldArrows.clear(); heldDirKeys.length = 0;
  setField(fieldFor(G.over), true);
  Object.assign(G.bowler, { x: d.mark, y: BOWLER.y, yaw: BOWLER_YAW, pose: POSE_BOWLER, body: null, drawn: null, fade: null, walk: 0 });
  setStatus(u.status);
  renderHud();
}
addEventListener('visibilitychange', checkPause);
let last = performance.now();
function frame(now) {
  if (!checkPause() && !G.frozen) update(Math.min(.04, (now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
openPicker();
const LANE = {
  WALL_X, WALL_Y, WALL_H_LEFT, WALL_H_BACK, PARAPET, CHALK_X, CHALK_Y, EDGE_X, EDGE_Y, PITCH_Y,
  CREASE_X, STUMPS_X, STUMPS_Z, BOWL_LINE_X, BRICK_X, BACKSTOP, BATTER, BOWLER, FIELDERS,
};
const FIELDING = { FIELDS, FIELD_NAMES, REACT, RUN_SPEED, CATCH_REACT, CATCH_RUN, GATHER_R, GATHER_Z, CATCH_R, CATCH_Z, BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT, RUN_DIST, SHOTS, LIVE_MAX, PROPS };
const BOWLING = { BALL_R, GRAVITY, RELEASE_X, CONTACT_X, STUMPS_FACE, BOWLED_HALF, BOWLERS, LINES, GRADES, DIRS, DIR_WORLD, LEG_SIDE, OFF_SIDE, STRAIGHT, DONE_T };
const dirIndex = dir => typeof dir === 'number' ? dir : DIRS.indexOf(dir);
// test controls. freeze() stops the frame loop advancing time so only step()/advance() move the game
window.__cricket = {
  G, LANE, BOWLING, FIELDING, TEAMS, setTeams, chooseTeam, openPicker,
  step(dt, skipDraw) { update(dt); if (!skipDraw) draw(); },
  freeze(on = true) { G.frozen = on; },
  seed(n) { reseed(n); },
  auto(on = true) { G.auto = on; },
  force(opts) { G.force = opts || {}; return G.force; },
  // fix the field placing (a FIELDS name) for every following ball until cleared with null; fielders snap to it now
  field(name) {
    if (name != null && !FIELDS[name]) throw new Error('no field ' + name);
    G.forceField = name || null;
    setField(name || fieldFor(G.over), true);
    return G.fielders.map(f => ({ name: f.name, x: f.x, y: f.y }));
  },
  // the latest ball's outcome: { runs, out, how, by? } (null before the first ball ends)
  outcome() { return G.last && { runs: G.last.runs, out: G.last.out, how: G.last.how, by: G.last.by }; },
  bowl,
  swing(dir) { return swingAt(dirIndex(dir)); },
  // aim and hit separately, as the keyboard does: aim(dir) holds a direction (null lets go, which is straight),
  // hit() is Space at G.time; aimed() is the direction the guide shows now
  aim(dir) { hookAim = dir == null ? null : dirIndex(dir); return DIRS[aimDir()]; },
  hit() { return swingAt(keyDir()); },
  aimed: () => DIRS[aimDir()],
  ballAt(t) { return ballAt(G.del, t); },
  // step in small slices until G.time reaches t exactly (or pred(G) is true), then draw once
  advance(t, slice = 1 / 120) {
    while (G.time < t - 1e-9) update(Math.min(slice, t - G.time));
    draw();
    return G.time;
  },
  until(pred, maxT = 10, slice = 1 / 120) {
    const stop = G.time + maxT;
    while (!pred(G) && G.time < stop) update(slice);
    draw();
    return pred(G);
  },
  dirFromScreen, roseCenter,
  // the match: newMatch(target?) starts one now (teams unchanged); match(patch?) merges patch into G.match and
  // returns it, so a test can set up any score (e.g. { runs: 50, wkts: 2, balls: 29 }); replay() is the result tap
  newMatch, replay, resultText, hidesView, clearWalk,
  match(patch) { if (patch) Object.assign(G.match, patch); renderHud(); return G.match; },
  MATCH: { OVERS, WICKETS, TARGET, REPLAY_T },
  // sound: play one effect now (starts the audio context if the page allows it); audio() is its state, or null
  sound(kind, amount) { ensureAudio(); sfx(kind, amount); return audio && audio.state; },
  audio: () => audio && { state: audio.state, muted },
};

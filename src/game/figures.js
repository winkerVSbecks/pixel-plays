// Jointed figures: body specs, two-bone IK, keyed poses and the vector helpers they use.
import { dynamicAdd, ease, lerp, SHOE } from '../engine.js';
import { FIG_SCALE } from './constants.js';

/* ---------- jointed figures ----------
   The engine's figure() has one symmetric stance, arms that only swing fore and aft, and knees and elbows it
   places itself. The bowler and the batter need more than that, so they are drawn here from a body spec: the
   pelvis, how the hips and chest are turned and tilted, and where the feet and hands are in the world. Knees and
   elbows are found by two-bone IK. Bone lengths, radii and colours are figure()'s, so they match the fielders.
   Spec fields: k (scale), pelvis [x, y, z], hipYaw, chestYaw, lean (forward), roll (towards the right side),
   footL/footR (ankles, z .12 on the ground), toeL/toeR (angles), handL/handR, poleL/poleR (which way the elbows
   point). "Right" is the figure's own right as seen on screen, the same side as figure()'s armR. */
export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vLen = a => Math.hypot(a[0], a[1], a[2]);
export const vNorm = a => vMul(a, 1 / (vLen(a) || 1));
export const vMix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const angMix = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * t;
export const LEG_LEN = 1.16, THIGH = .58, SHIN = .58, UPPER_ARM = .46, FOREARM = .5, ARM_LEN = .96;
// a two-bone limb from a towards t, bending towards pole; out of reach it straightens and points at t
export function ik(a, t, l1, l2, pole) {
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
export function bodyFrame(b) {
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
export function drawBody(b, t, add = dynamicAdd) {
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
export function poseBody(x, y, yaw, pose, k = FIG_SCALE) {
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
export function mixBody(a, b, t) {
  const out = { kind: b.kind, k: b.k };
  for (const key in b) {
    if (key === 'kind' || key === 'k') continue;
    const va = a[key] == null ? b[key] : a[key], vb = b[key];
    out[key] = Array.isArray(vb) ? vMix(va, vb, t) : /yaw|toe/i.test(key) ? angMix(va, vb, t) : lerp(va, vb, t);
  }
  return out;
}
// smooth keyframes: [[time, value], ...], eased in and out between neighbours, held flat outside
export function keyed(s, keys) {
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
export const armAt = (sh, dir, theta, reach, side = [0, 0, 0]) => vAdd(vAdd(sh, vMul(dir, Math.sin(theta) * reach)), vAdd([0, 0, -Math.cos(theta) * reach], side));

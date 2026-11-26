// The batter: his stance, the eight shots, the swing planned against the ball, and the bat.
import {
  capsule, capture, clamp, dynamicAdd, ease, lerp, pendingShadows, pix, rampOf, setCapture, W, zb,
} from '../engine.js';
import { BATTER, BLADE, CREASE_X, DIR_WORLD, FIG_SCALE, HAND, PITCH_Y } from './constants.js';
import { G } from './state.js';
import { ARM_LEN, bodyFrame, drawBody, mixBody, vAdd, vCross, vDot, vLen, vMix, vMul, vNorm, vSub } from './figures.js';
import { reachZ } from './bowler.js';
import { ballAt } from './delivery.js';
import { batterCeleAt } from './celebration.js';

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
export const BAT = { len: 1.4, handle: .3, blade: .3, half: .085, r: .115, sweet: 1.02, top: .05, bottom: .19 };
const BAT_TAPE = [70, 62, 58];
const UP = [0, 0, 1];
const slerp = (a, b, t) => {
  const c = clamp(vDot(a, b), -1, 1), w = Math.acos(c);
  if (w < 1e-4) return vNorm(vMix(a, b, t));
  if (Math.PI - w < 1e-3) { const p = vNorm(vCross(a, Math.abs(a[2]) < .9 ? UP : [1, 0, 0])); return t < .5 ? slerp(a, p, t * 2) : slerp(p, b, t * 2 - 1); }
  return vAdd(vMul(a, Math.sin((1 - t) * w) / Math.sin(w)), vMul(b, Math.sin(t * w) / Math.sin(w)));
};
const rotate = (v, axis, a) => vAdd(vAdd(vMul(v, Math.cos(a)), vMul(vCross(axis, v), Math.sin(a))), vMul(axis, vDot(axis, v) * (1 - Math.cos(a))));
export const flat = v => vNorm([v[0], v[1], 0]);
export const SIDE_ON = -Math.PI / 2;                      // the right-hander's chest faces -y
const myY = y => HAND === 'right' ? y : 2 * PITCH_Y - y;       // world <-> the right-hander's frame (its own inverse)
export const myV = v => HAND === 'right' ? v : [v[0], -v[1], v[2]];
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
export const BAT_SWING = .11, BAT_THROUGH = .08, BAT_FINISH = .3, BAT_HOLD = .55, BAT_BACK = 1.05;
const BAT_COMMIT = .09, BODY_IN = .14;                            // he starts the bat down this long before the ball arrives
// two bat keys: along the shot's arc when both are on it (so a finish can go right over the top), else the short way
export const mixBat = (a, b, u) => a.arc && a.arc === b.arc
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
export const batterAt = t => G.batter.cele && t >= G.batter.cele.t0 ? batterCeleAt(G.batter.cele, t) : batterPlay(t);
export function batterPlay(t) {
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
export function planSwing(sw, d) {
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
export function drawBatter() {
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

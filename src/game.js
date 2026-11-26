// The game: boot, the pause rule, the frame loop and the test controls (window.__cricket).
import './game/screen.js';
import {
  applyShadows, bakedPix, bakedZ, box, canvas, capsule, capture, castShadow, clamp, ctx, drawDots, drawLeaves,
  drawTufts, dynamicAdd, ease, figure, fit, flushShadows, H, hash, image, INK, lerp, pendingShadows, pix,
  project, rampOf, rgb, setCapture, shadeEdges, SIGNAL, sphere, STILL, W, WIND_FPS, zb,
} from './engine.js';
import {
  BACKSTOP, BALL_COLOR, BALL_R, BATTER, BLADE, BOWL_LINE_X, BOWLED_HALF, BOWLER, BOWLER_CATCH_R, BOWLER_CATCH_Z,
  BOWLER_HOT, BOWLER_YAW, BOWLERS, BRICK, BRICK_X, BRICKWORK, CATCH_R, CATCH_REACT, CATCH_RUN, CATCH_Z, CHALK_X,
  CHALK_Y, CONTACT_X, CREASE_X, CUE_GAP, CUE_NOW, CUE_T, CUE_TICK, DIR_WORLD, DIRS, DONE_T, EDGE_X, EDGE_Y,
  FIELD_NAMES, FIELDERS, FIELDS, FIG_SCALE, GATHER_R, GATHER_Z, GRADES, GRAVITY, HAND, LEG_SIDE, LINES, LIVE_MAX,
  OFF_SIDE, OVERS, PARAPET, PITCH_Y, PROPS, REACT, RELEASE_X, REPLAY_T, ROSE_IN, ROSE_OUT, RUN_DIST, RUN_SPEED,
  SHOTS, STRAIGHT, STUMP_BRICKS, STUMPS_FACE, STUMPS_X, STUMPS_Z, TARGET, TEAMS, WALL_H_BACK, WALL_H_LEFT,
  WALL_X, WALL_Y, WICKETS,
} from './game/constants.js';
import { bake } from './game/scene.js';
import { CHEER_T, G, KIDS, POSE_BOWLER, setTeams } from './game/state.js';
import { nodes, setStatus, setTouchInput, showHint, touchInput } from './game/hud.js';
import { reseed, rng } from './game/rng.js';
import {
  ARM_LEN, bodyFrame, drawBody, mixBody, poseBody, vAdd, vCross, vDot, vLen, vMix, vMul, vNorm, vSub,
} from './game/figures.js';
import { reachZ } from './game/bowler.js';
import { ballAt, bowl, swingAt } from './game/delivery.js';
import { clearWalk, fieldFor, hidesView, newMatch, renderHud, replay, resultText, setField } from './game/match.js';
import { actorBody, batterCeleAt, CELE_KIDS } from './game/celebration.js';
import { drawFx } from './game/fx.js';
import { update } from './game/update.js';

// a little jump, out of step by k
export const hop = (age, k) => age < CHEER_T ? .16 * Math.abs(Math.sin(age * 11 + k * 1.3)) * (1 - age / CHEER_T) : 0;
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
export function sfx(kind, amount = 1) {
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
export function openPicker() {
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

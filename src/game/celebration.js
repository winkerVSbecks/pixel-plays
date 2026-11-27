// The end-of-match celebration: runs, jumps, the huddle and the batter's reaction, all drawn from the clock.
import { clamp, ease, lerp, STILL } from '../engine.js';
import { BATTER, FIELD_BOUNDS, FIG_SCALE } from './constants.js';
import { facing, G } from './state.js';
import {
  angMix, armAt, bodyFrame, ik, keyed, mixBody, poseBody, SHIN, THIGH, vAdd, vMix, vMul, vNorm, vSub,
} from './figures.js';
import { bowlerAt, footAt, reachZ, strideLen } from './bowler.js';
import { clearAround, hidesView, routeTo } from './match.js';
import { BAT, batterPlay, flat, mixBat, myV, SIDE_ON } from './batter.js';

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
export const CELE_KIDS = 2.6;                             // how long the kids jump about after a win, before they stand cheering
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
export function actorBody(A, s) {
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
export function batterCeleAt(A, t) {
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
export function startCelebration() {
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

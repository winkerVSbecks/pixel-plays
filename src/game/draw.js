// draw(): the frame over the baked lane, with the figures, the ball, the kids and the aiming guides.
import {
  applyShadows, bakedPix, bakedZ, box, castShadow, clamp, ctx, drawDots, drawLeaves, drawTufts, dynamicAdd, ease,
  figure, flushShadows, H, hash, image, INK, lerp, pendingShadows, pix, project, rgb, shadeEdges, SIGNAL, sphere,
  STILL, W, WIND_FPS, zb,
} from '../engine.js';
import {
  BALL_COLOR, BALL_R, BATTER, BRICK, BRICKWORK, CONTACT_X, CUE_GAP, CUE_NOW, CUE_T, CUE_TICK, FIG_SCALE, PITCH_Y,
  ROSE_IN, ROSE_OUT, STUMP_BRICKS, STUMPS_X,
} from './constants.js';
import { CHEER_T, G, KIDS } from './state.js';
import { drawBody, mixBody, poseBody, vLen, vSub } from './figures.js';
import { ballAt } from './delivery.js';
import { actorBody, CELE_KIDS } from './celebration.js';
import { drawFx } from './fx.js';
import { drawBatter } from './batter.js';
import { aimDir } from './input.js';

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
export const roseCenter = () => project(BATTER.x, BATTER.y, 1.05);
export const dirFromScreen = (dx, dy) => (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8;
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
export function draw() {
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

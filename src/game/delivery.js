// One delivery: bowl() plans it, ballAt() reads its flight by time, and a swing is graded and struck.
import { clamp, figure, lerp } from '../engine.js';
import {
  AIM_X, BACKSTOP, BALL_R, BOUNCE, BOWLER, BOWLER_YAW, BOWLERS, BRICK, CHALK_X, CONTACT_X, CROSS, crossOf,
  DIR_WORLD, GLANCE, GLANCE_LIFT, GLANCE_PACE, GRAVITY, LEG, LEG_SIDE, LINE_ODDS, LINES, OFF_SIDE, PITCH_Y,
  DEFAULT_SHOT, GROUND_SAFE, REACT, RELEASE_X, SHOT_TYPES, SHOTS, STUMPS_FACE,
} from './constants.js';
import { G } from './state.js';
import { nodes, setStatus, setSwungYet, showHint, swungYet } from './hud.js';
import { lineOf, pickOne, range, rng } from './rng.js';
import { releasePose } from './bowler.js';
import { planChase } from './fielding.js';
import { fieldFor, setField } from './match.js';
import { burst, DUST, SPARK } from './fx.js';
import { BAT_SWING, batterAt, planSwing } from './batter.js';
import { sfx } from './sound.js';

// start a delivery now. opts (and G.force) may fix: type 'fast'|'spin', line 'stumps'|'off'|'leg', move 'in'|'away'|'none',
// amount (sideways movement at the stumps), offset (aim at the stumps relative to PITCH_Y), length (pitching x)
export function bowl(opts = {}) {
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
export function ballAt(d, t) {
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
/* one swing per ball, in direction dir (0-7, see DIRS), pressed at time t, playing shotType (a SHOT_TYPES entry:
   'ground' or 'air'; see SHOTS). The press is graded against the ball's
   arrival at the bat; the timing alone decides whether the bat meets the ball. Hitting against the line costs one
   grade, and so does a ball that moved off the pitch unless the timing was perfect, but neither (nor both) can
   take a connecting swing past mistimed. Returns the swing, or null when there is nothing to swing at. */
export function swingAt(dir, t = G.time, shotType = DEFAULT_SHOT) {
  if (!SHOT_TYPES.includes(shotType)) throw new Error('no shot type ' + shotType);
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
  d.swing = { dir, shotType, t, dt, grade, timed, side: grade === 0 ? null : dt < 0 ? 'early' : 'late', against, moved, line };
  if (grade < 3) d.hitAt = hitAt;
  // the batter's swing (drawing only): it meets the ball where it really is at hitAt, or swings through its line
  G.batter.swing = null;
  const meet = grade < 3 ? hitAt : d.tContact, cp = ballAt(d, meet), from = batterAt(t);
  G.batter.swing = { t0: t, dir, shotType, lineY, grade, from, tc: Math.max(grade < 3 ? hitAt : t + BAT_SWING, t + .035), C: { x: cp.x, y: cp.y, z: cp.z } };
  planSwing(G.batter.swing, d);
  if (!swungYet) { setSwungYet(); setStatus(G.you.name + ' need ' + (G.match ? G.match.target - G.match.runs : '') + ' to win'); }
  return d.swing;
}
/* the swing met the ball: it leaves the bat in the chosen direction, give or take the grade's scatter, at a speed
   and climb drawn for the shot type and the grade (SHOTS[shotType][grade]). G.force may fix speed, lift (degrees)
   and scatter (degrees, signed) for tests. The ball carries its shot type: a ground shot is never a six, and one met
   with the middle is marked grounded, so it cannot be caught on the full either (see GROUND_SAFE) */
export function strike(d) {
  const at = ballAt(d, d.hitAt), sw = d.swing, S = SHOTS[sw.shotType][sw.grade], f = G.force;
  const w = DIR_WORLD[sw.dir], aim = Math.atan2(w[1], w[0]);
  const scatter = f.scatter != null ? f.scatter : (rng() * 2 - 1) * S.scatter;
  let lift = f.lift != null ? f.lift : range(S.lift), speed = f.speed != null ? f.speed : range(S.speed);
  let yaw = aim + scatter * Math.PI / 180, flat = Math.cos(lift * Math.PI / 180) * speed;
  if (sw.dir === GLANCE) {
    // aim a ball's width and more past the far side of the bricks and the drum, at the chalk
    const clearY = Math.min(BACKSTOP.y - BACKSTOP.r, PITCH_Y - BRICK.l) - 1;
    yaw = Math.atan2(clearY - at.y, CHALK_X - at.x) + scatter * Math.PI / 180;
    if (f.lift == null) lift = Math.min(lift, GLANCE_LIFT[sw.shotType]);
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
    shotType: sw.shotType, grounded: sw.shotType === 'ground' && sw.grade <= GROUND_SAFE && !edge,
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

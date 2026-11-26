// Fielding: who chases a hit ball, catches and gathers, and how a live ball ends.
import { clamp } from '../engine.js';
import {
  BACKSTOP, BOWLED_HALF, BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT, CATCH_HOT, CATCH_R, CATCH_REACT, CATCH_RUN,
  CATCH_Z, DIRS, DONE_T, DROP, GATHER_R, GATHER_Z, GRADES, LIVE_MAX, PHYS_DT, PITCH_Y, REACT, RUN_DIST,
  RUN_SPEED,
} from './constants.js';
import { facing, G } from './state.js';
import { setAerial, setStatus } from './hud.js';
import { rng } from './rng.js';
import { ballAt } from './delivery.js';
import { stepBall } from './ball.js';
import { scoreBall } from './match.js';
import { startCelebration } from './celebration.js';
import { burst, DUST } from './fx.js';
import { sfx } from './sound.js';

/* ---------- fielding ----------
   At the hit the ball's whole path is replayed ahead of time (same fixed steps, so it is exact) to find the first
   moment any fielder can be at it: that fielder chases to that spot, the others stay set and watch. A boundary
   reached first beats them all. If the chase somehow falls through, it is planned again from where things are. */
export const team = () => [G.bowler, ...G.fielders];
const canCatch = b => !b.touched && b.z <= CATCH_Z;
const canGather = (b, f) => f === G.bowler && Math.hypot(b.vx, b.vy, b.vz) > BOWLER_HOT ? false
  : b.touched ? b.z <= GATHER_Z : b.z <= (f === G.bowler ? BOWLER_CATCH_Z : CATCH_Z);
const reachOf = (b, f) => b.touched ? GATHER_R : f === G.bowler ? BOWLER_CATCH_R : CATCH_R;
export function planChase(ball, react) {
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
export const RUN_POSE = { lean: .3 };
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
export function stepLive(d) {
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
export function passStumps(d) {
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
  setAerial(false);
  const sw = d.swing;
  G.last = {
    n: d.n, type: d.type, line: d.line, move: d.move, amount: d.amount, pitch: { ...d.P }, end: d.end,
    dir: sw ? DIRS[sw.dir] : null, shotType: sw ? sw.shotType : null, grade: sw ? GRADES[sw.grade] : null, side: sw ? sw.side : null,
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

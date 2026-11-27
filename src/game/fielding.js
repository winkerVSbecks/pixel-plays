// Fielding: who chases a hit ball, catches and gathers, and how a live ball ends.
import { clamp } from '../engine.js';
import {
  BACKSTOP, BOWLED_HALF, CATCH_HOT, CATCH_R,
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
import { difficulty } from './difficulty.js';

/* ---------- fielding ----------
   At the hit the ball's whole path is replayed ahead of time (same fixed steps, so it is exact) to find the first
   moment any fielder can be at it: that fielder chases to that spot, the others stay set and watch. A boundary
   reached first beats them all. If the chase somehow falls through, it is planned again from where things are. */
export const team = () => [G.bowler, ...G.fielders];
// a ball can be caught only if it has touched nothing and was not a clean ground shot (b.grounded, see strike), which
// is gathered as if it had bounced
const onFull = b => !b.touched && !b.grounded;
const canCatch = b => onFull(b) && b.z <= CATCH_Z;
// (catching and the bowler's stops get sharper with the difficulty; see difficulty.js). The bowler has his own limits:
// a ball he can catch off his own bowling (from 3 stars, ownCatch) has its own reach, height and pace (ownCatch*), and
// he takes it only where he stands: he never runs for one. Once he has left the spot his follow-through left him on
// (d.stand, by more than his reach) he lets a ball on the full go and fields it after it bounces. Any other ball he
// stops only if it is slower than bowlerHot, on the full within bowlerCatchR and below bowlerCatchZ
const ownCatch = (b, f) => f === G.bowler && difficulty().ownCatch && onFull(b);
const standing = () => { const d = G.del, s = d.stand; return !s || Math.hypot(G.bowler.x - s.x, G.bowler.y - s.y) <= difficulty().ownCatchR + 1e-9; };
function canGather(b, f) {
  if (f !== G.bowler) return b.z <= (onFull(b) ? CATCH_Z : GATHER_Z);
  const lv = difficulty(), speed = Math.hypot(b.vx, b.vy, b.vz);
  if (ownCatch(b, f)) return standing() && speed <= lv.ownCatchHot && b.z <= lv.ownCatchZ;
  return speed <= lv.bowlerHot && b.z <= (onFull(b) ? lv.bowlerCatchZ : GATHER_Z);
}
const reachOf = (b, f) => !onFull(b) ? GATHER_R : ownCatch(b, f) ? difficulty().ownCatchR : f === G.bowler ? difficulty().bowlerCatchR : CATCH_R;
export function planChase(ball, react) {
  const sim = { ...ball }, players = team(), { catchReact, catchRun } = difficulty();
  while (sim.t < LIVE_MAX) {
    stepBall(sim, PHYS_DT);
    if (sim.event || sim.gone) break;
    const air = onFull(sim), run = air ? Math.max(0, sim.t - ball.t - react * catchReact / REACT) * catchRun : Math.max(0, sim.t - ball.t - react) * RUN_SPEED;
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
  const b = G.ball, c = d.chase, { catchReact, catchRun } = difficulty();
  for (const f of team()) {
    if (f === c.f && b.t - d.tReact - (c.air ? c.react * (catchReact / REACT - 1) : 0) >= 0) {
      const dx = c.x - f.x, dy = c.y - f.y, gap = Math.hypot(dx, dy), go = Math.min(gap, (c.air ? catchRun : RUN_SPEED) * dt);
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
  if (!d.stand) d.stand = { x: G.bowler.x, y: G.bowler.y };  // where he stood when it was hit (see standing)
  while (b.t + PHYS_DT <= due + 1e-9) {
    const bounces = b.bounces, vz = b.vz;
    stepBall(b, PHYS_DT);
    if (b.bounces > bounces) sfx('bounce', -vz / 7);
    stepFielders(d, PHYS_DT);
    const e = b.event;
    if (e && e.how === 'wall') { burst(e.at, 8, DUST, 1.4, 1.2, .45); sfx('wall', e.prop ? .7 : 1); }
    if (e) {
      // clean over a house front: lost in the neighbour's, and the batter is out (a ground shot never climbs that
      // high; if one did, it would count as reaching the wall)
      const capped = b.shotType === 'ground';
      if (e.how === 'over' && !capped) return finish(d, 'hit', { runs: 0, out: true, how: 'over the wall' });
      // the wall or the chalk: 6 on the full, 4 if it bounced first or was a ground shot
      return finish(d, 'hit', { runs: e.touched || capped ? 4 : 6, out: false, how: e.how === 'over' ? 'wall' : e.how });
    }
    const f = gatherer(b);
    if (f) {
      const dist = Math.hypot(b.x - b.from.x, b.y - b.from.y);
      // below 3 stars the bowler never catches one off his own bowling: he fields it (see ownCatch)
      const chance = canCatch(b) && (f !== G.bowler || difficulty().ownCatch);
      const dropped = chance && Math.hypot(b.vx, b.vy, b.vz) > CATCH_HOT && rng() < DROP, caught = chance && !dropped;
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
   by and dist), 'caught' (out, with by; by 'bowler' reads "caught and bowled"), 'over the wall' (out), 'bowled'
   (out), or 'beaten' (missed or left, into the drum, no run) */
const OUTCOME_TEXT = o => o.dropped ? 'dropped! ' + (o.runs ? o.runs + (o.runs > 1 ? ' runs' : ' run') : 'no run') : o.how === 'caught' && o.by === 'bowler' ? 'caught and bowled' : o.how === 'bowled' || o.how === 'caught' ? o.how : o.how === 'over the wall' ? 'over the wall, out' : o.runs === 4 ? 'four' : o.runs === 6 ? 'six' : o.runs ? o.runs + (o.runs > 1 ? ' runs' : ' run') : 'no run';
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
  if (result === 'hit') Object.assign(G.last, { shot: d.shot, cross: d.cross, edge: d.edge, touched: b.event ? b.event.touched : b.touched, grounded: !!b.grounded, bounces: b.bounces, at: { x: b.x, y: b.y, z: b.z }, t: b.t });
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

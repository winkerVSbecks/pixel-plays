// The match: the chase, scoring, the HUD, field placings and fielders walking back clear of the view.
import { clamp, lerp, project } from '../engine.js';
import {
  BACKSTOP, BALL_R, BATTER, BOWLER, BOWLER_YAW, BOWLERS, CONTACT_X, FIELD_BOUNDS, FIELD_NAMES, FIELDS, GRAVITY,
  JOG, LEG, OVERS, PITCH_Y, REPLAY_T, STUMPS_X, STUMPS_Z, TARGET, WALL_X, WALL_Y, WICKETS,
} from './constants.js';
import { facing, G, POSE_BOWLER, POSE_FIELDER } from './state.js';
import { nodes, setStatus, showHint } from './hud.js';
import { nextType, range, rng, walkPose } from './rng.js';
import { openPicker } from './picker.js';

/* ---------- the match ----------
   Every ball counts (there are no extras). The chase is won as soon as the runs reach the target; it is lost when
   the wickets or the balls run out first, and tied if it stops exactly one short. The ball that decides it still
   plays out; the result goes up when its DONE_T is over (see update) */
export function newMatch(target) {
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
export function scoreBall(o) {
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
export function resultText(m) {
  const you = G.you.name, rival = G.rival.name, left = OVERS * 6 - m.balls;
  if (m.result === 'win') return you + ' win by ' + plural(WICKETS - m.wkts, 'wicket') + (left ? ', ' + plural(left, 'ball') + ' to spare' : ' off the last ball');
  const score = m.how === 'all out' ? 'all out for ' + m.runs + ': ' : '';
  if (m.result === 'tie') return m.how === 'all out' ? 'all out for ' + m.runs + ', scores level: a tie' : 'a tie on ' + m.runs;
  return score + rival + ' win by ' + plural(m.target - 1 - m.runs, 'run');
}
// the ball that decided the match has played out: show the result and wait for a tap
export function endMatch() {
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
export function replay() {
  if (G.phase !== 'over' || G.time - G.match.endT < REPLAY_T) return false;
  openPicker();
  return true;
}
// the scoreboard: runs/wickets, overs as 2.4, this over's balls, the target, and what is still needed
const oversText = balls => Math.floor(balls / 6) + '.' + balls % 6;
export function renderHud() {
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
export function stepLoose(b, dt) {
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
export const fieldFor = over => G.forceField || G.fieldOrder[over % G.fieldOrder.length];
export const nextField = () => fieldFor(G.ballInOver >= 6 ? G.over + 1 : G.over);
// send the fielders to a placing (snap puts them straight there)
export function setField(name, snap) {
  G.field = name;
  FIELDS[name].forEach((s, k) => {
    const f = G.fielders[k];
    f.name = s.name; f.home = { x: s.x, y: s.y };
    if (snap) { f.x = s.x; f.y = s.y; f.yaw = facing(f, BATTER); f.pose = POSE_FIELDER; f.running = false; f.via = null; f.routeFor = f.home; }
  });
}
export const fieldSet = () => G.fielders.every(f => Math.hypot(f.x - f.home.x, f.y - f.home.y) < .05);
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
export function hidesView(x, y) {
  const feet = project(x, y, 0), top = project(x, y, FIG_TALL).sy - 2;
  return VIEW.some(q => q.d < feet.d && Math.abs(q.sx - feet.sx) < FIG_HALF && q.sy > top && q.sy < feet.sy + 2);
}
// clear with room to spare, so a fielder can walk off his spot without stepping into the view
export const clearAround = (x, y) => !hidesView(x, y) && [0, 1, 2, 3, 4, 5, 6, 7].every(k => !hidesView(x + Math.cos(k * .785) * .4, y + Math.sin(k * .785) * .4));
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
export function clearWalk(a, b, leaving) {
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
export function routeTo(f, home) {
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
export function walkFielders(dt) {
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

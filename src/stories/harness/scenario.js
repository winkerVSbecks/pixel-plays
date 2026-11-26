// The story harness: a scenario (seed, kits, field, one delivery, an optional swing) is replayed through the real
// game modules from a fresh state to time t, so any moment of it can be drawn, scrubbed or replayed exactly.
// It imports the game in the order src/game.js does, after the page markup the modules expect (see dom.js).
import './dom.js';
import '../../game/screen.js';
import { createTarget, project, useTarget } from '../../engine.js';
import { BATTER, BOWLER, BOWLER_YAW, BOWLERS, DIRS, FIELD_NAMES, GRADES, TEAMS } from '../../game/constants.js';
import { bake } from '../../game/scene.js';
import { G, POSE_BOWLER, setTeams } from '../../game/state.js';
import '../../game/hud.js';
import { reseed } from '../../game/rng.js';
import { bowl, swingAt } from '../../game/delivery.js';
import { fieldSet, newMatch, setField } from '../../game/match.js';
import { update } from '../../game/update.js';
import { draw } from '../../game/draw.js';
import '../../game/input.js';
import '../../game/sound.js';
import '../../game/picker.js';

export { DIRS, FIELD_NAMES, GRADES, TEAMS };
export const TIMINGS = ['perfect', 'good', 'mistimed', 'miss'];
const STEP = 1 / 120;

/* every story draws into this one offscreen target (the lane is baked once) and copies the frame to its own canvas */
let shared = null;
export function target() {
  if (!shared) {
    shared = createTarget(document.createElement('canvas'));
    useTarget(shared);
    bake();
  }
  return useTarget(shared);
}

/* the press time for a timing grade: inside that grade's band of the bowler's window (see BOWLERS.window), early
   or late; a number is taken as seconds from the ball's arrival at the bat */
export function pressOffset(type, timing, side = 'late') {
  if (typeof timing === 'number') return timing;
  const w = BOWLERS[type].window, sign = side === 'early' ? -1 : 1;
  const off = { perfect: 0, good: (w[0] + w[1]) / 2, mistimed: (w[1] + w[2]) / 2, miss: w[2] + .06 }[timing];
  if (off == null) throw new Error('no timing ' + timing);
  return sign * off;
}

/* a fresh match in a known state: seeded, the kits and the field fixed, nobody moving, no delivery yet.
   sc = { seed, you, rival, field, type } */
function reset(sc) {
  reseed(sc.seed >>> 0);
  G.time = 0; G.auto = false; G.frozen = true; G.force = { ...sc.force };
  G.history = []; G.last = null; G.timeouts = 0;
  setTeams(sc.you || TEAMS[0].id, sc.rival || TEAMS[1].id);
  newMatch(sc.target);
  G.forceField = sc.field || null;
  setField(sc.field || G.fieldOrder[0], true);
  const type = sc.type || 'fast';
  G.overType = type;
  Object.assign(G.bowler, { x: BOWLERS[type].mark, y: BOWLER.y, yaw: BOWLER_YAW, pose: POSE_BOWLER, body: null, drawn: null, fade: null, walk: 0, cele: null });
  G.batter.fit = null;
  G.del = { stage: 'wait', timer: Infinity };
  if (sc.match) Object.assign(G.match, sc.match);
}

/* play scenario sc from its start to time t (seconds from the start of the run-up) and leave G there.
   sc: { seed, you, rival, field, type, line, move, amount, offset, length, force,
         bowl (default true), swing: { dir (index or DIRS name), shot ('ground' | 'air'), timing, side } | null }
   Returns what happened on the way: the delivery, when the swing and the result came, and the result */
export function play(sc, t) {
  reset(sc);
  const info = { d: null, tSwing: null, tDone: null };
  if (sc.bowl === false) { advance(t, info); return info; }
  const pick = ['line', 'move', 'amount', 'offset', 'length'].reduce((o, k) => (sc[k] != null && sc[k] !== 'random' ? { ...o, [k]: sc[k] } : o), {});
  const d = info.d = bowl({ type: sc.type || 'fast', ...pick });
  if (sc.swing) {
    const sw = sc.swing, dir = typeof sw.dir === 'number' ? sw.dir : DIRS.indexOf(sw.dir ?? 'NW');
    info.tSwing = d.tContact + pressOffset(d.type, sw.timing ?? 'perfect', sw.side);
    if (t >= info.tSwing) {
      advance(info.tSwing, info);
      swingAt(dir, G.time, sw.shot || 'ground');
    }
  }
  advance(t, info);
  return info;
}
function advance(t, info) {
  while (G.time < t - 1e-9) {
    update(Math.min(STEP, t - G.time));
    if (info.tDone == null && G.last && G.del.stage !== 'flight' && G.del.stage !== 'live') info.tDone = G.time;
  }
}

/* how long the scenario runs: until the result has been up, the bowler is back on his mark and the fielders are
   set, or 12 s. Cached per scenario */
const lengths = new Map();
export function duration(sc) {
  const key = JSON.stringify(sc);
  if (!lengths.has(key) && sc.bowl === false) lengths.set(key, sc.length || 4);
  if (!lengths.has(key)) {
    const info = play(sc, 0);
    let t = 0;
    while (t < 12) {
      advance((t += .1), info);
      const home = Math.abs(G.bowler.x - BOWLERS[G.overType].mark) < .06 && G.del.stage === 'wait' && fieldSet();
      if (home && (sc.bowl === false || G.last)) break;
    }
    lengths.set(key, Math.min(12, t + .4));
  }
  return lengths.get(key);
}

/* when something happens in scenario sc, in seconds from its start, plus `plus`: 'release', 'pitch', 'contact' (the
   ball at the bat), 'stumps', 'swing' (the press) or 'done' (the result) */
export function moment(sc, name, plus = 0) {
  if (name === 'done') return (play(sc, 12).tDone ?? 0) + plus;
  const info = play(sc, 0), d = info.d;
  const at = { release: d.tRelease, pitch: d.tPitch, contact: d.tContact, stumps: d.tStumps, swing: info.tSwing }[name];
  return +(at + plus).toFixed(2);
}

/* the first seed from sc.seed on whose ball pred(G.last) holds (a catch, a drop, a four...), searched over `tries`
   seeds and cached; null if none does */
const found = new Map();
export function findSeed(sc, pred, tries = 400) {
  const key = JSON.stringify(sc) + pred;
  if (!found.has(key)) {
    let hit = null;
    for (let i = 0; i < tries && hit == null; i++) {
      const s = { ...sc, seed: sc.seed + i };
      play(s, 0);
      advance(12, { tDone: null });
      if (G.last && pred(G.last, G)) hit = s.seed;
    }
    found.set(key, hit);
  }
  return found.get(key);
}

/* draw G as it is now into the shared target. Before drawing, the batter's lean smoothing is cleared so a frame
   does not depend on the frame drawn before it */
export function render() {
  const tg = target();
  G.batter.fit = null;
  G.bowler.drawn = null; G.bowler.fade = null;
  draw();
  return tg.canvas;
}

// screen points to frame a story on (canvas pixels)
export const FOCUS = {
  lane: () => null,
  batter: () => project(BATTER.x, BATTER.y, 1),
  bowler: () => project(G.bowler.x, G.bowler.y, 1),
  ball: () => (G.ball ? project(G.ball.x, G.ball.y, G.ball.z) : project(G.del.P ? G.del.P.x : 0, G.del.P ? G.del.P.y : 0, 0)),
  fielder: () => {
    const f = G.del.chase && G.del.chase.f;
    return f ? project(f.x, f.y, 1) : project(BATTER.x, BATTER.y, 1);
  },
  pitch: () => (G.del.P ? project((G.del.P.x + BATTER.x) / 2, G.del.P.y, 0) : project(4, BATTER.y, 0)),
};

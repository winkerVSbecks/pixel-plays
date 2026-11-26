// simulate(): play many seeded balls headless and tally what each shot type does (for tests and tuning).
import { BOWLERS, DIRS, SHOT_TYPES } from './constants.js';
import { G } from './state.js';
import { reseed } from './rng.js';
import { bowl, swingAt } from './delivery.js';
import { newMatch } from './match.js';
import { update } from './update.js';

const STEP = 1 / 120;
// a small seeded generator for the press timings, apart from the game's rng so both shot types get the same presses
function presses(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* play `balls` deliveries outside the match, each with a fresh seed (seed + i), so one shot type and another face the
   very same balls. Ball i is aimed at DIRS[i % 8] (or always at `dir`) and pressed at the ball's arrival plus an
   offset: timing 'perfect' (0), 'good' (anywhere inside the bowler's good window), 'any' (anywhere inside the
   mistimed window) or a number of seconds. Returns the shares of sixes, fours and outs (and how), runs per ball and
   the grades. The match on screen is thrown away: a fresh one starts afterwards. Teams must be chosen first */
export function simulate({ shot = 'ground', balls = 1000, seed = 1000, timing = 'perfect', dir = null } = {}) {
  if (!SHOT_TYPES.includes(shot)) throw new Error('no shot type ' + shot);
  const frozen = G.frozen, press = presses(seed * 7 + 1);
  G.frozen = true;
  reseed(seed); newMatch(); G.match = null;
  const t = { shot, timing, balls, six: 0, four: 0, out: 0, caught: 0, overWall: 0, bowled: 0, dropped: 0, edged: 0, runs: 0, grades: { perfect: 0, good: 0, mistimed: 0, miss: 0 } };
  for (let i = 0; i < balls; i++) {
    reseed(seed + i);
    G.del = { stage: 'wait', timer: 0 }; G.ball = null; G.batter.swing = null; G.stumps.down = false; G.phase = 'idle';
    const d = bowl(), w = BOWLERS[d.type].window, u = press() * 2 - 1;
    const at = d.tContact + (typeof timing === 'number' ? timing : timing === 'good' ? u * w[1] : timing === 'any' ? u * w[2] : 0);
    while (G.time < at - 1e-9) update(Math.min(STEP, at - G.time));
    swingAt(dir == null ? i % DIRS.length : dir, G.time, shot);
    for (let n = 0; G.del.stage !== 'done' && n < 4000; n++) update(STEP);
    const o = G.last;
    t.runs += o.runs; t.grades[o.grade || 'miss']++;
    if (o.runs === 6) t.six++;
    if (o.runs === 4) t.four++;
    if (o.out) t.out++;
    if (o.how === 'caught') t.caught++;
    if (o.how === 'over the wall') t.overWall++;
    if (o.how === 'bowled') t.bowled++;
    if (o.dropped) t.dropped++;
    if (o.edge) t.edged++;
  }
  const share = n => Math.round(1000 * n / balls) / 10;
  Object.assign(t, { sixPct: share(t.six), fourPct: share(t.four), outPct: share(t.out), runsPerBall: Math.round(100 * t.runs / balls) / 100 });
  newMatch();
  G.frozen = frozen;
  return t;
}

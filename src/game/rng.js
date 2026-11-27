// The seeded random sequence every delivery is drawn from (mulberry32), and helpers over it.
import { lerp } from '../engine.js';
import { BOWLED_HALF, LEG, PITCH_Y } from './constants.js';
import { G } from './state.js';

/* ---------- bowling ----------
   A delivery goes wait -> runup -> flight -> done -> wait. Everything about a ball is planned in bowl() when the
   run-up starts, so the marker can show where it will pitch and the flight can be read off analytically by time:
   straight from the hand to the pitching spot, then straight from there towards its moved line at the stumps. */
function mulberry32(a) {
  const next = () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  // where the sequence is, so a ball taken back by a pause can be drawn again exactly (see takeBack)
  next.state = to => to == null ? a : (a = to);
  return next;
}
export let rng = mulberry32(Math.random() * 2 ** 32 >>> 0);
// start the sequence again from seed n (the test controls' seed)
export function reseed(n) { rng = mulberry32(n); }
export const range = ([a, b]) => lerp(a, b, rng());
export const pickOne = list => list[Math.floor(rng() * list.length)];
export const lineOf = y => (y - PITCH_Y) * LEG > BOWLED_HALF ? 'leg' : (y - PITCH_Y) * LEG < -BOWLED_HALF ? 'off' : 'stumps';
export const nextType = () => G.ballInOver >= 6 ? (G.overType === 'fast' ? 'spin' : 'fast') : G.overType;

export const walkPose = (rate, step) => { const w = Math.sin(G.time * rate); return { stance: .08 + step * Math.abs(w), armR: w * .5, armL: -w * .5 }; };

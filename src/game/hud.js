// The HUD's DOM nodes, the status line and the how-to-play hint.
import { G } from './state.js';

export const nodes = {
  runs: document.getElementById('runs'),
  overs: document.getElementById('overs'),
  target: document.getElementById('target'),
  status: document.getElementById('status'),
  match: document.getElementById('match'),
  need: document.getElementById('need'),
  thisOver: document.getElementById('this-over'),
  overRow: document.getElementById('over-row'),
  team: document.getElementById('team'),
  loft: document.getElementById('loft'),
};
export function setStatus(text) {
  if (text === G.status) return;
  G.status = text;
  nodes.status.textContent = text;
}
/* how to play, for a newcomer: until the first swing of the visit, the status line says how to aim and hit, in the
   words of the input in use (a touch screen has no hover, so a tap does both). It goes up as each ball is bowled, so
   the outcome of a ball let go by still shows, and the first swing hands the line back to the match */
const SWING_HINT = { keys: 'arrows or mouse aim · space or click hits', touch: 'tap where you want to hit' };
export let swungYet = false, touchInput = matchMedia('(hover: none)').matches;
export const setSwungYet = () => { swungYet = true; };
export const setTouchInput = on => { touchInput = on; nodes.loft.hidden = !on; };
/* the aerial toggle, for touch (a tap has no Shift): armed, the next swing is lofted. It is shown only while touch is
   the input in use, and it disarms after every ball (see finish in fielding) */
export let aerial = false;
export function setAerial(on) {
  aerial = !!on;
  nodes.loft.setAttribute('aria-pressed', String(aerial));
}
nodes.loft.hidden = !touchInput;
nodes.loft.addEventListener('click', () => setAerial(!aerial));
export function showHint(refresh) {
  if (swungYet || !G.match) return;
  if (refresh && !Object.values(SWING_HINT).includes(G.status)) return;
  setStatus(touchInput ? SWING_HINT.touch : SWING_HINT.keys);
}

// Input: aim with keys or the pointer, swing with Space, Enter, a click or a tap.
// the page's canvas is the current target before the listeners below are added to it
import './screen.js';
import { canvas, clamp, H, W } from '../engine.js';
import { STRAIGHT } from './constants.js';
import { G, last } from './state.js';
import { setTouchInput, showHint, touchInput } from './hud.js';
import { swingAt } from './delivery.js';
import { replay } from './match.js';
import { dirFromScreen, roseCenter } from './draw.js';

/* ---------- input ----------
   Aim, then hit: one swing per ball. Keyboard: hold the arrows (two for a diagonal, opposite ones cancel), or a
   numpad or Q W E / A D / Z X C key, and press Space or Enter to swing that way; with no direction key held the
   swing goes straight. Mouse: the pointer's direction from the batter, snapped to the nearest of the 8, and a click
   swings that way. Touch has no hover, so a tap aims and swings at once. A press is graded at the moment it was
   made (pressTime). Nothing reaches the game while the team picker (or any other dialog) is open. */
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const KEY_DIRS = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
  KeyW: 0, KeyE: 1, KeyD: 2, KeyC: 3, KeyX: 4, KeyZ: 5, KeyA: 6, KeyQ: 7,
};
const isHitKey = e => e.code === 'Space' || e.key === ' ' || e.key === 'Enter';
export const heldArrows = new Set(), heldDirKeys = [];   // the direction keys held now; the last pressed letter key wins
/* what the highlight shows and which way each input swings. Every key press, pointer move and tap takes a number
   from inputSeq, so the guide can tell which came last */
let inputSeq = 0, keySeq = 0, moveSeq = 0, pointerOver = false, pointerDir = STRAIGHT, tapAim = null, hookAim = null;
// the test controls' held direction (an index into DIRS, or null)
export const setHookAim = dir => { hookAim = dir; };
export function keyDir() {
  if (heldDirKeys.length) return KEY_DIRS[heldDirKeys[heldDirKeys.length - 1]];
  let sx = 0, sy = 0;
  for (const k of heldArrows) { sx += ARROWS[k][0]; sy += ARROWS[k][1]; }
  if (sx || sy) return dirFromScreen(sx, sy);
  return hookAim != null ? hookAim : STRAIGHT;
}
const keysHeld = () => heldArrows.size > 0 || heldDirKeys.length > 0 || hookAim != null;
export function aimDir() {
  if (keysHeld()) return keyDir();
  if (tapAim && tapAim.del === G.del && tapAim.seq > Math.max(keySeq, moveSeq)) return tapAim.dir;
  if (pointerOver && moveSeq > keySeq) return pointerDir;
  return STRAIGHT;
}
const inputBlocked = () => G.phase === 'pick' || !!document.querySelector('dialog[open]');
/* the game time of an input event. G.time is the time of the last frame; the press happened e.timeStamp - lastFrame
   later on the same clock, so a press is graded at the moment it was made, not at the frame that handles it */
const pressTime = e => G.frozen ? G.time : G.time + clamp((e.timeStamp - last) / 1000, 0, .04);
/* one tap acts on one layer. A dialog opened by a press (the result tap opens the picker on its way down) ignores
   pointer clicks until that press is lifted and LAYER_GUARD ms have passed, so the same tap cannot pick the team
   under the finger; and the game ignores presses for LAYER_GUARD ms after any dialog closes, so the tap that closed
   it cannot swing. Keyboard clicks (detail 0) are never held back */
const LAYER_GUARD = 300;
let openPress = null, guardUntil = 0;
const guardFrom = () => { guardUntil = performance.now() + LAYER_GUARD; };
addEventListener('pointerup', e => { if (openPress === e.pointerId) { openPress = null; guardFrom(); } }, true);
addEventListener('pointercancel', e => { if (openPress === e.pointerId) { openPress = null; guardFrom(); } }, true);
addEventListener('click', e => {
  if (e.detail && e.target.closest('dialog[open]') && (openPress != null || performance.now() < guardUntil)) {
    e.preventDefault(); e.stopPropagation();
  }
}, true);
addEventListener('close', guardFrom, true);
// the screen direction from the batter to a pointer event, or null right on top of him
function pointerAim(e) {
  const r = canvas.getBoundingClientRect(), c = roseCenter();
  const dx = (e.clientX - r.left) * W / r.width - c.sx, dy = (e.clientY - r.top) * H / r.height - c.sy;
  return Math.hypot(dx, dy) < 3 ? null : dirFromScreen(dx, dy);
}
// a mouse aims as it moves; touch (and a pen) do not hover, so a tap aims and swings at once
const hovers = e => e.pointerType === 'mouse';
canvas.addEventListener('pointermove', e => {
  if (!hovers(e)) return;
  pointerOver = true;
  if (inputBlocked()) return;
  const dir = pointerAim(e);
  if (dir == null) return;
  pointerDir = dir;
  moveSeq = ++inputSeq;
});
canvas.addEventListener('pointerleave', e => { if (hovers(e)) pointerOver = false; });
canvas.addEventListener('pointerdown', e => {
  canvas.focus({ preventScroll: true });
  if (performance.now() < guardUntil) return;
  if (inputBlocked()) return;
  if (replay()) { openPress = e.pointerId; guardFrom(); return; }
  if (G.phase === 'over') return;
  const dir = pointerAim(e);
  if (dir == null) return;
  if (hovers(e)) { pointerOver = true; pointerDir = dir; moveSeq = ++inputSeq; }
  else tapAim = { dir, del: G.del, seq: ++inputSeq };
  swingAt(dir, pressTime(e));
});
/* keys work wherever focus is on the page (after the mute button, say), except in a text field or on a link.
   Space always belongs to the game outside a dialog: it never scrolls and never presses a focused button (the
   browser presses a button on Space's keyup, so that is cancelled too). Enter on a button still presses it */
let spaceTaken = false;
addEventListener('keydown', e => {
  if (inputBlocked() || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, a')) return;
  const dirKey = !!ARROWS[e.key] || KEY_DIRS[e.code] != null, hit = isHitKey(e);
  if (!dirKey && !hit) return;
  if (hit && e.key === 'Enter' && e.target.closest('button')) return;
  e.preventDefault();
  if (hit && e.key !== 'Enter') spaceTaken = true;
  keySeq = ++inputSeq;
  if (ARROWS[e.key]) heldArrows.add(e.key);
  else if (dirKey && !heldDirKeys.includes(e.code)) heldDirKeys.push(e.code);
  if (e.repeat) return;
  // after the result any key of the game (or Enter / Space) plays again
  if (G.phase === 'over') { replay(); return; }
  // a hit key swings in the keyboard's direction, timed as it goes down; a press before the ball is bowled does nothing
  if (hit) swingAt(keyDir(), pressTime(e));
});
addEventListener('keyup', e => {
  heldArrows.delete(e.key);
  const k = heldDirKeys.indexOf(e.code);
  if (k >= 0) heldDirKeys.splice(k, 1);
  if (spaceTaken && (e.code === 'Space' || e.key === ' ')) { spaceTaken = false; e.preventDefault(); }
});
addEventListener('blur', () => { heldArrows.clear(); heldDirKeys.length = 0; });
// the hint follows the input last used: a touch or pen press, or a mouse or key
addEventListener('pointerdown', e => { setTouchInput(e.pointerType !== 'mouse'); showHint(true); }, true);
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && touchInput) { setTouchInput(false); showHint(true); } }, true);
addEventListener('keydown', () => { if (touchInput) { setTouchInput(false); showHint(true); } }, true);

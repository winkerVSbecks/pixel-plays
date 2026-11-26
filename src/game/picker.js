// The team picker: nine kits in a 3 x 3 grid, shown before a match.
import { canvas } from '../engine.js';
import { TEAMS } from './constants.js';
import { G, setTeams } from './state.js';
import { nodes } from './hud.js';
import { newMatch } from './match.js';

/* ---------- team picker ----------
   Shown before a match: nine kit swatches in a 3 x 3 grid. Click or tap a team, or move with the
   arrow keys and press Enter or Space. The rival is drawn at random from the other eight, less any kit too close
   to yours (KIT_CLASH). */
const picker = document.getElementById('picker'), teamGrid = document.getElementById('teams');
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const teamButtons = TEAMS.map(t => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.team = t.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<span class="swatch" aria-hidden="true"></span><span></span>';
  b.firstChild.style.setProperty('--body', hex(t.body));
  b.lastChild.textContent = t.name;
  b.addEventListener('click', () => chooseTeam(t.id));
  teamGrid.append(b);
  return b;
});
// one tab stop for the grid; the arrow keys move between teams
function focusTeam(k) {
  teamButtons.forEach((b, i) => { b.tabIndex = i === k ? 0 : -1; });
  teamButtons[k].focus();
}
teamGrid.addEventListener('keydown', e => {
  const k = teamButtons.indexOf(document.activeElement);
  if (k < 0) return;
  const cols = 3, n = teamButtons.length;
  const next = { ArrowRight: (k + 1) % n, ArrowLeft: (k + n - 1) % n, ArrowDown: (k + cols) % n, ArrowUp: (k + n - cols) % n, Home: 0, End: n - 1 }[e.key];
  if (next == null) return;
  e.preventDefault();
  focusTeam(next);
});
// before the first pick there is nothing to go back to, so Escape cannot close the picker
picker.addEventListener('cancel', e => { if (!picker.dataset.picked) e.preventDefault(); });
// once a team has been picked there is something to go back to: Escape, a tap outside the box or the back button
const pickerBack = document.getElementById('picker-back');
pickerBack.addEventListener('click', () => picker.close());
// (only a tap that also started outside: the tap after a result opens the picker on its way down, and its click must
// not land on the new backdrop and close it again)
const outsidePicker = e => {
  const r = picker.getBoundingClientRect();
  return e.target === picker && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
};
let downOutside = false;
picker.addEventListener('pointerdown', e => { downOutside = outsidePicker(e); });
picker.addEventListener('click', e => {
  if (downOutside && outsidePicker(e) && picker.dataset.picked) picker.close();
  downOutside = false;
});
picker.addEventListener('close', () => {
  // closed without a pick: go back to where it was opened from. After the result is up that starts the next match in
  // the same shirts; before then (the deciding ball still playing out) the match carries on and shows its result
  if (G.phase === 'pick') { if (picker.dataset.from === 'over') newMatch(); else G.phase = 'idle'; }
  canvas.focus({ preventScroll: true });
});
export function openPicker() {
  // (not while the deciding ball plays out: the result and celebration are always seen first; see renderHud)
  if (G.match && G.match.result && G.phase !== 'over' && G.phase !== 'pick') return;
  // mid-match, picking a team throws the score away, so say so, and offer the way back to the match as it was
  const mid = !!(G.match && !G.match.result && G.phase !== 'pick');
  picker.dataset.from = G.phase;
  document.getElementById('picker-new').hidden = !mid;
  pickerBack.hidden = !mid;
  G.phase = 'pick';
  const k = Math.max(0, picker.dataset.picked ? TEAMS.indexOf(G.you) : 0);
  teamButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(!!picker.dataset.picked && i === k)));
  picker.showModal();
  focusTeam(k);
}
export function chooseTeam(id) {
  setTeams(id);
  picker.dataset.picked = '1';
  nodes.match.textContent = G.you.name + ' v ' + G.rival.name;
  newMatch();
  picker.close();
  canvas.focus();
}
document.getElementById('team').addEventListener('click', openPicker);

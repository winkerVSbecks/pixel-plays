// The welcome screen: the title, your team (nine kits in a 3 x 3 grid), the difficulty (1 to 5 stars) and Play.
import { canvas } from '../engine.js';
import { TEAMS } from './constants.js';
import { G, setTeams } from './state.js';
import { nodes } from './hud.js';
import { newMatch } from './match.js';
import { difficulty, LEVELS, setDifficulty } from './difficulty.js';

/* ---------- welcome screen ----------
   Shown before every match. Pick a team: click or tap one, or move with the arrow keys and press Enter or Space.
   Pick a difficulty from the stars (a radio group: arrow keys, or a tap). Play starts the match with both. The rival
   is drawn at random from the other eight, less any kit too close to yours (KIT_CLASH). The team and the difficulty
   are remembered in localStorage; both take effect only on Play, so looking mid-match changes nothing */
const STORE = { level: 'gully-cricket.difficulty', team: 'gully-cricket.team' };
const load = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode: not kept */ } };

const picker = document.getElementById('picker'), teamGrid = document.getElementById('teams');
const starRow = document.getElementById('stars'), levelAbout = document.getElementById('level-about');
const playButton = document.getElementById('play');
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
// what the screen shows as chosen; it becomes the match's on Play
let chosenTeam = TEAMS.find(t => t.id === load(STORE.team)) || TEAMS[0], chosenLevel = difficulty().stars;
// the saved difficulty is in play from the first match
const savedLevel = Number(load(STORE.level));
if (LEVELS[savedLevel - 1]) chosenLevel = setDifficulty(savedLevel).stars;

const teamButtons = TEAMS.map(t => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.team = t.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<span class="swatch" aria-hidden="true"></span><span></span>';
  b.firstChild.style.setProperty('--body', hex(t.body));
  b.lastChild.textContent = t.name;
  b.addEventListener('click', () => showTeam(t));
  teamGrid.append(b);
  return b;
});
function showTeam(t) {
  chosenTeam = t;
  teamButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.team === t.id)));
}
// one tab stop for the grid; the arrow keys move between teams
function focusTeam(k, focus = true) {
  teamButtons.forEach((b, i) => { b.tabIndex = i === k ? 0 : -1; });
  if (focus) teamButtons[k].focus();
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

// the stars: native radios, so the arrow keys and a screen reader treat them as one choice of five
const starInputs = LEVELS.map(lv => {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'difficulty';
  input.value = String(lv.stars);
  input.setAttribute('aria-label', lv.stars + (lv.stars === 1 ? ' star, ' : ' stars, ') + lv.name);
  input.addEventListener('change', () => showLevel(lv.stars));
  const star = document.createElement('span');
  star.setAttribute('aria-hidden', 'true');
  star.textContent = '★';
  label.append(input, star);
  starRow.append(label);
  return input;
});
function showLevel(stars) {
  chosenLevel = stars;
  starInputs.forEach((input, i) => {
    input.checked = i + 1 === stars;
    input.parentElement.classList.toggle('on', i < stars);
    input.nextSibling.textContent = i < stars ? '★' : '☆';
  });
  const lv = LEVELS[stars - 1];
  levelAbout.textContent = lv.stars + (lv.stars === 1 ? ' star' : ' stars') + ', ' + lv.name + ': ' + lv.about;
}

// before the first match there is nothing to go back to, so Escape cannot close the screen
picker.addEventListener('cancel', e => { if (!picker.dataset.picked) e.preventDefault(); });
// once a match has been played there is something to go back to: Escape, a tap outside the box or the back button
const pickerBack = document.getElementById('picker-back');
pickerBack.addEventListener('click', () => picker.close());
// (only a tap that also started outside: the tap after a result opens the screen on its way down, and its click must
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
  // closed without Play: go back to where it was opened from. After the result is up that starts the next match in
  // the same shirts and at the same difficulty; before then (the deciding ball still playing out) the match carries
  // on and shows its result
  if (G.phase === 'pick') { if (picker.dataset.from === 'over') newMatch(); else G.phase = 'idle'; }
  canvas.focus({ preventScroll: true });
});
playButton.addEventListener('click', () => {
  setDifficulty(chosenLevel);
  save(STORE.level, chosenLevel);
  save(STORE.team, chosenTeam.id);
  chooseTeam(chosenTeam.id);
});
export function openPicker() {
  // (not while the deciding ball plays out: the result and celebration are always seen first; see renderHud)
  if (G.match && G.match.result && G.phase !== 'over' && G.phase !== 'pick') return;
  // mid-match, Play throws the score away, so say so, and offer the way back to the match as it was
  const mid = !!(G.match && !G.match.result && G.phase !== 'pick');
  picker.dataset.from = G.phase;
  document.getElementById('picker-new').hidden = !mid;
  pickerBack.hidden = !mid;
  G.phase = 'pick';
  // it opens on what is in play (or, the first time, what was saved), not on a choice left unplayed last time
  showTeam(picker.dataset.picked ? G.you : chosenTeam);
  showLevel(difficulty().stars);
  picker.showModal();
  // the first time, focus starts on the teams; after a match it starts on Play, so Enter plays again as you were
  const k = TEAMS.indexOf(chosenTeam);
  focusTeam(k, !picker.dataset.picked);
  if (picker.dataset.picked) playButton.focus();
}
// start a match now as team id, at the difficulty in play (the welcome screen's Play, and window.__cricket)
export function chooseTeam(id) {
  setTeams(id);
  picker.dataset.picked = '1';
  nodes.match.textContent = G.you.name + ' v ' + G.rival.name;
  newMatch();
  picker.close();
  canvas.focus();
}
document.getElementById('team').addEventListener('click', openPicker);

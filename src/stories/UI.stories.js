// The page UI over the game: the HUD (score, overs, difficulty stars, target, this over, the status line and the
// touch aerial toggle) and the welcome screen (team, difficulty, Play). These are the page's own nodes and styles from
// index.html, driven by the game's own functions (renderHud, endMatch, openPicker), over a frame of the lane.
import { TEAMS } from './harness/scenario.js';
import { pageCss } from './harness/dom.js';
import { stage, timeArgs, timeArgTypes } from './harness/view.js';
import { G, setTeams } from '../game/state.js';
import { nodes, setAerial, setStatus, setTouchInput, showHint } from '../game/hud.js';
import { endMatch, renderHud } from '../game/match.js';
import { openPicker } from '../game/picker.js';
import { setDifficulty } from '../game/difficulty.js';

// the page's stylesheet, less the rules for the whole page (height, overflow), so it styles the HUD and the dialog
// without taking over Storybook's frame
if (!document.getElementById('game-page-css')) {
  const style = document.createElement('style');
  style.id = 'game-page-css';
  style.textContent = pageCss.replace(/html, body \{[^}]*\}/, '').replace(/\n\s*body \{[^}]*\}/, '');
  document.head.append(style);
}
const hud = ['scores', 'bottom', 'loft'].map(id => document.getElementById(id));
const picker = document.getElementById('picker');
const teamIds = TEAMS.map(t => t.id);

/* the stage's canvas, wrapped in a frame of the same size that holds the HUD. The frame is transformed, so the HUD's
   position: fixed is taken from it rather than from the window */
function framed(root, scale, extra = []) {
  const canvas = root.querySelector('canvas'), frame = document.createElement('div');
  frame.style.cssText = `position: relative; transform: translateZ(0); overflow: hidden; width: ${canvas.style.width}; height: ${canvas.style.height};
    font: 13px/1.35 ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace; color: var(--ink);`;
  canvas.replaceWith(frame);
  frame.append(canvas, ...extra);
  return frame;
}

export default {
  title: 'UI',
  parameters: { layout: 'centered' },
};

const hudArgTypes = {
  ...timeArgTypes(6),
  you: { control: 'select', options: teamIds, description: 'Your team (the batter\'s kit)', table: { category: 'Match' } },
  rival: { control: 'select', options: teamIds, description: 'The fielding side', table: { category: 'Match' } },
  runs: { control: { type: 'number', min: 0 }, table: { category: 'Match' } },
  wkts: { control: { type: 'range', min: 0, max: 3, step: 1 }, table: { category: 'Match' } },
  balls: { control: { type: 'range', min: 0, max: 30, step: 1 }, description: 'Balls bowled', table: { category: 'Match' } },
  target: { control: { type: 'number', min: 1 }, table: { category: 'Match' } },
  thisOver: { control: 'text', description: 'This over, one mark per ball: · 1 2 3 4 6 W', table: { category: 'Match' } },
  result: { control: 'select', options: ['none', 'win', 'lose', 'tie'], description: 'A decided match shows its result', table: { category: 'Match' } },
  status: { control: 'text', description: 'The status line (empty: what the game says)', table: { category: 'Match' } },
  touch: { control: 'boolean', description: 'Touch input: shows the aerial toggle and the touch hint', table: { category: 'Input' } },
  armed: { control: 'boolean', description: 'The aerial toggle armed', table: { category: 'Input' } },
};
const HUD_DEFAULTS = {
  ...timeArgs, time: 0.6, you: TEAMS[0].id, rival: TEAMS[1].id, runs: 23, wkts: 1, balls: 14, target: 61,
  thisOver: '1 · 4 W', result: 'none', status: '', touch: false, armed: false,
};
function renderHudStory(a) {
  const sc = { seed: a.seed, difficulty: a.difficulty, you: a.you, rival: a.rival, target: a.target, type: 'fast', swing: null };
  const after = () => {
    setTouchInput(a.touch);
    showHint(true);
    setAerial(a.touch && a.armed);
    const marks = a.thisOver.trim() ? a.thisOver.trim().split(/\s+/) : [];
    Object.assign(G.match, { runs: a.runs, wkts: a.wkts, balls: a.balls, target: a.target, thisOver: marks, result: a.result === 'none' ? null : a.result });
    G.match.how = a.result === 'none' ? null : a.wkts >= 3 ? 'all out' : a.result === 'win' ? 'target' : 'overs';
    nodes.match.textContent = G.you.name + ' v ' + G.rival.name;
    if (a.result !== 'none') endMatch();
    else renderHud();
    if (a.status) setStatus(a.status);
  };
  const root = stage(sc, a, { after, label: 'The game with its HUD: the score, the target, this over and the status line' });
  framed(root, a.scale, hud);
  return root;
}

export const Hud = { name: 'HUD', args: { ...HUD_DEFAULTS, status: 'four' }, argTypes: hudArgTypes, render: renderHudStory };
export const HudFirstBall = {
  name: 'HUD, how-to hint',
  args: { ...HUD_DEFAULTS, runs: 0, wkts: 0, balls: 0, thisOver: '' },
  argTypes: hudArgTypes, render: renderHudStory,
};
export const HudTouch = { name: 'HUD, touch with aerial armed', args: { ...HUD_DEFAULTS, touch: true, armed: true, difficulty: 3 }, argTypes: hudArgTypes, render: renderHudStory };
export const HudHard = { name: 'HUD, 5 stars', args: { ...HUD_DEFAULTS, difficulty: 5 }, argTypes: hudArgTypes, render: renderHudStory };
export const HudWin = {
  name: 'HUD, won',
  args: { ...HUD_DEFAULTS, runs: 62, wkts: 1, balls: 27, thisOver: '1 6 · 4 2 6', result: 'win', time: 3 },
  argTypes: hudArgTypes, render: renderHudStory,
};
export const HudLose = {
  name: 'HUD, all out',
  args: { ...HUD_DEFAULTS, runs: 40, wkts: 3, balls: 22, thisOver: '1 W · W', result: 'lose', time: 3 },
  argTypes: hudArgTypes, render: renderHudStory,
};

/* the welcome screen, opened by the game's openPicker over a frame of the lane. first: the first visit (focus on the
   teams); otherwise a match has been played (your team picked, focus on Play), and midMatch adds the warning that
   Play starts a new match, and the way back */
const welcomeArgTypes = {
  difficulty: { control: { type: 'range', min: 1, max: 5, step: 1 }, description: 'The level the screen opens on', table: { category: 'Game' } },
  you: { control: 'select', options: teamIds, description: 'Your team, once one has been picked', table: { category: 'Match' } },
  visit: { control: 'inline-radio', options: ['first', 'after a match', 'mid-match'], table: { category: 'Match' } },
  seed: { control: { type: 'number', min: 0, step: 1 }, table: { category: 'Time' } },
  scale: { control: { type: 'range', min: 1, max: 3, step: 1 }, table: { category: 'View' } },
};
function renderWelcome(a) {
  if (picker.open) picker.close();
  const root = stage({ seed: a.seed, difficulty: a.difficulty, bowl: false, you: a.you }, { ...timeArgs, scale: a.scale, time: 0 }, { label: 'The lane behind the welcome screen' });
  setDifficulty(a.difficulty);
  setTeams(a.you, TEAMS.find(t => t.id !== a.you).id);
  if (a.visit === 'first') delete picker.dataset.picked;
  else picker.dataset.picked = '1';
  G.phase = a.visit === 'mid-match' ? 'idle' : a.visit === 'first' ? 'pick' : 'over';
  Object.assign(G.match, { result: a.visit === 'after a match' ? 'win' : null });
  // the dialog goes into the story, so it is drawn (the page markup it came from is hidden)
  framed(root, a.scale, [picker]);
  queueMicrotask(() => { if (root.isConnected) openPicker(); else requestAnimationFrame(() => openPicker()); });
  return root;
}
const WELCOME_DEFAULTS = { difficulty: 1, you: TEAMS[0].id, visit: 'first', seed: 1, scale: 2 };
export const Welcome = { name: 'Welcome screen', args: WELCOME_DEFAULTS, argTypes: welcomeArgTypes, render: renderWelcome };
export const WelcomeAgain = { name: 'Welcome screen, after a match', args: { ...WELCOME_DEFAULTS, visit: 'after a match', difficulty: 3, you: TEAMS[4].id }, argTypes: welcomeArgTypes, render: renderWelcome };
export const WelcomeMidMatch = { name: 'Welcome screen, mid-match', args: { ...WELCOME_DEFAULTS, visit: 'mid-match', difficulty: 5, you: TEAMS[2].id }, argTypes: welcomeArgTypes, render: renderWelcome };

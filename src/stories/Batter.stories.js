// The batter: his stance, leaving a ball, and every shot (8 directions, along the ground or in the air) at each
// timing. Each story replays one seeded delivery through the game, so the time control scrubs the real animation.
import { H, W } from '../engine.js';
import { DIRS, moment, play, render, TIMINGS, FOCUS } from './harness/scenario.js';
import { stage, timeArgs, timeArgTypes } from './harness/view.js';

// the ball every shot story faces unless changed: fast, on the stumps, holding its line, a good length
const BALL = { type: 'fast', line: 'stumps', move: 'none', length: 3.6 };
const shotScenario = a => ({
  seed: a.seed, difficulty: a.difficulty, type: a.type, line: a.line, move: a.move, length: a.length,
  swing: { dir: a.dir, shot: a.shot, timing: a.timing, side: a.side },
});
const ballArgTypes = {
  type: { control: 'inline-radio', options: ['fast', 'spin'], description: 'The bowler', table: { category: 'Ball' } },
  line: { control: 'select', options: ['stumps', 'off', 'leg', 'random'], description: 'Line at the stumps', table: { category: 'Ball' } },
  move: { control: 'select', options: ['none', 'in', 'away', 'random'], description: 'Movement off the pitch', table: { category: 'Ball' } },
  length: { control: { type: 'range', min: 1.6, max: 4.8, step: .1 }, description: 'Where it pitches, along x', table: { category: 'Ball' } },
};
const shotArgTypes = {
  dir: { control: 'select', options: DIRS, description: 'Aim: N to NW on screen; SE is the glance, NW straight back', table: { category: 'Shot' } },
  shot: { control: 'inline-radio', options: ['ground', 'air'], description: 'Space (ground) or Shift+Space (air)', table: { category: 'Shot' } },
  timing: { control: 'select', options: TIMINGS, description: 'Timing grade of the press', table: { category: 'Shot' } },
  side: { control: 'inline-radio', options: ['early', 'late'], description: 'Pressed before or after the ball reaches the bat', table: { category: 'Shot' } },
};
const SHOT_DEFAULTS = { ...timeArgs, ...BALL, dir: 'N', shot: 'ground', timing: 'perfect', side: 'late', focus: 'batter', zoom: 2.5 };
const at = (a, name, plus) => moment(shotScenario({ ...SHOT_DEFAULTS, ...a }), name, plus);

export default {
  title: 'Batter',
  parameters: { layout: 'centered' },
  argTypes: { ...timeArgTypes(6), ...ballArgTypes, ...shotArgTypes },
};

const shotStory = (args, name) => ({
  args: { ...SHOT_DEFAULTS, ...args },
  render: a => stage(shotScenario(a), a, { label: `The batter playing ${a.shot === 'air' ? 'an aerial' : 'a grounded'} shot to ${a.dir}, ${a.timing} timing` }),
  name,
});

/* waiting for the ball with no delivery coming: the tap of the bat, the idle stance */
export const Stance = {
  args: { ...timeArgs, focus: 'batter', zoom: 3, time: 1.3 },
  argTypes: { ...timeArgTypes(4) },
  render: a => stage({ seed: a.seed, bowl: false }, a, { label: 'The batter in his stance, tapping the bat' }),
};
/* the backlift as the ball comes, the bat coming down its line, then checked and lifted away: no shot */
export const Leave = {
  args: { ...timeArgs, ...BALL, line: 'off', focus: 'batter', zoom: 2.5, time: at({}, 'contact') },
  argTypes: { ...timeArgTypes(6), ...ballArgTypes },
  render: a => stage({ seed: a.seed, difficulty: a.difficulty, type: a.type, line: a.line, move: a.move, length: a.length, swing: null }, a, { label: 'The batter leaving a ball outside off' }),
};
/* any shot: pick the direction, the shot type and the timing */
export const Shot = shotStory({ time: at({}, 'contact', .2) });
export const GroundDrive = shotStory({ dir: 'N', shot: 'ground', time: at({}, 'contact', .25) }, 'Ground drive (N)');
export const AerialDrive = shotStory({ dir: 'N', shot: 'air', time: at({ shot: 'air' }, 'contact', .25) }, 'Aerial drive (N)');
export const Glance = shotStory({ dir: 'SE', shot: 'ground', time: at({ dir: 'SE' }, 'contact', .2) }, 'Glance (SE)');
export const AerialGlance = shotStory({ dir: 'SE', shot: 'air', time: at({ dir: 'SE', shot: 'air' }, 'contact', .2) }, 'Aerial glance (SE)');
export const Straight = shotStory({ dir: 'NW', shot: 'ground', time: at({ dir: 'NW' }, 'contact', .2) }, 'Straight (NW)');
export const Good = shotStory({ timing: 'good', time: at({ timing: 'good' }, 'contact', .2) }, 'Good timing');
export const Mistimed = shotStory({ timing: 'mistimed', side: 'early', time: at({ timing: 'mistimed', side: 'early' }, 'contact', .2) }, 'Mistimed (early)');
export const Miss = shotStory({ timing: 'miss', side: 'early', time: at({ timing: 'miss', side: 'early' }, 'contact', .05) }, 'Miss (early)');

/* every direction (rows: ground, then air) at one timing, each frame the same time after the ball reaches the bat.
   `after` scrubs all of them together */
function sheet(a) {
  const cols = 8, cw = 60, ch = 60, z = 2, k = (a.scale || 1) * z;
  const root = document.createElement('figure');
  root.style.cssText = 'margin: 0; display: grid; gap: 6px; font: 12px/1.4 ui-monospace, Menlo, monospace; color: #1c1b19;';
  const view = document.createElement('canvas');
  view.width = cols * cw * k; view.height = 2 * (ch + 9) * k;
  view.style.cssText = `width: ${view.width}px; height: ${view.height}px; image-rendering: pixelated; background: #fff;`;
  view.setAttribute('role', 'img');
  view.setAttribute('aria-label', `The batter's shot in all eight directions, along the ground and in the air, ${a.timing} timing`);
  const caption = document.createElement('figcaption');
  caption.style.color = '#5f5b54';
  root.append(view, caption);
  const out = view.getContext('2d');
  out.imageSmoothingEnabled = false;
  const show = after => {
    out.fillStyle = '#fff'; out.fillRect(0, 0, view.width, view.height);
    ['ground', 'air'].forEach((shot, row) => DIRS.forEach((dir, col) => {
      const sc = shotScenario({ ...a, dir, shot });
      play(sc, Math.max(0, moment(sc, 'contact', after)));
      const src = render(), c = FOCUS.batter();
      const sx = Math.max(0, Math.min(W - cw, Math.round(c.sx - cw / 2))), sy = Math.max(0, Math.min(H - ch, Math.round(c.sy - ch / 2)));
      const x = col * cw * k, y = row * (ch + 9) * k;
      out.drawImage(src, sx, sy, cw, ch, x, y + 9 * k, cw * k, ch * k);
      out.fillStyle = '#1c1b19'; out.font = `${6 * k}px ui-monospace, Menlo, monospace`;
      out.fillText(`${dir} ${shot}`, x + 2 * k, y + 7 * k);
    }));
    caption.textContent = `${a.timing} (${a.side}) · ${after.toFixed(2)}s after the ball reaches the bat · seed ${a.seed}`;
  };
  show(a.after);
  if (a.playing) {
    const start = performance.now();
    const tick = now => {
      if (!root.isConnected && now - start > 500) return;
      show(-.15 + ((a.after + .15 + (now - start) / 1000 * a.rate) % 1.35));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return root;
}
export const AllDirections = {
  name: 'All directions',
  args: { ...BALL, timing: 'perfect', side: 'late', after: .25, playing: false, rate: .5, seed: 1, scale: 1 },
  argTypes: {
    after: { control: { type: 'range', min: -.15, max: 1.2, step: .01 }, description: 'Seconds after the ball reaches the bat (scrub)', table: { category: 'Time' } },
    playing: { control: 'boolean', table: { category: 'Time' } },
    rate: { control: { type: 'range', min: .1, max: 2, step: .05 }, table: { category: 'Time' } },
    seed: { control: { type: 'number', min: 0, step: 1 }, table: { category: 'Time' } },
    scale: { control: { type: 'range', min: 1, max: 2, step: 1 }, table: { category: 'View' } },
    timing: shotArgTypes.timing, side: shotArgTypes.side, ...ballArgTypes,
    time: { table: { disable: true } }, focus: { table: { disable: true } }, zoom: { table: { disable: true } }, dir: { table: { disable: true } }, shot: { table: { disable: true } },
  },
  render: sheet,
};

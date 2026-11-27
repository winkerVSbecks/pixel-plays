// The ball and its signals: the ball in flight and off the bat, the landing ring (with and without the movement
// wedge), the swing cue closing into a bar, and the states difficulty 4 (no cue) and 5 (no wedge) draw.
import { moment } from './harness/scenario.js';
import { stage, timeArgs, timeArgTypes } from './harness/view.js';

const argTypes = {
  type: { control: 'inline-radio', options: ['fast', 'spin'], description: 'The bowler', table: { category: 'Ball' } },
  line: { control: 'select', options: ['stumps', 'off', 'leg', 'random'], description: 'Line at the stumps', table: { category: 'Ball' } },
  move: { control: 'select', options: ['none', 'in', 'away', 'random'], description: 'Movement off the pitch (the wedge points this way)', table: { category: 'Ball' } },
  amount: { control: { type: 'range', min: .3, max: 1.2, step: .05 }, description: 'How far it moves by the stumps (the wedge grows with it)', table: { category: 'Ball' } },
  length: { control: { type: 'range', min: 1.6, max: 4.8, step: .1 }, description: 'Where it pitches, along x', table: { category: 'Ball' } },
};
const DEFAULTS = { ...timeArgs, type: 'fast', line: 'stumps', move: 'none', amount: .7, length: 3.4, focus: 'pitch', zoom: 2 };
// the batter leaves every ball here, so nothing hides the cue or the ring
const ball = a => ({ seed: a.seed, difficulty: a.difficulty, type: a.type, line: a.line, move: a.move, amount: a.move === 'none' ? undefined : a.amount, length: a.length, swing: null });
const at = (a, name, plus) => moment(ball({ ...DEFAULTS, ...a }), name, plus);
const story = (name, args, label) => ({ name, args: { ...DEFAULTS, ...args }, render: a => stage(ball(a), a, { label }) });

export default {
  title: 'Ball',
  argTypes: { ...timeArgTypes(6), ...argTypes },
};

export const InFlight = story('In flight', { focus: 'ball', time: at({}, 'release', .25) }, 'The ball in the air between the bowler and the pitch, with its shadow');
/* the target ring on the pitching spot, shown from the run-up until the ball lands; a ball that holds its line has
   no wedge */
export const LandingRing = story('Landing ring', { time: at({}, 'release', -.3) }, 'The landing ring on the pitching spot, with no wedge');
export const RingWedgeIn = story('Landing ring, wedge (in)', { move: 'in', time: at({ move: 'in' }, 'release', -.3) }, 'The landing ring with a wedge: the ball will move in');
export const RingWedgeAway = story('Landing ring, wedge (away, big)', { move: 'away', amount: 1.1, time: at({ move: 'away', amount: 1.1 }, 'release', -.3) }, 'The landing ring with a long wedge: the ball will move away a long way');
/* difficulty 5: the ring stays, the wedge is not drawn, though the ball still moves (and further) */
export const RingWedgeHidden = story('Landing ring, wedge hidden (5★)', { difficulty: 5, move: 'away', time: at({ difficulty: 5, move: 'away' }, 'release', -.3) }, 'The landing ring with no wedge at five stars, though the ball will move');
/* the cue: two ticks either side of the ball's line that close in over the last CUE_T seconds, then one solid bar */
export const CueClosing = story('Swing cue, closing', { time: at({}, 'contact', -.3) }, 'The swing cue: two ticks closing in on the ball\'s line');
export const CueNow = story('Swing cue, now', { time: at({}, 'contact') }, 'The swing cue as one solid bar: swing now');
/* difficulty 4 and 5: no cue at all, at the same moment as Swing cue, closing */
export const CueHidden = story('Swing cue hidden (4★)', { difficulty: 4, time: at({ difficulty: 4 }, 'contact', -.3) }, 'No swing cue at four stars, the ball coming on to the bat');
export const CueAndWedgeHidden = story('Cue and wedge hidden (5★)', { difficulty: 5, move: 'in', time: at({ difficulty: 5, move: 'in' }, 'contact', -.3) }, 'Five stars: no swing cue and no wedge, the ball coming on to the bat');
/* missed on the stumps: the bricks topple back off the stack */
export const Bowled = story('Bowled', { focus: 'batter', zoom: 2.5, time: at({}, 'stumps', .3) }, 'The bricks knocked over by a ball the batter left');

/* off the bat: an aerial drive climbing, with its shadow on the paving */
const hit = a => ({ ...ball(a), swing: { dir: 'N', shot: 'air', timing: 'perfect' } });
export const OffTheBat = {
  name: 'Off the bat',
  args: { ...DEFAULTS, focus: 'ball', zoom: 1.5, time: +moment(hit(DEFAULTS), 'contact', .3).toFixed(2) },
  render: a => stage(hit(a), a, { label: 'The ball climbing off the bat after an aerial drive' }),
};

// The bowler: the fast and the spin run-up, the delivery stride and follow-through, the walk back to his mark, and a
// gather off his own bowling. Each story replays one seeded ball through the game.
import { findBall, moment } from './harness/scenario.js';
import { stage, timeArgs, timeArgTypes } from './harness/view.js';

const ballArgTypes = {
  type: { control: 'inline-radio', options: ['fast', 'spin'], description: 'The bowler', table: { category: 'Ball' } },
  line: { control: 'select', options: ['stumps', 'off', 'leg', 'random'], description: 'Line at the stumps', table: { category: 'Ball' } },
  move: { control: 'select', options: ['none', 'in', 'away', 'random'], description: 'Movement off the pitch', table: { category: 'Ball' } },
};
// the batter leaves it outside off, so the ball runs on into the drum and the bowler is left to finish and walk back
const delivery = a => ({ seed: a.seed, difficulty: a.difficulty, type: a.type, line: a.line, move: a.move, swing: null });
const DEFAULTS = { ...timeArgs, type: 'fast', line: 'off', move: 'none', focus: 'bowler', zoom: 2.5 };
const at = (a, name, plus) => moment(delivery({ ...DEFAULTS, ...a }), name, plus);
const label = a => `The ${a.type} bowler running in and bowling`;

export default {
  title: 'Bowler',
  argTypes: { ...timeArgTypes(8), ...ballArgTypes },
  render: a => stage(delivery(a), a, { label: label(a) }),
};

export const FastRunUp = { name: 'Fast run-up', args: { ...DEFAULTS, time: at({}, 'release', -.45) } };
export const FastDelivery = { name: 'Fast delivery stride', args: { ...DEFAULTS, time: at({}, 'release') } };
export const FastFollowThrough = { name: 'Fast follow-through', args: { ...DEFAULTS, time: at({}, 'release', .25) } };
export const SpinRunUp = { name: 'Spin run-up', args: { ...DEFAULTS, type: 'spin', move: 'away', time: at({ type: 'spin', move: 'away' }, 'release', -.4) } };
export const SpinDelivery = { name: 'Spin delivery stride', args: { ...DEFAULTS, type: 'spin', move: 'away', time: at({ type: 'spin', move: 'away' }, 'release') } };
export const SpinFollowThrough = { name: 'Spin follow-through', args: { ...DEFAULTS, type: 'spin', move: 'away', time: at({ type: 'spin', move: 'away' }, 'release', .25) } };
/* the ball is dead: he turns and walks back to his mark for the next one */
export const WalkBack = { name: 'Walking back', args: { ...DEFAULTS, zoom: 2, time: at({}, 'done', 1.4) } };

/* a straight hit back at him that he fields off his own bowling (searched from the seed over every direction). A
   return catch on the full is in the game's rules, but no seeded or forced ball at any level produced one, so this
   is the bowler's own gather: he gets down to it and holds it up */
const RETURN = a => ({ seed: a.seed, difficulty: a.difficulty, type: a.type, swing: { dir: 'NW', shot: 'air', timing: 'perfect' } });
const byBowler = o => o.by === 'bowler';
const returnSc = a => findBall(RETURN(a), byBowler, { anyDir: true });
export const FieldsOwnBowling = {
  name: 'Fielding off his own bowling',
  args: { ...DEFAULTS, zoom: 2, time: +moment(returnSc(DEFAULTS), 'done', .3).toFixed(2) },
  argTypes: { line: { table: { disable: true } }, move: { table: { disable: true } } },
  render: a => stage(returnSc(a), a, { label: 'The bowler fielding a hit off his own bowling and holding the ball up' }),
};

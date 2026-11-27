// The bowler: the fast and the spin run-up, the delivery stride and follow-through, the walk back to his mark, a
// return catch (caught and bowled) and a gather off his own bowling. Each story replays one seeded ball through the
// game.
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

/* caught and bowled: a lofted hit straight back that he takes on the full off his own bowling, both hands up, and
   the fielding side cheers (searched from the seed for a ball he catches). He only catches one from 3 stars (ownCatch
   in difficulty.js), so the story starts there; at 1 or 2 stars the search finds none and he fields the ball */
const RETURN = a => ({ seed: a.seed, difficulty: a.difficulty, type: a.type, swing: { dir: 'NW', shot: 'air', timing: 'perfect' } });
const caughtAndBowled = o => o.how === 'caught' && o.by === 'bowler';
const catchSc = a => findBall(RETURN(a), caughtAndBowled);
export const CaughtAndBowled = {
  name: 'Caught and bowled',
  args: { ...DEFAULTS, difficulty: 3, zoom: 2, time: +moment(catchSc({ ...DEFAULTS, difficulty: 3 }), 'done', .3).toFixed(2) },
  argTypes: { line: { table: { disable: true } }, move: { table: { disable: true } } },
  render: a => stage(catchSc(a), a, { label: 'The bowler catching a hit straight back off his own bowling' }),
};
/* a hit back at him that bounces first: he fields it off his own bowling and holds it up (searched from the seed over
   every direction) */
const fieldedByBowler = o => o.how === 'fielded' && o.by === 'bowler' && !o.dropped;
const returnSc = a => findBall(RETURN(a), fieldedByBowler, { anyDir: true });
export const FieldsOwnBowling = {
  name: 'Fielding off his own bowling',
  args: { ...DEFAULTS, zoom: 2, time: +moment(returnSc(DEFAULTS), 'done', .3).toFixed(2) },
  argTypes: { line: { table: { disable: true } }, move: { table: { disable: true } } },
  render: a => stage(returnSc(a), a, { label: 'The bowler fielding a hit off his own bowling and holding the ball up' }),
};

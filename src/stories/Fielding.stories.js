// Fielding: a chase and gather, the ball held up, a catch, a dropped catch, the fielding side cheering a wicket, and
// each field setting. The outcome stories search from the seed control (and the aim, then
// the other directions) for a ball that ends that way.
import { FIELD_NAMES, findBall, moment } from './harness/scenario.js';
import { stage, timeArgs, timeArgTypes } from './harness/view.js';
import { DIRS } from '../game/constants.js';

const argTypes = {
  field: { control: 'select', options: FIELD_NAMES, description: 'Field setting (FIELDS)', table: { category: 'Field' } },
  dir: { control: 'select', options: DIRS, description: 'Aim of the shot', table: { category: 'Shot' } },
  shot: { control: 'inline-radio', options: ['ground', 'air'], table: { category: 'Shot' } },
  timing: { control: 'select', options: ['perfect', 'good', 'mistimed'], table: { category: 'Shot' } },
};
const DEFAULTS = { ...timeArgs, field: 'ring', dir: 'N', shot: 'ground', timing: 'good', focus: 'fielder', zoom: 2 };
// the line, movement and length are left to the seed, so the search below has a variety of balls to choose from
const scenario = a => ({ seed: a.seed, difficulty: a.difficulty, field: a.field, type: 'fast', swing: { dir: a.dir, shot: a.shot, timing: a.timing } });

/* a story whose ball must end in a given way: pred(G.last). Its time is when that happened, plus `plus` */
function outcome(name, pred, args, plus, label) {
  const sc = a => findBall(scenario(a), pred, { anyDir: true });
  const a0 = { ...DEFAULTS, ...args };
  return { name, args: { ...a0, time: +moment(sc(a0), 'done', plus).toFixed(2) }, render: a => stage(sc(a), a, { label }) };
}

export default {
  title: 'Fielding',
  argTypes: { ...timeArgTypes(8), ...argTypes },
};

const fielded = o => o.how === 'fielded' && o.by !== 'bowler' && !o.dropped && o.dist > 4;
export const ChaseAndGather = outcome('Chase and gather', fielded, { dir: 'NE' }, -.25, 'A fielder running to cut off a ground shot');
export const BallHeldUp = outcome('Ball held up', fielded, { dir: 'NE' }, .5, 'The fielder holding the ball up after gathering it');
export const Catch = outcome('Catch', o => o.how === 'caught' && o.by !== 'bowler', { shot: 'air', timing: 'perfect', dir: 'NE' }, .3, 'A fielder taking a catch, both hands over his head');
export const DroppedCatch = outcome('Dropped catch', o => o.dropped, { shot: 'air', timing: 'perfect', dir: 'NE' }, .1, 'A fielder dropping a hard catch');

/* bowled: the bricks go over and the fielding side jumps, arms up */
export const Cheer = {
  args: { ...DEFAULTS, focus: 'lane', zoom: 1, time: +moment({ seed: 1, field: 'ring', type: 'fast', line: 'stumps', move: 'none', swing: null }, 'done', .3).toFixed(2) },
  argTypes: { dir: { table: { disable: true } }, shot: { table: { disable: true } }, timing: { table: { disable: true } } },
  render: a => stage({ seed: a.seed, difficulty: a.difficulty, field: a.field, type: 'fast', line: 'stumps', move: 'none', swing: null }, a, { label: 'The fielding side cheering a wicket' }),
};

/* the placings with nobody moving, one story each */
const setting = field => ({
  name: `Field: ${field}`,
  args: { ...timeArgs, field, focus: 'lane', zoom: 1, time: 0 },
  argTypes: { dir: { table: { disable: true } }, shot: { table: { disable: true } }, timing: { table: { disable: true } } },
  render: a => stage({ seed: a.seed, field: a.field, bowl: false, length: 2 }, a, { label: `The fielders set in the ${a.field} field` }),
});
export const FieldRing = setting('ring');
export const FieldOff = setting(FIELD_NAMES[1]);
export const FieldLeg = setting(FIELD_NAMES[2]);
export const FieldDeep = setting('deep');

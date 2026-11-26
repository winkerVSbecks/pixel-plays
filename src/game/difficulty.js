// Difficulty: one to five stars, every value a level changes in one table. Pure data and a getter/setter, with no
// DOM, so stories and scripted runs can import it and set a level before they draw or play.
import {
  BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT, CATCH_REACT, CATCH_RUN, CROSS, TARGET,
} from './constants.js';

/* each level is the one before it plus its own changes:
   1  the game as it was tuned (the constants as they stand)
   2  a higher target
   3  quicker catching: the fielders get off the mark sooner and run faster for a ball in the air (catchReact, catchRun),
      and the bowler takes return catches a little wider, higher and harder hit (bowlerCatchR, bowlerCatchZ, bowlerHot);
      hitting across a ball that moved costs more (cross: pushed further off line and slower) and edges more often
   4  no swing cue: the ticks that close into a bar are not drawn (cue)
   5  no movement wedge on the landing ring (the ring stays), and the ball moves further off the pitch (move: a factor
      on the bowlers' movement range)
   target: the range the chase target is drawn from. TARGET's note in constants.js has how it was tuned */
const L1 = {
  stars: 1, name: 'easy', about: 'The timing cue and the movement wedge are shown.',
  target: TARGET, catchReact: CATCH_REACT, catchRun: CATCH_RUN,
  bowlerCatchR: BOWLER_CATCH_R, bowlerCatchZ: BOWLER_CATCH_Z, bowlerHot: BOWLER_HOT,
  cross: CROSS, cue: true, wedge: true, move: 1,
};
const L2 = { ...L1, stars: 2, name: 'steady', about: 'A higher target.', target: [60, 95] };
const L3 = {
  ...L2, stars: 3, name: 'tough', about: 'A higher target. Fielders get to catches quicker, and hitting across the movement costs more.',
  catchReact: .22, catchRun: 5.4, bowlerCatchR: .55, bowlerCatchZ: 1.5, bowlerHot: 9,
  cross: { ...CROSS, push: 52, pace: .45, edgeFrom: .2, edgeRate: 2.2, edgeMax: .85 },
};
const L4 = { ...L3, stars: 4, name: 'hard', about: 'As 3 stars, with no timing cue: judge the swing yourself.', cue: false };
const L5 = { ...L4, stars: 5, name: 'expert', about: 'As 4 stars, with no movement wedge, and the ball moves more off the pitch.', wedge: false, move: 1.25 };
export const LEVELS = [L1, L2, L3, L4, L5];
export const DEFAULT_LEVEL = 1;

let current = L1;
// the level in play now (an entry of LEVELS)
export const difficulty = () => current;
// set the level by its stars (1 to 5); returns the level now in play
export function setDifficulty(stars) {
  const lv = LEVELS[Math.round(stars) - 1];
  if (!lv) throw new Error('no difficulty ' + stars + ' (1 to 5)');
  current = lv;
  return current;
}
// ★★★☆☆ for a level's stars
export const starText = (stars, of = LEVELS.length) => '★'.repeat(stars) + '☆'.repeat(of - stars);

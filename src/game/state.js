// The game state G, the idle poses, the kids on the step and the teams' kits.
import { BATTER, BOWLER, BOWLER_YAW, FIELD_NAMES, FIELDERS, HAIR, kitClash, SKIN, TEAMS, WALL_Y } from './constants.js';

/* ---------- game state ---------- */
// idle poses
const POSE_BATTER = { crouch: .3, lean: .16, stance: .02, armR: .2, armL: .55 };
export const POSE_BOWLER = { stance: .12, armR: .2, armL: .1 };
export const POSE_FIELDER = { crouch: .2, lean: .18, stance: .18, armR: .45, armL: .45 };
export const POSE_HOLD = { stance: .14, lean: .05, armR: -1.2, armL: .2 };   // ball in hand, held up to show it
export const POSE_CATCH = { stance: .1, lean: -.05, armR: -2.9, armL: -2.6 }; // caught: both hands up over the head
export const POSE_CHEER = { stance: .14, lean: -.04, armR: -2.7, armL: -2.9 }; // a wicket: the fielding side's arms go up
// the kids on the blue door's step: sitting and standing, and the poses they jump with when a boundary comes
export const KIDS = [
  { x: -4.4, y: WALL_Y + .35, pose: { z: .26, scale: .66, crouch: .9, lean: .3, stance: .1, armR: .9, armL: .9 }, cheer: { z: .26, scale: .66, stance: .12, armR: -2.8, armL: -2.6 }, palette: { shirt: [232, 200, 72], stripe: [232, 200, 72], legs: [60, 64, 92], skin: SKIN[3], hair: HAIR[1] } },
  { x: -3.5, y: WALL_Y + .38, pose: { z: .26, scale: .62, stance: .06, armR: .15, armL: .15 }, cheer: { z: .26, scale: .62, stance: .1, armR: -2.6, armL: -2.9 }, palette: { shirt: [214, 96, 132], stripe: [214, 96, 132], legs: [88, 60, 70], skin: SKIN[4], hair: HAIR[0] } },
];
for (const k of KIDS) k.yaw = Math.atan2(BATTER.y - k.y, BATTER.x - k.x);
export const CHEER_T = 1.2;                               // how long a reaction to a wicket or boundary lasts
// a figure palette for one team: a solid shirt, and trousers a shade darker so the figure keeps its waist
const kitPalette = team => ({ shirt: team.body, stripe: team.body, legs: team.legs });
const person = (spot, k, yaw, pose) => ({ x: spot.x, y: spot.y, yaw, pose, palette: { skin: SKIN[k % SKIN.length], hair: HAIR[k % HAIR.length] } });
export const facing = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
export const G = {
  phase: 'pick', time: 0, status: '',
  you: null, rival: null,
  // the batter is drawn by drawBatter from his own pose (this yaw is not used): side-on, front shoulder to the bowler
  batter: person(BATTER, 0, Math.PI / 2, POSE_BATTER),
  bowler: person(BOWLER, 1, BOWLER_YAW, POSE_BOWLER),
  fielders: FIELDERS.map((s, k) => ({ name: s.name, home: { x: s.x, y: s.y }, ...person(s, k + 2, facing(s, BATTER), POSE_FIELDER) })),
  field: 'ring', fieldOrder: FIELD_NAMES, forceField: null,
  // bowling: del is the current delivery (see bowl()), ball is what is drawn, last is the latest ball's result
  del: { stage: 'wait', timer: 0 }, ball: null, last: null, history: [],
  balls: 0, over: 0, ballInOver: 0, overType: 'fast',
  stumps: { down: false, t: 0, seed: 0 },
  auto: true, frozen: false, force: {},
  timeouts: 0,  // how often a live ball hit the LIVE_MAX backstop
  react: null, fx: [],  // the latest wicket or boundary reaction { kind, t0 }, and contact sparks / dust in the air
  // the chase: target, runs, wickets, balls completed, this over's balls ('·', '1', '4', 'W', ...), and the result
  // ('win' | 'lose' | 'tie', with how: 'target' | 'all out' | 'overs') once it is decided; endT is when it was shown
  match: null,
};
G.batter.swing = null;
// when the frame loop last ran (a performance.now() time); input times a press from it
export let last = 0;
export const setLast = t => { last = t; };
// dress the batter in your kit and the fielding side in the rival's (drawn from the other eight, less any whose kit
// is too close to yours, if not given)
export function setTeams(youId, rivalId) {
  const you = TEAMS.find(t => t.id === youId);
  const others = TEAMS.filter(t => t !== you), fair = others.filter(t => !kitClash(you, t));
  const rival = others.find(t => t.id === rivalId) || fair[Math.floor(Math.random() * fair.length)];
  G.you = you; G.rival = rival;
  const dress = (p, team) => { p.palette = { ...kitPalette(team), skin: p.palette.skin, hair: p.palette.hair }; };
  dress(G.batter, you);
  for (const p of [G.bowler, ...G.fielders]) dress(p, rival);
  return { you: you.id, rival: rival.id };
}
setTeams(TEAMS[0].id, TEAMS[1].id); // something to wear behind the picker

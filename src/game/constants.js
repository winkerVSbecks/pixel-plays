// The lane's layout, bowling and batting, the hit, teams, field placings, props and colours.
import { rgb } from '../engine.js';

/* ---------- constants ----------
   Everything is laid out on the engine's world axes (x runs screen down-right, y runs screen down-left).
   The pitch lies along x at y = PITCH_Y. The batter stands at the near end (+x) facing the camera side-on;
   the bowler runs in from the far end (-x), so the ball travels down-right towards the batter.
   House fronts stand on the two far sides: x = WALL_X (left on screen) and y = WALL_Y (right on screen). */
export const WALL_X = -12.6, WALL_Y = -7.6, HOUSE_D = 1.9;          // house faces and their depth behind the face
export const WALL_H_LEFT = 4.2, WALL_H_BACK = 4.2, PARAPET = .35;     // wall heights; a parapet sits on top of each
export const EDGE_X = 13.4, EDGE_Y = 7.5;                             // the near sides fade out into white past these
export const CHALK_X = 11.6, CHALK_Y = 5.9;                           // chalk boundary along the two open near sides
export const PATH_W = 1.1;                                            // concrete footpath along the house fronts
export const PITCH_Y = -.3;
export const CREASE_X = 6.8, STUMPS_X = 9.5, BOWL_LINE_X = -3.9, BRICK_X = -4.5;
export const BACKSTOP = { x: 10.85, y: -.7, r: .44, h: 1.05 };
export const BRICK = { w: .22, l: .5, h: .17 };                        // one brick: w along x, l along y
export const STUMP_BRICKS = 4, STUMPS_Z = STUMP_BRICKS * BRICK.h;      // the stack's height
export const FIG_SCALE = 1;

/* ---------- bowling and batting ----------
   Times are seconds and speeds are world units per second. The engine's ground is mirrored when seen from above
   (+x runs screen down-right, +y screen down-left), so a right-hander facing the bowler (-x) shows his back to the
   camera and his chest to -y: for him -y is the off side and +y the leg side. A left-hander is his mirror image:
   chest to the camera (+y), so bat meeting ball is seen on every shot, with -y his leg side and +y his off side.
   HAND picks the batter; LEG is the sign of y on his leg side. A ball that nips "in" moves towards his body (the
   leg side) after the bounce, and one that goes "away" moves towards the off side. Ball paths are the same for
   either hand; only names flip. */
export const HAND = 'left';                               // he bats left-handed, facing the camera; 'right' mirrors everything back
export const LEG = HAND === 'right' ? 1 : -1;
export const BALL_R = .2, BALL_COLOR = [216, 236, 72], GRAVITY = 12;  // a tennis ball, drawn a little large so it reads
export const RELEASE_X = -4.4;                            // the bowler's front foot lands just behind the chalk line
export const CONTACT_X = 6.5;                             // the ideal moment: the bat meets the ball a long stride in front of the batter
export const AIM_X = 8.5;                                 // bowlers aim along the line to here (and pitch the bounce height for it)
/* the bricks stand well back, so a late press still finds the ball in front of them: the ball takes about 0.21 s
   (fast) / 0.35 s (spin) from CONTACT_X to the bricks. A late hit is played from wherever the ball has got to */
export const STUMPS_FACE = STUMPS_X - BRICK.w / 2 - .05;  // the front of the brick stack, allowing for the stagger
export const BOWLED_HALF = .3;                            // a missed ball whose centre passes this close to PITCH_Y hits the bricks
export const ARM_RELEASE = -3.4;                          // bowling arm just past vertical, swinging over the top
/* the two bowler types. mark: where the run-up starts. run: its average speed (the animation is in RUNUP). lean: kept for the release
   point, which still comes from the original release pose (releasePose). speed: ball
   speed out of the hand; after: the fraction it keeps off the pitch. bounce: ball height at the stumps.
   pitch: the range of pitching spots along x. move: how far the ball has moved sideways by the time it reaches
   the stumps. window: |press - arrival| limits for perfect, good and mistimed; anything wider is a miss. */
export const BOWLERS = {
  fast: { mark: -11, run: 6.8, lean: .22, speed: 15, after: .85, bounce: .55, pitch: [2.6, 4.8], move: [.6, .75], moves: ['in', 'away', 'none'], window: [.07, .15, .26] },
  spin: { mark: -6.8, run: 2.4, lean: .06, speed: 9.5, after: .8, bounce: .42, pitch: [1.6, 4.2], move: [.75, .95], moves: ['in', 'away'], window: [.09, .20, .36] },
};
// where the ball is aimed at the stumps before any movement, relative to PITCH_Y
export const LINES = { stumps: [-.06, .06], off: [-.68 * LEG, -.55 * LEG].sort((a, b) => a - b), leg: [.55 * LEG, .68 * LEG].sort((a, b) => a - b) };
export const LINE_ODDS = ['stumps', 'stumps', 'off', 'off', 'leg'];
export const GRADES = ['perfect', 'good', 'mistimed', 'miss'];
// the 8 screen compass directions from the batter, and the same directions in world (x, y)
export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const DIR_WORLD = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
// right-hander: S, SW, W go to the leg side (+y) and N, NE, E to the off side (-y); a left-hander has them swapped
export const LEG_SIDE = [0, 1, 2, 4, 5, 6].filter(k => DIR_WORLD[k][1] * LEG > 0), OFF_SIDE = [0, 1, 2, 4, 5, 6].filter(k => DIR_WORLD[k][1] * LEG < 0);
export const DONE_T = 1.6;                                // how long a ball's result stays up before the bowler walks back
// the match: chase a random target in OVERS overs of six balls with WICKETS wickets. The rival's score is target - 1.
// TARGET is tuned by simulation: a player who reads the field and hits into the gaps wins about 6 in 10 with sharp
// timing, about 4 in 10 with average timing and about 1 in 10 with loose timing; 85 needs no more than about 13
// boundaries in the 30 balls
export const OVERS = 5, WICKETS = 3, TARGET = [50, 85];
export const REPLAY_T = .6;                               // the result has to be up this long before a tap starts a new match
export const HOLD_T = .9;                                 // of that, how long everyone holds still (or celebrates) first
export const ROSE_IN = 15, ROSE_OUT = 23;                 // the direction guide around the batter, in canvas pixels
export const STRAIGHT = 7;                                // NW: straight back down the lane past the bowler, the aim with no key held
// the swing cue (see drawCue): shown for the last CUE_T s, solid for CUE_NOW s either side of the moment; tick gap, length
export const CUE_T = .6, CUE_NOW = .05, CUE_GAP = [.12, 1.5], CUE_TICK = .45;

/* ---------- the hit ----------
   Off the bat the ball is a loose body: gravity, bounces on the paving, rolls to a stop, and rebounds off the house
   fronts and the larger props. By timing grade (perfect, good, mistimed): speed out of the bat, its climb in degrees,
   and a random sideways error in degrees around the chosen direction. Perfect is hard and lofted, good is hard and
   driven down so it skids along the ground, mistimed is weak and loops up. The perfect slog is a gamble: it climbs
   steeply enough that one aimed at a house front often carries clean over it (out), and it is sprayed wide enough
   that a narrow gap may still find a fielder; into a wide gap, or over the chalk, it is still usually six */
export const SHOTS = [
  { speed: [14, 17.5], lift: [14, 52], scatter: 9 },
  { speed: [11.5, 14], lift: [-10, 1], scatter: 5 },
  { speed: [4.5, 8], lift: [0, 28], scatter: 14 },
];
/* the glance behind (SE): played fine, past the bricks and the drum on the side away from the camera, so it is a
   real shot (four, or runs if fine cuts it off) and not a thud into the bricks. It is played softer and kept low */
export const GLANCE = 3, GLANCE_PACE = .72, GLANCE_LIFT = 12;
/* hitting across the movement. A ball that moved off the pitch is safest hit with it: towards the side it is moving
   to, the way the landing ring's wedge points. Hit against it and the bat meets it at an angle. How much depends on
   crossOf: how far the ball moved (its amount) times how square across the movement the shot goes (1 for straight
   across, .71 for a diagonal, 0 along the lane or with the movement), softened by the timing (timing[grade]: a
   perfect hit takes it best, but not all of it; this is the timing alone, before the grade's other penalties). With that much cross, the hit either squirts off its line towards
   the movement by up to push degrees and loses up to pace of its speed, or (more often the bigger the cross, from
   edgeFrom up, at most edgeMax of the time) takes a thin edge: a slow ball off at an angle on the movement side,
   fine to square (atan2 of fine), that loops up where it can be caught (loops of the time) or skids away low */
export const CROSS = { timing: [.6, .85, 1], push: 40, pace: .35, edgeFrom: .3, edgeRate: 1.6, edgeMax: .75, edgeSpeed: [5, 9], fine: [.25, 1.1], loops: .5, loop: [16, 40], low: [-8, 4] };
export function crossOf(d, dir) {
  if (d.move === 'none' || !d.amount) return 0;
  const w = DIR_WORLD[dir], across = -w[1] / Math.hypot(w[0], w[1]) * Math.sign(d.end - d.aim);
  return Math.max(0, across) * d.amount;
}
export const PHYS_DT = 1 / 240;                           // the loose ball is stepped at a fixed rate, so a replay is exact
export const BOUNCE = .45, SKID = .8, BOUNCE_MIN = 1.2;   // paving: vertical restitution, speed kept along the ground per bounce
export const ROLL = 3.2, VERGE_ROLL = 14;                 // rolling slow-down on the paving, and in the weeds past the chalk
export const WALL_BOUNCE = .4, PROP_BOUNCE = .45;
export const LIVE_MAX = 8;                                // backstop: no ball stays live longer than this after the hit
// the tops of the house fronts (face plus parapet). The far-right face is three houses of different heights
const BACK_TOPS = [[WALL_X, -1.4, WALL_H_BACK + PARAPET], [-1.4, 5.4, WALL_H_BACK - .3 + PARAPET], [5.4, 12.8, WALL_H_BACK + .2 + PARAPET]];
export const wallTop = (side, a) => side === 'x' ? WALL_H_LEFT + PARAPET : (BACK_TOPS.find(([a0, a1]) => a < a1) || BACK_TOPS[2])[2];

export const SKIN = [[222, 170, 132], [196, 146, 110], [170, 120, 88], [128, 88, 64], [150, 104, 74], [214, 164, 128]];
export const HAIR = [[38, 28, 24], [30, 26, 24], [60, 44, 34], [24, 22, 22], [52, 40, 32], [36, 30, 28]];
/* 1992 World Cup kits, reduced to each team's body colour. The real shirts also had a blue / green /
   red band across the shoulders, the same on every team; it is left out so the team colour reads at
   figure size. */
export const TEAMS = [
  { id: 'aus', name: 'Australia', body: [244, 204, 40] },
  { id: 'eng', name: 'England', body: [140, 190, 236] },
  { id: 'ind', name: 'India', body: [44, 58, 128] },
  { id: 'nz', name: 'New Zealand', body: [204, 206, 206] },
  { id: 'pak', name: 'Pakistan', body: [150, 214, 48] },
  { id: 'sa', name: 'South Africa', body: [26, 122, 66] },
  { id: 'sl', name: 'Sri Lanka', body: [34, 76, 196] },
  { id: 'wi', name: 'West Indies', body: [140, 36, 62] },
  { id: 'zim', name: 'Zimbabwe', body: [210, 34, 34] },
];
for (const t of TEAMS) t.legs = t.body.map(v => Math.round(v * .78)); // trousers: the body colour, a shade darker
// kits too close to tell apart at figure size (the four nearest pairs in OKLab, all under 0.16; the next is 0.17,
// yellow against grey): the random rival is never drawn from these, so the batter always stands out from the field
const KIT_CLASH = ['eng nz', 'ind sl', 'aus pak', 'wi zim'];
export const kitClash = (a, b) => KIT_CLASH.includes(a.id + ' ' + b.id) || KIT_CLASH.includes(b.id + ' ' + a.id);
export const BLADE = [242, 214, 148];                 // pale willow; the engine's edge shading gives it a darker rim

export const BATTER = { x: 7.5, y: PITCH_Y + LEG * .5 }; // on the leg side of the stumps line, so the ball passes in front of his pads
export const BOWLER = { x: -6.4, y: -.55 };
export const BOWLER_YAW = 0;                // he runs straight down the pitch, whichever side of it the batter stands
/* field placings, one per over in a shuffled order, so the gaps move. Spots are given as [direction, distance]
   from the batter: the direction is an index into DIRS (fractions sit between two shot directions). The bowler is
   the sixth fielder, wherever his follow-through leaves him, and covers the straight hit (NW).
   The field is spread round the bat so the gaps are narrow: fielders stand 4.5 to 7 out, each on a shot's line or
   between two, where he can cut off a hit along the ground and a lofted hit is still low enough to catch. (Deeper
   is no harder: a fielder on the boundary only guards his own line.) The four placings guard different lines, so
   the batter has to look where the gaps are each over; the glance and the corner are guarded in some of them.
   Nobody may stand between the camera and the batter, his bricks or the pitch (see hidesView), so the open
   corner straight down the screen (S) is guarded from the corner of the chalk, and the glance behind (SE) from
   fine, out on the glance's line beyond the bricks. Any spot that would hide the view is nudged clear when the
   page loads. The spots stay put on the screen for either HAND, so their names do not: byHand(right, left) names a
   spot (and a placing) for the batter in HAND. The off and leg placings swap names but keep their order in FIELDS */
const byHand = (right, left) => HAND === 'right' ? right : left;
const spot = (name, k, r) => {
  const a = (225 + 45 * k) * Math.PI / 180;
  return { name, x: +(BATTER.x + Math.cos(a) * r).toFixed(2), y: +(BATTER.y + Math.sin(a) * r).toFixed(2) };
};
const CORNER = { name: 'deep corner', x: CHALK_X - .55, y: CHALK_Y - .6 };
const FINE = { name: 'fine', x: 11.1, y: -2 };   // on the glance's line (the same for either HAND), beyond the drum
export const FIELDS = {
  // round the bat: N to E covered from between the lines, the glance, SW and W
  ring: [spot(byHand('cover point', 'midwicket'), .5, 4.5), spot(byHand('backward point', 'backward square'), 1.5, 4.5), { ...FINE }, spot(byHand('square leg', 'point'), 5, 6), spot(byHand('deep midwicket', 'deep cover'), 6, 6.5)],
  // N, NE and E packed (the off side for a right-hander, the leg side for a left-hander), the corner and SW/W
  [byHand('off', 'leg')]: [spot(byHand('mid-off', 'mid-on'), -.1, 5.2), spot(byHand('cover', 'midwicket'), .6, 4.5), spot(byHand('backward point', 'backward square'), 1.6, 4.4), { ...CORNER }, spot(byHand('deep midwicket', 'deep cover'), 6.3, 6.75)],
  // S, SW and W packed (the leg side for a right-hander, the off side for a left-hander), NE and deep E
  [byHand('leg', 'off')]: [{ ...CORNER }, spot(byHand('square leg', 'point'), 4.85, 6.1), spot(byHand('deep midwicket', 'deep cover'), 6, 7), spot(byHand('point', 'square leg'), 1, 4.5), spot(byHand('deep backward point', 'deep backward square'), 2, 6)],
  // back on the boundaries: deep N, long down the lane, the corner, the glance and deep SW
  deep: [spot(byHand('deep cover', 'deep midwicket'), 0, 6.5), spot(byHand('long-on', 'long-off'), 6.8, 14.8), { ...CORNER }, { ...FINE }, spot(byHand('deep square leg', 'deep point'), 5.4, 6.8)],
};
export const FIELDERS = FIELDS.ring;                      // the field the lane starts with
export const FIELD_NAMES = Object.keys(FIELDS);
export const FIELD_BOUNDS = { x0: WALL_X + 1.4, x1: CHALK_X - .45, y0: WALL_Y + 1.3, y1: CHALK_Y - .45 };
/* fielding: after REACT seconds the chosen fielder runs at RUN_SPEED to where he can first reach the ball; he
   gathers a ball within GATHER_R of him and below GATHER_Z (chest height). Runs go by how far from the bat he
   gathered it: nearer than RUN_DIST[0] is no run, then 1, 2, and 3 beyond RUN_DIST[2]. Running for a catch he is
   a little slower off the mark and across the ground (CATCH_REACT, CATCH_RUN: he has to watch it down), so the
   quicker fielding cuts off ground shots without making every lofted hit a chance */
export const REACT = .25, RUN_SPEED = 5, JOG = 4.2, GATHER_R = .6, GATHER_Z = 1.5;
export const CATCH_REACT = .3, CATCH_RUN = 4.6;
// a ball that has not touched the ground, a wall or a prop is caught if it comes within CATCH_R of a fielder below
// CATCH_Z (a stretch and a jump above the head). Anything that has touched something first is only fielded: clean catches only
export const CATCH_R = .85, CATCH_Z = 2.7;
// a ball still flying faster than CATCH_HOT when it reaches a fielder's hands is a hard chance: held only 85% of the
// time (DROP). A drop is fielded where it fell, so a hit straight at a deep fielder is a gamble and not a sure out
export const CATCH_HOT = 10, DROP = .15;
/* the bowler is the sixth fielder, but he finishes his follow-through off balance right on the straight hit's line,
   so he only takes a return catch that comes to him, close and below the waist; anything higher or wider goes past */
export const BOWLER_CATCH_R = .4, BOWLER_CATCH_Z = 1.1;
export const BOWLER_HOT = 7;                              // a ball still going faster than this is past him before he can get down to it
export const RUN_DIST = [4, 6, 8.5];
/* what a loose ball can hit besides the walls: upright drums (x, y, r, h) and boxes (x0, y0, x1, y1, h), matching
   the baked props. A ball above a prop's top lands on it. Plant leaves, the washing and the meter box don't count.
   Everything standing on the footpath counts as the wall it stands against (house rule: the scooter is the wall),
   so only the drum, the bricks and the bowler's brick are in play; they take the pace off the ball (bounce). */
const pot = (x, y, r) => ({ x, y, r: r * .8, h: r * 1.3 });
export const PROPS = [
  { x: BACKSTOP.x, y: BACKSTOP.y, r: BACKSTOP.r, h: BACKSTOP.h, bounce: .3 },  // the oil drum behind the stumps
  { x0: STUMPS_X - .16, y0: PITCH_Y - .32, x1: STUMPS_X + .16, y1: PITCH_Y + .32, h: STUMPS_Z, bounce: .25 },
  { x0: BRICK_X - BRICK.w / 2, y0: PITCH_Y - BRICK.l / 2, x1: BRICK_X + BRICK.w / 2, y1: PITCH_Y + BRICK.l / 2, h: BRICK.h, bounce: .3 },
  { x: WALL_X + .75, y: WALL_Y + .75, r: .5, h: 1.15 },                     // the blue water drum in the far corner
  { x0: 1.7, y0: WALL_Y + .4, x1: 3.3, y1: WALL_Y + 1, h: 1.2 },           // scooter
  { x0: 4.1, y0: WALL_Y + .38, x1: 5.45, y1: WALL_Y + 1.05, h: .45 },      // the sleeping dog
  { x0: -4.8, y0: WALL_Y, x1: -3.2, y1: WALL_Y + .62, h: .26 },            // door steps
  { x0: 6.4, y0: WALL_Y, x1: 8, y1: WALL_Y + .62, h: .26 },
  { x0: WALL_X, y0: 1.8, x1: WALL_X + .62, y1: 3.4, h: .26 },
  { x: -4.4, y: WALL_Y + .35, r: .28, h: 1.5 },                            // the two kids on the blue door's step
  { x: -3.5, y: WALL_Y + .38, r: .26, h: 1.6 },
  { x0: WALL_X, y0: -2.1, x1: WALL_X + .55, y1: -.1, h: 1.2 },             // the bicycle against the wall
  pot(-10.6, WALL_Y + .45, .38), pot(-9.7, WALL_Y + .42, .32), pot(-2.8, WALL_Y + .95, .3), pot(WALL_X + .45, 4.4, .4), pot(11.6, WALL_Y + .45, .36),
];

export const ASPHALT = [[118, 112, 112], [124, 118, 117], [130, 124, 122], [136, 130, 127]];
export const PATCH = [[102, 98, 102], [107, 103, 106], [112, 108, 110], [117, 113, 114]];
export const SLAB = [[168, 158, 142], [175, 165, 148], [182, 172, 154], [189, 179, 160]];
export const EARTH = [138, 112, 84], CHALK = rgb(246, 244, 236), CHALK_DIM = rgb(214, 210, 204);
export const PLASTER_A = [226, 196, 140], PLASTER_C = [222, 178, 170], PLASTER_D = [176, 204, 186], BRICKWORK = [166, 82, 60], MORTAR = [196, 178, 156];
export const SHUTTER = [62, 116, 104], DOOR_BLUE = [58, 96, 150], DOOR_WOOD = [130, 84, 52], GLASS = [44, 42, 56], STONE = [196, 186, 166];
export const ROOF = [178, 170, 158], RIM = [222, 214, 198];
export const POT = [176, 92, 62], POT_LEAF = [[64, 108, 60], [92, 132, 70], [124, 156, 82]];
export const KIND_ROAD = 1, KIND_PATH = 2;

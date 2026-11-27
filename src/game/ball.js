// The loose ball after the hit: fixed-step physics against the paving, the walls and the props.
import { clamp } from '../engine.js';
import {
  BALL_R, BOUNCE, BOUNCE_MIN, CHALK_X, CHALK_Y, EDGE_X, EDGE_Y, GRAVITY, PROP_BOUNCE, PROPS, ROLL, SKID,
  VERGE_ROLL, WALL_BOUNCE, WALL_X, WALL_Y, wallTop,
} from './constants.js';

// where the loose ball is resting or bouncing: the paving, or the top of a prop it is above
function floorUnder(b) {
  let floor = 0;
  for (const p of PROPS) {
    if (b.z - BALL_R < p.h - .05) continue;
    const inside = p.r != null ? Math.hypot(b.x - p.x, b.y - p.y) < p.r : b.x > p.x0 && b.x < p.x1 && b.y > p.y0 && b.y < p.y1;
    if (inside) floor = Math.max(floor, p.h);
  }
  return floor;
}
// push the ball out of a prop's side and send it back off the face it hit
function hitProps(b) {
  for (const p of PROPS) {
    if (b.z - BALL_R >= p.h - .05) continue;
    let nx, ny, gap;
    if (p.r != null) {
      const dx = b.x - p.x, dy = b.y - p.y, dist = Math.hypot(dx, dy) || 1e-6;
      gap = dist - p.r - BALL_R; nx = dx / dist; ny = dy / dist;
    } else {
      const cx = clamp(b.x, p.x0, p.x1), cy = clamp(b.y, p.y0, p.y1), dx = b.x - cx, dy = b.y - cy, dist = Math.hypot(dx, dy);
      if (dist > 0) { gap = dist - BALL_R; nx = dx / dist; ny = dy / dist; }
      else {
        // the centre got inside: leave by the nearest face
        const faces = [[b.x - p.x0, -1, 0], [p.x1 - b.x, 1, 0], [b.y - p.y0, 0, -1], [p.y1 - b.y, 0, 1]].sort((a, c) => a[0] - c[0]);
        gap = -faces[0][0] - BALL_R; nx = faces[0][1]; ny = faces[0][2];
      }
    }
    if (gap >= 0) continue;
    b.x -= nx * gap; b.y -= ny * gap;
    const vn = b.vx * nx + b.vy * ny;
    const e = p.bounce != null ? p.bounce : PROP_BOUNCE;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
    if (p.bounce == null && !b.event) b.event = { how: 'wall', side: b.x - WALL_X < b.y - WALL_Y ? 'x' : 'y', touched: b.touched, prop: true, at: { x: b.x, y: b.y, z: b.z } };
    b.touched = true;
  }
}
/* one fixed step of the loose ball. It notes the first thing that ends the ball as b.event: 'wall' (a house front,
   below its top), 'over' (clear over a house), or 'chalk' (over the boundary line on an open side), each with
   b.touched telling whether it had bounced (or hit something) on the way */
export function stepBall(b, dt) {
  b.t += dt;
  if (b.gone) return;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= GRAVITY * dt;
  const floor = floorUnder(b), past = b.x > CHALK_X || b.y > CHALK_Y;
  if (b.z < floor + BALL_R) {
    b.z = floor + BALL_R;
    if (b.vz < -BOUNCE_MIN) {
      b.vz *= -BOUNCE; b.vx *= SKID; b.vy *= SKID;
      if (!b.touched) b.first = { x: b.x, y: b.y };
      b.touched = true; b.bounces++;
    } else {
      b.vz = 0; b.touched = true;
      const sp = Math.hypot(b.vx, b.vy), next = Math.max(0, sp - (past ? VERGE_ROLL : ROLL) * dt);
      if (sp > 0) { b.vx *= next / sp; b.vy *= next / sp; }
    }
  }
  hitProps(b);
  // the house fronts: a ball clear above the parapet sails over; anything lower thumps the wall and comes back
  if (!b.over) for (const side of ['x', 'y']) {
    const pos = side === 'x' ? b.x : b.y, face = side === 'x' ? WALL_X : WALL_Y;
    if (pos > face + BALL_R) continue;
    const top = wallTop(side, side === 'x' ? b.y : b.x);
    if (b.z - BALL_R > top) {
      b.over = side;
      if (!b.event) b.event = { how: 'over', side, touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
      break;
    }
    if (!b.event) b.event = { how: 'wall', side, touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
    b.touched = true;
    if (side === 'x') { b.x = face + BALL_R; b.vx = Math.abs(b.vx) * WALL_BOUNCE; }
    else { b.y = face + BALL_R; b.vy = Math.abs(b.vy) * WALL_BOUNCE; }
    b.vx *= .7; b.vy *= .7;
  }
  if (past && !b.event) b.event = { how: 'chalk', touched: b.touched, at: { x: b.x, y: b.y, z: b.z } };
  // out of sight: dropped behind a house, or off the edge of the lane into the white
  if (b.over && b.z < wallTop(b.over, b.over === 'x' ? b.y : b.x) - .3) b.gone = true;
  if (b.x > EDGE_X - .4 || b.y > EDGE_Y - .4) {
    if (b.z <= BALL_R + .01) { b.vx = b.vy = 0; } // settles in the weeds
    if (b.x > EDGE_X + 3 || b.y > EDGE_Y + 3) b.gone = true;
  }
  b.still = !b.gone && b.vz === 0 && b.vx === 0 && b.vy === 0;
}

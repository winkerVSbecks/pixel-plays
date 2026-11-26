// update(dt): one step of the simulation. Time is passed in, so a caller can step, freeze or replay it.
import { BAT_BACK, hop, sfx } from '../game.js';
import { BOWLER, BOWLER_YAW, BOWLERS, DONE_T, HOLD_T, PHYS_DT } from './constants.js';
import { G, POSE_BOWLER, POSE_CATCH, POSE_CHEER, POSE_FIELDER, POSE_HOLD } from './state.js';
import { nextType, walkPose } from './rng.js';
import { bowlerAt, gaitBody } from './bowler.js';
import { ballAt, bowl, strike } from './delivery.js';
import { stepBall } from './ball.js';
import { passStumps, RUN_POSE, stepLive, team } from './fielding.js';
import { endMatch, fieldSet, nextField, setField, stepLoose, walkFielders } from './match.js';
import { stepFx } from './fx.js';

/* ---------- update ---------- */
export function update(dt) {
  G.time += dt;
  if (G.phase === 'pick') return;
  const d = G.del;
  if (d.stage === 'runup' && G.time >= d.tRelease) d.stage = 'flight';
  if (d.stage === 'flight') {
    if (G.time >= d.tPitch && !d.bounced) { d.bounced = true; sfx('bounce', .8); }
    if (d.hitAt != null && G.time >= d.hitAt) { strike(d); stepLive(d); }
    else if (G.time >= d.tStumps) passStumps(d);
    else G.ball = ballAt(d, G.time);
  } else if (d.stage === 'live') {
    stepLive(d);
  } else if (d.stage === 'done') {
    const b = G.ball;
    if (b && b.held) b.t = G.time - d.tHit;
    else if (b && b.t != null) { const due = G.time - d.tHit; while (b.t + PHYS_DT <= due + 1e-9) stepBall(b, PHYS_DT); }
    else if (b) stepLoose(b, dt);
    if (b && b.gone) G.ball = null;
    if ((d.timer -= dt) <= 0) {
      d.stage = 'wait'; d.timer = .5; G.ball = null;
      if (G.match && G.match.result) endMatch();
      else setField(nextField());
    }
  } else if (d.stage === 'wait') {
    d.timer -= dt;
  }
  // the fielders: set while the ball comes down, chasing while it is live, then back to their spots. Once the match
  // is decided they (and the bowler) are moved only by the celebration, which is drawn from the clock
  if (G.cele) { /* see startCelebration */ }
  else if (d.stage === 'live' || d.stage === 'done' && d.timer > DONE_T - HOLD_T) {
    const cheer = d.stage === 'done' && G.react && G.react.kind === 'wicket';
    team().forEach((f, k) => {
      if (f === G.bowler && G.time - d.t0 < d.runT + .4) return;
      const held = G.ball && G.ball.held === f;
      f.pose = f.running && d.stage === 'live' ? { ...walkPose(14, .34), ...RUN_POSE } : held ? (G.ball.caught ? POSE_CATCH : POSE_HOLD) : cheer ? POSE_CHEER : f === G.bowler ? POSE_BOWLER : POSE_FIELDER;
      // a wicket: everyone jumps, a little out of step
      if (cheer) f.pose = { ...f.pose, z: hop(G.time - G.react.t0, k) };
    });
  } else if (d.stage === 'done' || d.stage === 'wait') walkFielders(dt);
  stepFx(dt);
  // the bowler: running in and following through, then walking back to his mark
  const bw = G.bowler, s = d.t0 == null ? Infinity : G.time - d.t0;
  bw.body = null;  // a jointed body when running in or walking back; otherwise he is drawn from bw.pose like a fielder
  if (G.cele) {
    // he finishes his follow-through before he joins in
    if (G.time < G.cele.bowlerT0 && d.t0 != null) { const at = bowlerAt(d, s); bw.x = at.x; bw.yaw = at.yaw; bw.body = at.body; }
  } else if (d.stage !== 'wait' && s < d.runT + .4) {
    const at = bowlerAt(d, s);
    bw.x = at.x; bw.yaw = at.yaw; bw.body = at.body;
  } else if (d.stage === 'done' && d.timer <= DONE_T - HOLD_T || d.stage === 'wait') {
    const mark = { x: BOWLERS[nextType()].mark, y: BOWLER.y }, gx = mark.x - bw.x, gy = mark.y - bw.y, gap = Math.hypot(gx, gy);
    if (gap > .05) {
      const go = Math.min(gap, 3.6 * dt);
      bw.x += gx / gap * go; bw.y += gy / gap * go;
      bw.yaw = Math.atan2(gy, gx);
      bw.walk = (bw.walk || 0) + go;
      bw.body = gaitBody(bw.x, bw.y, bw.yaw, bw.walk);
    } else {
      bw.x = mark.x; bw.y = mark.y;
      bw.yaw = BOWLER_YAW;
      bw.pose = POSE_BOWLER;
      if (d.stage === 'wait' && d.timer <= 0 && G.auto && fieldSet()) bowl();
    }
  }
  if (G.batter.swing && G.time - G.batter.swing.tc > BAT_BACK) G.batter.swing = null;
}

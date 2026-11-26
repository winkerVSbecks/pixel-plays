// The game: boot, the pause rule, the frame loop and the test controls (window.__cricket).
import './game/screen.js';
import { fit } from './engine.js';
import {
  BACKSTOP, BALL_R, BATTER, BOWL_LINE_X, BOWLED_HALF, BOWLER, BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT,
  BOWLER_YAW, BOWLERS, BRICK_X, CATCH_R, CATCH_REACT, CATCH_RUN, CATCH_Z, CHALK_X, CHALK_Y, CONTACT_X, CREASE_X,
  DIR_WORLD, DIRS, DONE_T, EDGE_X, EDGE_Y, FIELD_NAMES, FIELDERS, FIELDS, GATHER_R, GATHER_Z, GRADES, GRAVITY,
  LEG_SIDE, LINES, LIVE_MAX, OFF_SIDE, OVERS, PARAPET, PITCH_Y, PROPS, REACT, RELEASE_X, REPLAY_T, RUN_DIST,
  RUN_SPEED, SHOT_TYPES, SHOTS, STRAIGHT, STUMPS_FACE, STUMPS_X, STUMPS_Z, TARGET, TEAMS, WALL_H_BACK, WALL_H_LEFT, WALL_X,
  WALL_Y, WICKETS,
} from './game/constants.js';
import { bake } from './game/scene.js';
import { G, last, POSE_BOWLER, setLast, setTeams } from './game/state.js';
import { aerial, setAerial, setStatus } from './game/hud.js';
import { reseed, rng } from './game/rng.js';
import { ballAt, bowl, swingAt } from './game/delivery.js';
import { clearWalk, fieldFor, hidesView, newMatch, renderHud, replay, resultText, setField } from './game/match.js';
import { update } from './game/update.js';
import { dirFromScreen, draw, roseCenter } from './game/draw.js';
import { aimDir, heldArrows, heldDirKeys, keyDir, setHookAim, shotFor } from './game/input.js';
import { audio, ensureAudio, muted, sfx } from './game/sound.js';
import { chooseTeam, openPicker } from './game/picker.js';
import { simulate } from './game/simulate.js';

/* ---------- boot ---------- */
addEventListener('resize', fit);
fit();
bake();
/* pause: while any dialog is open (the team picker or the shell's Rules) or the tab is hidden, the match clock
   stops, so nothing is bowled and no sound cue fires. Pausing never changes what a ball does:
   - a ball whose fate is still open (in the run-up, or in flight with no swing made and not yet at the bat) is taken
     back on the way out and the very same delivery is bowled again from the mark, so it cannot be re-rolled;
   - once the batter has swung or the ball is past the bat, everything stays frozen where
     it was and carries on from there, so the outcome stands and counts once */
const pausedNow = () => document.hidden || !!document.querySelector('dialog[open]');
function checkPause() {
  const p = pausedNow();
  if (p && !G.paused) G.paused = { del: G.del };
  else if (!p && G.paused) {
    const d = G.paused.del;
    G.paused = null;
    // (unless the picker started a new match meanwhile, which has its own fresh delivery)
    if (d === G.del && unplayed(d)) takeBack(d);
  }
  return !!G.paused;
}
const unplayed = d => d.stage === 'runup' || d.stage === 'flight' && !d.swing && G.time < d.tContact;
function takeBack(d) {
  const u = d.undo;
  // rewind the random sequence to where this ball was drawn from: the next bowl() repeats type, line, length, movement
  rng.state(u.rng);
  G.balls--; G.over = u.over; G.ballInOver = u.ballInOver; G.overType = u.overType;
  if (G.match && u.thisOver) G.match.thisOver = u.thisOver;
  G.del = { stage: 'wait', timer: .6 };
  G.ball = null; G.batter.swing = null; G.stumps.down = false; G.react = null;
  heldArrows.clear(); heldDirKeys.length = 0;
  setField(fieldFor(G.over), true);
  Object.assign(G.bowler, { x: d.mark, y: BOWLER.y, yaw: BOWLER_YAW, pose: POSE_BOWLER, body: null, drawn: null, fade: null, walk: 0 });
  setStatus(u.status);
  renderHud();
}
addEventListener('visibilitychange', checkPause);
setLast(performance.now());
function frame(now) {
  if (!checkPause() && !G.frozen) update(Math.min(.04, (now - last) / 1000));
  setLast(now);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
openPicker();
const LANE = {
  WALL_X, WALL_Y, WALL_H_LEFT, WALL_H_BACK, PARAPET, CHALK_X, CHALK_Y, EDGE_X, EDGE_Y, PITCH_Y,
  CREASE_X, STUMPS_X, STUMPS_Z, BOWL_LINE_X, BRICK_X, BACKSTOP, BATTER, BOWLER, FIELDERS,
};
const FIELDING = { FIELDS, FIELD_NAMES, REACT, RUN_SPEED, CATCH_REACT, CATCH_RUN, GATHER_R, GATHER_Z, CATCH_R, CATCH_Z, BOWLER_CATCH_R, BOWLER_CATCH_Z, BOWLER_HOT, RUN_DIST, SHOTS, LIVE_MAX, PROPS };
const BOWLING = { BALL_R, GRAVITY, RELEASE_X, CONTACT_X, STUMPS_FACE, BOWLED_HALF, BOWLERS, LINES, GRADES, DIRS, DIR_WORLD, LEG_SIDE, OFF_SIDE, STRAIGHT, DONE_T, SHOT_TYPES };
const dirIndex = dir => typeof dir === 'number' ? dir : DIRS.indexOf(dir);
// test controls. freeze() stops the frame loop advancing time so only step()/advance() move the game
window.__cricket = {
  G, LANE, BOWLING, FIELDING, TEAMS, setTeams, chooseTeam, openPicker,
  step(dt, skipDraw) { update(dt); if (!skipDraw) draw(); },
  freeze(on = true) { G.frozen = on; },
  seed(n) { reseed(n); },
  auto(on = true) { G.auto = on; },
  force(opts) { G.force = opts || {}; return G.force; },
  // fix the field placing (a FIELDS name) for every following ball until cleared with null; fielders snap to it now
  field(name) {
    if (name != null && !FIELDS[name]) throw new Error('no field ' + name);
    G.forceField = name || null;
    setField(name || fieldFor(G.over), true);
    return G.fielders.map(f => ({ name: f.name, x: f.x, y: f.y }));
  },
  // the latest ball's outcome: { runs, out, how, by?, shotType } (null before the first ball ends)
  outcome() { return G.last && { runs: G.last.runs, out: G.last.out, how: G.last.how, by: G.last.by, shotType: G.last.shotType }; },
  bowl,
  // swing now in dir; shot is a SHOT_TYPES entry ('ground' or 'air'), by default what Space would play now
  swing(dir, shot) { return swingAt(dirIndex(dir), G.time, shot || shotFor(false)); },
  // aim and hit separately, as the keyboard does: aim(dir) holds a direction (null lets go, which is straight),
  // hit(shot?) is Space at G.time ('air' is Shift+Space); aimed() is the direction the guide shows now
  aim(dir) { setHookAim(dir == null ? null : dirIndex(dir)); return DIRS[aimDir()]; },
  hit(shot) { return swingAt(keyDir(), G.time, shot || shotFor(false)); },
  // the touch aerial toggle: aerial(true) arms it, aerial(false) disarms it; returns whether it is armed
  aerial(on) { if (on != null) setAerial(on); return aerial; },
  aimed: () => DIRS[aimDir()],
  ballAt(t) { return ballAt(G.del, t); },
  // step in small slices until G.time reaches t exactly (or pred(G) is true), then draw once
  advance(t, slice = 1 / 120) {
    while (G.time < t - 1e-9) update(Math.min(slice, t - G.time));
    draw();
    return G.time;
  },
  until(pred, maxT = 10, slice = 1 / 120) {
    const stop = G.time + maxT;
    while (!pred(G) && G.time < stop) update(slice);
    draw();
    return pred(G);
  },
  dirFromScreen, roseCenter,
  // the match: newMatch(target?) starts one now (teams unchanged); match(patch?) merges patch into G.match and
  // returns it, so a test can set up any score (e.g. { runs: 50, wkts: 2, balls: 29 }); replay() is the result tap
  newMatch, replay, resultText, hidesView, clearWalk,
  match(patch) { if (patch) Object.assign(G.match, patch); renderHud(); return G.match; },
  MATCH: { OVERS, WICKETS, TARGET, REPLAY_T },
  // simulate({ shot, balls, seed, timing, dir }): many seeded balls headless, tallied (see game/simulate.js), e.g.
  // simulate({ shot: 'air', timing: 'perfect' }) against simulate({ shot: 'ground', timing: 'perfect' })
  simulate,
  // sound: play one effect now (starts the audio context if the page allows it); audio() is its state, or null
  sound(kind, amount) { ensureAudio(); sfx(kind, amount); return audio && audio.state; },
  audio: () => audio && { state: audio.state, muted },
};

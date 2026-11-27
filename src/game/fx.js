// Contact sparks and dust: single pixels thrown out under gravity.
import { drawDots, hash, project, rgb } from '../engine.js';
import { GRAVITY } from './constants.js';
import { G } from './state.js';

/* ---------- feedback ----------
   Sparks off the bat for a timed shot, a puff of dust for a mistimed one and where the ball thumps a house front.
   Each bit is a single pixel thrown out from the spot under gravity, gone in a fraction of a second. */
export const SPARK = [rgb(255, 240, 170), rgb(255, 214, 10), rgb(255, 255, 255)];
export const DUST = [rgb(214, 200, 176), rgb(190, 176, 152), rgb(232, 222, 204)];
export function burst(at, n, colors, speed, up, life) {
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.283 + hash(i, G.balls) * .8, v = speed * (.5 + hash(G.balls, i) * .7);
    G.fx.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up * (.4 + hash(i + 7, G.balls)), t: 0, life: life * (.6 + hash(i, 3) * .5), c: colors[i % colors.length] });
  }
}
export function stepFx(dt) {
  for (const p of G.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= GRAVITY * .5 * dt; }
  G.fx = G.fx.filter(p => p.t < p.life);
}
export function drawFx() {
  for (const p of G.fx) { const q = project(p.x, p.y, p.z); drawDots([[q.sx, q.sy]], p.c); }
}

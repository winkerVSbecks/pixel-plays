// The story frame: a pixel canvas that shows a scenario at a time, with play/pause, a scrub position, a playback
// rate and a crop around what the story is about, plus a line saying what is happening at that moment.
import { H, W } from '../../engine.js';
import { G } from '../../game/state.js';
import { duration, FOCUS, play, render } from './scenario.js';

// the controls every animated story shares
export const timeArgTypes = (max = 8) => ({
  time: { control: { type: 'range', min: 0, max, step: .01 }, description: 'Seconds from the start of the run-up (scrub)', table: { category: 'Time' } },
  playing: { control: 'boolean', description: 'Play from the scrub position, looping at the end', table: { category: 'Time' } },
  rate: { control: { type: 'range', min: .1, max: 2, step: .05 }, description: 'Playback rate while playing', table: { category: 'Time' } },
  seed: { control: { type: 'number', min: 0, step: 1 }, description: 'Seed for the random sequence (mulberry32)', table: { category: 'Time' } },
  difficulty: { control: { type: 'range', min: 1, max: 5, step: 1 }, description: 'Stars (difficulty.js): 4 hides the swing cue, 5 also the movement wedge', table: { category: 'Game' } },
  focus: { control: 'select', options: Object.keys(FOCUS), description: 'What the view is centred on', table: { category: 'View' } },
  zoom: { control: { type: 'range', min: 1, max: 4, step: .5 }, description: 'Crop in around the focus', table: { category: 'View' } },
  scale: { control: { type: 'range', min: 1, max: 4, step: 1 }, description: 'Whole-pixel upscale', table: { category: 'View' } },
});
export const timeArgs = { time: 0, playing: false, rate: 1, seed: 1, difficulty: 1, focus: 'lane', zoom: 1, scale: 2 };

const fmt = v => (v == null || !isFinite(v) ? '–' : v.toFixed(2) + 's');
/* what to say under the canvas: the clock, the stage, the delivery's key moments and the result so far */
function describe(sc, info, t, end) {
  const d = info.d, parts = [`t ${t.toFixed(2)}s of ${end.toFixed(1)}s`, 'seed ' + sc.seed, (sc.difficulty || 1) + '★'];
  if (d) {
    parts.push(G.del === d ? d.stage : 'next ball');
    parts.push(`${d.type} · ${d.line} · ${d.move}${d.move !== 'none' ? ' ' + d.amount.toFixed(2) : ''}`);
    parts.push(`release ${fmt(d.tRelease)} · pitch ${fmt(d.tPitch)} · bat ${fmt(d.tContact)} · bricks ${fmt(d.tStumps)}`);
    if (info.tSwing != null) parts.push(`${sc.swing.shot || 'ground'} shot to ${sc.swing.dir} at ` + fmt(info.tSwing) + (d.swing ? ` (${['perfect', 'good', 'mistimed', 'miss'][d.swing.grade]})` : ''));
  } else parts.push(G.del.stage);
  if (G.last) {
    const o = G.last;
    parts.push('result: ' + o.how + (o.runs ? ', ' + o.runs : '') + (o.out ? ', out' : '') + (o.by ? ' (' + o.by + ')' : '') + (o.dropped ? ', dropped' : ''));
  }
  return parts.join(' · ');
}

/* the story element for scenario sc. args carry the shared controls (time, playing, rate, focus, zoom, scale);
   label is the canvas's accessible name. after(info) runs once the game is at the time and before it is drawn (to
   set up the HUD, say); extra(ctx, t) may draw over the frame */
export function stage(sc, args, { label, extra, after } = {}) {
  const end = duration(sc), scale = args.scale || 2, zoom = args.zoom || 1;
  const root = document.createElement('figure');
  root.style.cssText = 'margin: 0; display: grid; gap: 6px; font: 12px/1.4 ui-monospace, Menlo, monospace; color: #1c1b19;';
  const view = document.createElement('canvas');
  view.width = W * scale; view.height = H * scale;
  view.setAttribute('role', 'img');
  view.setAttribute('aria-label', label || 'A moment of the game');
  view.style.cssText = `display: block; width: ${W * scale}px; height: ${H * scale}px; image-rendering: pixelated; background: #fff;`;
  const caption = document.createElement('figcaption');
  caption.style.cssText = `max-width: ${W * scale}px; color: #5f5b54;`;
  root.append(view, caption);
  const out = view.getContext('2d');
  out.imageSmoothingEnabled = false;
  const show = t => {
    const info = play(sc, t);
    if (after) after(info);
    const src = render();
    const at = zoom > 1 && (FOCUS[args.focus] || FOCUS.lane)();
    const sw = W / zoom, sh = H / zoom;
    const sx = at ? Math.max(0, Math.min(W - sw, Math.round(at.sx - sw / 2))) : 0, sy = at ? Math.max(0, Math.min(H - sh, Math.round(at.sy - sh / 2))) : 0;
    out.clearRect(0, 0, view.width, view.height);
    out.drawImage(src, sx, sy, sw, sh, 0, 0, view.width, view.height);
    if (extra) extra(out, t, { sx, sy, k: view.width / sw });
    caption.textContent = describe(sc, info, t, end);
  };
  const t0 = Math.min(args.time || 0, end);
  show(t0);
  if (args.playing) {
    const start = performance.now();
    const tick = now => {
      if (!root.isConnected && now - start > 500) return;  // the story was re-rendered or left
      show((t0 + (now - start) / 1000 * (args.rate || 1)) % end);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return root;
}

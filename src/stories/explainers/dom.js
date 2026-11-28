// Small helpers shared by the explainer widgets: build a widget from markup, find its parts, and run a
// play/pause animation loop that stops by itself once the widget leaves the page.
import './visual.css';

// a widget root (<div class="visual {cls}">) holding the given markup; $(role) finds a part by its data-role
export function widget(cls, markup) {
  const root = document.createElement('div');
  root.className = 'visual ' + cls;
  root.innerHTML = markup;
  const $ = role => root.querySelector(`[data-role="${role}"]`);
  return { root, $ };
}

/* a requestAnimationFrame loop behind a Play/Pause button. step(dt) runs each frame with the seconds since the last
   one, and may return false to stop. The loop also stops when the root is no longer in the document or no longer
   visible (a story was switched, a docs page left, or Storybook hid the story root to show a docs page), so nothing
   keeps drawing into a widget nobody can see. beforeStart runs on each Play */
export function player(root, button, step, { beforeStart } = {}) {
  let playing = false, last = 0, id = 0;
  const label = () => { button.textContent = playing ? 'Pause' : 'Play'; };
  function frame(ts) {
    id = 0;
    if (!playing) return;
    if (!root.isConnected || !root.checkVisibility()) { stop(); return; }
    const dt = last ? Math.min((ts - last) / 1000, .1) : 0;
    last = ts;
    if (step(dt) === false) { stop(); return; }
    id = requestAnimationFrame(frame);
  }
  function start() {
    if (playing) return;
    if (beforeStart) beforeStart();
    playing = true; last = 0; label();
    id = requestAnimationFrame(frame);
  }
  function stop() {
    playing = false;
    if (id) cancelAnimationFrame(id);
    id = 0; label();
  }
  button.addEventListener('click', () => (playing ? stop() : start()));
  label();
  return { start, stop, get playing() { return playing; } };
}

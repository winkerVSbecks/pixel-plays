// Page chrome: About and Rules popups (top right) and background music. The credits live in About and on the welcome screen.
const MUSIC_VOLUME = .4;
// the About popup, one paragraph per line: text, and [text, url] for a link
const ABOUT = [
  ['Gully Cricket by ', ['Varun', 'https://varun.ca']],
  ['Based on the original concept by ', ['abhi', 'https://x.com/awwbhi2'], ' and games by ', ['AmirMushich', 'https://x.com/AmirMushich']],
  [['Pixel Plays on GitHub', 'https://github.com/amirmushichge/pixel-plays']],
];
const css = `
  .pp-link { font: inherit; color: #6b675f; background: none; border: 0; padding: 10px; margin: 0; cursor: pointer; }
  .pp-link:hover, .pp-link:focus-visible { color: #1c1b19; }
  /* Rules, then About (an info icon) at the far right, share the top right corner, clear of the scores at the top left */
  #pp-top { position: fixed; top: max(4px, env(safe-area-inset-top)); right: max(6px, env(safe-area-inset-right)); z-index: 5; display: flex; align-items: center; }
  #pp-about-open { display: grid; place-items: center; padding: 10px; touch-action: manipulation; }
  #pp-about-open svg { display: block; width: 17px; height: 17px; }
  #pp-rules-open { touch-action: manipulation; }
  .pp-dialog { width: min(340px, calc(100vw - 32px)); padding: 16px; border: 1px solid #1c1b19; color: #1c1b19; background: #fff; font: inherit; }
  .pp-dialog::backdrop { background: rgba(255, 255, 255, .72); }
  .pp-dialog h2 { margin: 0 0 10px; font: inherit; font-weight: 600; }
  .pp-dialog ol { margin: 0 0 8px; padding-left: 18px; }
  .pp-dialog li { margin-bottom: 8px; }
  .pp-dialog p { margin: 0 0 8px; }
  .pp-dialog a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .pp-dialog form { text-align: right; }
  .pp-dialog .pp-link { margin: 0 -10px -10px; color: #1c1b19; touch-action: manipulation; }
`;
export function mount({ title: heading, rules: ruleList, music }) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const rules = popup('pp-rules', heading);
  const steps = document.createElement('ol');
  for (const rule of ruleList) {
    const li = document.createElement('li');
    li.textContent = rule;
    steps.append(li);
  }
  rules.body.append(steps);
  const rulesOpen = opener('pp-rules-open', rules.dialog);
  rulesOpen.textContent = 'Rules';

  const about = popup('pp-about', 'About');
  about.body.append(...ABOUT.map(parts => {
    const line = document.createElement('p');
    line.append(...parts.map(part => typeof part === 'string' ? part : outLink(...part)));
    return line;
  }));
  const aboutOpen = opener('pp-about-open', about.dialog);
  aboutOpen.setAttribute('aria-label', 'About');
  aboutOpen.setAttribute('aria-haspopup', 'dialog');
  aboutOpen.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">'
    + '<circle cx="8" cy="8" r="7"/><path d="M8 7v4.5" stroke-linecap="round"/><circle cx="8" cy="4.6" r=".55" fill="currentColor" stroke="none"/></svg>';

  const top = document.createElement('div');
  top.id = 'pp-top';
  top.append(rulesOpen, aboutOpen);

  document.body.append(top, rules.dialog, about.dialog);
  startMusic(music);
}
// a modal in the Rules chrome: a title, a body and a Close button. Esc closes it (the browser's own dialog
// behaviour), and so does a press on the backdrop. While any dialog is open the game takes no input and pauses
function popup(id, heading) {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'pp-dialog';
  dialog.setAttribute('aria-labelledby', id + '-title');
  const title = document.createElement('h2');
  title.id = id + '-title';
  title.textContent = heading;
  const body = document.createElement('div');
  const form = document.createElement('form');
  form.method = 'dialog';
  // focus starts on Close, so an Enter straight after opening closes the popup rather than following a link
  form.innerHTML = '<button class="pp-link" autofocus>Close</button>';
  dialog.append(title, body, form);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  return { dialog, body };
}
function opener(id, dialog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'pp-link';
  button.addEventListener('click', () => dialog.showModal());
  return button;
}
// a link that opens in a new tab
function outLink(text, url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}
// the track loops from the first gesture, because browsers block sound before one.
// The game's own sound button mutes it too.
function startMusic(src) {
  const music = new Audio(src);
  music.loop = true;
  music.volume = MUSIC_VOLUME;
  music.preload = 'none';
  let started = false;
  const start = () => {
    started = true;
    music.play().catch(() => { started = false; });
  };
  for (const kind of ['pointerdown', 'keydown']) document.addEventListener(kind, () => { if (!started) start(); });
  document.getElementById('mute').addEventListener('click', () => { music.muted = !music.muted; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause();
    else if (started) start();
  });
}

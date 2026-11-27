// Page chrome: About and Rules popups (top right) and background music. The credits live in About.
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
  /* wide enough that the rules read in longer lines (about 60 characters), still clear of the edges on a phone */
  .pp-dialog { width: min(520px, calc(100vw - 32px)); padding: 16px; border: 1px solid #1c1b19; color: #1c1b19; background: #fff; font: inherit; }
  /* on a short screen the body scrolls inside the dialog, and Close stays in view below it */
  .pp-dialog[open] { display: flex; flex-direction: column; }
  /* it reaches into the dialog's side padding, so the scroll box does not clip the list numbers that sit in it */
  .pp-body { overflow-y: auto; min-height: 0; margin: 0 -16px; padding: 0 16px; }
  .pp-dialog::backdrop { background: rgba(255, 255, 255, .72); }
  .pp-dialog h2 { margin: 0 0 10px; font: inherit; font-weight: 600; }
  .pp-dialog * + h2 { margin-top: 16px; }
  .pp-dialog ol, .pp-dialog ul { margin: 0 0 8px; padding-left: 18px; }
  .pp-dialog li { margin-bottom: 8px; }
  .pp-dialog li ul { margin: 8px 0 0; }
  .pp-dialog li li { margin-bottom: 4px; }
  .pp-dialog strong { font-weight: 600; }
  .pp-dialog p { margin: 0 0 8px; }
  .pp-dialog a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .pp-dialog form { text-align: right; }
  .pp-dialog .pp-link { margin: 0 -10px -10px; color: #1c1b19; touch-action: manipulation; }
`;
export function mount({ controls, rules: ruleList, music }) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  // no visible title: it opens straight on Controls, and is named Rules for screen readers
  const rules = popup('pp-rules', 'Rules', false);
  const keys = list('ul', controls.map(([label, text]) => {
    const name = document.createElement('strong');
    name.textContent = label;
    return [name, ' ' + text];
  }));
  const steps = list('ol', ruleList.map(rule => typeof rule === 'string' ? [rule] : [rule.text, list('ul', rule.items.map(item => [item]))]));
  rules.body.append(subhead('Controls'), keys, subhead('Rules'), steps);
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
// a list element, one item per entry; each entry is the nodes and strings that go in its item
function list(tag, entries) {
  const el = document.createElement(tag);
  el.append(...entries.map(parts => {
    const li = document.createElement('li');
    li.append(...parts);
    return li;
  }));
  return el;
}
function subhead(text) {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}
// a modal in the Rules chrome: a title (shown, or only named for screen readers), a body and a Close button.
// Esc closes it (the browser's own dialog behaviour), and so does a press on the backdrop. While any dialog
// is open the game takes no input and pauses
function popup(id, heading, showTitle = true) {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'pp-dialog';
  const body = document.createElement('div');
  body.className = 'pp-body';
  const form = document.createElement('form');
  form.method = 'dialog';
  // focus starts on Close, so an Enter straight after opening closes the popup rather than following a link
  form.innerHTML = '<button class="pp-link" autofocus>Close</button>';
  if (showTitle) {
    dialog.setAttribute('aria-labelledby', id + '-title');
    const title = subhead(heading);
    title.id = id + '-title';
    dialog.append(title, body, form);
  } else {
    dialog.setAttribute('aria-label', heading);
    dialog.append(body, form);
  }
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

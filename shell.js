'use strict';
// Page chrome: rules popup (top right), credits (bottom centre) and background music.
window.PixelPlays = (() => {
  const MUSIC_VOLUME = .4;
  const CREDITS = [
    ['Concept by', 'abhi', 'https://x.com/awwbhi2'],
    ['Game by', 'AmirMushich', 'https://x.com/AmirMushich'],
  ];
  const css = `
    .pp-link { font: inherit; color: #8b877f; background: none; border: 0; padding: 10px; margin: 0; cursor: pointer; }
    .pp-link:hover, .pp-link:focus-visible { color: #1c1b19; }
    #pp-rules-open { position: fixed; top: max(4px, env(safe-area-inset-top)); right: max(6px, env(safe-area-inset-right)); z-index: 5; }
    #pp-rules { width: min(340px, calc(100vw - 32px)); padding: 16px; border: 1px solid #1c1b19; color: #1c1b19; background: #fff; font: inherit; }
    #pp-rules::backdrop { background: rgba(255, 255, 255, .72); }
    #pp-rules h2 { margin: 0 0 10px; font: inherit; font-weight: 600; }
    #pp-rules ol { margin: 0 0 8px; padding-left: 18px; }
    #pp-rules li { margin-bottom: 8px; }
    #pp-rules form { text-align: right; }
    #pp-rules .pp-link { margin: 0 -10px -10px; color: #1c1b19; }
    #pp-credits { position: fixed; bottom: max(14px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 4; margin: 0; color: #8b877f; white-space: nowrap; pointer-events: none; }
    #pp-credits a { color: inherit; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
    #pp-credits a:hover, #pp-credits a:focus-visible { color: #1c1b19; }
    /* long end-of-game status lines run towards the centre, so the credits step above them */
    @media (max-width: 1200px) { #pp-credits { bottom: max(38px, calc(env(safe-area-inset-bottom) + 24px)); } }
    @media (max-width: 600px) { #pp-credits { bottom: max(72px, calc(env(safe-area-inset-bottom) + 58px)); } }
  `;
  function mount({ title: heading, rules, music }) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);

    const open = document.createElement('button');
    open.type = 'button';
    open.id = 'pp-rules-open';
    open.className = 'pp-link';
    open.textContent = 'Rules';
    const dialog = document.createElement('dialog');
    dialog.id = 'pp-rules';
    dialog.setAttribute('aria-labelledby', 'pp-rules-title');
    const title = document.createElement('h2');
    title.id = 'pp-rules-title';
    title.textContent = heading;
    const steps = document.createElement('ol');
    for (const rule of rules) {
      const li = document.createElement('li');
      li.textContent = rule;
      steps.append(li);
    }
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = '<button class="pp-link">Close</button>';
    dialog.append(title, steps, form);
    open.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

    // one line that reads "Concept by abhi and Game by AmirMushich", each name linking to its author
    const credits = document.createElement('p');
    credits.id = 'pp-credits';
    CREDITS.forEach(([label, name, url], i) => {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = name;
      credits.append((i ? ' and ' : '') + label + ' ', link);
    });

    document.body.append(open, dialog, credits);
    startMusic(music);
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
    PixelPlays.music = music;
  }
  return { mount };
})();

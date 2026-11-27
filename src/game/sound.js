// Sound effects from Web Audio (no files), and the mute button.

/* ---------- sound ----------
   Web Audio: short oscillator blips and filtered noise, no files. The context starts on the first
   press or key (browsers only allow sound after a gesture); headless and muted play stays silent.
   A page that sets globalThis.__silent (Storybook's preview does) never makes a context, so it never plays a sound */
export let muted = false, audio = null, noiseBuf = null;
export function ensureAudio() {
  if (globalThis.__silent) return;
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio = new AC();
  noiseBuf = audio.createBuffer(1, audio.sampleRate / 2, audio.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}
addEventListener('pointerdown', ensureAudio, true);
addEventListener('keydown', ensureAudio, true);
// filtered noise: a slap, a clatter, a crowd's breath
function hiss(at, length, level, freq, q = .8, type = 'bandpass') {
  const src = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
  src.buffer = noiseBuf;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + Math.min(.01, length / 4));
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(at, Math.random() * .2); src.stop(at + length + .02);
}
// a pitch glide from f0 to f1, fading out: a knock, a thud, a voice
function glide(at, f0, f1, length, level, type = 'sine', attack = .005) {
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + length);
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + attack);
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(at); osc.stop(at + length + .02);
}
// a struck body: noise through a narrow band-pass, hit in about a millisecond and dying away. A click, a pock, a clack
function knock(at, length, level, freq, q = 4, type = 'bandpass') {
  const src = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
  src.buffer = noiseBuf;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(.0005, at);
  gain.gain.exponentialRampToValueAtTime(level, at + .001);
  gain.gain.exponentialRampToValueAtTime(.0005, at + length);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(at, Math.random() * .2); src.stop(at + length + .02);
}
const jit = (a, b) => a + Math.random() * (b - a);  // sound only: never the game's seeded rng
// the bat-on-ball sound is candidate 7, "Crisp but full", from the bat-sound audition, ported as is. These two helpers
// are the audition's mode() and burst(), renamed so they clash with no game function (strike() is the hit itself,
// ring and burst are taken too); `out` is the node they play into.
// a damped resonance: a sine held at one pitch, faded in over `attack` seconds and dying away over `decay` seconds.
// `bend` > 1 starts it that much flatter and lets it settle up to pitch in 20 ms (a rubbery "pop"; 1 = none)
function sfxRing(out, at, freq, decay, level, attack = .003, bend = 1) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq / bend, at);
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq, at + .02);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + attack + decay + .02);
}
// a burst of noise through a band-pass (a struck, rough body), with a gentle low-pass on top to keep it round.
// lp = 0 skips the low-pass
function sfxStrike(out, at, freq, q, decay, level, attack = .002, lp = 2500) {
  const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  let tail = f;
  if (lp) { const l = audio.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; l.Q.value = .5; f.connect(l); tail = l; }
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
  s.connect(f); tail.connect(g).connect(out);
  s.start(at, Math.random() * .2); s.stop(at + attack + decay + .02);
}
// the audition played louder than the game. The hit goes through one gain of this much, which brings a perfect hit's
// peak down to about 0.4 without changing its shape (scaling the levels inside would: their decays end at a fixed floor)
const HIT_LEVEL = .66;
export function sfx(kind, amount = 1) {
  if (!audio || muted || audio.state !== 'running') return;
  const now = audio.currentTime + .005;
  if (kind === 'hit') {
    // bat on tennis ball: a small click on top of a strong, longer wooden body. Perfect (0) is fullest, good (1) a
    // little higher and shorter, mistimed (2 or more) higher, thinner and shorter with more click. Each hit varies
    // about 3% in pitch and 6% in level
    const g = amount >= 2 ? 2 : amount >= 1 ? 1 : 0;
    const p = jit(.97, 1.03) * [1, 1.04, 1.14][g], v = jit(.94, 1.06) * [1, .85, .6][g], len = 1.6 * [1, .85, .6][g];
    const out = audio.createGain();
    out.gain.value = HIT_LEVEL; out.connect(audio.destination);
    sfxStrike(out, now, 2600 * p, .8, .006, .65 * v * [1, 1, 1.3][g], .0007, 0);
    sfxRing(out, now, 470 * p, .07 * len, .3 * v, .0015);
    sfxRing(out, now, 200 * p, .1 * len, .4 * v * [1, .8, .5][g], .002);
    sfxStrike(out, now, 470 * p, 4, .06 * len, 1.2 * v, .0015, 3000);
  } else if (kind === 'bounce') {
    glide(now, 200, 90, .07, .04 + .16 * Math.min(1, amount), 'sine');
    hiss(now, .02, .03 * Math.min(1, amount), 1800);
  } else if (kind === 'wall') {
    // a thump on plaster (or the oil drum)
    glide(now, 120, 60, .16, .26 * amount, 'triangle');
    hiss(now, .08, .1 * amount, 500, 1.2);
  } else if (kind === 'bricks') {
    glide(now, 150, 70, .12, .2, 'triangle');
    for (let k = 0; k < 6; k++) {
      const at = now + .02 + k * jit(.05, .09);
      // each brick a stony clack: a click and a hard, short ring at one pitch, over grit
      const f = jit(1100, 1900);
      hiss(at, .05, jit(.06, .12), jit(900, 1700), 2);
      knock(at, .004, jit(.25, .4), jit(3000, 4200), .8);
      glide(at, f * 1.02, f, .03, jit(.04, .07), 'sine', .001);
      glide(at, f * 2.76, f * 2.7, .015, .02, 'sine', .001);
    }
  } else if (kind === 'cheer') {
    // a few kids: rising "yay"s with a wobble, over a breathy roar
    hiss(now, .9, .05, 1800, .5);
    for (let k = 0; k < 4; k++) {
      const at = now + jit(0, .18), f = jit(520, 760);
      glide(at, f, f * jit(1.25, 1.5), jit(.35, .55), .045, 'triangle', .04);
    }
    for (let k = 0; k < 6; k++) hiss(now + .1 + k * jit(.08, .13), .05, jit(.03, .06), jit(1500, 2600));
  } else if (kind === 'groan') {
    // the batting kids: a falling "ohh"
    for (let k = 0; k < 3; k++) {
      const at = now + jit(0, .08), f = jit(260, 340);
      glide(at, f, f * .62, jit(.6, .8), .06, 'sawtooth', .06);
    }
    hiss(now, .5, .03, 600, .7, 'lowpass');
  }
}
const muteButton = document.getElementById('mute');
muteButton.addEventListener('click', () => {
  muted = !muted;
  muteButton.textContent = muted ? 'sound off' : 'sound on';
  muteButton.setAttribute('aria-pressed', String(muted));
});

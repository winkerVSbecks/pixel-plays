// Small stand-ins for the few browser things the game touches when it loads and draws, so the real engine and the
// Storybook scenario harness run in Node (for npm run art). Nothing here draws: the engine writes its own pixel
// buffer, and a canvas's 2D context only has to hand that buffer back.
// Import this module, then import the game with a dynamic import() so the stand-ins are in place first.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// 'virtual:game-page', which the Vite config serves as the text of index.html, is that file here
const PAGE = new URL('../index.html', import.meta.url);
registerHooks({
  resolve: (specifier, context, next) => (specifier === 'virtual:game-page' ? { url: specifier, shortCircuit: true } : next(specifier, context)),
  load: (url, context, next) => (url === 'virtual:game-page'
    ? { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(readFileSync(PAGE, 'utf8'))};` }
    : next(url, context)),
});

/* a canvas 2D context: createImageData gives the engine a buffer to draw into, putImageData keeps it */
function context2d(canvas) {
  return {
    canvas, image: null, imageSmoothingEnabled: false,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) { this.image = img; },
    clearRect() {}, fillRect() {}, drawImage() {},
  };
}
/* a DOM element that takes any property and ignores any call: the HUD, the picker and the buttons are written to
   and listened on, but nothing reads them back for drawing. A property it does not have reads as another such
   element (firstChild, parentNode and so on) */
const noop = () => {};
function element(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(), style: { setProperty: noop, removeProperty: noop }, dataset: {}, children: [], hidden: false, textContent: '', value: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    append: noop, appendChild: x => x, prepend: noop, replaceChildren: noop, remove: noop, focus: noop, blur: noop,
    showModal: noop, show: noop, close: noop, closest: () => null, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
  };
  if (node.tagName === 'CANVAS') {
    let ctx = null;
    node.width = 300; node.height = 150;
    node.getContext = () => (ctx ||= context2d(node));
  }
  return new Proxy(node, { get: (t, k) => (k in t || typeof k === 'symbol' || k === 'then' ? t[k] : (t[k] = element())) });
}
const byId = new Map();
globalThis.window = globalThis;
globalThis.document = {
  body: element('body'), activeElement: null,
  getElementById: id => byId.get(id) || byId.set(id, element(id === 'c' ? 'canvas' : 'div')).get(id),
  createElement: element, importNode: n => n, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop,
};
globalThis.DOMParser = class { parseFromString() { return { body: { children: [] }, querySelector: () => ({ textContent: '' }) }; } };
globalThis.matchMedia = query => ({ matches: query.includes('reduce'), addEventListener: noop }); // reduced motion: no wind sway
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.requestAnimationFrame = noop;
globalThis.innerWidth = 1200; globalThis.innerHeight = 900; globalThis.devicePixelRatio = 1;
// the harness seeds the game's own generator; anything left on Math.random gets a fixed sequence too (mulberry32)
let seed = 0x9e3779b9;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

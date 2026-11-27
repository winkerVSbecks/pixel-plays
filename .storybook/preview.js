// Storybook plays no sound. The game's sound module makes no AudioContext while __silent is set, and no media
// element (the game's music) may play here.
globalThis.__silent = true;
HTMLMediaElement.prototype.play = function () { this.pause(); return Promise.resolve(); };

/** @type { import('@storybook/html').Preview } */
export default {
  parameters: { layout: 'centered' },
};

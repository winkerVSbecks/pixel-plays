import { themes } from 'storybook/theming';

// Storybook plays no sound. The game's sound module makes no AudioContext while __silent is set, and no media
// element (the game's music) may play here.
globalThis.__silent = true;
HTMLMediaElement.prototype.play = function () { this.pause(); return Promise.resolve(); };

// docs pages follow the system light or dark setting, like the Storybook UI around them
const dark = matchMedia('(prefers-color-scheme: dark)').matches;

/** @type { import('@storybook/html').Preview } */
export default {
  parameters: { layout: 'centered', docs: { theme: dark ? themes.dark : themes.light } },
};

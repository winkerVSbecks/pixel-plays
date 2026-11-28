import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// the game's index.html as a string, for the stories that need the page markup the game modules look up
// (Storybook's dev server answers /index.html itself, so a plain `?raw` import of it gets the wrong page)
const PAGE = 'virtual:game-page';
const pageHtml = {
  name: 'game-page-html',
  resolveId: id => (id === PAGE ? '\0' + PAGE : null),
  load(id) {
    if (id !== '\0' + PAGE) return null;
    const file = fileURLToPath(new URL('../index.html', import.meta.url));
    this.addWatchFile(file);
    return 'export default ' + JSON.stringify(readFileSync(file, 'utf8'));
  },
};

/** @type { import('@storybook/html-vite').StorybookConfig } */
export default {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.js'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/html-vite', options: {} },
  staticDirs: ['../public'],
  viteFinal: config => ({ ...config, plugins: [...(config.plugins || []), pageHtml] }),
};

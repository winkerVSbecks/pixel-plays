/** @type { import('@storybook/html-vite').StorybookConfig } */
export default {
  stories: ['../src/**/*.stories.js'],
  framework: { name: '@storybook/html-vite', options: {} },
  staticDirs: ['../public'],
};

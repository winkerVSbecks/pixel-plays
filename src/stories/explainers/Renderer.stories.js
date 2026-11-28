// The widget behind the "How it works/Renderer" docs page, also on its own as a story.
import { rendererWidget } from './renderer.js';

export default {
  title: 'How it works/Widgets/Renderer',
  parameters: { layout: 'padded' },
};

export const Renderer = {
  name: 'Renderer',
  render: () => rendererWidget(),
};

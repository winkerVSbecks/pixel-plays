// The widget behind the "How it works/Figures" docs page, also on its own as a story.
import { figuresWidget } from './figures.js';

export default {
  title: 'How it works/Widgets/Figures',
  parameters: { layout: 'padded' },
};

export const Figures = {
  name: 'Figures',
  render: () => figuresWidget(),
};

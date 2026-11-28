// The widget behind the "How it works/Ball and fielding" docs page, also on its own as a story.
import { ballWidget } from './ball.js';

export default {
  title: 'How it works/Widgets/Ball and fielding',
  parameters: { layout: 'padded' },
};

export const BallAndFielding = {
  name: 'Ball and fielding',
  render: () => ballWidget(),
};

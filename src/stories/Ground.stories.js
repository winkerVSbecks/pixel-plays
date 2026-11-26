// Smoke story: the lane with nobody on it, baked and drawn into a canvas of its own.
import { createTarget, H, useTarget, W } from '../engine.js';
import { bake, drawGround } from '../game/scene.js';

export default {
  title: 'Scene/Ground',
  args: { time: 0, scale: 2 },
  argTypes: {
    time: { control: { type: 'range', min: 0, max: 10, step: .125 }, description: 'Wind time, in seconds' },
    scale: { control: { type: 'range', min: 1, max: 4, step: 1 }, description: 'Whole-pixel upscale' },
  },
};

export const EmptyGround = {
  render: ({ time, scale }) => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'The empty lane: houses along two sides, the pitch, props and trees, no players');
    canvas.style.cssText = `display: block; width: ${W * scale}px; height: ${H * scale}px; image-rendering: pixelated;`;
    useTarget(createTarget(canvas));
    bake();
    drawGround(time);
    return canvas;
  },
};

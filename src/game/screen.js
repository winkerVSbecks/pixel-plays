// The game's render target: the page's canvas. Imported first, so everything after draws to it.
import { createTarget, useTarget } from '../engine.js';

export const screen = useTarget(createTarget(document.getElementById('c')));

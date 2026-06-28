// Entry point — bootstraps the game and wires up controls.

import { init } from './src/core/game.js';
import { initControls } from './src/controls.js';

window.addEventListener('load', () => {
  initControls();
  init();
});

// Entry point — bootstraps the game and wires up controls.

import { init } from './game.js';
import { initControls } from './controls.js';

window.addEventListener('load', () => {
  initControls();
  init();
});

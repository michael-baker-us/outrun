// Time-of-day system: cycles through dawn → day → dusk → night → dawn.
// Mutates the `palette` export each frame by calling applyTODPalette().
//
// Phase mapping: 0 = dawn, 0.25 = day (noon), 0.5 = dusk, 0.75 = night (midnight).

import { applyTODPalette } from '../rendering/palette.js';
import { invalidateSkyGradient } from '../rendering/sky.js';

const CYCLE_DURATION = 180; // seconds for a full day/night cycle

let _phase = 0.25; // start at noon so the game opens in daylight

export function updateTOD(dt) {
  _phase = (_phase + dt / CYCLE_DURATION) % 1;
  applyTODPalette(_phase);
  invalidateSkyGradient();
}

export function setTODPhase(p) {
  _phase = ((p % 1) + 1) % 1;
  applyTODPalette(_phase);
  invalidateSkyGradient();
}

export function getTODPhase() { return _phase; }

// 0 at noon, 1 at midnight, smooth cosine interpolation.
export function getNightFactor() {
  const shifted = ((_phase - 0.25) + 1) % 1; // 0 at noon, 0.5 at midnight
  return (1 - Math.cos(shifted * Math.PI * 2)) / 2;
}

export function resetTOD() { setTODPhase(0.25); }

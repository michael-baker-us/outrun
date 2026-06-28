// Touch/tilt controls: maps on-screen buttons and device tilt to the same
// `keys` object the keyboard uses. Also polls the Gamepad API at ~60 Hz.

import { keys, setTiltSteer } from './car.js';
import { startGame, getState } from './game.js';
import { unlockAudio } from './audio.js';

// ---- Tilt steering --------------------------------------------------------

const TILT_FULL   = 4.2;
const TILT_DEAD   = 0.45;
const TILT_INVERT = 1;

let tiltOn = false;
let tiltNeutral = null;
let knob = null, status = null;

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
  return 0;
}

function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || (g.x == null && g.y == null)) return;
  const a = screenAngle();
  let h = a === 90 ? -g.y : a === 270 ? g.y : a === 180 ? -g.x : g.x;
  if (h == null || Number.isNaN(h)) return;

  if (tiltNeutral === null) tiltNeutral = h;
  let d = h - tiltNeutral;
  if (Math.abs(d) < TILT_DEAD) d = 0;
  else d -= Math.sign(d) * TILT_DEAD;
  setTiltSteer(TILT_INVERT * Math.max(-1, Math.min(1, d / TILT_FULL)));

  if (knob) knob.style.left = (50 + Math.max(-1, Math.min(1, d / TILT_FULL)) * TILT_INVERT * 50) + '%';
  if (status && !status.dataset.live) { status.dataset.live = '1'; status.textContent = 'tilt: move it!'; }
}

async function enableTilt() {
  try {
    const M = window.DeviceMotionEvent;
    if (M && typeof M.requestPermission === 'function') {
      const res = await M.requestPermission();
      if (res !== 'granted') { if (status) status.textContent = 'tilt: permission denied'; return false; }
    } else if (!M) {
      if (status) status.textContent = 'tilt: not supported';
      return false;
    }
    tiltNeutral = null;
    window.addEventListener('devicemotion', onMotion);
    return true;
  } catch (_) {
    if (status) status.textContent = 'tilt: needs HTTPS';
    return false;
  }
}

function disableTilt() {
  window.removeEventListener('devicemotion', onMotion);
  setTiltSteer(0);
}

// ---- On-screen buttons ----------------------------------------------------

function bind(id, key) {
  const el = document.getElementById(id);
  if (!el) return;

  const press = (e) => {
    e.preventDefault();
    unlockAudio();
    const state = getState();
    if (state === 'gameover' || state === 'title') { startGame(); return; }
    if (state === 'paused' || state === 'settings') return;
    keys[key] = true;
    el.classList.add('active');
    if (el.setPointerCapture && e.pointerId != null) {
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    }
  };
  const release = (e) => {
    e.preventDefault();
    keys[key] = false;
    el.classList.remove('active');
  };

  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---- Gamepad --------------------------------------------------------------
// Polls navigator.getGamepads() at ~60 Hz and writes directly into `keys`.
// When a gamepad is connected its input fully overrides the corresponding keys.

function _pollGamepad() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let pad = null;
  for (const p of pads) { if (p?.connected) { pad = p; break; } }
  if (!pad) return;

  const ax = pad.axes[0] ?? 0;
  const dz = 0.18;
  keys['ArrowLeft']  = ax < -dz || !!(pad.buttons[14]?.pressed); // left stick / D-pad L
  keys['ArrowRight'] = ax >  dz || !!(pad.buttons[15]?.pressed); // right stick / D-pad R
  keys['ArrowUp']    = !!(pad.buttons[0]?.pressed) || !!(pad.buttons[7]?.pressed); // A / RT
  keys['ArrowDown']  = !!(pad.buttons[2]?.pressed) || !!(pad.buttons[6]?.pressed); // X / LT
}

// ---- Init -----------------------------------------------------------------

export function initControls() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  bind('btn-left',  'ArrowLeft');
  bind('btn-right', 'ArrowRight');
  bind('btn-gas',   'ArrowUp');
  bind('btn-brake', 'ArrowDown');

  knob   = document.getElementById('tilt-knob');
  status = document.getElementById('tilt-status');

  const tiltBtn = document.getElementById('btn-tilt');
  if (tiltBtn) {
    tiltBtn.addEventListener('click', async () => {
      unlockAudio();
      if (!tiltOn) {
        if (status) { status.textContent = 'tilt: requesting...'; delete status.dataset.live; }
        if (await enableTilt()) {
          tiltOn = true;
          document.body.classList.add('tilt');
          tiltBtn.classList.add('on');
        }
      } else {
        tiltOn = false;
        disableTilt();
        document.body.classList.remove('tilt');
        tiltBtn.classList.remove('on');
      }
    });
  }

  const gameCanvas = document.getElementById('game');
  if (gameCanvas) {
    gameCanvas.addEventListener('pointerdown', (e) => {
      unlockAudio();
      const state = getState();
      if (state === 'gameover' || state === 'title') { e.preventDefault(); startGame(); }
    });
  }

  // Gamepad: self-contained 60 Hz poll so game.js doesn't need to call us.
  if ('getGamepads' in navigator) {
    setInterval(_pollGamepad, 16);
  }
}

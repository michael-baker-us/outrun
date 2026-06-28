// Touch/tilt controls: maps on-screen buttons and device tilt to the same
// `keys` object the keyboard uses. Also polls the Gamepad API at ~60 Hz.
// On touch devices, builds a DOM overlay for the title / vehicle-select screens
// so options have proper large tap targets instead of tiny canvas hit zones.

import { keys, setTiltSteer } from './world/car.js';
import {
  startGame, getState,
  getTitleState,
  titlePrevStage, titleNextStage,
  titleCycleDifficulty, titleToggleBoosts, titleOpenVehicleSelect,
  vehicleSelectPrev, vehicleSelectNext, vehicleSelectConfirm,
  openSettings, settingsClose, settingsToggle, settingsVolumeAdjust,
} from './core/game.js';
import { unlockAudio, setMasterVolume } from './systems/audio.js';
import { settings } from './core/settings.js';
import { isWebGLSupported } from './rendering/webgl-road.js';

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
    _applyTouchAudioUnlock();
    e.preventDefault();
    const state = getState();
    // Title/vehicleSelect: the DOM overlay handles interaction; game buttons do nothing.
    if (state === 'title' || state === 'vehicleSelect') return;
    if (state === 'gameover') { startGame(); return; }
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

// ---- Touch title-screen overlay -------------------------------------------
// Only built on touch devices. Provides large tap targets for stage, difficulty,
// vehicle, and boost options so users don't have to hit tiny canvas text.

const DIFF_COLORS = { easy: '#44ff88', normal: '#ffe44d', hard: '#ff4444' };

let _touchAudioUnlocked = false;

function _applyTouchAudioUnlock() {
  unlockAudio();
  if (!_touchAudioUnlocked) {
    setMasterVolume(settings.volume ?? 0.55);
    _touchAudioUnlocked = true;
  }
}

function _tap(e, fn) {
  // Unlock audio BEFORE preventDefault — iOS Safari may not treat the event
  // as a user gesture for Web Audio if preventDefault was already called.
  _applyTouchAudioUnlock();
  e.preventDefault();
  e.stopPropagation();
  fn();
}

function _buildTouchTitleUI() {
  // Title screen overlay
  const titleUI = document.createElement('div');
  titleUI.id = 'touch-title-ui';
  titleUI.innerHTML = `
    <div class="ttu-stage-row">
      <button id="ttu-prev"  class="ttu-arrow">&#9664;</button>
      <div class="ttu-stage-info">
        <span id="ttu-stage-name" class="ttu-stage-name"></span>
        <div id="ttu-dots" class="ttu-dots"></div>
      </div>
      <button id="ttu-next"  class="ttu-arrow">&#9654;</button>
    </div>
    <div class="ttu-opts">
      <button id="ttu-diff"    class="ttu-opt"></button>
      <button id="ttu-vehicle" class="ttu-opt"></button>
      <button id="ttu-boost"   class="ttu-opt"></button>
    </div>
    <button id="ttu-race" class="ttu-race">&#9654;&nbsp; RACE</button>
  `;
  document.body.appendChild(titleUI);

  titleUI.querySelector('#ttu-prev')   .addEventListener('pointerdown', e => _tap(e, titlePrevStage));
  titleUI.querySelector('#ttu-next')   .addEventListener('pointerdown', e => _tap(e, titleNextStage));
  titleUI.querySelector('#ttu-diff')   .addEventListener('pointerdown', e => _tap(e, titleCycleDifficulty));
  titleUI.querySelector('#ttu-vehicle').addEventListener('pointerdown', e => _tap(e, titleOpenVehicleSelect));
  titleUI.querySelector('#ttu-boost')  .addEventListener('pointerdown', e => _tap(e, titleToggleBoosts));
  titleUI.querySelector('#ttu-race')   .addEventListener('pointerdown', e => _tap(e, startGame));

  // Vehicle select overlay
  const vehicleUI = document.createElement('div');
  vehicleUI.id = 'touch-vehicle-ui';
  vehicleUI.innerHTML = `
    <div class="ttu-header">SELECT VEHICLE</div>
    <div class="ttu-stage-row">
      <button id="tvu-prev"  class="ttu-arrow">&#9664;</button>
      <div class="ttu-stage-info">
        <span id="tvu-name" class="ttu-stage-name"></span>
        <span id="tvu-desc" class="tvu-desc"></span>
        <div id="tvu-dots" class="ttu-dots"></div>
      </div>
      <button id="tvu-next"  class="ttu-arrow">&#9654;</button>
    </div>
    <button id="tvu-confirm" class="ttu-race">&#10003;&nbsp; CONFIRM</button>
  `;
  document.body.appendChild(vehicleUI);

  vehicleUI.querySelector('#tvu-prev')   .addEventListener('pointerdown', e => _tap(e, vehicleSelectPrev));
  vehicleUI.querySelector('#tvu-next')   .addEventListener('pointerdown', e => _tap(e, vehicleSelectNext));
  vehicleUI.querySelector('#tvu-confirm').addEventListener('pointerdown', e => _tap(e, vehicleSelectConfirm));
}

// ---- Touch settings overlay -----------------------------------------------

const _SETTINGS_ROWS = [
  { label: 'Motion Blur',  idx: 0 },
  { label: 'Film Grain',   idx: 1 },
  { label: 'Auto FPS',     idx: 2 },
  { label: 'Volume',       idx: 3, type: 'volume' },
  { label: 'WebGL Road',   idx: 4, type: 'webgl' },
  { label: 'Traffic',      idx: 5 },
];

function _buildTouchSettingsUI() {
  const el = document.getElementById('touch-settings-ui');
  if (!el) return;

  let html = `<div class="tsu-title">SETTINGS</div>`;

  for (const row of _SETTINGS_ROWS) {
    if (row.type === 'volume') {
      html += `
        <div class="tsu-row">
          <span class="tsu-label">${row.label}</span>
          <div class="tsu-vol-row">
            <button id="tsu-vol-down" class="tsu-vol-btn">&#8722;</button>
            <span id="tsu-vol-val" class="tsu-vol-val">55%</span>
            <button id="tsu-vol-up" class="tsu-vol-btn">+</button>
          </div>
        </div>`;
    } else {
      html += `
        <div class="tsu-row">
          <span class="tsu-label">${row.label}</span>
          <button id="tsu-${row.idx}" class="tsu-toggle">ON</button>
        </div>`;
    }
  }

  html += `<button id="tsu-back" class="tsu-back">&#8592; BACK</button>`;
  el.innerHTML = html;

  for (const row of _SETTINGS_ROWS) {
    if (row.type === 'volume') {
      el.querySelector('#tsu-vol-down').addEventListener('pointerdown', e => _tap(e, () => settingsVolumeAdjust(-1)));
      el.querySelector('#tsu-vol-up')  .addEventListener('pointerdown', e => _tap(e, () => settingsVolumeAdjust(+1)));
    } else {
      el.querySelector(`#tsu-${row.idx}`).addEventListener('pointerdown', e => _tap(e, () => settingsToggle(row.idx)));
    }
  }

  el.querySelector('#tsu-back').addEventListener('pointerdown', e => _tap(e, settingsClose));
}

function _syncSettingsUI() {
  const volEl  = document.getElementById('tsu-vol-val');
  if (volEl) volEl.textContent = `${Math.round((settings.volume ?? 0.55) * 100)}%`;

  const states = [
    settings.motionBlur,
    settings.filmGrain,
    settings.autoDowngrade,
    null, // volume handled separately
    isWebGLSupported() ? settings.webglRoad : null,
    settings.trafficEnabled,
  ];

  for (const row of _SETTINGS_ROWS) {
    if (row.type === 'volume') continue;
    const btn = document.getElementById(`tsu-${row.idx}`);
    if (!btn) continue;
    const val = states[row.idx];
    if (val === null) {
      btn.textContent = 'N/A';
      btn.disabled    = true;
      btn.classList.add('off');
    } else {
      btn.textContent = val ? 'ON' : 'OFF';
      btn.disabled    = false;
      btn.classList.toggle('off', !val);
    }
  }
}

// rAF loop: keeps overlay content and body[data-state] in sync with game state.
function _syncTouchUI() {
  const state = getState();
  document.body.dataset.state = state;

  if (state === 'title') {
    const ts = getTitleState();

    const nameEl  = document.getElementById('ttu-stage-name');
    const dotsEl  = document.getElementById('ttu-dots');
    const diffEl  = document.getElementById('ttu-diff');
    const vehEl   = document.getElementById('ttu-vehicle');
    const boostEl = document.getElementById('ttu-boost');

    if (nameEl) { nameEl.textContent = ts.stageName; nameEl.style.color = ts.stageColor; }

    if (dotsEl) {
      if (dotsEl.children.length !== ts.stageCount) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < ts.stageCount; i++) {
          const d = document.createElement('span');
          d.className = 'ttu-dot';
          dotsEl.appendChild(d);
        }
      }
      Array.from(dotsEl.children).forEach((d, i) => {
        d.style.background = i === ts.stageIdx ? ts.stageColor : 'rgba(255,255,255,0.25)';
      });
    }

    if (diffEl) {
      diffEl.textContent = `DIFFICULTY: ${ts.difficulty.toUpperCase()}`;
      diffEl.style.color = DIFF_COLORS[ts.difficulty] || '#ffe44d';
    }

    if (vehEl) {
      vehEl.textContent = `VEHICLE: ${ts.vehicleName}`;
      vehEl.style.color  = ts.vehicleColor;
      vehEl.disabled     = ts.isSpecial;
      vehEl.style.opacity = ts.isSpecial ? '0.38' : '1';
    }

    if (boostEl) {
      boostEl.textContent = `BOOSTS: ${ts.boostsEnabled ? 'ON' : 'OFF'}`;
      boostEl.style.color = ts.boostsEnabled ? '#55ff88' : 'rgba(255,255,255,0.38)';
    }
  }

  if (state === 'settings') {
    _syncSettingsUI();
  }

  if (state === 'vehicleSelect') {
    const ts = getTitleState();

    const nameEl = document.getElementById('tvu-name');
    const descEl = document.getElementById('tvu-desc');
    const dotsEl = document.getElementById('tvu-dots');

    if (nameEl) { nameEl.textContent = ts.vehicleName; nameEl.style.color = ts.vehicleColor; }
    if (descEl) { descEl.textContent = ts.vehicleDesc; }

    if (dotsEl) {
      if (dotsEl.children.length !== ts.vehicleCount) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < ts.vehicleCount; i++) {
          const d = document.createElement('span');
          d.className = 'ttu-dot';
          dotsEl.appendChild(d);
        }
      }
      Array.from(dotsEl.children).forEach((d, i) => {
        d.style.background = i === ts.vehicleIdx ? ts.vehicleColor : 'rgba(255,255,255,0.25)';
      });
    }
  }

  requestAnimationFrame(_syncTouchUI);
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
      _applyTouchAudioUnlock();
      if (!tiltOn) {
        if (status) { status.textContent = 'tilt: requesting...'; delete status.dataset.live; }
        if (await enableTilt()) {
          tiltOn = true;
          document.body.classList.add('tilt');
          tiltBtn.classList.add('on');
          tiltBtn.textContent = 'RESET';
        }
      } else {
        tiltOn = false;
        disableTilt();
        document.body.classList.remove('tilt');
        tiltBtn.classList.remove('on');
        tiltBtn.textContent = 'MOTION';
      }
    });
  }

  // Canvas tap: only used for gameover state. Title/vehicleSelect handled by DOM overlay.
  const gameCanvas = document.getElementById('game');
  if (gameCanvas) {
    gameCanvas.addEventListener('pointerdown', (e) => {
      const state = getState();
      if (state !== 'gameover') return;
      _applyTouchAudioUnlock();
      e.preventDefault();
      startGame();
    });
  }

  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('pointerdown', e => _tap(e, openSettings));
  }

  // Build the touch overlays on touch devices and start the sync loop.
  if (isTouch) {
    _buildTouchTitleUI();
    _buildTouchSettingsUI();
    _syncTouchUI();
  }

  // Gamepad: self-contained 60 Hz poll so game.js doesn't need to call us.
  if ('getGamepads' in navigator) {
    setInterval(_pollGamepad, 16);
  }
}

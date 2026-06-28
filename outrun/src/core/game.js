// Main game loop — wires road, scenery, opponents, car, and HUD together.
// Game state machine: title → playing ↔ paused/settings → gameover → title

import { buildSegments, projectRoad, drawRoad, TRACK_LENGTH, DRAW_DISTANCE, SEGMENT_LENGTH, segmentProjections, getHorizonCurveX, fogAlpha, projectObject, makeRng } from '../rendering/road.js';
import { isWebGLSupported, initWebGL, drawRoadGL, getWebGLCanvas } from '../rendering/webgl-road.js';
import { drawBackground } from '../rendering/sky.js';
import { AssetManager } from '../world/assets.js';
import { buildSprites } from '../rendering/sprites.js';
import { CAR, initInput, updateCar, drawCar, drawCar3D } from '../world/car.js';
import { updateParticles, drawParticles, emitSmoke, emitDust, emitExhaust, emitSparks, resetParticles, getParticleCount } from '../rendering/particles.js';
import { drawScenery, getLastSpriteCount } from '../rendering/scenery.js';
import { drawCheckpoint } from '../world/checkpoint.js';
import { buildOpponents, updateOpponents, checkCollisions, drawOpponents, VEHICLE_TYPES, OPPONENT_COLORS } from '../world/opponents.js';
import { initDebug, recordFrameStart, recordPhysicsStep, recordFrameEnd, drawDebugOverlay, getFPS } from '../debug.js';
import { initRenderer, getCtx, beginFrame, endFrame, captureGhost, getGhostCanvas, WIDTH, HEIGHT } from '../rendering/renderer.js';
import { palette } from '../rendering/palette.js';
import { updateTOD, setTODPhase, getTODPhase, getNightFactor, resetTOD } from '../systems/tod.js';
import { setWeather, getWeatherMode, updateWeather, drawWeather, getGripMultiplier, resetWeather } from '../systems/weather.js';
import { settings } from './settings.js';
import { getGameState, setGameState } from './gamestate.js';
import { unlockAudio, updateEngineSound, playSFX, startMusic, stopMusic, resetAudio, setMasterVolume } from '../systems/audio.js';
import { addHighScore, getHighScores, loadSettings, saveSettings, saveLastSeed } from './storage.js';
import { STAGES, getStage, getStageIndex } from '../world/stage.js';

const DIFFICULTY = {
  easy:   { startTime: 40, checkpointTime: 8 },
  normal: { startTime: 30, checkpointTime: 6 },
  hard:   { startTime: 20, checkpointTime: 4 },
};
const CHECKPOINT_GAP  = 50_000;
const PHYSICS_STEP    = 1 / 120;

// Standard vehicles available for regular stages
const PLAYER_VEHICLES = [
  { type: 'sports',  color: '#cc2222', name: 'FERRARI',   desc: 'Sports · Fast & nimble' },
  { type: 'sports',  color: '#2244cc', name: 'AZURE',     desc: 'Sports · Cool racer' },
  { type: 'sports',  color: '#228833', name: 'VIPER',     desc: 'Sports · Precision' },
  { type: 'sports',  color: '#dd8811', name: 'SUNBURST',  desc: 'Sports · Classic style' },
  { type: 'compact', color: '#882299', name: 'HATCH',     desc: 'Compact · Nimble' },
  { type: 'sedan',   color: '#664422', name: 'CRUISER',   desc: 'Sedan · Reliable' },
  { type: 'truck',   color: '#335544', name: 'RANGER',    desc: 'Truck · Muscle' },
];

let ctx;
let segments, opponents, trackSeed;
let cameraZ, distance, score, timeLeft, lastTime;
let nextCheckpoint, flashText, flashUntil;

// Boost pad system
const _BASE_MAX_SPEED = CAR.maxSpeed; // 9000 — fixed reference, never mutated
let _boostPads    = [];  // [{pos, xMin, xMax}] generated per run
let _boostPadIdx  = 0;   // index of next upcoming pad
let _boostUntil   = 0;   // ms when active boost phase ends
let _boostFadeEnd = 0;   // ms when fade-out completes
const _BOOST_ACTIVE = 3000;  // ms of full-speed boost
const _BOOST_FADE   = 2000;  // ms to taper back to normal speed
const _BOOST_MULT   = 1.40;
const _BOOST_PAD_DEPTH = 2400; // road units the pad strip spans
let accumulator = 0;
let assets = null;

// WebGL road renderer state
let _webglReady  = false;
let _webglCanvas = null;

// Visual state (render-only)
let _shakeIntensity = 0, _shakeX = 0, _shakeY = 0, _cameraDip = 0;
let _vigGrad = null, _vigW = 0, _vigH = 0;
let _ghostCanvas = null;
const GRAIN_SIZE = 96;
let _grainCanvas = null, _grainCtx = null, _grainFrame = 0;
let _lowFpsFrames = 0;

// Phase 6 state
let _menuIdx            = 0;      // focused menu item
let _settingsReturn     = 'title'; // which state ESC/BACK in settings returns to
let _attractZ           = 0;      // camera Z for title attract mode
let _prevStageIdx       = -1;     // tracks stage transitions
let _gameOverSaved      = false;  // prevents duplicate score saves
let _audioVolumeApplied = false;  // applies saved volume on first audio unlock
let _selectedStage      = 0;      // stage index chosen on title screen
let _vehicleSelectIdx   = 0;      // index into PLAYER_VEHICLES (regular stages only)
let _spaceStars         = null;   // pre-generated star field for SPACE stage

const _SL_COUNT  = 14;
const _SL_ANGLES = Array.from({ length: _SL_COUNT }, (_, i) => (i / _SL_COUNT) * Math.PI * 2 + 0.22);
const _SL_DISTS  = Array.from({ length: _SL_COUNT }, (_, i) => 82 + (i * 31 % 52));

// controls.js imports getState from game.js — delegate to the state machine
export function getState() { return getGameState(); }

// Hit-test a pointer tap in logical (800×500) coordinates against the current
// screen and dispatch the appropriate action. Called by controls.js after
// translating CSS pointer coords → logical coords.
export function handleCanvasTap(lx, ly) {
  const state = getGameState();
  unlockAudio();

  if (state === 'title') {
    // Stage selector band (includes label, name, and dots)
    if (ly >= 140 && ly < 250) {
      if (lx < WIDTH / 2) {
        _selectedStage = (_selectedStage - 1 + STAGES.length) % STAGES.length;
      } else {
        _selectedStage = (_selectedStage + 1) % STAGES.length;
      }
      _rebuildOpponents();
      return;
    }
    // Difficulty band
    if (ly >= 250 && ly < 310) {
      const diffs = Object.keys(DIFFICULTY);
      const idx = diffs.indexOf(settings.difficulty);
      settings.difficulty = diffs[(idx + 1) % diffs.length];
      _saveSettings();
      return;
    }
    // Vehicle hint band (only meaningful for non-special stages)
    if (ly >= 305 && ly < 330) {
      const selStage = STAGES[_selectedStage];
      if (!selStage.special) { _menuIdx = 0; setGameState('vehicleSelect'); }
      return;
    }
    // Boost toggle band
    if (ly >= 325 && ly < 368) {
      settings.boostsEnabled = !settings.boostsEnabled;
      _saveSettings();
      return;
    }
    // Catch-all: start game
    startGame();
    return;
  }

  if (state === 'vehicleSelect') {
    const selStage = STAGES[_selectedStage];
    if (!selStage.special) {
      if (lx < WIDTH * 0.35) {
        _vehicleSelectIdx = (_vehicleSelectIdx - 1 + PLAYER_VEHICLES.length) % PLAYER_VEHICLES.length;
        _saveSettings();
        return;
      }
      if (lx > WIDTH * 0.65) {
        _vehicleSelectIdx = (_vehicleSelectIdx + 1) % PLAYER_VEHICLES.length;
        _saveSettings();
        return;
      }
    }
    // Center tap or special-stage tap: back to title
    setGameState('title');
    return;
  }

  if (state === 'gameover') {
    startGame();
    return;
  }
}

// ---- Public API -------------------------------------------------------------

export function startGame() {
  // Build opponents appropriate for the chosen stage
  _rebuildOpponents();
  // Apply vehicle for selected stage
  _applyPlayerVehicle();
  _generateBoostPads();
  resetGame();
  const selStage = STAGES[_selectedStage];
  if (selStage.special) {
    // Special stages always start at distance 0 but keep their theme
    _prevStageIdx = _selectedStage;
  } else if (_selectedStage > 0) {
    distance      = selStage.startDistance;
    _prevStageIdx = _selectedStage;
  }
  saveLastSeed(trackSeed);
  setGameState('playing');
  startMusic();
  // Flash the stage name on entry for all stages
  const entryStage = STAGES[_selectedStage];
  flashText  = `${entryStage.name}  —  ${entryStage.subtitle}`;
  flashUntil = performance.now() + 2800;
}

export function resetGame() {
  const diff      = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
  cameraZ         = 0;
  distance        = 0;
  score           = 0;
  timeLeft        = diff.startTime;
  nextCheckpoint  = CHECKPOINT_GAP;
  flashText       = '';
  flashUntil      = 0;
  CAR.x              = 0;
  CAR.speed          = 0;
  CAR.maxSpeed       = _BASE_MAX_SPEED;
  CAR.invuln         = 0;
  CAR.gripMultiplier = 1.0;
  accumulator        = 0;
  _boostUntil        = 0;
  _boostFadeEnd      = 0;
  _boostPadIdx       = 0;
  _shakeIntensity    = 0;
  _cameraDip         = 0;
  _lowFpsFrames      = 0;
  _prevStageIdx      = 0;
  _gameOverSaved     = false;
  resetParticles();
  resetTOD();
  resetWeather();
}

function _generateBoostPads() {
  _boostPads   = [];
  _boostPadIdx = 0;
  if (!settings.boostsEnabled) return;
  const rng = makeRng((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
  // Exactly one pad in every other checkpoint gap (gaps 2, 4, 6 …)
  // so the player earns it after clearing the preceding checkpoint.
  for (let cp = 2; cp * CHECKPOINT_GAP < 3_000_000; cp += 2) {
    const gapStart = (cp - 1) * CHECKPOINT_GAP;
    const pos = gapStart + CHECKPOINT_GAP * 0.2 + rng() * CHECKPOINT_GAP * 0.6;
    const cx  = (rng() * 2 - 1) * 0.55;
    const hw  = 0.20 + rng() * 0.22;
    _boostPads.push({ pos, xMin: cx - hw, xMax: cx + hw });
  }
}

function _checkBoostPads() {
  if (!settings.boostsEnabled) return;
  // Advance past consumed / behind pads
  while (_boostPadIdx < _boostPads.length && _boostPads[_boostPadIdx].pos < distance - 400) {
    _boostPadIdx++;
  }
  // Only trigger when fully out of the boost/fade cycle
  if (performance.now() >= _boostFadeEnd && _boostPadIdx < _boostPads.length) {
    const pad = _boostPads[_boostPadIdx];
    if (pad.pos <= distance + 400 && CAR.x >= pad.xMin && CAR.x <= pad.xMax) {
      const now     = performance.now();
      _boostUntil   = now + _BOOST_ACTIVE;
      _boostFadeEnd = _boostUntil + _BOOST_FADE;
      CAR.speed     = _BASE_MAX_SPEED * _BOOST_MULT; // instant speed kick
      _boostPadIdx++;
      flashText  = 'SPEED BOOST!';
      flashUntil = now + 1600;
    }
  }
}

// ---- Render layers ----------------------------------------------------------

const LAYERS = [
  { name: 'sky',
    draw: () => {
      const selStage = STAGES[_selectedStage];
      if (selStage?.theme === 'space') {
        _drawSpaceBackground();
      } else {
        drawBackground(ctx, WIDTH, HEIGHT, getHorizonCurveX(), getNightFactor());
        if (selStage?.theme === 'sea') {
          _drawSeaHorizon();
        } else if (!selStage?.special && getStageIndex(distance) === 0) {
          _drawCoastOcean();
        } else if (selStage?.theme === 'dirt') {
          _drawDustHaze();
        }
      }
    } },
  { name: 'road',
    draw: () => {
      if (_webglReady && settings.webglRoad) {
        drawRoadGL(WIDTH, HEIGHT);
        ctx.drawImage(_webglCanvas, 0, 0, WIDTH, HEIGHT);
      } else {
        drawRoad(ctx, segments, WIDTH, HEIGHT);
      }
    } },
  { name: 'ground-overlay',
    draw: () => {
      const th = STAGES[_selectedStage]?.theme;
      if (th === 'space') _drawSpaceGroundStars();
      else if (th === 'sea')  _drawSeaWaves();
      else if (th === 'dirt') _drawDirtTireRuts();
      if (settings.boostsEnabled && getGameState() === 'playing') _drawBoostPads();
    } },
  { name: 'lights',
    draw: () => _drawNightLights() },
  { name: 'scenery',
    draw: () => {
      const gs = getGameState();
      // Title/vehicleSelect: always use the selected stage for preview scenery.
      // Playing on a special stage: use _selectedStage (distance-based lookup returns COAST).
      // Playing on a regular stage: progress by distance as normal.
      let stageIdx;
      if (gs === 'title' || gs === 'vehicleSelect') {
        stageIdx = _selectedStage;
      } else if (STAGES[_selectedStage]?.special) {
        stageIdx = _selectedStage;
      } else {
        stageIdx = getStageIndex(distance);
      }
      drawScenery(ctx, segments, assets, stageIdx);
    } },
  { name: 'checkpoint',
    draw: () => { if (getGameState() === 'playing') drawCheckpoint(ctx, nextCheckpoint - distance); } },
  { name: 'traffic',
    draw: () => {
      if (!settings.trafficEnabled && getGameState() === 'playing') return;
      const s = getGameState();
      const camZ = (s === 'title' || s === 'vehicleSelect') ? _attractZ : cameraZ;
      drawOpponents(ctx, opponents, camZ, getNightFactor());
    } },
  { name: 'weather-fx',
    draw: () => drawWeather(ctx, WIDTH, HEIGHT) },
  { name: 'particles',
    draw: () => drawParticles(ctx) },
  { name: 'player',
    draw: () => {
      const s = getGameState();
      if (s !== 'title' && s !== 'vehicleSelect') drawCar(ctx, WIDTH, HEIGHT);
    } },
  { name: 'speed-fx',
    draw: () => { if (getGameState() === 'playing') drawSpeedFX(); } },
  { name: 'motion-blur',
    draw: () => _drawMotionBlur() },
  { name: 'hud',
    draw: () => { if (getGameState() === 'playing') drawHUD(); } },
  { name: 'film-grain',
    draw: () => _drawFilmGrain() },
  { name: 'debug',
    draw: () => drawDebugOverlay(ctx, WIDTH, HEIGHT, {
      seed: trackSeed, car: CAR,
      segmentsDrawn: segmentProjections.length,
      spritesDrawn: getLastSpriteCount(),
      particles: getParticleCount(),
      tod: getTODPhase(),
      weather: getWeatherMode(),
    }) },
];

// ---- WebGL init helper ------------------------------------------------------

function _tryInitWebGL() {
  if (_webglReady) return true;
  if (!isWebGLSupported()) return false;
  _webglReady = initWebGL(WIDTH, HEIGHT);
  if (_webglReady) _webglCanvas = getWebGLCanvas();
  return _webglReady;
}

// ---- Init -------------------------------------------------------------------

export function init() {
  const canvasEl = document.getElementById('game');
  initRenderer(canvasEl);
  ctx = getCtx();

  const seedParam = new URLSearchParams(location.search).get('seed');
  trackSeed = (seedParam !== null && /^\d+$/.test(seedParam))
    ? (parseInt(seedParam, 10) >>> 0)
    : (Math.floor(Math.random() * 0xffffffff) >>> 0);
  console.log(`OutRun track seed: ${trackSeed}  (replay with ?seed=${trackSeed})`);

  segments  = buildSegments(trackSeed);
  opponents = buildOpponents(16); // initial attract mode — replaced on startGame
  initInput();
  initDebug();

  buildSprites();
  assets = new AssetManager();
  ['pine', 'palm', 'poplar', 'bush', 'rock',
   'billboard-0', 'billboard-1', 'billboard-2'].forEach(key => {
    assets.add(key, `assets/${key}.png`);
  });
  assets.load();

  // Restore persisted settings
  const saved = loadSettings();
  if (saved) {
    if (typeof saved.motionBlur    === 'boolean') settings.motionBlur    = saved.motionBlur;
    if (typeof saved.filmGrain     === 'boolean') settings.filmGrain     = saved.filmGrain;
    if (typeof saved.autoDowngrade === 'boolean') settings.autoDowngrade = saved.autoDowngrade;
    if (typeof saved.volume        === 'number')  settings.volume        = saved.volume;
    if (typeof saved.webglRoad     === 'boolean') {
      settings.webglRoad = saved.webglRoad;
      if (settings.webglRoad) _tryInitWebGL();
    }
    if (typeof saved.difficulty === 'string' && DIFFICULTY[saved.difficulty]) {
      settings.difficulty = saved.difficulty;
    }
    if (typeof saved.vehicleIdx === 'number' && saved.vehicleIdx < PLAYER_VEHICLES.length) {
      _vehicleSelectIdx = saved.vehicleIdx;
    }
    if (typeof saved.boostsEnabled  === 'boolean') settings.boostsEnabled  = saved.boostsEnabled;
    if (typeof saved.trafficEnabled === 'boolean') settings.trafficEnabled = saved.trafficEnabled;
  }

  // URL param ?renderer=webgl overrides saved setting (useful for quick comparison)
  if (new URLSearchParams(location.search).get('renderer') === 'webgl') {
    _tryInitWebGL();
    settings.webglRoad = _webglReady;
  }

  // Initialize game vars so the attract scene has valid state
  resetGame();

  _setupKeyboard();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function _setupKeyboard() {
  document.addEventListener('keydown', e => {
    // Audio unlock + saved-volume restore on first gesture
    unlockAudio();
    if (!_audioVolumeApplied) {
      setMasterVolume(settings.volume ?? 0.55);
      _audioVolumeApplied = true;
    }

    const state = getGameState();

    if (state === 'title') {
      if (e.key === ' ' || e.key === 'Enter') {
        startGame();
      } else if (e.key === 'ArrowLeft') {
        _selectedStage = (_selectedStage - 1 + STAGES.length) % STAGES.length;
        _rebuildOpponents();
      } else if (e.key === 'ArrowRight') {
        _selectedStage = (_selectedStage + 1) % STAGES.length;
        _rebuildOpponents();
      } else if (e.key === 'd' || e.key === 'D') {
        const diffs = Object.keys(DIFFICULTY);
        const idx = diffs.indexOf(settings.difficulty);
        settings.difficulty = diffs[(idx + 1) % diffs.length];
        _saveSettings();
      } else if (e.key === 'b' || e.key === 'B') {
        settings.boostsEnabled = !settings.boostsEnabled;
        _saveSettings();
      } else if (e.key === 'v' || e.key === 'V') {
        _menuIdx = 0; setGameState('vehicleSelect');
      } else if (e.key === 'i' || e.key === 'I') {
        _settingsReturn = 'title'; setGameState('instructions');
      } else if (e.key === 'Escape') {
        _settingsReturn = 'title'; _menuIdx = 0; setGameState('settings');
      }
      return;
    }

    if (state === 'vehicleSelect') {
      const selStage = STAGES[_selectedStage];
      if (!selStage.special) {
        if (e.key === 'ArrowLeft') {
          _vehicleSelectIdx = (_vehicleSelectIdx - 1 + PLAYER_VEHICLES.length) % PLAYER_VEHICLES.length;
          _saveSettings();
        } else if (e.key === 'ArrowRight') {
          _vehicleSelectIdx = (_vehicleSelectIdx + 1) % PLAYER_VEHICLES.length;
          _saveSettings();
        }
      }
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        setGameState('title');
      }
      return;
    }

    if (state === 'instructions') {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        setGameState(_settingsReturn ?? 'title');
      }
      return;
    }

    if (state === 'playing') {
      if (e.key === 'Escape') { setGameState('paused'); _menuIdx = 0; stopMusic(); updateEngineSound(0); return; }
      if (e.key === 't' || e.key === 'T') setTODPhase(getTODPhase() + 0.1);
      if (e.key === 'w' || e.key === 'W') {
        const modes = ['clear', 'rain'];
        setWeather(modes[(modes.indexOf(getWeatherMode()) + 1) % modes.length]);
      }
      return;
    }

    if (state === 'paused') {
      const len = _PAUSE_ITEMS.length;
      if (e.key === 'ArrowUp')   { _menuIdx = (_menuIdx - 1 + len) % len; return; }
      if (e.key === 'ArrowDown') { _menuIdx = (_menuIdx + 1) % len; return; }
      if (e.key === 'Escape')    { setGameState('playing'); startMusic(); return; }
      if (e.key === ' ' || e.key === 'Enter') {
        if (_menuIdx === 0) { setGameState('playing'); startMusic(); }
        if (_menuIdx === 1) { _settingsReturn = 'paused'; _menuIdx = 0; setGameState('settings'); }
        if (_menuIdx === 2) { stopMusic(); resetAudio(); setGameState('title'); resetGame(); }
      }
      return;
    }

    if (state === 'settings') {
      const len = _SETTINGS_LABELS.length;
      if (e.key === 'ArrowUp')   { _menuIdx = (_menuIdx - 1 + len) % len; return; }
      if (e.key === 'ArrowDown') { _menuIdx = (_menuIdx + 1) % len; return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        if (_menuIdx === 0) settings.motionBlur    = !settings.motionBlur;
        if (_menuIdx === 1) settings.filmGrain     = !settings.filmGrain;
        if (_menuIdx === 2) settings.autoDowngrade = !settings.autoDowngrade;
        if (_menuIdx === 3) {
          settings.volume = Math.max(0, Math.min(1, (settings.volume ?? 0.55) + d * 0.1));
          setMasterVolume(settings.volume);
        }
        if (_menuIdx === 4) _toggleWebGL();
        if (_menuIdx === 5) settings.trafficEnabled = !settings.trafficEnabled;
        _saveSettings(); return;
      }
      // ESC or Enter on BACK item → return to previous state
      if (e.key === 'Escape' || ((e.key === ' ' || e.key === 'Enter') && _menuIdx === len - 1)) {
        setGameState(_settingsReturn); _menuIdx = 0; return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (_menuIdx === 0) settings.motionBlur     = !settings.motionBlur;
        if (_menuIdx === 1) settings.filmGrain      = !settings.filmGrain;
        if (_menuIdx === 2) settings.autoDowngrade  = !settings.autoDowngrade;
        if (_menuIdx === 4) _toggleWebGL();
        if (_menuIdx === 5) settings.trafficEnabled = !settings.trafficEnabled;
        _saveSettings();
      }
      return;
    }

    if (state === 'gameover') {
      if (e.key === 'r' || e.key === 'R' || e.key === ' ' || e.key === 'Enter') { startGame(); return; }
      if (e.key === 'Escape') { stopMusic(); resetAudio(); setGameState('title'); resetGame(); }
    }
  });
}

function _rebuildOpponents() {
  const stage = STAGES[_selectedStage];
  const count = Math.max(8, Math.round(16 * (stage.trafficMultiplier ?? 1)));
  opponents = buildOpponents(count, stage.opponentTypes || null, stage.opponentColors || null);
}

function _applyPlayerVehicle() {
  const stage = STAGES[_selectedStage];
  if (stage.special) {
    CAR.vehicleType  = stage.playerVehicle;
    CAR.vehicleColor = stage.playerColor;
  } else {
    const v = PLAYER_VEHICLES[_vehicleSelectIdx] || PLAYER_VEHICLES[0];
    CAR.vehicleType  = v.type;
    CAR.vehicleColor = v.color;
  }
}

function _toggleWebGL() {
  if (!settings.webglRoad) {
    // Enabling: initialize on demand (lazy, in case user never needs it)
    settings.webglRoad = _tryInitWebGL();
  } else {
    settings.webglRoad = false;
  }
}

function _saveSettings() {
  saveSettings({
    motionBlur:    settings.motionBlur,
    filmGrain:     settings.filmGrain,
    autoDowngrade: settings.autoDowngrade,
    volume:        settings.volume,
    webglRoad:     settings.webglRoad,
    difficulty:    settings.difficulty,
    vehicleIdx:    _vehicleSelectIdx,
    boostsEnabled:   settings.boostsEnabled,
    trafficEnabled:  settings.trafficEnabled,
  });
}

// ---- Game loop --------------------------------------------------------------

function loop(now) {
  recordFrameStart(now);
  const elapsed = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const state = getGameState();

  if (!assets?.ready) {
    beginFrame();
    drawLoadingScreen();
    endFrame();
    recordFrameEnd(performance.now());
    requestAnimationFrame(loop);
    return;
  }

  if (state === 'title' || state === 'vehicleSelect') {
    _attractZ = (_attractZ + 2200 * elapsed) % TRACK_LENGTH;
    updateTOD(elapsed);
    updateWeather(elapsed);
    _applyStageColors();
  }

  if (state === 'playing') {
    updateTOD(elapsed);
    updateWeather(elapsed);
    _applyStageColors();

    // Boost: immediate speed kick on pad hit, then 3 s full speed, 2 s linear fade back
    { const _n = performance.now();
      if (_n < _boostUntil) {
        CAR.maxSpeed = _BASE_MAX_SPEED * _BOOST_MULT;
      } else if (_n < _boostFadeEnd) {
        const t = (_n - _boostUntil) / _BOOST_FADE;
        CAR.maxSpeed = _BASE_MAX_SPEED * (_BOOST_MULT - (_BOOST_MULT - 1.0) * t);
      } else {
        CAR.maxSpeed = _BASE_MAX_SPEED;
      }
    }

    accumulator += elapsed;
    while (accumulator >= PHYSICS_STEP) {
      update(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
      recordPhysicsStep();
    }
    _emitAmbientParticles();
    _checkAutoDowngrade();
    updateEngineSound(CAR.speed / _BASE_MAX_SPEED);
  }

  // Particles settle gracefully while paused
  if (state !== 'title') updateParticles(elapsed);

  render(elapsed);
  if (settings.motionBlur) captureGhost();
  recordFrameEnd(performance.now());
  requestAnimationFrame(loop);
}

// ---- Physics (fixed timestep) -----------------------------------------------

function update(dt) {
  CAR.gripMultiplier = getGripMultiplier();
  updateCar(CAR, dt);
  if (settings.trafficEnabled) updateOpponents(opponents, dt);

  cameraZ += CAR.speed * dt;
  if (cameraZ >= TRACK_LENGTH) cameraZ -= TRACK_LENGTH;

  distance += CAR.speed * dt;
  score = Math.floor(distance / 100);
  _checkBoostPads();

  // Stage transition: special stages stay fixed; regular stages flash on threshold crossing
  if (!STAGES[_selectedStage]?.special) {
    const stageIdx = getStageIndex(distance);
    if (stageIdx !== _prevStageIdx) {
      const stage = getStage(distance);
      flashText  = `${stage.name}  —  ${stage.subtitle}`;
      flashUntil = performance.now() + 2800;
      _prevStageIdx = stageIdx;
    }
  }

  const spinHit = settings.trafficEnabled && checkCollisions(opponents, CAR, cameraZ, dt);
  if (spinHit) {
    emitSparks(WIDTH / 2, HEIGHT - 30, 18);
    playSFX('crash');
    _shakeIntensity = 14;
  }

  if (distance >= nextCheckpoint) {
    const cpBonus = (DIFFICULTY[settings.difficulty] || DIFFICULTY.normal).checkpointTime;
    timeLeft += cpBonus;
    nextCheckpoint += CHECKPOINT_GAP;
    flashText  = `CHECKPOINT  +${cpBonus}s`;
    flashUntil = performance.now() + 1800;
    playSFX('checkpoint');
  }

  timeLeft -= dt;
  if (timeLeft <= 0 && getGameState() === 'playing' && !_gameOverSaved) {
    timeLeft       = 0;
    _gameOverSaved = true;
    addHighScore(score);
    stopMusic();
    resetAudio();
    setGameState('gameover');
  }
}

// ---- Render -----------------------------------------------------------------

function render(elapsed) {
  beginFrame();
  const state = getGameState();

  // Title + vehicle select use attract camera; gameplay uses physics camera
  const isAttract = state === 'title' || state === 'vehicleSelect';
  const camZ = isAttract ? _attractZ : cameraZ;
  const carX = isAttract ? 0 : CAR.x;
  projectRoad(segments, camZ, carX, WIDTH, HEIGHT);

  // Screen shake only during active gameplay
  if (state === 'playing' || state === 'gameover') {
    _shakeIntensity *= 0.86;
    if (_shakeIntensity > 0.4) {
      _shakeX = (Math.random() - 0.5) * _shakeIntensity;
      _shakeY = (Math.random() - 0.5) * _shakeIntensity * 0.6;
    } else { _shakeX = 0; _shakeY = 0; }
    const dipTarget = (CAR.braking && CAR.speed > 100) ? 5 : 0;
    _cameraDip += (dipTarget - _cameraDip) * 0.12;
  }

  ctx.save();
  if (_shakeX || _shakeY || _cameraDip) ctx.translate(Math.round(_shakeX), Math.round(_shakeY + _cameraDip));
  for (const layer of LAYERS) layer.draw();
  ctx.restore();

  // State-specific full-screen overlays, drawn outside shake transform
  if (state === 'title')         drawTitleScreen();
  if (state === 'vehicleSelect') drawVehicleSelectScreen();
  if (state === 'paused')        drawPauseScreen();
  if (state === 'settings')      drawSettingsScreen();
  if (state === 'instructions')  drawInstructionsScreen();
  if (state === 'gameover')      drawGameOver();

  endFrame();
}

// ---- Coastal ocean strip ----------------------------------------------------

function _drawCoastOcean() {
  const nf = getNightFactor();
  const hy = HEIGHT * 0.500; // horizon sits at ~50% of canvas height

  // Ocean colour: bright day-blue fading to dark night-navy
  const r  = Math.round(28  * (1 - nf) + 8  * nf);
  const g  = Math.round(108 * (1 - nf) + 38 * nf);
  const b  = Math.round(172 * (1 - nf) + 72 * nf);
  const c  = `rgba(${r},${g},${b},`;

  // Thin gradient band centred on the horizon — fades into sky above and sand below
  const gr = ctx.createLinearGradient(0, hy - 26, 0, hy + 14);
  gr.addColorStop(0,    c + '0)');
  gr.addColorStop(0.38, c + '0.88)');
  gr.addColorStop(0.72, c + '0.60)');
  gr.addColorStop(1,    c + '0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, hy - 26, WIDTH, 40);
}

// ---- SEA stage horizon + wave effects ---------------------------------------

function _drawSeaHorizon() {
  const hy = HEIGHT * 0.500;
  // Deep ocean water band at horizon
  const gr = ctx.createLinearGradient(0, hy - 32, 0, hy + 50);
  gr.addColorStop(0,    'rgba(0,60,140,0)');
  gr.addColorStop(0.28, 'rgba(0,80,170,0.90)');
  gr.addColorStop(0.60, 'rgba(0,55,130,0.72)');
  gr.addColorStop(1,    'rgba(0,40,110,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, hy - 32, WIDTH, 82);

  // Distant whitecaps along the horizon
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#c8e8ff'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const y = hy - 8 + i * 3;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 22) {
      const offset = Math.sin((x / 80 + i * 0.7) * Math.PI * 2) * 2.5;
      if (x === 0) ctx.moveTo(x, y + offset); else ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function _drawSeaWaves() {
  const t = performance.now() / 900;
  const hy = HEIGHT * 0.52;

  // Animated wave lines — perspective-spaced from horizon to near
  for (let i = 0; i < 18; i++) {
    const progress = i / 18;
    const y = hy + (HEIGHT - hy) * (progress * progress * progress);
    const amplitude = 2 + progress * 14;
    const waveLen   = 250 - progress * 150;
    const speed     = 0.6 + progress * 0.4;

    ctx.globalAlpha = 0.03 + progress * 0.08;
    ctx.strokeStyle = '#c8e8ff';
    ctx.lineWidth   = 0.5 + progress * 2;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 8) {
      const off = Math.sin((x / waveLen + t * speed)         * Math.PI * 2) * amplitude * 0.55
                + Math.sin((x / (waveLen * 1.4) - t * 0.6)  * Math.PI * 2) * amplitude * 0.45;
      if (x === 0) ctx.moveTo(x, y + off); else ctx.lineTo(x, y + off);
    }
    ctx.stroke();
  }

  // Wake foam lines spreading from the road edges (V-shape vanishing to horizon)
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  const midX = WIDTH / 2;
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    for (let y = HEIGHT; y > hy; y -= 4) {
      const progress = (HEIGHT - y) / (HEIGHT - hy);
      const x = midX + side * (WIDTH * 0.08 + progress * WIDTH * 0.22);
      const wobble = Math.sin((y / 30 + t * 1.2) * Math.PI * 2) * progress * 4;
      if (y === HEIGHT) ctx.moveTo(x + wobble, y); else ctx.lineTo(x + wobble, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// ---- SPACE stage background -------------------------------------------------

let _spaceGroundStars = null;

function _initSpaceStars() {
  // Sky stars (above horizon)
  _spaceStars = Array.from({ length: 340 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT * 0.56,
    r: Math.random() * 1.8 + 0.3,
    a: Math.random() * 0.55 + 0.45,
  }));
  // Ground stars (below horizon — drawn after road, appear on near-black grass)
  _spaceGroundStars = Array.from({ length: 200 }, () => ({
    x: Math.random() * WIDTH,
    y: HEIGHT * 0.53 + Math.random() * HEIGHT * 0.47,
    r: Math.random() * 1.2 + 0.2,
    a: Math.random() * 0.35 + 0.08,
  }));
}

function _drawSpaceBackground() {
  if (!_spaceStars) _initSpaceStars();

  // Deep space gradient — full canvas height so the ground blends in
  const sg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sg.addColorStop(0,    '#000108');
  sg.addColorStop(0.40, '#05021c');
  sg.addColorStop(0.54, '#080420'); // horizon
  sg.addColorStop(0.58, '#06031a'); // below horizon matches grass color
  sg.addColorStop(1,    '#000008');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Nebula blobs
  const nb = [
    { x: WIDTH * 0.16, y: HEIGHT * 0.16, r: WIDTH * 0.30, col: 'rgba(80,20,130,' },
    { x: WIDTH * 0.74, y: HEIGHT * 0.22, r: WIDTH * 0.24, col: 'rgba(20,60,140,' },
    { x: WIDTH * 0.48, y: HEIGHT * 0.36, r: WIDTH * 0.20, col: 'rgba(150,30,70,' },
    { x: WIDTH * 0.85, y: HEIGHT * 0.45, r: WIDTH * 0.14, col: 'rgba(40,100,180,' },
  ];
  for (const n of nb) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.col + '0.22)'); g.addColorStop(1, n.col + '0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.56);
  }

  // Sky stars
  for (const s of _spaceStars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Horizon neon glow (track below catches the light)
  const hg = ctx.createLinearGradient(0, HEIGHT * 0.46, 0, HEIGHT * 0.58);
  hg.addColorStop(0, 'rgba(80,20,200,0)');
  hg.addColorStop(0.5, 'rgba(110,40,220,0.60)');
  hg.addColorStop(1, 'rgba(60,10,160,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, HEIGHT * 0.46, WIDTH, HEIGHT * 0.12);
}

function _drawSpaceGroundStars() {
  // Stamped AFTER road drawing — visible on the near-black grass voids flanking the track
  if (!_spaceGroundStars) _initSpaceStars();
  for (const s of _spaceGroundStars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function _drawSpaceEdgeGlow() {
  // Neon purple glow traces the road platform edges — makes it look like the track is
  // a lit platform floating above an infinite abyss. Drawn in 'lighter' mode for true glow.
  if (segmentProjections.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth   = 5;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = 'rgba(170,50,255,0.55)';

  for (const side of [-1, 1]) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < segmentProjections.length; i++) {
      const p = segmentProjections[i];
      if (fogAlpha(p.dz) > 0.85) break;
      const x = p.roadX + side * p.roadW;
      if (!started) { ctx.moveTo(x, p.screenY); started = true; }
      else ctx.lineTo(x, p.screenY);
    }
    ctx.stroke();
  }

  // Thin bright inner line for extra neon sharpness
  ctx.strokeStyle = 'rgba(220,140,255,0.40)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < segmentProjections.length; i++) {
      const p = segmentProjections[i];
      if (fogAlpha(p.dz) > 0.85) break;
      const x = p.roadX + side * p.roadW;
      if (!started) { ctx.moveTo(x, p.screenY); started = true; }
      else ctx.lineTo(x, p.screenY);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ---- DIRT stage dust haze + tire ruts ---------------------------------------

function _drawDustHaze() {
  const hy = HEIGHT * 0.50;
  const gr = ctx.createLinearGradient(0, hy - 28, 0, hy + 44);
  gr.addColorStop(0,    'rgba(180,120,50,0)');
  gr.addColorStop(0.4,  'rgba(180,120,50,0.30)');
  gr.addColorStop(1,    'rgba(180,120,50,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, hy - 28, WIDTH, 72);
}

function _drawDirtTireRuts() {
  // Faint tyre-track ruts running parallel to road centre line
  const hy  = HEIGHT * 0.52;
  const mid = WIDTH / 2;
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#3a1a08';
  for (const side of [-1, 1]) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = HEIGHT; y > hy; y -= 6) {
      const progress = (HEIGHT - y) / (HEIGHT - hy);
      const x = mid + side * (WIDTH * 0.07 + progress * WIDTH * 0.14);
      if (y === HEIGHT) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Boost pad rendering ----------------------------------------------------

function _drawBoostPads() {
  const now   = performance.now();
  const pulse = 0.55 + 0.45 * Math.sin(now / 150); // ~6 Hz glow pulse

  for (let k = _boostPadIdx; k < _boostPads.length; k++) {
    const pad    = _boostPads[k];
    const dzNear = pad.pos - distance;
    if (dzNear < 8) continue;
    if (dzNear > DRAW_DISTANCE * SEGMENT_LENGTH * 0.88) break; // outside draw distance

    const dzFar = dzNear + _BOOST_PAD_DEPTH;
    const pnl = projectObject(dzNear, pad.xMin);
    const pnr = projectObject(dzNear, pad.xMax);
    const pfl = projectObject(dzFar,  pad.xMin);
    const pfr = projectObject(dzFar,  pad.xMax);
    if (!pnl || !pnr || !pfl || !pfr) continue;

    const a = pulse * (1 - fogAlpha(dzNear) * 0.6);

    // Main glowing strip
    ctx.fillStyle = `rgba(180,255,20,${(0.50 * a).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(pnl.x, pnl.y); ctx.lineTo(pnr.x, pnr.y);
    ctx.lineTo(pfr.x, pfr.y); ctx.lineTo(pfl.x, pfl.y);
    ctx.closePath(); ctx.fill();

    // Bright edge lines
    ctx.strokeStyle = `rgba(220,255,80,${(0.90 * a).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, pnl.scale * 12);
    ctx.beginPath(); ctx.moveTo(pnl.x, pnl.y); ctx.lineTo(pnr.x, pnr.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pfl.x, pfl.y); ctx.lineTo(pfr.x, pfr.y); ctx.stroke();

    // Chevron arrow toward far end (indicates direction)
    const mx = (pnl.x + pnr.x) / 2, my = (pnl.y + pnr.y) / 2;
    const fx = (pfl.x + pfr.x) / 2, fy = (pfl.y + pfr.y) / 2;
    const aw = (pnr.x - pnl.x) * 0.22;
    ctx.fillStyle = `rgba(255,255,100,${(0.65 * a).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx - aw, my + (my - fy) * 0.35);
    ctx.lineTo(mx + aw, my + (my - fy) * 0.35);
    ctx.closePath(); ctx.fill();
  }
}

// ---- Stage color override ---------------------------------------------------

const _DEFAULT_RUMBLE   = ['#cc2b2b', '#efefef'];
const _DEFAULT_DASH     = ['#ffffff', null];
const _DEFAULT_SHOULDER = '#c0b090';
const _DEFAULT_FOG      = '#c0d0d8';

function _applyStageColors() {
  const selStage = STAGES[_selectedStage];
  const gs = getGameState();
  let ov;
  if (gs === 'title' || gs === 'vehicleSelect' || selStage?.special) {
    ov = selStage?.roadOverride;
  } else {
    ov = getStage(distance).roadOverride;
  }

  // Apply grass and surface overrides first (shoulder then references grass color)
  if (ov?.grass)   { palette.road.grass[0]   = ov.grass[0];   palette.road.grass[1]   = ov.grass[1]; }
  if (ov?.surface) { palette.road.surface[0] = ov.surface[0]; palette.road.surface[1] = ov.surface[1]; }
  const r = ov?.rumble || _DEFAULT_RUMBLE;
  palette.road.rumble[0] = r[0]; palette.road.rumble[1] = r[1];

  // Special stages: no center dashes, no shoulder strip (void/water/dirt flows to the boundary)
  if (selStage?.special) {
    palette.road.dash[0]  = null;
    palette.road.dash[1]  = null;
    // Shoulder becomes invisible by matching the grass color
    palette.road.shoulder = palette.road.grass[0];
    // SPACE: road segments in distance fade to void, not warm sky haze
    palette.sky.fog = selStage.theme === 'space' ? '#000008' : _DEFAULT_FOG;
  } else {
    palette.road.dash[0]  = _DEFAULT_DASH[0];
    palette.road.dash[1]  = _DEFAULT_DASH[1];
    palette.road.shoulder = ov?.shoulder ?? _DEFAULT_SHOULDER;
    palette.sky.fog       = _DEFAULT_FOG;
  }
}

// ---- Speed FX --------------------------------------------------------------

function drawSpeedFX() {
  const sf = CAR.speed / CAR.maxSpeed;
  if (!_vigGrad || _vigW !== WIDTH || _vigH !== HEIGHT) {
    _vigGrad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.18,
                                        WIDTH / 2, HEIGHT / 2, HEIGHT * 0.75);
    _vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    _vigGrad.addColorStop(1, 'rgba(0,0,0,0.75)');
    _vigW = WIDTH; _vigH = HEIGHT;
  }
  ctx.globalAlpha = 0.18 + sf * 0.35;
  ctx.fillStyle   = _vigGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;

  if (sf < 0.65) return;
  const lineAlpha = Math.pow((sf - 0.65) / 0.35, 2) * 0.38;
  const baseLen   = 15 + sf * 55;
  const cx = WIDTH / 2, cy = HEIGHT * 0.52;
  const phase = (distance / 200) % 1;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
  for (let i = 0; i < _SL_COUNT; i++) {
    const a  = _SL_ANGLES[i];
    const d0 = _SL_DISTS[i] + phase * 22;
    const d1 = d0 + baseLen;
    ctx.globalAlpha = lineAlpha * (0.35 + (i % 3) * 0.22);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
    ctx.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Night lights -----------------------------------------------------------

function _drawNightLights() {
  const nf = getNightFactor();
  if (nf < 0.05) return;
  const cx = WIDTH / 2, by = HEIGHT - 18, alpha = nf * 0.80;
  ctx.globalCompositeOperation = 'lighter';
  for (const ox of [-26, 26]) {
    const lx = cx + ox, ly = by - 42;
    const g  = ctx.createRadialGradient(lx, ly, 8, lx, ly, HEIGHT * 0.78);
    g.addColorStop(0,    `rgba(255,255,185,${Math.min(0.9, alpha * 0.65).toFixed(2)})`);
    g.addColorStop(0.20, `rgba(255,255,175,${Math.min(0.9, alpha * 0.22).toFixed(2)})`);
    g.addColorStop(0.55, `rgba(220,230,155,${Math.min(0.9, alpha * 0.06).toFixed(2)})`);
    g.addColorStop(1,    'rgba(200,220,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---- Motion blur -----------------------------------------------------------

function _drawMotionBlur() {
  if (!settings.motionBlur) return;
  if (!_ghostCanvas) _ghostCanvas = getGhostCanvas();
  const sf = CAR.speed / CAR.maxSpeed;
  if (sf < 0.72) return;
  const alpha = Math.pow((sf - 0.72) / 0.28, 1.5) * 0.16;
  ctx.globalAlpha = alpha; ctx.drawImage(_ghostCanvas, 0, 0); ctx.globalAlpha = 1;
}

// ---- Film grain ------------------------------------------------------------

function _drawFilmGrain() {
  if (!settings.filmGrain) return;
  if (!_grainCanvas) {
    _grainCanvas = document.createElement('canvas');
    _grainCanvas.width  = GRAIN_SIZE; _grainCanvas.height = GRAIN_SIZE;
    _grainCtx = _grainCanvas.getContext('2d');
  }
  _grainFrame++;
  if (_grainFrame % 4 === 0) {
    const img = _grainCtx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const d   = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255 | 0; d[i] = d[i+1] = d[i+2] = v; d[i+3] = 18;
    }
    _grainCtx.putImageData(img, 0, 0);
  }
  ctx.globalAlpha = 0.55;
  for (let y = 0; y < HEIGHT; y += GRAIN_SIZE)
    for (let x = 0; x < WIDTH; x += GRAIN_SIZE)
      ctx.drawImage(_grainCanvas, x, y);
  ctx.globalAlpha = 1;
}

// ---- Auto-downgrade --------------------------------------------------------

function _checkAutoDowngrade() {
  if (!settings.autoDowngrade) return;
  const fps = getFPS();
  if (fps > 0 && fps < 45) {
    if (++_lowFpsFrames > 120) { settings.filmGrain = false; settings.motionBlur = false; _lowFpsFrames = 0; }
  } else if (fps >= 55) {
    _lowFpsFrames = Math.max(0, _lowFpsFrames - 1);
  }
}

// ---- Ambient particles -----------------------------------------------------

function _emitAmbientParticles() {
  const cx = WIDTH / 2, by = HEIGHT - 30;
  if (CAR.spinTime > 0 && Math.random() < 0.8) emitSmoke(cx, by);
  if (Math.abs(CAR.x) > 1.05 && CAR.speed > 600 && Math.random() < 0.55) emitDust(cx, by);
  const sf = CAR.speed / CAR.maxSpeed;
  if (sf > 0.65 && Math.random() < 0.10) emitExhaust(cx, HEIGHT - 10);
}

// ---- Loading screen --------------------------------------------------------

function drawLoadingScreen() {
  const w = WIDTH, h = HEIGHT, progress = assets ? assets.progress : 0;
  ctx.fillStyle = '#091420'; ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe44d'; ctx.font = 'bold 52px monospace';
  ctx.fillText('OUTRUN', w / 2, h / 2 - 56);
  const bw = 360, bh = 12, bx = (w - bw) / 2, by = h / 2 - 10;
  ctx.fillStyle = '#1a3a5a'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffe44d'; ctx.fillRect(bx, by, bw * progress, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px monospace';
  ctx.fillText('LOADING...', w / 2, h / 2 + 22);
  ctx.textAlign = 'left';
}

// ---- HUD -------------------------------------------------------------------

function drawHUD() {
  const w = WIDTH, h = HEIGHT;
  ctx.font = 'bold 22px monospace';

  ctx.fillStyle = palette.hud.bg; ctx.fillRect(12, 12, 150, 38);
  ctx.fillStyle = timeLeft < 10 ? palette.hud.timeLow : palette.hud.time;
  ctx.textAlign = 'left';
  ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, 22, 39);

  const toCp = Math.max(0, Math.round((nextCheckpoint - distance) / 100));
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = palette.hud.bg; ctx.fillRect(12, 54, 150, 24);
  ctx.fillStyle = palette.hud.checkpoint;
  ctx.fillText(`NEXT CP ${toCp}m`, 22, 71);

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = palette.hud.bg; ctx.fillRect(w - 212, 12, 200, 38);
  ctx.fillStyle = palette.hud.text;
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${score}`, w - 22, 39);

  const mph = Math.round(CAR.speed / _BASE_MAX_SPEED * 150);
  ctx.fillStyle = palette.hud.bg; ctx.fillRect(w - 132, h - 48, 120, 36);
  ctx.fillStyle = palette.hud.text;
  ctx.fillText(`${mph} MPH`, w - 22, h - 22);

  // Stage name — top-centre, subtle
  const selSt = STAGES[_selectedStage];
  const hudStage = selSt?.special ? selSt : getStage(distance);
  ctx.textAlign = 'center'; ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText(hudStage.name, w / 2, 20);

  ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace';
  ctx.fillStyle = palette.hud.seed;
  ctx.fillText(`SEED ${trackSeed}`, 14, h - 14);

  if (performance.now() < flashUntil) {
    ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = palette.hud.flash;
    ctx.fillText(flashText, w / 2, 88);
    ctx.textAlign = 'left';
  }
}

// ---- Menu draw helpers -----------------------------------------------------

function _roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x,     y,     x + r,     y,         r);
  ctx.closePath();
}

// ---- Title screen ----------------------------------------------------------

function drawTitleScreen() {
  const w = WIDTH, h = HEIGHT, now = performance.now();

  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0,   'rgba(0,0,0,0.55)');
  overlay.addColorStop(0.6, 'rgba(0,0,0,0.20)');
  overlay.addColorStop(1,   'rgba(0,0,0,0.78)');
  ctx.fillStyle = overlay; ctx.fillRect(0, 0, w, h);

  // Logo
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px monospace';
  ctx.fillStyle = '#aa1111'; ctx.fillText('OUTRUN', w / 2 + 3, h * 0.24 + 4);
  ctx.fillStyle = '#ffe44d'; ctx.fillText('OUTRUN', w / 2,     h * 0.24);

  // Stage selector
  const stage = STAGES[_selectedStage];
  const sx = w / 2, sy = h * 0.36;
  ctx.font = 'bold 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText('SELECT STAGE   [←→]', sx, sy - 22);
  const stageColor = stage.special ? '#ff88ff' : '#ffe44d';
  ctx.font = 'bold 26px monospace'; ctx.fillStyle = stageColor;
  ctx.fillText(`◀  ${stage.name}  ▶`, sx, sy + 6);
  if (stage.label) {
    ctx.font = 'bold 11px monospace'; ctx.fillStyle = 'rgba(255,160,255,0.80)';
    ctx.fillText(stage.label, sx, sy + 24);
    ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fillText(stage.subtitle, sx, sy + 40);
  } else {
    ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(stage.subtitle, sx, sy + 24);
  }

  // Stage dots
  const dotCount = STAGES.length;
  STAGES.forEach((s, i) => {
    const dx = sx + (i - (dotCount - 1) / 2) * 16;
    ctx.fillStyle = i === _selectedStage ? stageColor : 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(dx, sy + 54, 4, 0, Math.PI * 2); ctx.fill();
  });

  // Difficulty selector
  const dy = h * 0.58;
  const diffKeys = Object.keys(DIFFICULTY);
  const diffColors = { easy: '#44ff88', normal: '#ffe44d', hard: '#ff4444' };
  ctx.font = 'bold 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText('DIFFICULTY   [D]', sx, dy - 16);
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = diffColors[settings.difficulty] || '#ffe44d';
  ctx.fillText(`◀  ${settings.difficulty.toUpperCase()}  ▶`, sx, dy + 4);

  // Vehicle hint
  const selStage = STAGES[_selectedStage];
  ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.38)';
  if (selStage.special) {
    ctx.fillText(`VEHICLE: ${selStage.playerVehicle.toUpperCase()}`, sx, dy + 24);
  } else {
    const v = PLAYER_VEHICLES[_vehicleSelectIdx] || PLAYER_VEHICLES[0];
    ctx.fillText(`[V] VEHICLE: ${v.name}`, sx, dy + 24);
  }

  // Boost toggle
  ctx.font = '12px monospace';
  ctx.fillStyle = settings.boostsEnabled ? '#55ff88' : 'rgba(255,255,255,0.28)';
  ctx.fillText(`[B] SPEED BOOSTS: ${settings.boostsEnabled ? 'ON' : 'OFF'}`, sx, dy + 42);

  if (Math.floor(now / 520) % 2 === 0) {
    ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffe44d';
    ctx.fillText('PRESS SPACE TO RACE', w / 2, h * 0.73);
  }

  const scores = getHighScores();
  if (scores.length > 0) {
    ctx.font = 'bold 11px monospace'; ctx.fillStyle = 'rgba(180,210,255,0.50)';
    ctx.fillText('HIGH SCORES', w / 2, h * 0.80);
    scores.slice(0, 3).forEach((s, i) => {
      ctx.font = `${i === 0 ? 'bold ' : ''}11px monospace`;
      ctx.fillStyle = i === 0 ? '#ffe44d' : 'rgba(255,255,255,0.55)';
      ctx.fillText(`${i + 1}.  ${s.score.toLocaleString()}`, w / 2, h * 0.80 + 18 + i * 16);
    });
  }

  ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('[←→] STAGE  [D] DIFFICULTY  [B] BOOSTS  [V] VEHICLE  [SPACE] RACE  [I] HELP  [ESC] SETTINGS', w / 2, h - 14);
  ctx.textAlign = 'left';
}

// ---- Vehicle select screen -------------------------------------------------

function drawVehicleSelectScreen() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, w, h);

  const pw = 420, ph = 300;
  const px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(8,18,38,0.97)';
  _roundRect(px, py, pw, ph, 10); ctx.fill();
  ctx.strokeStyle = '#ffe44d'; ctx.lineWidth = 2;
  _roundRect(px, py, pw, ph, 10); ctx.stroke();

  ctx.textAlign = 'center'; ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#ffe44d';
  ctx.fillText('SELECT VEHICLE', w / 2, py + 32);
  ctx.fillStyle = 'rgba(255,228,77,0.25)'; ctx.fillRect(px + 18, py + 42, pw - 36, 1);

  const selStage = STAGES[_selectedStage];

  if (selStage.special) {
    ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(255,160,255,0.85)';
    ctx.fillText(`${selStage.name} STAGE — vehicle locked to theme`, w / 2, py + 68);
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 40, py + 80, pw - 80, 150); ctx.clip();
    drawCar3D(ctx, w / 2, py + 204, 190, selStage.playerColor || '#88aaff', selStage.playerVehicle);
    ctx.restore();
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = selStage.playerColor || '#88aaff';
    ctx.fillText(selStage.playerVehicle.toUpperCase(), w / 2, py + 258);
  } else {
    const v = PLAYER_VEHICLES[_vehicleSelectIdx];
    ctx.font = 'bold 18px monospace'; ctx.fillStyle = v.color;
    ctx.fillText(`◀  ${v.name}  ▶`, w / 2, py + 68);
    ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.fillText(v.desc, w / 2, py + 86);
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 40, py + 96, pw - 80, 148); ctx.clip();
    drawCar3D(ctx, w / 2, py + 214, 190, v.color, v.type);
    ctx.restore();
    const dotY = py + 264;
    PLAYER_VEHICLES.forEach((_, i) => {
      const dx = w / 2 + (i - (PLAYER_VEHICLES.length - 1) / 2) * 16;
      ctx.fillStyle = i === _vehicleSelectIdx ? '#ffe44d' : 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(dx, dotY, 4, 0, Math.PI * 2); ctx.fill();
    });
  }

  ctx.textAlign = 'center'; ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('[←→] change   ·   [SPACE / ESC] back', w / 2, py + ph + 14);
  ctx.textAlign = 'left';
}

// ---- Pause screen ----------------------------------------------------------

const _PAUSE_ITEMS = ['RESUME', 'SETTINGS', 'QUIT TO TITLE'];

function drawPauseScreen() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, w, h);

  const pw = 280, ph = 46 + _PAUSE_ITEMS.length * 46 + 22;
  const px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(8,18,38,0.95)';
  _roundRect(px, py, pw, ph, 8); ctx.fill();
  ctx.strokeStyle = '#ffe44d'; ctx.lineWidth = 2;
  _roundRect(px, py, pw, ph, 8); ctx.stroke();

  ctx.textAlign = 'center'; ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#ffe44d';
  ctx.fillText('PAUSED', w / 2, py + 32);
  ctx.fillStyle = 'rgba(255,228,77,0.25)'; ctx.fillRect(px + 18, py + 42, pw - 36, 1);

  _PAUSE_ITEMS.forEach((item, i) => {
    const iy = py + 68 + i * 46, sel = i === _menuIdx;
    if (sel) { ctx.fillStyle = 'rgba(255,228,77,0.12)'; ctx.fillRect(px + 8, iy - 24, pw - 16, 36); }
    ctx.font = `${sel ? 'bold ' : ''}19px monospace`;
    ctx.fillStyle = sel ? '#ffe44d' : 'rgba(255,255,255,0.72)';
    ctx.fillText(`${sel ? '▶ ' : '  '}${item}`, w / 2, iy);
  });

  ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('↑↓ move   ·   ENTER select   ·   ESC resume', w / 2, py + ph + 14);
  ctx.textAlign = 'left';
}

// ---- Settings screen -------------------------------------------------------

const _SETTINGS_LABELS = ['Motion Blur', 'Film Grain', 'Auto FPS', 'Volume', 'WebGL Road', 'Traffic', '← BACK'];

function drawSettingsScreen() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(0, 0, w, h);

  const pw = 340, ph = 52 + _SETTINGS_LABELS.length * 48 + 22;
  const px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(8,18,38,0.97)';
  _roundRect(px, py, pw, ph, 8); ctx.fill();
  ctx.strokeStyle = '#4488cc'; ctx.lineWidth = 2;
  _roundRect(px, py, pw, ph, 8); ctx.stroke();

  ctx.textAlign = 'center'; ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#4488cc';
  ctx.fillText('SETTINGS', w / 2, py + 34);
  ctx.fillStyle = 'rgba(68,136,204,0.3)'; ctx.fillRect(px + 18, py + 44, pw - 36, 1);

  _SETTINGS_LABELS.forEach((label, i) => {
    const iy = py + 74 + i * 48, sel = i === _menuIdx;
    if (sel) { ctx.fillStyle = 'rgba(68,136,204,0.15)'; ctx.fillRect(px + 8, iy - 26, pw - 16, 38); }
    ctx.textAlign = 'left';
    ctx.font = `${sel ? 'bold ' : ''}16px monospace`;
    ctx.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.62)';
    ctx.fillText(`${sel ? '▶ ' : '  '}${label}`, px + 18, iy);

    let val = '';
    if (i === 0) val = settings.motionBlur    ? 'ON' : 'OFF';
    if (i === 1) val = settings.filmGrain     ? 'ON' : 'OFF';
    if (i === 2) val = settings.autoDowngrade ? 'ON' : 'OFF';
    if (i === 3) val = `◀ ${Math.round((settings.volume ?? 0.55) * 100)}% ▶`;
    if (i === 4) val = isWebGLSupported()
      ? (settings.webglRoad ? 'ON' : 'OFF')
      : 'NOT SUPPORTED';
    if (i === 5) val = settings.trafficEnabled ? 'ON' : 'OFF';
    if (val) {
      ctx.textAlign = 'right'; ctx.fillStyle = sel ? '#ffe44d' : 'rgba(255,228,77,0.60)';
      ctx.fillText(val, px + pw - 18, iy);
    }
  });

  ctx.textAlign = 'center'; ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('↑↓ move   ·   ←→ adjust   ·   ENTER toggle   ·   ESC back', w / 2, py + ph + 14);
  ctx.textAlign = 'left';
}

// ---- Game over screen ------------------------------------------------------

function drawGameOver() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.font = 'bold 52px monospace'; ctx.fillStyle = '#ff4444';
  ctx.fillText('GAME OVER', w / 2, h / 2 - 52);

  ctx.font = 'bold 28px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(`SCORE  ${score.toLocaleString()}`, w / 2, h / 2);

  const goSt = STAGES[_selectedStage]?.special ? STAGES[_selectedStage] : getStage(distance);
  ctx.font = '15px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.fillText(`DISTANCE  ${(distance / 1000).toFixed(1)} km   ·   STAGE: ${goSt.name}`, w / 2, h / 2 + 28);

  const scores = getHighScores();
  if (scores.length > 0 && scores[0].score === score) {
    ctx.font = 'bold 19px monospace'; ctx.fillStyle = '#ffe44d';
    ctx.fillText('★  NEW HIGH SCORE  ★', w / 2, h / 2 + 58);
  }

  ctx.font = '15px monospace'; ctx.fillStyle = '#ffe44d';
  ctx.fillText('[SPACE / R]  RACE AGAIN     [ESC]  TITLE', w / 2, h / 2 + 88);
  ctx.textAlign = 'left';
}

// ---- Instructions screen ---------------------------------------------------

function drawInstructionsScreen() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(0, 0, w, h);

  const pw = Math.min(480, w - 40), ph = 430;
  const px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(8,18,38,0.97)';
  _roundRect(px, py, pw, ph, 10); ctx.fill();
  ctx.strokeStyle = '#ffe44d'; ctx.lineWidth = 2;
  _roundRect(px, py, pw, ph, 10); ctx.stroke();

  ctx.textAlign = 'center'; ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffe44d';
  ctx.fillText('HOW TO PLAY', w / 2, py + 32);
  ctx.fillStyle = 'rgba(255,228,77,0.25)'; ctx.fillRect(px + 18, py + 42, pw - 36, 1);

  const col1 = px + 28, col2 = px + pw - 28;
  let y = py + 66;
  const section = (label) => {
    ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillStyle = 'rgba(100,180,255,0.80)';
    ctx.fillText(label, col1, y); y += 20;
  };
  const row = (key, desc) => {
    ctx.textAlign = 'left';  ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(255,228,77,0.85)';
    ctx.fillText(key, col1, y);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(desc, col2, y); y += 20;
  };
  const gap = (n = 10) => { y += n; };

  section('DRIVING');
  row('↑  Arrow / Gas button',   'Accelerate');
  row('↓  Arrow / Brake button', 'Brake');
  row('← →  Arrows / Tilt',      'Steer');
  row('Gamepad  Left stick',      'Steer');
  row('Gamepad  A / RT',          'Gas  ·  X / LT = Brake');
  gap();
  section('GAME');
  row('ESC',           'Pause / Resume');
  row('SPACE or R',    'Restart  (game over screen)');
  gap();
  section('DEV SHORTCUTS  (keyboard only)');
  row('T',             'Advance time of day');
  row('W',             'Toggle rain');
  row('` (backtick)',  'Debug overlay');
  row('?seed=N in URL','Replay a specific track layout');
  gap();
  section('STAGES');
  row('← →  on title screen',    'Pick starting biome');
  row('COAST / DESERT / CITY',   'All unlocked — choose any');

  ctx.textAlign = 'center'; ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText('[SPACE / ESC]  BACK', w / 2, py + ph - 14);
  ctx.textAlign = 'left';
}

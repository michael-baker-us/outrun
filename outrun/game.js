// Main game loop — wires road, scenery, opponents, car, and HUD together.
// Game state machine: title → playing ↔ paused/settings → gameover → title

import { buildSegments, projectRoad, drawRoad, TRACK_LENGTH, segmentProjections, getHorizonCurveX } from './road.js';
import { drawBackground } from './sky.js';
import { AssetManager } from './assets.js';
import { buildSprites } from './sprites.js';
import { CAR, initInput, updateCar, drawCar } from './car.js';
import { updateParticles, drawParticles, emitSmoke, emitDust, emitExhaust, emitSparks, resetParticles, getParticleCount } from './particles.js';
import { drawScenery, getLastSpriteCount } from './scenery.js';
import { drawCheckpoint } from './checkpoint.js';
import { buildOpponents, updateOpponents, checkCollisions, drawOpponents } from './opponents.js';
import { initDebug, recordFrameStart, recordPhysicsStep, recordFrameEnd, drawDebugOverlay, getFPS } from './debug.js';
import { initRenderer, getCtx, beginFrame, endFrame, captureGhost, getGhostCanvas, WIDTH, HEIGHT } from './renderer.js';
import { palette } from './palette.js';
import { updateTOD, setTODPhase, getTODPhase, getNightFactor, resetTOD } from './tod.js';
import { setWeather, getWeatherMode, updateWeather, drawWeather, getGripMultiplier, resetWeather } from './weather.js';
import { settings } from './settings.js';
import { getGameState, setGameState } from './gamestate.js';
import { unlockAudio, updateEngineSound, playSFX, startMusic, stopMusic, resetAudio, setMasterVolume } from './audio.js';
import { addHighScore, getHighScores, loadSettings, saveSettings, saveLastSeed } from './storage.js';
import { STAGES, getStage, getStageIndex } from './stage.js';

const START_TIME     = 40;
const CHECKPOINT_TIME = 8;
const CHECKPOINT_GAP  = 50_000;
const PHYSICS_STEP    = 1 / 120;

let ctx;
let segments, opponents, trackSeed;
let cameraZ, distance, score, timeLeft, lastTime;
let nextCheckpoint, flashText, flashUntil;
let accumulator = 0;
let assets = null;

// Visual state (render-only)
let _shakeIntensity = 0, _shakeX = 0, _shakeY = 0, _cameraDip = 0;
let _vigGrad = null, _vigW = 0, _vigH = 0;
let _ghostCanvas = null;
const GRAIN_SIZE = 96;
let _grainCanvas = null, _grainCtx = null, _grainFrame = 0;
let _lowFpsFrames = 0;

// Phase 6 state
let _menuIdx           = 0;      // focused menu item
let _settingsReturn    = 'title'; // which state ESC/BACK in settings returns to
let _attractZ          = 0;      // camera Z for title attract mode
let _prevStageIdx      = -1;     // tracks stage transitions
let _gameOverSaved     = false;  // prevents duplicate score saves
let _audioVolumeApplied = false; // applies saved volume on first audio unlock
let _selectedStage     = 0;      // 0=COAST 1=DESERT 2=CITY, chosen on title screen

const _SL_COUNT  = 14;
const _SL_ANGLES = Array.from({ length: _SL_COUNT }, (_, i) => (i / _SL_COUNT) * Math.PI * 2 + 0.22);
const _SL_DISTS  = Array.from({ length: _SL_COUNT }, (_, i) => 82 + (i * 31 % 52));

// controls.js imports getState from game.js — delegate to the state machine
export function getState() { return getGameState(); }

// ---- Public API -------------------------------------------------------------

export function startGame() {
  resetGame();
  if (_selectedStage > 0) {
    distance      = STAGES[_selectedStage].startDistance;
    _prevStageIdx = _selectedStage;
  }
  saveLastSeed(trackSeed);
  setGameState('playing');
  startMusic();
}

export function resetGame() {
  cameraZ         = 0;
  distance        = 0;
  score           = 0;
  timeLeft        = START_TIME;
  nextCheckpoint  = CHECKPOINT_GAP;
  flashText       = '';
  flashUntil      = 0;
  CAR.x              = 0;
  CAR.speed          = 0;
  CAR.invuln         = 0;
  CAR.gripMultiplier = 1.0;
  accumulator        = 0;
  _shakeIntensity    = 0;
  _cameraDip         = 0;
  _lowFpsFrames      = 0;
  _prevStageIdx      = 0;
  _gameOverSaved     = false;
  resetParticles();
  resetTOD();
  resetWeather();
}

// ---- Render layers ----------------------------------------------------------

const LAYERS = [
  { name: 'sky',
    draw: () => {
      drawBackground(ctx, WIDTH, HEIGHT, getHorizonCurveX(), getNightFactor());
      if (getStageIndex(distance) === 0) _drawCoastOcean();
    } },
  { name: 'road',
    draw: () => drawRoad(ctx, segments, WIDTH, HEIGHT) },
  { name: 'lights',
    draw: () => _drawNightLights() },
  { name: 'scenery',
    draw: () => drawScenery(ctx, segments, assets, getStageIndex(distance)) },
  { name: 'checkpoint',
    draw: () => { if (getGameState() === 'playing') drawCheckpoint(ctx, nextCheckpoint - distance); } },
  { name: 'traffic',
    draw: () => {
      const camZ = getGameState() === 'title' ? _attractZ : cameraZ;
      drawOpponents(ctx, opponents, camZ, getNightFactor());
    } },
  { name: 'weather-fx',
    draw: () => drawWeather(ctx, WIDTH, HEIGHT) },
  { name: 'particles',
    draw: () => drawParticles(ctx) },
  { name: 'player',
    draw: () => { if (getGameState() !== 'title') drawCar(ctx, WIDTH, HEIGHT); } },
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
  opponents = buildOpponents(16);
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
      } else if (e.key === 'ArrowRight') {
        _selectedStage = (_selectedStage + 1) % STAGES.length;
      } else if (e.key === 'i' || e.key === 'I') {
        _settingsReturn = 'title'; setGameState('instructions');
      } else if (e.key === 'Escape') {
        _settingsReturn = 'title'; _menuIdx = 0; setGameState('settings');
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
      if (e.key === 'Escape') { setGameState('paused'); _menuIdx = 0; stopMusic(); return; }
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
        _saveSettings(); return;
      }
      // ESC or Enter on BACK item → return to previous state
      if (e.key === 'Escape' || ((e.key === ' ' || e.key === 'Enter') && _menuIdx === len - 1)) {
        setGameState(_settingsReturn); _menuIdx = 0; return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (_menuIdx === 0) settings.motionBlur    = !settings.motionBlur;
        if (_menuIdx === 1) settings.filmGrain     = !settings.filmGrain;
        if (_menuIdx === 2) settings.autoDowngrade = !settings.autoDowngrade;
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

function _saveSettings() {
  saveSettings({
    motionBlur:    settings.motionBlur,
    filmGrain:     settings.filmGrain,
    autoDowngrade: settings.autoDowngrade,
    volume:        settings.volume,
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

  if (state === 'title') {
    // Attract mode: keep world alive so the title screen looks dynamic
    _attractZ = (_attractZ + 2200 * elapsed) % TRACK_LENGTH;
    updateTOD(elapsed);
    updateWeather(elapsed);
  }

  if (state === 'playing') {
    updateTOD(elapsed);
    updateWeather(elapsed);
    _applyStageColors();

    accumulator += elapsed;
    while (accumulator >= PHYSICS_STEP) {
      update(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
      recordPhysicsStep();
    }
    _emitAmbientParticles();
    _checkAutoDowngrade();
    updateEngineSound(CAR.speed / CAR.maxSpeed);
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
  updateOpponents(opponents, dt);

  cameraZ += CAR.speed * dt;
  if (cameraZ >= TRACK_LENGTH) cameraZ -= TRACK_LENGTH;

  distance += CAR.speed * dt;
  score = Math.floor(distance / 100);

  // Stage transition: flash stage name when crossing a threshold
  const stageIdx = getStageIndex(distance);
  if (stageIdx !== _prevStageIdx) {
    const stage = getStage(distance);
    flashText  = `${stage.name}  —  ${stage.subtitle}`;
    flashUntil = performance.now() + 2800;
    _prevStageIdx = stageIdx;
  }

  const spinHit = checkCollisions(opponents, CAR, cameraZ, dt);
  if (spinHit) {
    emitSparks(WIDTH / 2, HEIGHT - 30, 18);
    playSFX('crash');
    _shakeIntensity = 14;
  }

  if (distance >= nextCheckpoint) {
    timeLeft += CHECKPOINT_TIME;
    nextCheckpoint += CHECKPOINT_GAP;
    flashText  = `CHECKPOINT  +${CHECKPOINT_TIME}s`;
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

  // Title uses attract camera; gameplay uses physics camera
  const camZ = state === 'title' ? _attractZ : cameraZ;
  const carX = state === 'title' ? 0 : CAR.x;
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
  if (state === 'title')        drawTitleScreen();
  if (state === 'paused')       drawPauseScreen();
  if (state === 'settings')     drawSettingsScreen();
  if (state === 'instructions') drawInstructionsScreen();
  if (state === 'gameover')     drawGameOver();

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

// ---- Stage color override ---------------------------------------------------

function _applyStageColors() {
  const ov = getStage(distance).roadOverride;
  if (!ov) return;
  if (ov.grass)    { palette.road.grass[0]   = ov.grass[0];    palette.road.grass[1]   = ov.grass[1]; }
  if (ov.surface)  { palette.road.surface[0] = ov.surface[0];  palette.road.surface[1] = ov.surface[1]; }
  if (ov.shoulder) { palette.road.shoulder   = ov.shoulder; }
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

  const mph = Math.round(CAR.speed / CAR.maxSpeed * 150);
  ctx.fillStyle = palette.hud.bg; ctx.fillRect(w - 132, h - 48, 120, 36);
  ctx.fillStyle = palette.hud.text;
  ctx.fillText(`${mph} MPH`, w - 22, h - 22);

  // Stage name — top-centre, subtle
  ctx.textAlign = 'center'; ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText(getStage(distance).name, w / 2, 20);

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
  const sx = w / 2, sy = h * 0.38;
  const canPrev = true, canNext = true; // all unlocked
  ctx.font = 'bold 13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.fillText('SELECT STAGE', sx, sy - 22);
  ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#ffe44d';
  ctx.fillText(`◀  ${stage.name}  ▶`, sx, sy + 6);
  ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(stage.subtitle, sx, sy + 26);

  // Stage dots
  STAGES.forEach((_, i) => {
    const dx = sx + (i - 1) * 18;
    ctx.fillStyle = i === _selectedStage ? '#ffe44d' : 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.arc(dx, sy + 44, 4, 0, Math.PI * 2); ctx.fill();
  });

  if (Math.floor(now / 520) % 2 === 0) {
    ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffe44d';
    ctx.fillText('PRESS SPACE TO RACE', w / 2, h * 0.58);
  }

  const scores = getHighScores();
  if (scores.length > 0) {
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = 'rgba(180,210,255,0.55)';
    ctx.fillText('HIGH SCORES', w / 2, h * 0.68);
    scores.slice(0, 5).forEach((s, i) => {
      ctx.font = `${i === 0 ? 'bold ' : ''}13px monospace`;
      ctx.fillStyle = i === 0 ? '#ffe44d' : 'rgba(255,255,255,0.62)';
      ctx.fillText(`${i + 1}.  ${s.score.toLocaleString()}`, w / 2, h * 0.68 + 20 + i * 18);
    });
  }

  ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('[←→] STAGE   [SPACE] RACE   [I] HOW TO PLAY   [ESC] SETTINGS', w / 2, h - 16);
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

const _SETTINGS_LABELS = ['Motion Blur', 'Film Grain', 'Auto FPS', 'Volume', '← BACK'];

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

  const stage = getStage(distance);
  ctx.font = '15px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.fillText(`DISTANCE  ${(distance / 1000).toFixed(1)} km   ·   STAGE: ${stage.name}`, w / 2, h / 2 + 28);

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

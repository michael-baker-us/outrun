// Main game loop — wires road, scenery, opponents, car, and HUD together,
// plus the timer / score / checkpoint / game-over state machine.

import { buildSegments, projectRoad, drawRoad, TRACK_LENGTH, segmentProjections, getHorizonCurveX } from './road.js';
import { drawBackground } from './sky.js';
import { AssetManager } from './assets.js';
import { buildSprites } from './sprites.js';
import { CAR, initInput, updateCar, drawCar } from './car.js';
import { updateParticles, drawParticles, emitSmoke, emitDust, emitExhaust, emitSparks, resetParticles, getParticleCount } from './particles.js';
import { drawScenery, getLastSpriteCount } from './scenery.js';
import { drawCheckpoint } from './checkpoint.js';
import { buildOpponents, updateOpponents, checkCollisions, drawOpponents } from './opponents.js';
import { initDebug, recordFrameStart, recordPhysicsStep, recordFrameEnd, drawDebugOverlay } from './debug.js';
import { initRenderer, getCtx, beginFrame, endFrame, WIDTH, HEIGHT } from './renderer.js';
import { palette } from './palette.js';

const START_TIME      = 40;       // seconds on the clock
const CHECKPOINT_TIME = 8;         // bonus seconds per checkpoint
// Checkpoints are spaced so that only good driving banks more time than it
// costs: at top speed a gap takes ~5.5s (net +2.5s), at a sloppy pace ~10s
// (net -2s). Independent of track length so it isn't trivially short.
const CHECKPOINT_GAP  = 50000;    // cumulative distance between checkpoints

// Fixed physics timestep: decouples simulation speed from frame rate so
// physics is identical at 30fps, 60fps, and 144fps.
const PHYSICS_STEP = 1 / 120;

let ctx;
let segments, opponents, trackSeed;
let cameraZ, distance, score, timeLeft, lastTime;
let nextCheckpoint, flashText, flashUntil;
let accumulator = 0;
let assets = null;

// ---- Visual state (render-only, not physics) --------------------------------
let _shakeIntensity = 0; // pixels; decays each render frame
let _shakeX = 0, _shakeY = 0;
let _cameraDip = 0;      // smooth y-offset when braking, pixels

// Vignette gradient (cached; rebuilt if canvas size changes)
let _vigGrad = null, _vigW = 0, _vigH = 0;

// Speed lines: fixed angles + distances for stable streaks (no per-frame random)
const _SL_COUNT  = 14;
const _SL_ANGLES = Array.from({ length: _SL_COUNT }, (_, i) =>
  (i / _SL_COUNT) * Math.PI * 2 + 0.22);
const _SL_DISTS  = Array.from({ length: _SL_COUNT }, (_, i) =>
  82 + (i * 31 % 52));

let _state = 'playing';
export function getState() { return _state; }

export function resetGame() {
  cameraZ = 0;
  distance = 0;
  score = 0;
  timeLeft = START_TIME;
  _state = 'playing';
  nextCheckpoint = CHECKPOINT_GAP;
  flashText = '';
  flashUntil = 0;
  CAR.x = 0;
  CAR.speed = 0;
  CAR.invuln = 0;
  accumulator = 0;
  _shakeIntensity = 0;
  _cameraDip = 0;
  resetParticles();
}

// Ordered render layers — background → foreground.
// Phase 5 will insert post-fx passes between layers (e.g. bloom after 'traffic',
// vignette before 'hud'). Keep the array shape stable so that's non-breaking.
const LAYERS = [
  // sky.js uses the previous frame's segmentProjections for parallax — imperceptible lag.
  { name: 'sky',        draw: () => drawBackground(ctx, WIDTH, HEIGHT, getHorizonCurveX()) },
  { name: 'road',       draw: () => drawRoad(ctx, segments, WIDTH, HEIGHT) },
  { name: 'scenery',    draw: () => drawScenery(ctx, segments, assets) },
  { name: 'checkpoint', draw: () => drawCheckpoint(ctx, nextCheckpoint - distance) },
  { name: 'traffic',    draw: () => drawOpponents(ctx, opponents, cameraZ) },
  { name: 'particles',  draw: () => drawParticles(ctx) },
  { name: 'player',     draw: () => drawCar(ctx, WIDTH, HEIGHT) },
  { name: 'speed-fx',   draw: () => drawSpeedFX() },
  { name: 'hud',        draw: () => drawHUD() },
  { name: 'gameover',   draw: () => { if (_state === 'gameover') drawGameOver(); } },
  { name: 'debug',      draw: () => drawDebugOverlay(ctx, WIDTH, HEIGHT, {
      seed: trackSeed, car: CAR,
      segmentsDrawn: segmentProjections.length,
      spritesDrawn: getLastSpriteCount(),
      particles: getParticleCount(),
    }) },
];

export function init() {
  const canvasEl = document.getElementById('game');
  initRenderer(canvasEl);
  ctx = getCtx();

  // Track seed: ?seed=<n> in the URL replays a specific layout; otherwise random.
  const seedParam = new URLSearchParams(location.search).get('seed');
  trackSeed = (seedParam !== null && /^\d+$/.test(seedParam))
    ? (parseInt(seedParam, 10) >>> 0)
    : (Math.floor(Math.random() * 0xffffffff) >>> 0);
  console.log(`OutRun track seed: ${trackSeed}  (replay with ?seed=${trackSeed})`);

  segments  = buildSegments(trackSeed);
  opponents = buildOpponents(16);
  initInput();
  initDebug();

  // Pre-render procedural sprites onto offscreen canvases (sync, instant).
  // Then register each key with the AssetManager so real PNGs in assets/
  // can override them in future (the 404s for now are handled gracefully).
  buildSprites();
  assets = new AssetManager();
  ['pine', 'palm', 'poplar', 'bush', 'rock',
   'billboard-0', 'billboard-1', 'billboard-2'].forEach(key => {
    assets.add(key, `assets/${key}.png`);
  });
  assets.load();  // async; game loop polls assets.ready

  document.addEventListener('keydown', e => {
    if (_state === 'gameover' && (e.key === 'r' || e.key === 'R')) resetGame();
  });

  resetGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  recordFrameStart(now);

  const elapsed = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Show a loading screen until all asset fetches have settled (success or 404).
  if (!assets?.ready) {
    beginFrame();
    drawLoadingScreen();
    endFrame();
    recordFrameEnd(performance.now());
    requestAnimationFrame(loop);
    return;
  }

  if (_state === 'playing') {
    accumulator += elapsed;
    while (accumulator >= PHYSICS_STEP) {
      update(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
      recordPhysicsStep();
    }
    // Particle effects are visual — emit once per frame, not per physics step
    _emitAmbientParticles();
  }

  updateParticles(elapsed);
  render(elapsed);
  recordFrameEnd(performance.now());

  requestAnimationFrame(loop);
}

function update(dt) {
  updateCar(CAR, dt);
  updateOpponents(opponents, dt);

  cameraZ += CAR.speed * dt;
  if (cameraZ >= TRACK_LENGTH) cameraZ -= TRACK_LENGTH;

  distance += CAR.speed * dt;
  score = Math.floor(distance / 100);

  const spinHit = checkCollisions(opponents, CAR, cameraZ, dt);
  if (spinHit) {
    emitSparks(WIDTH / 2, HEIGHT - 30, 18);
    _shakeIntensity = 14;
  }

  // Checkpoint: bank bonus time and flash a message.
  if (distance >= nextCheckpoint) {
    timeLeft += CHECKPOINT_TIME;
    nextCheckpoint += CHECKPOINT_GAP;
    flashText = `CHECKPOINT  +${CHECKPOINT_TIME}s`;
    flashUntil = performance.now() + 1800;
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    _state = 'gameover';
  }
}

function render(elapsed) {
  beginFrame();
  projectRoad(segments, cameraZ, CAR.x, WIDTH, HEIGHT);

  // Decay screen shake and smooth camera dip
  _shakeIntensity *= 0.86;
  if (_shakeIntensity > 0.4) {
    _shakeX = (Math.random() - 0.5) * _shakeIntensity;
    _shakeY = (Math.random() - 0.5) * _shakeIntensity * 0.6;
  } else {
    _shakeX = 0; _shakeY = 0;
  }
  const dipTarget = (CAR.braking && CAR.speed > 100) ? 5 : 0;
  _cameraDip += (dipTarget - _cameraDip) * 0.12;

  ctx.save();
  if (_shakeX || _shakeY || _cameraDip) {
    ctx.translate(Math.round(_shakeX), Math.round(_shakeY + _cameraDip));
  }
  for (const layer of LAYERS) layer.draw();
  ctx.restore();

  endFrame();
}

// Screen-space overlay effects: vignette + speed lines. Drawn after the car,
// before the HUD, so they frame the action without obscuring game info.
function drawSpeedFX() {
  const sf = CAR.speed / CAR.maxSpeed;

  // Vignette — always present at low opacity, intensifies with speed
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

  // Speed lines — radial streaks that animate outward with game distance
  if (sf < 0.65) return;
  const lineAlpha = Math.pow((sf - 0.65) / 0.35, 2) * 0.38;
  const baseLen   = 15 + sf * 55;
  const cx = WIDTH / 2, cy = HEIGHT * 0.52;
  const phase = (distance / 200) % 1; // animates lines outward as you drive
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 1.2;
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

// Emit ambient particle effects once per rendered frame (not per physics step).
function _emitAmbientParticles() {
  const cx = WIDTH / 2, by = HEIGHT - 30;

  if (CAR.spinTime > 0 && Math.random() < 0.8) emitSmoke(cx, by);

  if (Math.abs(CAR.x) > 1.05 && CAR.speed > 600 && Math.random() < 0.55) {
    emitDust(cx, by);
  }

  const sf = CAR.speed / CAR.maxSpeed;
  if (sf > 0.65 && Math.random() < 0.10) emitExhaust(cx, HEIGHT - 10);
}

function drawLoadingScreen() {
  const w = WIDTH, h = HEIGHT;
  const progress = assets ? assets.progress : 0;

  ctx.fillStyle = '#091420';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe44d';
  ctx.font = 'bold 52px monospace';
  ctx.fillText('OUTRUN', w / 2, h / 2 - 56);

  // Progress bar track + fill
  const bw = 360, bh = 12, bx = (w - bw) / 2, by = h / 2 - 10;
  ctx.fillStyle = '#1a3a5a';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffe44d';
  ctx.fillRect(bx, by, bw * progress, bh);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px monospace';
  ctx.fillText('LOADING...', w / 2, h / 2 + 22);
  ctx.textAlign = 'left';
}

function drawHUD() {
  const w = WIDTH, h = HEIGHT;
  ctx.font = 'bold 22px monospace';

  // Time (top-left)
  ctx.fillStyle = palette.hud.bg;
  ctx.fillRect(12, 12, 150, 38);
  ctx.fillStyle = timeLeft < 10 ? palette.hud.timeLow : palette.hud.time;
  ctx.textAlign = 'left';
  ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, 22, 39);

  // Distance to next checkpoint (under the clock)
  const toCp = Math.max(0, Math.round((nextCheckpoint - distance) / 100));
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = palette.hud.bg;
  ctx.fillRect(12, 54, 150, 24);
  ctx.fillStyle = palette.hud.checkpoint;
  ctx.fillText(`NEXT CP ${toCp}m`, 22, 71);
  ctx.font = 'bold 22px monospace';

  // Score (top-right)
  ctx.fillStyle = palette.hud.bg;
  ctx.fillRect(w - 212, 12, 200, 38);
  ctx.fillStyle = palette.hud.text;
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${score}`, w - 22, 39);

  // Speed (bottom-right)
  const mph = Math.round(CAR.speed / CAR.maxSpeed * 150);
  ctx.fillStyle = palette.hud.bg;
  ctx.fillRect(w - 132, h - 48, 120, 36);
  ctx.fillStyle = palette.hud.text;
  ctx.fillText(`${mph} MPH`, w - 22, h - 22);
  ctx.textAlign = 'left';

  // Track seed (bottom-left, small) so a layout can be replayed via ?seed=
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = palette.hud.seed;
  ctx.fillText(`SEED ${trackSeed}`, 14, h - 14);
  ctx.font = 'bold 22px monospace';

  // Checkpoint flash (center)
  if (performance.now() < flashUntil) {
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.hud.flash;
    ctx.fillText(flashText, w / 2, 90);
    ctx.textAlign = 'left';
  }
}

function drawGameOver() {
  const w = WIDTH, h = HEIGHT;
  ctx.fillStyle = palette.gameover.overlay;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.fillStyle = palette.gameover.title;
  ctx.font = 'bold 56px monospace';
  ctx.fillText('GAME OVER', w / 2, h / 2 - 30);

  ctx.fillStyle = palette.gameover.text;
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`FINAL SCORE  ${score}`, w / 2, h / 2 + 20);

  ctx.fillStyle = palette.gameover.prompt;
  ctx.font = '20px monospace';
  ctx.fillText('Press R to restart', w / 2, h / 2 + 64);
  ctx.textAlign = 'left';
}

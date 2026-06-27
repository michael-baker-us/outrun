// Main game loop — wires road, scenery, opponents, car, and HUD together,
// plus the timer / score / checkpoint / game-over state machine.

import { buildSegments, projectRoad, drawRoad, TRACK_LENGTH, segmentProjections, getHorizonCurveX } from './road.js';
import { drawBackground } from './sky.js';
import { CAR, initInput, updateCar, drawCar, drawSmoke } from './car.js';
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
  accumulator = 0;
}

// Ordered render layers — background → foreground.
// Phase 5 will insert post-fx passes between layers (e.g. bloom after 'traffic',
// vignette before 'hud'). Keep the array shape stable so that's non-breaking.
const LAYERS = [
  // sky.js uses the previous frame's segmentProjections for parallax — imperceptible lag.
  { name: 'sky',        draw: () => drawBackground(ctx, WIDTH, HEIGHT, getHorizonCurveX()) },
  { name: 'road',       draw: () => drawRoad(ctx, segments, WIDTH, HEIGHT) },
  { name: 'scenery',    draw: () => drawScenery(ctx, segments) },
  { name: 'checkpoint', draw: () => drawCheckpoint(ctx, nextCheckpoint - distance) },
  { name: 'traffic',    draw: () => drawOpponents(ctx, opponents, cameraZ) },
  { name: 'particles',  draw: () => drawSmoke(ctx, WIDTH, HEIGHT) },
  { name: 'player',     draw: () => drawCar(ctx, WIDTH, HEIGHT) },
  { name: 'hud',        draw: () => drawHUD() },
  { name: 'gameover',   draw: () => { if (_state === 'gameover') drawGameOver(); } },
  { name: 'debug',      draw: () => drawDebugOverlay(ctx, WIDTH, HEIGHT, {
      seed: trackSeed, car: CAR,
      segmentsDrawn: segmentProjections.length,
      spritesDrawn: getLastSpriteCount(),
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

  if (_state === 'playing') {
    accumulator += elapsed;
    while (accumulator >= PHYSICS_STEP) {
      update(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
      recordPhysicsStep();
    }
  }

  render();
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

  checkCollisions(opponents, CAR, cameraZ, dt);

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

function render() {
  beginFrame();
  // Pre-pass: project road geometry into segmentProjections (no drawing).
  // sky.js reads segmentProjections for parallax; all draw layers follow.
  projectRoad(segments, cameraZ, CAR.x, WIDTH, HEIGHT);
  for (const layer of LAYERS) layer.draw();
  endFrame();
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

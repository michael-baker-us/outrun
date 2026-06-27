// Main game loop — wires road, scenery, opponents, car, and HUD together,
// plus the timer / score / checkpoint / game-over state machine.

import { buildSegments, drawRoad, TRACK_LENGTH, NUM_SEGMENTS, SEGMENT_LENGTH, segmentProjections } from './road.js';
import { CAR, initInput, updateCar, drawCar, drawSmoke } from './car.js';
import { drawScenery, getLastSpriteCount } from './scenery.js';
import { drawCheckpoint } from './checkpoint.js';
import { buildOpponents, updateOpponents, checkCollisions, drawOpponents } from './opponents.js';
import { initDebug, recordFrameStart, recordPhysicsStep, recordFrameEnd, drawDebugOverlay } from './debug.js';

const WIDTH  = 800;
const HEIGHT = 500;

const START_TIME      = 40;       // seconds on the clock
const CHECKPOINT_TIME = 8;         // bonus seconds per checkpoint
// Checkpoints are spaced so that only good driving banks more time than it
// costs: at top speed a gap takes ~5.5s (net +2.5s), at a sloppy pace ~10s
// (net -2s). Independent of track length so it isn't trivially short.
const CHECKPOINT_GAP  = 50000;    // cumulative distance between checkpoints

// Fixed physics timestep: decouples simulation speed from frame rate so
// physics is identical at 30fps, 60fps, and 144fps.
const PHYSICS_STEP = 1 / 120;

let canvas, ctx, segments, opponents, trackSeed;
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

export function init() {
  canvas = document.getElementById('game');
  canvas.width  = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d');

  // Track seed: ?seed=<n> in the URL replays a specific layout; otherwise random.
  const seedParam = new URLSearchParams(location.search).get('seed');
  trackSeed = (seedParam !== null && /^\d+$/.test(seedParam))
    ? (parseInt(seedParam, 10) >>> 0)
    : (Math.floor(Math.random() * 0xffffffff) >>> 0);
  console.log(`OutRun track seed: ${trackSeed}  (replay with ?seed=${trackSeed})`);

  segments = buildSegments(trackSeed);
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

  // Countdown.
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    _state = 'gameover';
  }
}

function render() {
  drawRoad(ctx, segments, cameraZ, CAR.x, WIDTH, HEIGHT);
  drawScenery(ctx, segments);
  drawCheckpoint(ctx, nextCheckpoint - distance);
  drawOpponents(ctx, opponents, cameraZ);
  drawSmoke(ctx, WIDTH, HEIGHT);
  drawCar(ctx, WIDTH, HEIGHT);
  drawHUD(ctx, WIDTH, HEIGHT);

  if (_state === 'gameover') drawGameOver(ctx, WIDTH, HEIGHT);

  drawDebugOverlay(ctx, WIDTH, HEIGHT, {
    seed: trackSeed,
    car: CAR,
    segmentsDrawn: segmentProjections.length,
    spritesDrawn: getLastSpriteCount(),
  });
}

function drawHUD(ctx, w, h) {
  ctx.font = 'bold 22px monospace';

  // Time (top-left)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(12, 12, 150, 38);
  ctx.fillStyle = timeLeft < 10 ? '#ff4444' : '#ffe44d';
  ctx.textAlign = 'left';
  ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, 22, 39);

  // Distance to next checkpoint (under the clock)
  const toCp = Math.max(0, Math.round((nextCheckpoint - distance) / 100));
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(12, 54, 150, 24);
  ctx.fillStyle = '#cfe8ff';
  ctx.fillText(`NEXT CP ${toCp}m`, 22, 71);
  ctx.font = 'bold 22px monospace';

  // Score (top-right)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(w - 212, 12, 200, 38);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${score}`, w - 22, 39);

  // Speed (bottom-right)
  const mph = Math.round(CAR.speed / CAR.maxSpeed * 150);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(w - 132, h - 48, 120, 36);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${mph} MPH`, w - 22, h - 22);
  ctx.textAlign = 'left';

  // Track seed (bottom-left, small) so a layout can be replayed via ?seed=
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'left';
  ctx.fillText(`SEED ${trackSeed}`, 14, h - 14);
  ctx.font = 'bold 22px monospace';

  // Checkpoint flash (center)
  if (performance.now() < flashUntil) {
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe44d';
    ctx.fillText(flashText, w / 2, 90);
    ctx.textAlign = 'left';
  }
}

function drawGameOver(ctx, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('GAME OVER', w / 2, h / 2 - 30);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`FINAL SCORE  ${score}`, w / 2, h / 2 + 20);

  ctx.fillStyle = '#ffe44d';
  ctx.font = '20px monospace';
  ctx.fillText('Press R to restart', w / 2, h / 2 + 64);
  ctx.textAlign = 'left';
}

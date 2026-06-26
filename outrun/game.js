// Main game loop — wires road, scenery, opponents, car, and HUD together,
// plus the timer / score / checkpoint / game-over state machine.

const WIDTH  = 800;
const HEIGHT = 500;

const START_TIME      = 40;                       // seconds on the clock
const CHECKPOINT_TIME = 8;                         // bonus seconds per checkpoint
const TRACK_LEN       = NUM_SEGMENTS * SEGMENT_LENGTH;
// Checkpoints are spaced so that only good driving banks more time than it
// costs: at top speed a gap takes ~5.5s (net +2.5s), at a sloppy pace ~10s
// (net -2s). Independent of track length so it isn't trivially short.
const CHECKPOINT_GAP  = 50000;                     // cumulative distance between checkpoints

let canvas, ctx, segments, opponents;
let cameraZ, distance, score, timeLeft, state, lastTime;
let nextCheckpoint, flashText, flashUntil;

function init() {
  canvas = document.getElementById('game');
  canvas.width  = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d');

  segments = buildSegments();
  opponents = buildOpponents(8);
  initInput();
  window.addEventListener('keydown', e => {
    if (state === 'gameover' && (e.key === 'r' || e.key === 'R')) resetGame();
  });

  resetGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function resetGame() {
  cameraZ = 0;
  distance = 0;
  score = 0;
  timeLeft = START_TIME;
  state = 'playing';
  nextCheckpoint = CHECKPOINT_GAP;
  flashText = '';
  flashUntil = 0;
  CAR.x = 0;
  CAR.speed = 0;
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp to avoid huge jumps
  lastTime = now;

  if (state === 'playing') update(dt);
  render();

  requestAnimationFrame(loop);
}

function update(dt) {
  updateCar(CAR, dt);
  updateOpponents(opponents, dt);

  cameraZ += CAR.speed * dt;
  if (cameraZ >= TRACK_LEN) cameraZ -= TRACK_LEN;

  distance += CAR.speed * dt;
  score = Math.floor(distance / 100);

  checkCollisions(opponents, CAR, cameraZ);

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
    state = 'gameover';
  }
}

function render() {
  drawRoad(ctx, segments, cameraZ, CAR.x, WIDTH, HEIGHT);
  drawScenery(ctx, segments);
  drawOpponents(ctx, opponents, cameraZ);
  drawCar(ctx, WIDTH, HEIGHT);
  drawHUD(ctx, WIDTH, HEIGHT);

  if (state === 'gameover') drawGameOver(ctx, WIDTH, HEIGHT);
}

function drawHUD(ctx, w, h) {
  ctx.font = 'bold 22px monospace';

  // Time (top-left)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(12, 12, 150, 38);
  ctx.fillStyle = timeLeft < 10 ? '#ff4444' : '#ffe44d';
  ctx.textAlign = 'left';
  ctx.fillText(`TIME ${Math.ceil(timeLeft)}`, 22, 39);

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

window.addEventListener('load', init);

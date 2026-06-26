// Main game loop — wires road, car, and canvas together.

const WIDTH  = 800;
const HEIGHT = 500;

let canvas, ctx, segments, opponents;
let cameraZ = 0;

function init() {
  canvas = document.getElementById('game');
  canvas.width  = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d');

  segments = buildSegments();
  opponents = buildOpponents(8);
  initInput();
  requestAnimationFrame(loop);
}

function loop() {
  updateCar(CAR);
  updateOpponents(opponents);

  // Advance camera by car speed
  cameraZ += CAR.speed;
  if (cameraZ >= NUM_SEGMENTS * SEGMENT_LENGTH) cameraZ -= NUM_SEGMENTS * SEGMENT_LENGTH;

  checkCollisions(opponents, CAR, cameraZ);

  // Compute accumulated curve offset so the road bends around the car
  const startSeg = Math.floor(cameraZ / SEGMENT_LENGTH) % NUM_SEGMENTS;
  let cameraX = CAR.x;
  for (let i = 0; i < DRAW_DISTANCE; i++) {
    const seg = segments[(startSeg + i) % NUM_SEGMENTS];
    cameraX -= seg.curve * 0.0015 * i;
  }

  drawRoad(ctx, segments, cameraZ, cameraX, WIDTH, HEIGHT);
  drawScenery(ctx, segments);
  drawOpponents(ctx, opponents, cameraZ);
  drawCar(ctx, WIDTH, HEIGHT);
  drawHUD(ctx, WIDTH, HEIGHT);

  requestAnimationFrame(loop);
}

function drawHUD(ctx, w, h) {
  const mph = Math.round(CAR.speed / CAR.maxSpeed * 150);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(w - 120, h - 48, 110, 36);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${mph} MPH`, w - 16, h - 20);
  ctx.textAlign = 'left';
}

window.addEventListener('load', init);

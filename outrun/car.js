// Player car state — position and input handling.

const CAR = {
  x:        0,      // lateral position (-1 = far left, 1 = far right)
  speed:    0,      // forward speed (units/frame)
  maxSpeed: 300,
  accel:    10,
  brake:    20,
  decel:    5,      // natural deceleration
  steer:    0.04,
};

const keys = {};

function initInput() {
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup',   e => keys[e.key] = false);
}

function updateCar(car) {
  if (keys['ArrowUp'])   car.speed = Math.min(car.speed + car.accel, car.maxSpeed);
  if (keys['ArrowDown']) car.speed = Math.max(car.speed - car.brake, 0);
  if (!keys['ArrowUp'] && !keys['ArrowDown']) {
    car.speed = Math.max(car.speed - car.decel, 0);
  }

  const steerAmount = car.steer * (car.speed / car.maxSpeed);
  if (keys['ArrowLeft'])  car.x = Math.max(car.x - steerAmount, -1.5);
  if (keys['ArrowRight']) car.x = Math.min(car.x + steerAmount,  1.5);
}

function drawCar(ctx, screenW, screenH) {
  // Simple block car sprite — placeholder until we add a real sprite
  const w = 80, h = 40;
  const x = screenW / 2 - w / 2;
  const y = screenH - h - 40;

  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x, y, w, h);

  // Windshield
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(x + 10, y + 5, w - 20, h * 0.4);

  // Wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 6,      y + h - 12, 14, 12);
  ctx.fillRect(x + w - 8,  y + h - 12, 14, 12);
}

// Weather system: manages rain drops (screen-space), wet-road overlay, and
// physics modifiers (grip) consumed by game.js / car.js.

const RAIN_COUNT = 180;
const _drops     = [];

let _mode = 'clear';

export function setWeather(mode) {
  _mode = mode;
  if (mode === 'rain') _initDrops();
  else _drops.length = 0;
}

export function getWeatherMode() { return _mode; }

export function updateWeather(dt) {
  if (_mode === 'rain') _updateRain(dt);
}

export function drawWeather(ctx, W, H) {
  if (_mode !== 'rain') return;
  _drawRain(ctx, W, H);
  _drawWetRoad(ctx, W, H);
}

// Multiplies car steerRate and brake force — reduced traction in rain.
export function getGripMultiplier() {
  return _mode === 'rain' ? 0.82 : 1.0;
}

// Extra fog density (0..1) additive on top of the normal distance fog.
export function getExtraFogDensity() {
  return _mode === 'rain' ? 0.25 : 0;
}

export function resetWeather() { setWeather('clear'); }

// ---- Internal ---------------------------------------------------------------

function _initDrops() {
  _drops.length = 0;
  for (let i = 0; i < RAIN_COUNT; i++) {
    _drops.push({
      x:     Math.random(),          // 0..1 normalized screen X
      y:     Math.random(),          // 0..1 normalized screen Y
      speed: 0.25 + Math.random() * 0.35, // screen fractions per second
      len:   0.016 + Math.random() * 0.020,
    });
  }
}

function _updateRain(dt) {
  for (const d of _drops) {
    d.y += d.speed * dt;
    d.x += 0.04 * dt; // slight wind drift
    if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
    if (d.x > 1)   d.x -= 1;
  }
}

function _drawRain(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(180,200,255,0.50)';
  ctx.lineWidth   = 1;
  for (const d of _drops) {
    const x   = d.x * W, y = d.y * H, len = d.len * H;
    ctx.beginPath();
    ctx.moveTo(x,               y);
    ctx.lineTo(x + len * 0.28, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function _drawWetRoad(ctx, W, H) {
  const roadTop = H * 0.50;
  ctx.save();
  // Dark wet sheen on the road area
  ctx.fillStyle = 'rgba(15,25,45,0.20)';
  ctx.fillRect(0, roadTop, W, H - roadTop);
  // Subtle horizontal reflections narrowing toward the horizon
  ctx.strokeStyle = 'rgba(160,200,255,0.12)';
  ctx.lineWidth   = 1;
  for (let i = 0; i < 6; i++) {
    const y  = roadTop + (i / 6) * (H - roadTop) * 0.38;
    const sq = i / 6;
    ctx.beginPath();
    ctx.moveTo(W * (0.15 + sq * 0.22), y);
    ctx.lineTo(W * (0.85 - sq * 0.22), y);
    ctx.stroke();
  }
  ctx.restore();
}

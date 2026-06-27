// Player car: dt-based physics, input handling, and a shared 3D-ish car
// renderer used for both the player and opponent traffic.

// Vehicle shape profiles — control roof/body proportions per type.
// roofFrac: roof width as a fraction of car width
// roofHFrac: roof height as a fraction of car height
export const VEHICLE_SHAPES = {
  sports:  { hFrac: 0.60, roofFrac: 0.70, roofHFrac: 0.36 },
  sedan:   { hFrac: 0.65, roofFrac: 0.74, roofHFrac: 0.42 },
  compact: { hFrac: 0.56, roofFrac: 0.66, roofHFrac: 0.38 },
  truck:   { hFrac: 0.75, roofFrac: 0.88, roofHFrac: 0.48 },
};

export const CAR = {
  x:              0,
  speed:          0,
  maxSpeed:       9000,
  accel:          14000,
  brake:          26000,
  decel:          7000,
  steerRate:      1.6,
  offRoadMax:     3000,
  offRoadDrag:    22000,
  spinTime:       0,
  spinDur:        0,
  spinAngle:      0,
  spinTotal:      0,
  spinDir:        1,
  steerInput:     0,     // -1..1, current steer direction used for body lean
  braking:        false, // true while ArrowDown held and car is moving
  invuln:         0,     // seconds of post-crash invulnerability remaining
  gripMultiplier: 1.0,   // set by weather.js — reduces braking and steering in rain
};

export const SPIN_TRIGGER_SPEED = 2500;
const SPIN_BASE_DURATION = 1.25;
const SPIN_DECEL         = 13000;
const SPIN_SKID_RATE     = 1.2;
const INVULN_DURATION    = 1.8; // grace period after spin recovery

export function startSpinOut(car, dir, impactSpeed) {
  const f = Math.min(1, Math.max(0, impactSpeed / car.maxSpeed));
  car.spinDir   = dir || (Math.random() < 0.5 ? -1 : 1);
  car.spinDur   = SPIN_BASE_DURATION + 0.7 * f;
  car.spinTime  = car.spinDur;
  car.spinTotal = (1.5 + 1.5 * f) * 2 * Math.PI;
  car.spinAngle = 0;
  car.invuln    = 0; // clear any existing invuln at crash time
}

const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

export const keys = {};
let tiltSteer = 0;
const TILT_GAIN = 1.4;

export function setTiltSteer(v) { tiltSteer = v; }

export function initInput() {
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });
}

export function updateCar(car, dt) {
  if (car.invuln > 0) car.invuln = Math.max(0, car.invuln - dt);

  if (car.spinTime > 0) {
    car.spinTime -= dt;
    const p = Math.min(1, Math.max(0, 1 - car.spinTime / car.spinDur));
    car.spinAngle = car.spinDir * car.spinTotal * easeOutCubic(p);
    car.speed = Math.max(0, car.speed - SPIN_DECEL * dt);
    car.x += car.spinDir * SPIN_SKID_RATE * dt * (1 - p);
    car.x = Math.max(-2.2, Math.min(2.2, car.x));
    if (car.spinTime <= 0) {
      car.spinTime  = 0;
      car.spinAngle = 0;
      car.invuln    = INVULN_DURATION;
    }
    car.steerInput = 0;
    car.braking    = false;
    return;
  }

  car.braking    = !!(keys['ArrowDown'] && car.speed > 0);
  const rawSteer = (keys['ArrowLeft'] ? -1 : 0) + (keys['ArrowRight'] ? 1 : 0)
                 + (tiltSteer ? Math.max(-1, Math.min(1, tiltSteer)) : 0);
  car.steerInput = Math.max(-1, Math.min(1, rawSteer));

  const grip = car.gripMultiplier ?? 1;
  if (keys['ArrowUp'])  car.speed = Math.min(car.speed + car.accel * dt, car.maxSpeed);
  else if (car.braking) car.speed = Math.max(car.speed - car.brake * grip * dt, 0);
  else                  car.speed = Math.max(car.speed - car.decel * dt, 0);

  const steer = car.steerRate * grip * dt * (car.speed / car.maxSpeed);
  if (keys['ArrowLeft'])  car.x -= steer;
  if (keys['ArrowRight']) car.x += steer;
  if (tiltSteer)          car.x += steer * tiltSteer * TILT_GAIN;
  car.x = Math.max(-2, Math.min(2, car.x));

  if (Math.abs(car.x) > 1 && car.speed > car.offRoadMax) {
    car.speed = Math.max(car.offRoadMax, car.speed - car.offRoadDrag * dt);
  }
}

export function drawCar(ctx, screenW, screenH) {
  // Blink the car during post-crash invulnerability (8 Hz flash)
  if (CAR.invuln > 0 && Math.floor(CAR.invuln * 8) % 2 === 0) return;

  const cx = screenW / 2, by = screenH - 18;
  // Body rolls away from the turn direction (centrifugal feel), max ≈ 2.3°
  const lean = -CAR.steerInput * 0.04;

  ctx.save();
  if (lean !== 0) {
    ctx.translate(cx, by);
    ctx.rotate(lean);
    ctx.translate(-cx, -by);
  }

  if (CAR.spinTime > 0) {
    drawCarSpinning(ctx, cx, by, 120, '#cc2222', CAR.spinAngle);
  } else {
    drawCar3D(ctx, cx, by, 120, '#cc2222');
    if (CAR.braking) drawBrakeLights(ctx, cx, by, 120);
  }

  ctx.restore();
}

// ---- Pre-rendered car sprites -----------------------------------------------
// Each unique (color, type) pair is rendered once to an offscreen canvas and
// blitted every frame — avoids per-frame gradient allocations that hitch the GC.

const CAR_REF_W = 240;
const _carSprites = {};

function getCarSprite(color, type = 'sports') {
  const key = `${color}:${type}`;
  if (_carSprites[key]) return _carSprites[key];
  const sh   = VEHICLE_SHAPES[type] || VEHICLE_SHAPES.sports;
  const w    = CAR_REF_W, h = w * sh.hFrac;
  const padX = w * 0.12, padTop = h * 0.12, padBot = h * 0.22;
  const cw   = Math.ceil(w + padX * 2), ch = Math.ceil(h + padTop + padBot);
  const off  = document.createElement('canvas');
  off.width  = cw; off.height = ch;
  const octx = off.getContext('2d');
  const anchorX = cw / 2, anchorY = ch - Math.ceil(padBot);
  drawCarBody(octx, anchorX, anchorY, w, color, type);
  const sprite = { canvas: off, anchorX, anchorY, w: cw, h: ch };
  _carSprites[key] = sprite;
  return sprite;
}

export function drawCar3D(ctx, cx, bottomY, w, color, type = 'sports') {
  const sp    = getCarSprite(color, type);
  const scale = w / CAR_REF_W;
  ctx.drawImage(sp.canvas,
    cx - sp.anchorX * scale, bottomY - sp.anchorY * scale,
    sp.w * scale, sp.h * scale);
}

// Bright red circles over the approximate tail light positions.
// Using solid fills (no radial gradients) to avoid per-frame allocations.
export function drawBrakeLights(ctx, cx, bottomY, w, type = 'sports') {
  const sh = VEHICLE_SHAPES[type] || VEHICLE_SHAPES.sports;
  const h  = w * sh.hFrac;
  const r  = w * 0.09;
  const ly = bottomY - h * 0.55;
  const lx = cx - w * 0.36, rx = cx + w * 0.36;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle   = '#ff2020';
  ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(rx, ly, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Soft additive glow around tail lights — visible at night (nightFactor > 0).
// Uses 'lighter' composite mode; caller must be inside a save/restore if needed.
export function drawTailLightGlow(ctx, cx, bottomY, w, type, nightFactor) {
  if (nightFactor < 0.08) return;
  const sh  = VEHICLE_SHAPES[type] || VEHICLE_SHAPES.sports;
  const h   = w * sh.hFrac;
  const ly  = bottomY - h * 0.55;
  const lx  = cx - w * 0.36, rx = cx + w * 0.36;
  const r   = w * 0.30;
  const a   = (nightFactor * 0.55).toFixed(2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const x of [lx, rx]) {
    const g = ctx.createRadialGradient(x, ly, 0, x, ly, r);
    g.addColorStop(0, `rgba(255,30,30,${a})`);
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, ly, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Spin-out render: horizontal squash simulates yaw rotation, lean peaks side-on.
function drawCarSpinning(ctx, cx, bottomY, w, color, angle) {
  const sp    = getCarSprite(color); // player is always sports type
  const scale = w / CAR_REF_W;
  const yaw   = Math.cos(angle);
  const lean  = 0.28 * Math.sin(angle);
  ctx.save();
  ctx.translate(cx, bottomY);
  ctx.rotate(lean);
  ctx.scale(yaw, 1);
  ctx.drawImage(sp.canvas,
    -sp.anchorX * scale, -sp.anchorY * scale,
    sp.w * scale, sp.h * scale);
  ctx.restore();
}

function drawCarBody(ctx, cx, bottomY, w, baseColor, type = 'sports') {
  const sh   = VEHICLE_SHAPES[type] || VEHICLE_SHAPES.sports;
  const h    = w * sh.hFrac;
  const left = cx - w / 2;
  const top  = bottomY - h;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, bottomY - h * 0.03, w * 0.56, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tires
  const tireW = w * 0.17, tireH = h * 0.30;
  ctx.fillStyle = '#0b0b0b';
  roundRect(ctx, left - tireW * 0.2,     bottomY - tireH, tireW, tireH, 3);
  roundRect(ctx, left + w - tireW * 0.8, bottomY - tireH, tireW, tireH, 3);

  // Lower bumper (darkest)
  const bumpH = h * 0.22;
  ctx.fillStyle = shade(baseColor, -0.45);
  roundRect(ctx, left, bottomY - bumpH - h * 0.04, w, bumpH, 4);

  // Main body with vertical gradient
  const bodyTop = top + h * 0.30;
  const bodyH   = h * 0.50;
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  bodyGrad.addColorStop(0,   shade(baseColor, 0.28));
  bodyGrad.addColorStop(0.5, baseColor);
  bodyGrad.addColorStop(1,   shade(baseColor, -0.28));
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, left, bodyTop, w, bodyH, 6);

  // Roof / greenhouse — shape varies by vehicle type
  const roofW = w * sh.roofFrac, roofH = h * sh.roofHFrac;
  const roofX = cx - roofW / 2;
  const roofGrad = ctx.createLinearGradient(0, top, 0, top + roofH);
  roofGrad.addColorStop(0, shade(baseColor, 0.12));
  roofGrad.addColorStop(1, shade(baseColor, -0.12));
  ctx.fillStyle = roofGrad;
  roundRect(ctx, roofX, top, roofW, roofH + h * 0.08, 6);

  // Rear window
  const winW = roofW * 0.78, winH = roofH * 0.66;
  const winGrad = ctx.createLinearGradient(0, top + roofH * 0.18, 0, top + roofH * 0.18 + winH);
  winGrad.addColorStop(0, '#46597a');
  winGrad.addColorStop(1, '#10141f');
  ctx.fillStyle = winGrad;
  roundRect(ctx, cx - winW / 2, top + roofH * 0.18, winW, winH, 4);

  // Tail lights with glowing cores
  const tlW = w * 0.16, tlH = bodyH * 0.42;
  const tlY = bodyTop + bodyH * 0.30;
  ctx.fillStyle = '#cc1414';
  roundRect(ctx, left + w * 0.06,              tlY, tlW, tlH, 3);
  roundRect(ctx, left + w * 0.94 - tlW,        tlY, tlW, tlH, 3);
  ctx.fillStyle = 'rgba(255,170,150,0.95)';
  roundRect(ctx, left + w * 0.06 + tlW * 0.28, tlY + tlH * 0.28, tlW * 0.44, tlH * 0.4, 2);
  roundRect(ctx, left + w * 0.94 - tlW * 0.72, tlY + tlH * 0.28, tlW * 0.44, tlH * 0.4, 2);

  // Roof highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth   = Math.max(1, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(roofX + 4,         top + 2);
  ctx.lineTo(roofX + roofW - 4, top + 2);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
  ctx.fill();
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (pct >= 0) { r += (255 - r) * pct; g += (255 - g) * pct; b += (255 - b) * pct; }
  else          { r *= (1 + pct);        g *= (1 + pct);        b *= (1 + pct);       }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// Player car: dt-based physics, input handling, and a shared 3D-ish car
// renderer used for both the player and opponent traffic.

// Vehicle shape profiles — control roof/body proportions per type.
// Special vehicles supply drawFn:true; drawCarBody dispatches to the matching
// draw function below instead of running the generic car body code.
export const VEHICLE_SHAPES = {
  sports:     { hFrac: 0.60, roofFrac: 0.70, roofHFrac: 0.36 },
  sedan:      { hFrac: 0.65, roofFrac: 0.74, roofHFrac: 0.42 },
  compact:    { hFrac: 0.56, roofFrac: 0.66, roofHFrac: 0.38 },
  truck:      { hFrac: 0.75, roofFrac: 0.88, roofHFrac: 0.48 },
  jetski:     { hFrac: 1.30, drawFn: true },
  powerboat:  { hFrac: 1.10, drawFn: true },
  spacecart:  { hFrac: 0.60, drawFn: true },
  aliencraft: { hFrac: 0.52, drawFn: true },
  dirtbike:   { hFrac: 1.55, drawFn: true },
  atv:        { hFrac: 1.20, drawFn: true },
};

export const CAR = {
  x:              0,
  speed:          0,
  maxSpeed:       9000,
  accel:          4800,   // lower than raw feels; taper in updateCar makes low-end punchy
  brake:          26000,
  decel:          7000,
  vehicleType:    'sports',
  vehicleColor:   '#cc2222',
  steerRate:      1.6,
  steerDrag:      2000,   // speed scrubbed per second at full steer lock (proportional to sf)
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
  if (keys['ArrowUp']) {
    // Taper acceleration so low-end feels punchy but top speed is hard-earned (~3.5 s 0→max)
    const sf = car.speed / car.maxSpeed;
    car.speed = Math.min(car.speed + car.accel * (1 - sf * 0.80) * dt, car.maxSpeed);
  } else if (car.braking) {
    car.speed = Math.max(car.speed - car.brake * grip * dt, 0);
  } else {
    car.speed = Math.max(car.speed - car.decel * dt, 0);
  }

  // Cornering drag: turning scrubs speed proportional to steer amount × current speed fraction
  if (car.steerInput !== 0 && car.steerDrag) {
    const sf = car.speed / car.maxSpeed;
    car.speed = Math.max(0, car.speed - Math.abs(car.steerInput) * car.steerDrag * sf * dt);
  }

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
  if (CAR.invuln > 0 && Math.floor(CAR.invuln * 8) % 2 === 0) return;

  const cx = screenW / 2, by = screenH - 18;
  const vt = CAR.vehicleType  ?? 'sports';
  const vc = CAR.vehicleColor ?? '#cc2222';
  const lean = -CAR.steerInput * 0.04;

  ctx.save();
  if (lean !== 0) {
    ctx.translate(cx, by);
    ctx.rotate(lean);
    ctx.translate(-cx, -by);
  }

  if (CAR.spinTime > 0) {
    drawCarSpinning(ctx, cx, by, 120, vc, CAR.spinAngle, vt);
  } else {
    drawCar3D(ctx, cx, by, 120, vc, vt);
    if (CAR.braking) drawBrakeLights(ctx, cx, by, 120, vt);
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
function drawCarSpinning(ctx, cx, bottomY, w, color, angle, type = 'sports') {
  const sp    = getCarSprite(color, type);
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
  const sh = VEHICLE_SHAPES[type] || VEHICLE_SHAPES.sports;
  if (sh.drawFn) {
    _drawSpecialVehicle(ctx, cx, bottomY, w, baseColor, type);
    return;
  }
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

// ---- Special vehicle drawing -------------------------------------------------

function _drawSpecialVehicle(ctx, cx, bottomY, w, color, type) {
  switch (type) {
    case 'jetski':     return _drawJetski(ctx, cx, bottomY, w, color);
    case 'powerboat':  return _drawPowerboat(ctx, cx, bottomY, w, color);
    case 'spacecart':  return _drawSpacecart(ctx, cx, bottomY, w, color);
    case 'aliencraft': return _drawAliencaft(ctx, cx, bottomY, w, color);
    case 'dirtbike':   return _drawDirtbike(ctx, cx, bottomY, w, color);
    case 'atv':        return _drawAtv(ctx, cx, bottomY, w, color);
  }
}

function _drawJetski(ctx, cx, bottomY, w, color) {
  const left = cx - w / 2;

  // === WATER WAKE ===
  // Wide V-spray behind the hull
  ctx.fillStyle = 'rgba(200,240,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(cx, bottomY + 2);
  ctx.lineTo(cx - w * 0.55, bottomY + 8);
  ctx.lineTo(cx - w * 0.38, bottomY + 2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, bottomY + 2);
  ctx.lineTo(cx + w * 0.55, bottomY + 8);
  ctx.lineTo(cx + w * 0.38, bottomY + 2);
  ctx.closePath(); ctx.fill();

  // Foam spray ellipses on the flanks
  ctx.fillStyle = 'rgba(220,245,255,0.40)';
  ctx.beginPath(); ctx.ellipse(cx - w * 0.30, bottomY + 1, w * 0.20, w * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + w * 0.30, bottomY + 1, w * 0.20, w * 0.045, 0, 0, Math.PI * 2); ctx.fill();

  // Water shadow
  ctx.fillStyle = 'rgba(0,40,80,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY - 4, w * 0.48, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();

  // === HULL ===
  const hullH = w * 0.38;
  const hullTop = bottomY - hullH;

  // Hull body — wide trapezoidal shape
  const hGrad = ctx.createLinearGradient(0, hullTop, 0, bottomY);
  hGrad.addColorStop(0,   shade(color, 0.28));
  hGrad.addColorStop(0.5, color);
  hGrad.addColorStop(1,   shade(color, -0.45));
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.moveTo(left + w * 0.03, bottomY - hullH * 0.12);
  ctx.lineTo(left + w * 0.97, bottomY - hullH * 0.12);
  ctx.lineTo(left + w * 0.84, hullTop);
  ctx.lineTo(left + w * 0.16, hullTop);
  ctx.closePath(); ctx.fill();

  // Hull deck stripe (lighter accent)
  ctx.fillStyle = shade(color, 0.18);
  ctx.fillRect(left + w * 0.16, hullTop, w * 0.68, hullH * 0.12);

  // Engine cowling (raised center section)
  ctx.fillStyle = shade(color, -0.25);
  roundRect(ctx, left + w * 0.28, bottomY - hullH * 0.58, w * 0.44, hullH * 0.38, 4);

  // Windshield (blue tinted, raked back)
  ctx.fillStyle = 'rgba(80,200,255,0.60)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, hullTop);
  ctx.lineTo(cx + w * 0.20, hullTop);
  ctx.lineTo(cx + w * 0.15, hullTop + hullH * 0.34);
  ctx.lineTo(cx - w * 0.15, hullTop + hullH * 0.34);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(200,240,255,0.45)'; ctx.lineWidth = Math.max(1, w * 0.014);
  ctx.stroke();

  // Navigation lights
  ctx.fillStyle = '#ff3300';
  ctx.beginPath(); ctx.arc(left + w * 0.09, bottomY - hullH * 0.28, Math.max(2, w * 0.040), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#00cc44';
  ctx.beginPath(); ctx.arc(left + w * 0.91, bottomY - hullH * 0.28, Math.max(2, w * 0.040), 0, Math.PI * 2); ctx.fill();

  // === RIDER ===
  const seatY = hullTop + hullH * 0.10;

  // Torso — wetsuit / life jacket
  const suitCol = shade(color, 0.12);
  const torsoGrad = ctx.createLinearGradient(0, seatY - w * 0.70, 0, seatY);
  torsoGrad.addColorStop(0, shade(suitCol, 0.20));
  torsoGrad.addColorStop(1, shade(suitCol, -0.24));
  ctx.fillStyle = torsoGrad;
  roundRect(ctx, cx - w * 0.21, seatY - w * 0.70, w * 0.42, w * 0.64, 6);

  // Life-jacket bright accents
  ctx.fillStyle = 'rgba(255,200,0,0.75)';
  roundRect(ctx, cx - w * 0.20, seatY - w * 0.60, w * 0.06, w * 0.38, 2);
  roundRect(ctx, cx + w * 0.14, seatY - w * 0.60, w * 0.06, w * 0.38, 2);

  // Arms reaching forward to bars
  ctx.strokeStyle = suitCol; ctx.lineWidth = Math.max(4, w * 0.050); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, seatY - w * 0.52);
  ctx.quadraticCurveTo(cx - w * 0.25, seatY - w * 0.64, cx - w * 0.30, seatY - w * 0.74);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.18, seatY - w * 0.52);
  ctx.quadraticCurveTo(cx + w * 0.25, seatY - w * 0.64, cx + w * 0.30, seatY - w * 0.74);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Handlebars (narrow — jetski bars are close together)
  ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(2.5, w * 0.034); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - w * 0.34, seatY - w * 0.76); ctx.lineTo(cx + w * 0.34, seatY - w * 0.76); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(3, w * 0.044);
  ctx.beginPath(); ctx.moveTo(cx - w * 0.34, seatY - w * 0.76); ctx.lineTo(cx - w * 0.26, seatY - w * 0.76); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.26, seatY - w * 0.76); ctx.lineTo(cx + w * 0.34, seatY - w * 0.76); ctx.stroke();
  ctx.lineCap = 'butt';

  // Helmet — watersports style (rounded, visor)
  const helCy = seatY - w * 1.00;
  const helR  = w * 0.18;
  const helG  = ctx.createRadialGradient(cx - helR * 0.32, helCy - helR * 0.28, helR * 0.08,
                                          cx, helCy, helR);
  helG.addColorStop(0,   '#ffffff');
  helG.addColorStop(0.25, shade(color, 0.40));
  helG.addColorStop(0.72, color);
  helG.addColorStop(1,   shade(color, -0.48));
  ctx.fillStyle = helG;
  ctx.beginPath(); ctx.arc(cx, helCy, helR, 0, Math.PI * 2); ctx.fill();

  // Visor (larger for water sport — full face coverage)
  ctx.fillStyle = 'rgba(10,140,220,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx, helCy + helR * 0.24, helR * 0.72, helR * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(cx - helR * 0.15, helCy - helR * 0.35, helR * 0.28, helR * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
}

function _drawPowerboat(ctx, cx, bottomY, w, color) {
  const left = cx - w / 2;

  // === WAKE & WATER ===
  // Wide V-spray
  ctx.fillStyle = 'rgba(200,240,255,0.50)';
  ctx.beginPath();
  ctx.moveTo(cx, bottomY + 2);
  ctx.lineTo(cx - w * 0.62, bottomY + 12);
  ctx.lineTo(cx - w * 0.42, bottomY + 2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, bottomY + 2);
  ctx.lineTo(cx + w * 0.62, bottomY + 12);
  ctx.lineTo(cx + w * 0.42, bottomY + 2);
  ctx.closePath(); ctx.fill();

  // Rooster-tail engine exhaust water plumes
  ctx.fillStyle = 'rgba(200,235,255,0.35)';
  ctx.beginPath(); ctx.ellipse(cx - w * 0.22, bottomY + 1, w * 0.12, w * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + w * 0.22, bottomY + 1, w * 0.12, w * 0.04, 0, 0, Math.PI * 2); ctx.fill();

  // Water shadow
  ctx.fillStyle = 'rgba(0,40,80,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY - 2, w * 0.54, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();

  // === HULL ===
  const hullH = w * 0.38;
  const hullTop = bottomY - hullH;

  // Wide flat racing hull
  const hGrad = ctx.createLinearGradient(0, hullTop, 0, bottomY);
  hGrad.addColorStop(0,   shade(color, 0.30));
  hGrad.addColorStop(0.6, color);
  hGrad.addColorStop(1,   shade(color, -0.48));
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.moveTo(left + w * 0.01, bottomY - hullH * 0.08);
  ctx.lineTo(left + w * 0.99, bottomY - hullH * 0.08);
  ctx.lineTo(left + w * 0.92, hullTop);
  ctx.lineTo(left + w * 0.08, hullTop);
  ctx.closePath(); ctx.fill();

  // Deck line (white racing stripe)
  ctx.fillStyle = '#e8e8d0';
  ctx.fillRect(left + w * 0.08, hullTop, w * 0.84, hullH * 0.10);

  // Open cockpit recess
  ctx.fillStyle = shade(color, -0.35);
  roundRect(ctx, left + w * 0.28, hullTop + hullH * 0.08, w * 0.44, hullH * 0.42, 4);

  // Cockpit windscreen (low, raked)
  ctx.fillStyle = 'rgba(80,165,230,0.62)';
  ctx.beginPath();
  ctx.moveTo(left + w * 0.28, hullTop + hullH * 0.08);
  ctx.lineTo(left + w * 0.72, hullTop + hullH * 0.08);
  ctx.lineTo(left + w * 0.68, hullTop + hullH * 0.20);
  ctx.lineTo(left + w * 0.32, hullTop + hullH * 0.20);
  ctx.closePath(); ctx.fill();

  // Dual engines (rear, prominent)
  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, left + w * 0.12, bottomY - hullH * 0.30, w * 0.22, hullH * 0.28, 3);
  roundRect(ctx, left + w * 0.66, bottomY - hullH * 0.30, w * 0.22, hullH * 0.28, 3);
  // Engine cowlings (colored)
  ctx.fillStyle = shade(color, -0.22);
  roundRect(ctx, left + w * 0.13, bottomY - hullH * 0.28, w * 0.20, hullH * 0.18, 2);
  roundRect(ctx, left + w * 0.67, bottomY - hullH * 0.28, w * 0.20, hullH * 0.18, 2);
  // Exhaust ports
  ctx.fillStyle = '#555';
  ctx.beginPath(); ctx.arc(left + w * 0.19, bottomY - hullH * 0.06, Math.max(2, w * 0.030), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(left + w * 0.81, bottomY - hullH * 0.06, Math.max(2, w * 0.030), 0, Math.PI * 2); ctx.fill();

  // Nav lights
  ctx.fillStyle = '#ff3300';
  ctx.beginPath(); ctx.arc(left + w * 0.07, bottomY - hullH * 0.32, Math.max(2, w * 0.038), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#00cc44';
  ctx.beginPath(); ctx.arc(left + w * 0.93, bottomY - hullH * 0.32, Math.max(2, w * 0.038), 0, Math.PI * 2); ctx.fill();

  // === DRIVER ===
  const seatY = hullTop + hullH * 0.48;

  // Lower body (seated, barely visible above cockpit)
  const jerseyCol = shade(color, 0.14);
  ctx.fillStyle = shade(jerseyCol, -0.10);
  roundRect(ctx, cx - w * 0.14, seatY - w * 0.08, w * 0.28, w * 0.10, 3);

  // Torso (upright in cockpit, visible above windscreen)
  const torsoGrad = ctx.createLinearGradient(0, seatY - w * 0.72, 0, seatY);
  torsoGrad.addColorStop(0, shade(jerseyCol, 0.22));
  torsoGrad.addColorStop(1, shade(jerseyCol, -0.22));
  ctx.fillStyle = torsoGrad;
  roundRect(ctx, cx - w * 0.18, seatY - w * 0.72, w * 0.36, w * 0.66, 5);

  // Racing suit detail — coloured arm panels
  ctx.fillStyle = 'rgba(255,255,255,0.70)';
  roundRect(ctx, cx - w * 0.17, seatY - w * 0.58, w * 0.05, w * 0.36, 2);
  roundRect(ctx, cx + w * 0.12, seatY - w * 0.58, w * 0.05, w * 0.36, 2);

  // Arms on steering wheel
  ctx.strokeStyle = jerseyCol; ctx.lineWidth = Math.max(4, w * 0.048); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.15, seatY - w * 0.50);
  ctx.quadraticCurveTo(cx - w * 0.22, seatY - w * 0.62, cx - w * 0.20, seatY - w * 0.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.15, seatY - w * 0.50);
  ctx.quadraticCurveTo(cx + w * 0.22, seatY - w * 0.62, cx + w * 0.20, seatY - w * 0.75);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Steering wheel (small, round — powerboat style)
  ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2, w * 0.026);
  ctx.beginPath(); ctx.arc(cx, seatY - w * 0.78, w * 0.10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, seatY - w * 0.68); ctx.lineTo(cx, seatY - w * 0.88); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - w * 0.09, seatY - w * 0.78); ctx.lineTo(cx + w * 0.09, seatY - w * 0.78); ctx.stroke();

  // Helmet — full racing helmet, lower profile
  const helCy = seatY - w * 1.00;
  const helR  = w * 0.18;
  const helG  = ctx.createRadialGradient(cx - helR * 0.30, helCy - helR * 0.26, helR * 0.08,
                                          cx, helCy, helR);
  helG.addColorStop(0,   '#ffffff');
  helG.addColorStop(0.26, shade(color, 0.40));
  helG.addColorStop(0.72, color);
  helG.addColorStop(1,   shade(color, -0.46));
  ctx.fillStyle = helG;
  ctx.beginPath(); ctx.arc(cx, helCy, helR, 0, Math.PI * 2); ctx.fill();

  // Visor
  ctx.fillStyle = 'rgba(20,100,200,0.76)';
  ctx.beginPath();
  ctx.ellipse(cx, helCy + helR * 0.22, helR * 0.70, helR * 0.30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Chin spoiler
  ctx.fillStyle = shade(color, -0.20);
  ctx.beginPath();
  ctx.moveTo(cx - helR * 0.62, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.62, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.72, helCy + helR * 0.16);
  ctx.lineTo(cx - helR * 0.72, helCy + helR * 0.16);
  ctx.closePath(); ctx.fill();

  // Helmet highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(cx - helR * 0.16, helCy - helR * 0.34, helR * 0.26, helR * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
}

function _drawSpacecart(ctx, cx, bottomY, w, color) {
  const h = w * 0.60, left = cx - w / 2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY, w * 0.48, w * 0.09, 0, 0, Math.PI * 2); ctx.fill();

  // Thruster glow
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#88aaff';
  ctx.beginPath(); ctx.ellipse(cx - w * 0.28, bottomY - h * 0.06, w * 0.10, w * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + w * 0.28, bottomY - h * 0.06, w * 0.10, w * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Wing panels
  ctx.fillStyle = shade(color, -0.22);
  ctx.fillRect(left - w * 0.12, bottomY - h * 0.38, w * 0.16, h * 0.22);
  ctx.fillRect(left + w * 0.96, bottomY - h * 0.38, w * 0.16, h * 0.22);

  // Main body
  const bGrad = ctx.createLinearGradient(0, bottomY - h * 0.7, 0, bottomY - h * 0.08);
  bGrad.addColorStop(0, shade(color, 0.30)); bGrad.addColorStop(0.5, color); bGrad.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = bGrad;
  roundRect(ctx, left + w * 0.06, bottomY - h * 0.66, w * 0.88, h * 0.58, 6);

  // Neon accent stripe
  ctx.strokeStyle = '#44ccff'; ctx.lineWidth = Math.max(1.5, w * 0.024);
  ctx.beginPath(); ctx.moveTo(left + w * 0.10, bottomY - h * 0.66); ctx.lineTo(left + w * 0.90, bottomY - h * 0.66); ctx.stroke();

  // Dome canopy
  const dGrad = ctx.createRadialGradient(cx - w * 0.07, bottomY - h * 0.84, 0, cx, bottomY - h * 0.72, w * 0.30);
  dGrad.addColorStop(0, 'rgba(210,235,255,0.88)');
  dGrad.addColorStop(0.5, 'rgba(100,180,255,0.45)');
  dGrad.addColorStop(1, 'rgba(40,90,200,0.18)');
  ctx.fillStyle = dGrad;
  ctx.beginPath(); ctx.ellipse(cx, bottomY - h * 0.72, w * 0.30, h * 0.24, 0, Math.PI, 0); ctx.fill();

  // Rear neon lights
  ctx.fillStyle = '#00aaff';
  roundRect(ctx, left + w * 0.07, bottomY - h * 0.37, w * 0.15, h * 0.12, 2);
  roundRect(ctx, left + w * 0.78, bottomY - h * 0.37, w * 0.15, h * 0.12, 2);
}

function _drawAliencaft(ctx, cx, bottomY, w, color) {
  const h = w * 0.52, left = cx - w / 2;

  // Underside glow
  const glowGrad = ctx.createRadialGradient(cx, bottomY - h * 0.20, 0, cx, bottomY - h * 0.20, w * 0.52);
  glowGrad.addColorStop(0, 'rgba(120,255,80,0.38)'); glowGrad.addColorStop(1, 'rgba(120,255,80,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.ellipse(cx, bottomY - h * 0.20, w * 0.52, h * 0.30, 0, 0, Math.PI * 2); ctx.fill();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY, w * 0.50, w * 0.08, 0, 0, Math.PI * 2); ctx.fill();

  // Disc body
  const bGrad = ctx.createLinearGradient(0, bottomY - h * 0.62, 0, bottomY - h * 0.10);
  bGrad.addColorStop(0, shade(color, 0.42)); bGrad.addColorStop(0.4, color); bGrad.addColorStop(1, shade(color, -0.50));
  ctx.fillStyle = bGrad;
  ctx.beginPath(); ctx.ellipse(cx, bottomY - h * 0.30, w * 0.50, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();

  // Upper dome
  ctx.fillStyle = shade(color, 0.18);
  ctx.beginPath(); ctx.ellipse(cx, bottomY - h * 0.52, w * 0.22, h * 0.22, 0, Math.PI, 0); ctx.fill();

  // Glowing ring
  ctx.strokeStyle = '#80ff60'; ctx.lineWidth = Math.max(2, w * 0.026); ctx.globalAlpha = 0.82;
  ctx.beginPath(); ctx.ellipse(cx, bottomY - h * 0.30, w * 0.46, h * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Rim lights
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI;
    const lx = cx + Math.cos(Math.PI + t) * w * 0.40;
    const ly = bottomY - h * 0.30 + Math.sin(Math.PI + t) * h * 0.08;
    ctx.fillStyle = i % 2 === 0 ? '#ff4400' : '#00ff88';
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(2, w * 0.032), 0, Math.PI * 2); ctx.fill();
  }
}

function _drawDirtbike(ctx, cx, bottomY, w, color) {
  // From-behind perspective: rear wheel prominent, rider visible above
  const wheelR = w * 0.24;
  const wheelCy = bottomY - wheelR * 0.90;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY, w * 0.30, w * 0.06, 0, 0, Math.PI * 2); ctx.fill();

  // Rear tyre — chunky knob tread
  ctx.fillStyle = '#0e0e0e';
  ctx.beginPath(); ctx.arc(cx, wheelCy, wheelR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#282828'; ctx.lineWidth = Math.max(1.5, w * 0.024);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + wheelR * 0.70 * Math.cos(a), wheelCy + wheelR * 0.70 * Math.sin(a));
    ctx.lineTo(cx + wheelR * 0.96 * Math.cos(a), wheelCy + wheelR * 0.96 * Math.sin(a));
    ctx.stroke();
  }

  // Rim + spokes
  ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = Math.max(2, w * 0.026);
  ctx.beginPath(); ctx.arc(cx, wheelCy, wheelR * 0.60, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.010);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + wheelR * 0.13 * Math.cos(a), wheelCy + wheelR * 0.13 * Math.sin(a));
    ctx.lineTo(cx + wheelR * 0.58 * Math.cos(a), wheelCy + wheelR * 0.58 * Math.sin(a));
    ctx.stroke();
  }
  ctx.fillStyle = '#bbbbbb';
  ctx.beginPath(); ctx.arc(cx, wheelCy, wheelR * 0.13, 0, Math.PI * 2); ctx.fill();

  // Swing-arm stubs on each side
  ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(2.5, w * 0.032);
  ctx.beginPath();
  ctx.moveTo(cx - wheelR * 0.75, wheelCy - wheelR * 0.30);
  ctx.lineTo(cx - w * 0.16, wheelCy - wheelR * 1.30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + wheelR * 0.75, wheelCy - wheelR * 0.30);
  ctx.lineTo(cx + w * 0.16, wheelCy - wheelR * 1.30);
  ctx.stroke();

  // Rear fender in bike colour
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, wheelCy, wheelR * 1.16, Math.PI * 1.10, Math.PI * 1.90);
  ctx.lineTo(cx + w * 0.18, wheelCy - wheelR * 1.28);
  ctx.lineTo(cx - w * 0.18, wheelCy - wheelR * 1.28);
  ctx.closePath(); ctx.fill();

  // Number plate (bright, highly visible)
  const plateTop = wheelCy - wheelR * 1.52;
  ctx.fillStyle = '#fff200';
  roundRect(ctx, cx - w * 0.14, plateTop, w * 0.28, wheelR * 0.42, 3);
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${Math.max(7, w * 0.085)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('MX', cx, plateTop + wheelR * 0.21);
  ctx.textBaseline = 'alphabetic';

  // Main body / frame above number plate
  const bodyBot = plateTop - wheelR * 0.08;
  const bodyGrad = ctx.createLinearGradient(0, bodyBot - wheelR * 0.95, 0, bodyBot);
  bodyGrad.addColorStop(0, shade(color, 0.18)); bodyGrad.addColorStop(1, shade(color, -0.28));
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - w * 0.19, bodyBot - wheelR * 0.90, w * 0.38, wheelR * 0.82, 5);

  // Exhaust pipes (one each side, angling down-out)
  ctx.strokeStyle = '#888'; ctx.lineWidth = Math.max(2.5, w * 0.038); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, wheelCy - wheelR * 0.55);
  ctx.quadraticCurveTo(cx - w * 0.35, wheelCy, cx - w * 0.42, wheelCy + wheelR * 0.10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.18, wheelCy - wheelR * 0.55);
  ctx.quadraticCurveTo(cx + w * 0.35, wheelCy, cx + w * 0.42, wheelCy + wheelR * 0.10);
  ctx.stroke();
  // Exhaust end caps (darker)
  ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(3, w * 0.046);
  ctx.beginPath(); ctx.arc(cx - w * 0.42, wheelCy + wheelR * 0.10, 1, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + w * 0.42, wheelCy + wheelR * 0.10, 1, 0, Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'butt';

  // === RIDER ===
  const seatY = bodyBot - wheelR * 0.88;

  // Torso / jersey
  const jerseyCol = shade(color, 0.15);
  const jerGrad = ctx.createLinearGradient(0, seatY - wheelR * 0.95, 0, seatY);
  jerGrad.addColorStop(0, shade(jerseyCol, 0.22)); jerGrad.addColorStop(1, shade(jerseyCol, -0.22));
  ctx.fillStyle = jerGrad;
  roundRect(ctx, cx - w * 0.22, seatY - wheelR * 0.95, w * 0.44, wheelR * 0.88, 6);

  // Jersey number block (white)
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  roundRect(ctx, cx - w * 0.09, seatY - wheelR * 0.75, w * 0.18, wheelR * 0.34, 2);

  // Arms extending outward to bars
  ctx.strokeStyle = jerseyCol; ctx.lineWidth = Math.max(4, w * 0.052); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, seatY - wheelR * 0.60);
  ctx.quadraticCurveTo(cx - w * 0.30, seatY - wheelR * 0.72, cx - w * 0.40, seatY - wheelR * 0.90);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.20, seatY - wheelR * 0.60);
  ctx.quadraticCurveTo(cx + w * 0.30, seatY - wheelR * 0.72, cx + w * 0.40, seatY - wheelR * 0.90);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Handlebars
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = Math.max(3, w * 0.040); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - w * 0.46, seatY - wheelR * 0.93); ctx.lineTo(cx + w * 0.46, seatY - wheelR * 0.93); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(4, w * 0.052);
  ctx.beginPath(); ctx.moveTo(cx - w * 0.46, seatY - wheelR * 0.93); ctx.lineTo(cx - w * 0.36, seatY - wheelR * 0.93); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.36, seatY - wheelR * 0.93); ctx.lineTo(cx + w * 0.46, seatY - wheelR * 0.93); ctx.stroke();
  ctx.lineCap = 'butt';

  // Helmet
  const helCy = seatY - wheelR * 1.32;
  const helR  = w * 0.17;
  const helG  = ctx.createRadialGradient(cx - helR * 0.35, helCy - helR * 0.30, helR * 0.08,
                                          cx, helCy, helR);
  helG.addColorStop(0,   '#ffffff');
  helG.addColorStop(0.25, shade(color, 0.45));
  helG.addColorStop(0.75, color);
  helG.addColorStop(1,   shade(color, -0.50));
  ctx.fillStyle = helG;
  ctx.beginPath(); ctx.arc(cx, helCy, helR, 0, Math.PI * 2); ctx.fill();

  // Visor
  ctx.fillStyle = 'rgba(20,60,160,0.80)';
  ctx.beginPath();
  ctx.ellipse(cx, helCy + helR * 0.22, helR * 0.70, helR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Chin guard / peak brim
  ctx.fillStyle = shade(color, -0.18);
  ctx.beginPath();
  ctx.moveTo(cx - helR * 0.60, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.60, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.70, helCy + helR * 0.14);
  ctx.lineTo(cx - helR * 0.70, helCy + helR * 0.14);
  ctx.closePath(); ctx.fill();

  // Helmet highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.ellipse(cx - helR * 0.18, helCy - helR * 0.35, helR * 0.30, helR * 0.18, -0.3, 0, Math.PI * 2); ctx.fill();
}

function _drawAtv(ctx, cx, bottomY, w, color) {
  const left = cx - w / 2;
  const wR   = w * 0.20;          // rear wheel radius
  const wheelY = bottomY - wR * 0.88;
  const lx = left + w * 0.12, rx = left + w * 0.88;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, bottomY, w * 0.52, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();

  function drawWheel(wx) {
    // Chunky off-road tyre
    ctx.fillStyle = '#0e0e0e';
    ctx.beginPath(); ctx.arc(wx, wheelY, wR, 0, Math.PI * 2); ctx.fill();
    // Knob tread
    ctx.strokeStyle = '#272727'; ctx.lineWidth = Math.max(1.5, w * 0.022);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(wx + wR * 0.72 * Math.cos(a), wheelY + wR * 0.72 * Math.sin(a));
      ctx.lineTo(wx + wR * 0.96 * Math.cos(a), wheelY + wR * 0.96 * Math.sin(a));
      ctx.stroke();
    }
    // Rim
    ctx.strokeStyle = '#7a7a7a'; ctx.lineWidth = Math.max(2, w * 0.028);
    ctx.beginPath(); ctx.arc(wx, wheelY, wR * 0.60, 0, Math.PI * 2); ctx.stroke();
    // Spokes
    ctx.lineWidth = Math.max(1, w * 0.010);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(wx + wR * 0.14 * Math.cos(a), wheelY + wR * 0.14 * Math.sin(a));
      ctx.lineTo(wx + wR * 0.58 * Math.cos(a), wheelY + wR * 0.58 * Math.sin(a));
      ctx.stroke();
    }
    ctx.fillStyle = '#999';
    ctx.beginPath(); ctx.arc(wx, wheelY, wR * 0.14, 0, Math.PI * 2); ctx.fill();
  }
  drawWheel(lx); drawWheel(rx);

  // Axle bar
  ctx.fillStyle = '#444';
  ctx.fillRect(left + w * 0.02, wheelY - wR * 0.18, w * 0.96, wR * 0.18);

  // Rear fenders (arching over each wheel)
  ctx.fillStyle = shade(color, -0.12);
  ctx.beginPath(); ctx.arc(lx, wheelY, wR * 1.18, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(lx, wheelY); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(rx, wheelY, wR * 1.18, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(rx, wheelY); ctx.closePath(); ctx.fill();

  // Main body
  const bodyTop = wheelY - wR * 2.40;
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, wheelY - wR * 0.80);
  bodyGrad.addColorStop(0, shade(color, 0.28)); bodyGrad.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, left + w * 0.16, bodyTop, w * 0.68, wR * 1.62, 5);

  // Tail light bar across the back
  ctx.fillStyle = shade(color, -0.30);
  roundRect(ctx, left + w * 0.16, wheelY - wR * 1.0, w * 0.68, wR * 0.20, 2);
  // Tail lights
  ctx.fillStyle = '#cc1212';
  roundRect(ctx, left + w * 0.18, wheelY - wR * 1.02, w * 0.14, wR * 0.22, 2);
  roundRect(ctx, left + w * 0.68, wheelY - wR * 1.02, w * 0.14, wR * 0.22, 2);
  // Light cores
  ctx.fillStyle = '#ff7070';
  roundRect(ctx, left + w * 0.21, wheelY - wR * 0.98, w * 0.08, wR * 0.12, 1);
  roundRect(ctx, left + w * 0.71, wheelY - wR * 0.98, w * 0.08, wR * 0.12, 1);

  // Rear cargo rack
  ctx.strokeStyle = '#777'; ctx.lineWidth = Math.max(1.5, w * 0.020);
  const rY = bodyTop - wR * 0.18;
  ctx.strokeRect(left + w * 0.22, rY, w * 0.56, wR * 0.22);
  for (const x of [w * 0.40, w * 0.56]) {
    ctx.beginPath(); ctx.moveTo(left + x, rY); ctx.lineTo(left + x, rY + wR * 0.22); ctx.stroke();
  }

  // === RIDER ===
  const seatY = bodyTop - wR * 0.10;

  // Torso
  const jerseyCol = shade(color, 0.12);
  const jerGrad = ctx.createLinearGradient(0, seatY - wR * 1.10, 0, seatY);
  jerGrad.addColorStop(0, shade(jerseyCol, 0.24)); jerGrad.addColorStop(1, shade(jerseyCol, -0.22));
  ctx.fillStyle = jerGrad;
  roundRect(ctx, cx - w * 0.22, seatY - wR * 1.10, w * 0.44, wR * 1.00, 6);

  // Jersey number block
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  roundRect(ctx, cx - w * 0.09, seatY - wR * 0.90, w * 0.18, wR * 0.36, 2);

  // Arms extended to bars
  ctx.strokeStyle = jerseyCol; ctx.lineWidth = Math.max(4, w * 0.052); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, seatY - wR * 0.78);
  ctx.quadraticCurveTo(cx - w * 0.28, seatY - wR * 0.90, cx - w * 0.38, seatY - wR * 1.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.20, seatY - wR * 0.78);
  ctx.quadraticCurveTo(cx + w * 0.28, seatY - wR * 0.90, cx + w * 0.38, seatY - wR * 1.04);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Handlebars — wide ATV bars
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = Math.max(3, w * 0.042); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - w * 0.44, seatY - wR * 1.08); ctx.lineTo(cx + w * 0.44, seatY - wR * 1.08); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(4, w * 0.054);
  ctx.beginPath(); ctx.moveTo(cx - w * 0.44, seatY - wR * 1.08); ctx.lineTo(cx - w * 0.34, seatY - wR * 1.08); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.34, seatY - wR * 1.08); ctx.lineTo(cx + w * 0.44, seatY - wR * 1.08); ctx.stroke();
  ctx.lineCap = 'butt';

  // Helmet
  const helCy = seatY - wR * 1.52;
  const helR  = w * 0.18;
  const helG  = ctx.createRadialGradient(cx - helR * 0.30, helCy - helR * 0.28, helR * 0.08,
                                          cx, helCy, helR);
  helG.addColorStop(0,   '#ffffff');
  helG.addColorStop(0.28, shade(color, 0.42));
  helG.addColorStop(0.72, color);
  helG.addColorStop(1,   shade(color, -0.48));
  ctx.fillStyle = helG;
  ctx.beginPath(); ctx.arc(cx, helCy, helR, 0, Math.PI * 2); ctx.fill();

  // Visor
  ctx.fillStyle = 'rgba(20,55,150,0.78)';
  ctx.beginPath();
  ctx.ellipse(cx, helCy + helR * 0.20, helR * 0.68, helR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Helmet peak brim
  ctx.fillStyle = shade(color, -0.20);
  ctx.beginPath();
  ctx.moveTo(cx - helR * 0.62, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.62, helCy - helR * 0.04);
  ctx.lineTo(cx + helR * 0.74, helCy + helR * 0.12);
  ctx.lineTo(cx - helR * 0.74, helCy + helR * 0.12);
  ctx.closePath(); ctx.fill();

  // Helmet highlight
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.beginPath(); ctx.ellipse(cx - helR * 0.15, helCy - helR * 0.32, helR * 0.28, helR * 0.17, -0.3, 0, Math.PI * 2); ctx.fill();
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

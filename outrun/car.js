// Player car: dt-based physics, input handling, and a shared 3D-ish car
// renderer (drawCarBody) used for both the player and opponent traffic.

const CAR = {
  x:         0,      // lateral position in road half-widths (-1..1 = on road)
  speed:     0,      // forward speed in world units / second
  maxSpeed:  9000,
  accel:     14000,  // units / second^2
  brake:     26000,
  decel:     7000,   // natural coast-down
  steerRate: 1.6,    // half-widths / second at full speed
  offRoadMax:  3000,  // speed cap while on the grass (~33% of maxSpeed, never 0)
  offRoadDrag: 22000, // bleed-down rate off-road; must exceed accel so you can't climb back up
  spinTime:  0,      // seconds left in a crash spin-out (0 = normal control)
  spinDur:   0,      // total duration of the current spin-out
  spinAngle: 0,      // current sprite yaw during a spin-out
  spinTotal: 0,      // total yaw to sweep over the spin
  spinDir:   1,      // spin direction (and skid direction)
  smoke:     [],     // tire-smoke puffs
};

// OutRun-style spin-out on crashing into traffic.
const SPIN_TRIGGER_SPEED = 2500;   // below this a contact just bumps, no spin
const SPIN_BASE_DURATION = 1.25;   // seconds of lost control at a light crash
const SPIN_DECEL         = 13000;  // slide-to-a-near-stop rate
const SPIN_SKID_RATE     = 1.2;    // sideways slide (road half-widths/sec) at spin start

// dir: which way to spin/skid (+/-1); impactSpeed scales how violent it is.
function startSpinOut(car, dir, impactSpeed) {
  const f = Math.min(1, Math.max(0, impactSpeed / car.maxSpeed)); // 0..1 intensity
  car.spinDir   = dir || (Math.random() < 0.5 ? -1 : 1);
  car.spinDur   = SPIN_BASE_DURATION + 0.7 * f;
  car.spinTime  = car.spinDur;
  car.spinTotal = (1.5 + 1.5 * f) * 2 * Math.PI; // 1.5 turns (light) .. 3 turns (full speed)
  car.spinAngle = 0;
}

const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

function spawnSmoke(car) {
  for (let k = 0; k < 2; k++) {
    car.smoke.push({
      ox: Math.random() * 64 - 32, oy: Math.random() * 16 - 8,
      age: 0, max: 0.6 + Math.random() * 0.5, r0: 7 + Math.random() * 9,
    });
  }
  if (car.smoke.length > 70) car.smoke.splice(0, car.smoke.length - 70);
}

function updateSmoke(car, dt) {
  for (const s of car.smoke) s.age += dt;
  if (car.smoke.length) car.smoke = car.smoke.filter(s => s.age < s.max);
}

function drawSmoke(ctx, screenW, screenH) {
  if (!CAR.smoke.length) return;
  const bx = screenW / 2, by = screenH - 24;
  for (const s of CAR.smoke) {
    const p = s.age / s.max;
    const r = s.r0 + p * 24;
    ctx.globalAlpha = (1 - p) * 0.45;
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.arc(bx + s.ox, by + s.oy - p * 12, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const keys = {};
let tiltSteer = 0;          // analog steering from device tilt (-1..1), set by controls.js
const TILT_GAIN = 1.4;      // how strongly full tilt steers vs a held key

function initInput() {
  window.addEventListener('keydown', e => keys[e.key] = true);
  window.addEventListener('keyup',   e => keys[e.key] = false);
}

function updateCar(car, dt) {
  updateSmoke(car, dt);

  // Spin-out: no control. The spin decelerates (fast then easing to rest), the
  // car slides sideways, sheds speed, and kicks up tire smoke.
  if (car.spinTime > 0) {
    car.spinTime -= dt;
    const p = Math.min(1, Math.max(0, 1 - car.spinTime / car.spinDur)); // 0..1 progress
    car.spinAngle = car.spinDir * car.spinTotal * easeOutCubic(p);       // fast, then slows
    car.speed = Math.max(0, car.speed - SPIN_DECEL * dt);
    car.x += car.spinDir * SPIN_SKID_RATE * dt * (1 - p);                // slide, easing off
    car.x = Math.max(-2.2, Math.min(2.2, car.x));
    spawnSmoke(car);
    if (car.spinTime <= 0) { car.spinTime = 0; car.spinAngle = 0; }
    return;
  }

  if (keys['ArrowUp'])        car.speed = Math.min(car.speed + car.accel * dt, car.maxSpeed);
  else if (keys['ArrowDown']) car.speed = Math.max(car.speed - car.brake * dt, 0);
  else                        car.speed = Math.max(car.speed - car.decel * dt, 0);

  const steer = car.steerRate * dt * (car.speed / car.maxSpeed);
  if (keys['ArrowLeft'])  car.x -= steer;
  if (keys['ArrowRight']) car.x += steer;
  if (tiltSteer)          car.x += steer * tiltSteer * TILT_GAIN;
  car.x = Math.max(-2, Math.min(2, car.x));

  // Off-road: the road spans x in [-1, 1]. On the grass you bleed down hard
  // toward a low cap (drag > accel, so holding forward can't climb back up),
  // but you still creep forward at ~the cap -- never stuck at a dead stop.
  if (Math.abs(car.x) > 1 && car.speed > car.offRoadMax) {
    car.speed = Math.max(car.offRoadMax, car.speed - car.offRoadDrag * dt);
  }
}

function drawCar(ctx, screenW, screenH) {
  if (CAR.spinTime > 0) {
    drawCarSpinning(ctx, screenW / 2, screenH - 18, 120, '#cc2222', CAR.spinAngle);
  } else {
    drawCar3D(ctx, screenW / 2, screenH - 18, 120, '#cc2222');
  }
}

// --- Pre-rendered car sprites ---------------------------------------------
// Drawing the gradient-shaded car every frame allocated ~3 gradients per car
// and churned the GC (hitching near traffic). Instead render each color once
// to an offscreen canvas and blit it, scaled, each frame.

const CAR_REF_W = 240;
const _carSprites = {};

function getCarSprite(color) {
  if (_carSprites[color]) return _carSprites[color];
  const w = CAR_REF_W, h = w * 0.6;
  const padX = w * 0.12, padTop = h * 0.12, padBot = h * 0.22;
  const cw = Math.ceil(w + padX * 2), ch = Math.ceil(h + padTop + padBot);
  const off = document.createElement('canvas');
  off.width = cw; off.height = ch;
  const octx = off.getContext('2d');
  const anchorX = cw / 2, anchorY = ch - padBot; // bottom-center of the car body
  drawCarBody(octx, anchorX, anchorY, w, color);
  const sprite = { canvas: off, anchorX, anchorY, w: cw, h: ch };
  _carSprites[color] = sprite;
  return sprite;
}

function drawCar3D(ctx, cx, bottomY, w, color) {
  const sp = getCarSprite(color);
  const scale = w / CAR_REF_W;
  ctx.drawImage(sp.canvas, cx - sp.anchorX * scale, bottomY - sp.anchorY * scale,
                sp.w * scale, sp.h * scale);
}

// Spin-out render: yaw the car about its vertical axis (horizontal squash, so it
// turns rear -> edge -> front -> edge -> rear without ever looking upside-down)
// plus a lean that peaks side-on. Reads as a car spinning flat on the road.
function drawCarSpinning(ctx, cx, bottomY, w, color, angle) {
  const sp = getCarSprite(color);
  const scale = w / CAR_REF_W;
  const yaw  = Math.cos(angle);          // 1 rear .. 0 edge-on .. -1 front (mirrored)
  const lean = 0.28 * Math.sin(angle);   // leans hardest when side-on
  ctx.save();
  ctx.translate(cx, bottomY);            // pivot at the car's ground contact
  ctx.rotate(lean);
  ctx.scale(yaw, 1);                      // squash horizontally about the centerline
  ctx.drawImage(sp.canvas, -sp.anchorX * scale, -sp.anchorY * scale, sp.w * scale, sp.h * scale);
  ctx.restore();
}

// ---- Shared 3D-ish car (rear view), centered at cx with its base at bottomY ----

function drawCarBody(ctx, cx, bottomY, w, baseColor) {
  const h = w * 0.6;
  const left = cx - w / 2;
  const top = bottomY - h;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, bottomY - h * 0.03, w * 0.56, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tires
  const tireW = w * 0.17, tireH = h * 0.30;
  ctx.fillStyle = '#0b0b0b';
  roundRect(ctx, left - tireW * 0.2,      bottomY - tireH, tireW, tireH, 3);
  roundRect(ctx, left + w - tireW * 0.8,  bottomY - tireH, tireW, tireH, 3);

  // Lower bumper (darkest)
  const bumpH = h * 0.22;
  ctx.fillStyle = shade(baseColor, -0.45);
  roundRect(ctx, left, bottomY - bumpH - h * 0.04, w, bumpH, 4);

  // Main body with vertical gradient (rounded-surface shading)
  const bodyTop = top + h * 0.30;
  const bodyH = h * 0.50;
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  bodyGrad.addColorStop(0,   shade(baseColor, 0.28));
  bodyGrad.addColorStop(0.5, baseColor);
  bodyGrad.addColorStop(1,   shade(baseColor, -0.28));
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, left, bodyTop, w, bodyH, 6);

  // Roof / greenhouse (narrower = sense of depth)
  const roofW = w * 0.70, roofH = h * 0.36;
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
  roundRect(ctx, left + w * 0.06,            tlY, tlW, tlH, 3);
  roundRect(ctx, left + w * 0.94 - tlW,      tlY, tlW, tlH, 3);
  ctx.fillStyle = 'rgba(255,170,150,0.95)';
  roundRect(ctx, left + w * 0.06 + tlW * 0.28, tlY + tlH * 0.28, tlW * 0.44, tlH * 0.4, 2);
  roundRect(ctx, left + w * 0.94 - tlW * 0.72, tlY + tlH * 0.28, tlW * 0.44, tlH * 0.4, 2);

  // Roof highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(roofX + 4, top + 2);
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

// Lighten (pct > 0) or darken (pct < 0) a #rrggbb color.
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (pct >= 0) { r += (255 - r) * pct; g += (255 - g) * pct; b += (255 - b) * pct; }
  else          { r *= (1 + pct);       g *= (1 + pct);       b *= (1 + pct); }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// Layered parallax background: sky gradient → sun → far mountains → near mountains.
//
// Called once per frame before road.js draws the road geometry. Receives `curveX`
// (the farthest segment's accumulated lateral drift, in road.js world units) and
// converts it to a pixel shift for each layer at its own parallax rate.
//
// curveX is in road world units. Empirically, a strong curve gives curveX ≈ 2000–4000.
// We scale by PARALLAX_SCALE to get sensible screen-pixel offsets.

import { palette } from './palette.js';

const PARALLAX_SCALE = 0.022;  // world-units → screen-pixel factor (tune here)

// The horizon sits at ~46% of screen height (sky fills the top portion).
const HORIZON_FRAC = 0.46;

// ---- Mountain profile ----------------------------------------------------
// Two sine-sum profiles of different spatial frequency mix, both of length
// PROFILE_LEN. They tile seamlessly (period = PROFILE_LEN pixels at screen scale).

const PROFILE_LEN = 512;

function makeProfile(freqs) {
  const p = new Float32Array(PROFILE_LEN);
  for (let i = 0; i < PROFILE_LEN; i++) {
    const t = (i / PROFILE_LEN) * Math.PI * 2;
    let v = 0;
    for (const [freq, amp, phase] of freqs) v += Math.sin(t * freq + phase) * amp;
    p[i] = Math.max(0, v);
  }
  return p;
}

// Far mountains: broad, gentle ridgeline.
const FAR_PROFILE = makeProfile([
  [1.0, 0.42, 0.2],
  [2.3, 0.26, 0.7],
  [4.7, 0.14, 1.4],
  [9.1, 0.07, 2.1],
]);

// Near mountains: sharper, more rugged peaks.
const NEAR_PROFILE = makeProfile([
  [1.7, 0.38, 1.1],
  [3.5, 0.28, 0.3],
  [7.0, 0.16, 2.5],
  [13.2, 0.09, 0.9],
]);

function sampleProfile(profile, screenX, screenW, pixelShift) {
  // Map the screen column (with parallax offset) to a [0,1] profile coordinate.
  const u = ((screenX - pixelShift) / screenW / 2.0 % 1 + 2) % 1;
  return profile[Math.floor(u * PROFILE_LEN)];
}

// ---- Sky gradient (cached) -----------------------------------------------
let _skyGrad = null;

export function invalidateSkyGradient() { _skyGrad = null; }

function drawSkyGradient(ctx, W, H) {
  if (!_skyGrad) {
    const horizonY = H * HORIZON_FRAC;
    _skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    _skyGrad.addColorStop(0,    palette.sky.top);
    _skyGrad.addColorStop(0.58, palette.sky.mid);
    _skyGrad.addColorStop(1,    palette.sky.horizon);
  }
  ctx.fillStyle = _skyGrad;
  ctx.fillRect(0, 0, W, H * HORIZON_FRAC);
}

// ---- Sun -----------------------------------------------------------------

function drawSun(ctx, W, H) {
  const horizonY = H * HORIZON_FRAC;
  const sunX = W * 0.58;
  const sunY = horizonY * 0.38;
  const sunR = 32;

  // Outer glow
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 3.2);
  glow.addColorStop(0,   'rgba(255,240,160,0.55)');
  glow.addColorStop(0.5, 'rgba(255,210,100,0.18)');
  glow.addColorStop(1,   'rgba(255,200,100,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Sun disc
  ctx.fillStyle = '#fff8e0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Mountain layer -------------------------------------------------------

function drawMountainLayer(ctx, W, H, profile, color, heightFrac, pixelShift) {
  const horizonY = H * HORIZON_FRAC;
  const maxH = horizonY * heightFrac;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);

  const step = 3;
  for (let x = 0; x <= W + step; x += step) {
    const h = sampleProfile(profile, x, W, pixelShift) * maxH;
    ctx.lineTo(Math.min(x, W), horizonY - h);
  }

  ctx.lineTo(W, horizonY);
  ctx.closePath();
  ctx.fill();
}

// ---- Cloud band ----------------------------------------------------------
// Simple oval streaks scattered across the upper sky.

const CLOUDS = [
  { rx: 0.12, ry: 0.60, rw: 0.14, rh: 0.025 },
  { rx: 0.34, ry: 0.25, rw: 0.18, rh: 0.020 },
  { rx: 0.55, ry: 0.42, rw: 0.12, rh: 0.018 },
  { rx: 0.71, ry: 0.18, rw: 0.22, rh: 0.022 },
  { rx: 0.88, ry: 0.52, rw: 0.10, rh: 0.016 },
];

function drawClouds(ctx, W, H, pixelShift) {
  const horizonY = H * HORIZON_FRAC;
  ctx.fillStyle = palette.sky.cloud;

  for (const c of CLOUDS) {
    // Wrap cloud X with parallax shift applied
    const cx = ((c.rx * W - pixelShift * 0.35) % W + W) % W;
    const cy = c.ry * horizonY;
    const rw = c.rw * W;
    const rh = c.rh * horizonY;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wrap-around copy so clouds tile seamlessly at the screen edges
    if (cx < rw) {
      ctx.beginPath();
      ctx.ellipse(cx + W, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (cx > W - rw) {
      ctx.beginPath();
      ctx.ellipse(cx - W, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- Public API ----------------------------------------------------------

export function drawBackground(ctx, screenW, screenH, curveX) {
  // Negative: when road curves right (curveX > 0), background shifts left.
  const horizonPixelShift = -curveX * PARALLAX_SCALE;

  drawSkyGradient(ctx, screenW, screenH);
  drawSun(ctx, screenW, screenH);
  drawClouds(ctx, screenW, screenH, horizonPixelShift);
  drawMountainLayer(ctx, screenW, screenH, FAR_PROFILE,  palette.sky.mountainFar,  0.50, horizonPixelShift * 0.25);
  drawMountainLayer(ctx, screenW, screenH, NEAR_PROFILE, palette.sky.mountainNear, 0.38, horizonPixelShift * 0.42);
}

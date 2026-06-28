// Pseudo-3D road renderer using projected trapezoid segments.
//
// Two-pass design (Phase 2+):
//   projectRoad() — pass 1: projection only. Populates segmentProjections[]
//                   and frameSegs[]. Must be called once per frame before any
//                   other rendering (sky.js reads segmentProjections for parallax).
//   drawRoad()    — pass 2: draw the road geometry onto ctx. No projection work.

import { palette } from './palette.js';

export const SEGMENT_LENGTH = 200;
export const NUM_SEGMENTS   = 500;
const CAMERA_HEIGHT  = 1000;
const CAMERA_DEPTH   = 0.84;
const ROAD_WIDTH     = 2000;
export const DRAW_DISTANCE  = 120;
export const TRACK_LENGTH   = NUM_SEGMENTS * SEGMENT_LENGTH;

const STRIPE = 3;

// Local alias so renderSegment reads naturally.
// grass/rumble/surface/dash are arrays — the alias shares the same array ref,
// so mutations like palette.road.grass[0]='...' are visible here automatically.
// shoulder is a string; read it from palette directly each frame (no alias).
const COLORS = {
  grass:   palette.road.grass,
  rumble:  palette.road.rumble,
  road:    palette.road.surface,
  dash:    palette.road.dash,
};

// ---- Distance fog --------------------------------------------------------
// Fog blends road, scenery, and traffic toward palette.sky.fog as dz increases,
// removing the hard "pop-in" at the draw distance boundary.
const FOG_NEAR = DRAW_DISTANCE * SEGMENT_LENGTH * 0.25;  // fog starts at 25% draw distance
const FOG_FAR  = DRAW_DISTANCE * SEGMENT_LENGTH * 0.88;  // fully fogged at 88%

// Returns a 0..1 fog opacity for an object at camera depth `dz`.
export function fogAlpha(dz) {
  if (dz <= FOG_NEAR) return 0;
  if (dz >= FOG_FAR)  return 1;
  return (dz - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
}

// ---- Shared frame state --------------------------------------------------

// Per-frame projection cache — read by scenery.js, checkpoint.js, opponents.js.
export const segmentProjections = [];

// Internal draw list — populated by projectRoad, consumed by drawRoad and webgl-road.
export const frameSegs = [];

// Frame context for projectObject().
const _frame = { W: 0, H: 0, playerX: 0, cameraY: CAMERA_HEIGHT };

// ---- projectObject -------------------------------------------------------
// Project a non-segment object at exact depth `dz`, lateral `offset` (road half-widths).
export function projectObject(dz, offset) {
  if (dz <= CAMERA_DEPTH) return null;
  const scale = CAMERA_DEPTH / dz;
  const W = _frame.W, H = _frame.H;
  const w = scale * ROAD_WIDTH * W / 2;
  const centerX = W / 2 + scale * (interpByDepth(dz, 'curveX') - _frame.playerX * ROAD_WIDTH) * W / 2;
  const y = H / 2 - scale * (interpByDepth(dz, 'elev') - _frame.cameraY) * H / 2;
  return { x: centerX + offset * w, y, w, scale, clip: interpByDepth(dz, 'clip') };
}

function interpByDepth(dz, field) {
  const sp = segmentProjections;
  if (sp.length === 0) return 0;
  if (dz <= sp[0].dz) return sp[0][field];
  for (let i = 1; i < sp.length; i++) {
    if (dz <= sp[i].dz) {
      const a = sp[i - 1], b = sp[i];
      const t = (dz - a.dz) / ((b.dz - a.dz) || 1);
      return a[field] + (b[field] - a[field]) * t;
    }
  }
  return sp[sp.length - 1][field];
}

// Returns the accumulated lateral curve offset of the farthest visible segment.
// sky.js uses this to drive parallax scrolling.
export function getHorizonCurveX() {
  if (segmentProjections.length === 0) return 0;
  return segmentProjections[segmentProjections.length - 1].curveX;
}

// ---- Track generation ----------------------------------------------------

const CURVE = { gentle: 1.5, medium: 3, hard: 4.5 };
const HILL  = { low: 650, med: 1150, high: 1650 };
const easeCurve = (a, b, p) => a + (b - a) * (1 - Math.cos(p * Math.PI)) / 2;

export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addCurve(segs, start, enter, hold, leave, curve) {
  let n = start;
  for (let k = 0; k < enter && n < NUM_SEGMENTS; k++, n++) segs[n].curve = easeCurve(0, curve, k / enter);
  for (let k = 0; k < hold  && n < NUM_SEGMENTS; k++, n++) segs[n].curve = curve;
  for (let k = 0; k < leave && n < NUM_SEGMENTS; k++, n++) segs[n].curve = easeCurve(curve, 0, k / leave);
  return n;
}

function addHill(segs, start, len, height) {
  for (let k = 0; k < len && start + k < NUM_SEGMENTS; k++) {
    segs[start + k].y = height * Math.sin((k / len) * Math.PI);
  }
  return start + len;
}

// Deterministic sprite variety by segment index — avoids consuming the
// seeded RNG so curve/hill layout is unchanged when sprite density changes.
function _sh(i) { return (i * 2654435761 + 1234567891) >>> 0; }  // Knuth hash

function _segSprites(i) {
  const h = _sh(i);
  const sprites = [];

  // Primary layer: one sprite every 7 segments, alternating sides
  if (i % 7 === 0) {
    const side = (i % 14 === 0) ? -1 : 1;
    if (i % 49 === 0) {
      // Billboard every 49 segments
      sprites.push({ type: `billboard-${h % 3}`, offset: side * 2.2 });
    } else {
      // Tree type: pine 50%, palm 25%, poplar 25%
      const t = (h >> 4) & 7;
      const type = t < 4 ? 'pine' : t < 6 ? 'palm' : 'poplar';
      sprites.push({ type, offset: side * (2.6 + ((h >> 12) & 7) * 0.1) });
    }
  }

  // Secondary layer: farther out, less frequent
  if (i % 11 === 0) {
    const side = (i % 22 === 0) ? 1 : -1;
    const t = (h >> 16) & 7;
    const type = t < 3 ? 'pine' : t < 6 ? 'palm' : 'poplar';
    sprites.push({ type, offset: side * (3.6 + ((h >> 20) & 3) * 0.2) });
  }

  // Rocks and bushes near the roadside
  if (i % 17 === 0 && ((h >> 24) & 3) > 0) {
    const side = (h >> 26) & 1 ? 1 : -1;
    const type = (h >> 22) & 1 ? 'rock' : 'bush';
    sprites.push({ type, offset: side * (2.0 + ((h >> 18) & 3) * 0.15) });
  }

  return sprites;
}

export function buildSegments(seed) {
  const rng  = makeRng(seed >>> 0);
  const rnd  = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const segs = [];

  for (let i = 0; i < NUM_SEGMENTS; i++) {
    segs.push({ curve: 0, y: 0, color: Math.floor(i / STRIPE) % 2, sprites: _segSprites(i) });
  }

  let i = rnd(6, 14);
  while (i < NUM_SEGMENTS - 12) {
    const dir = rng() < 0.5 ? -1 : 1;
    const roll = rng();
    if (roll < 0.34)      i = addCurve(segs, i, rnd(6, 10), rnd(24, 44), rnd(6, 10), CURVE.gentle * dir);
    else if (roll < 0.62) i = addCurve(segs, i, rnd(4, 8),  rnd(12, 22), rnd(4, 8),  CURVE.medium * dir);
    else if (roll < 0.82) i = addCurve(segs, i, rnd(3, 5),  rnd(6, 12),  rnd(3, 5),  CURVE.hard * dir);
    else {
      i = addCurve(segs, i, rnd(3, 5), rnd(8, 14), rnd(3, 4), CURVE.medium * dir);
      i = addCurve(segs, i, rnd(3, 4), rnd(8, 14), rnd(3, 5), CURVE.medium * -dir);
    }
    i += rnd(6, 18);
  }

  let h = rnd(20, 50);
  while (h < NUM_SEGMENTS - 18) {
    const r = rng();
    const mag = (r < 0.5 ? HILL.high : r < 0.8 ? HILL.med : HILL.low) * (rng() < 0.5 ? -1 : 1);
    h = addHill(segs, h, rnd(16, 34), mag);
    h += rnd(45, 100);
  }

  return segs;
}

// ---- Projection helpers --------------------------------------------------

function project(worldZ, worldY, cameraXWorld, cameraZ, cameraY, screenW, screenH) {
  const camZ  = worldZ - cameraZ;
  const scale = CAMERA_DEPTH / camZ;
  const x = Math.round(screenW / 2 + scale * (0 - cameraXWorld) * screenW / 2);
  const y = Math.round(screenH / 2 - scale * (worldY - cameraY) * screenH / 2);
  const w = Math.round(scale * ROAD_WIDTH * screenW / 2);
  return { camZ, scale, x, y, w };
}

// ---- Pass 1: project -------------------------------------------------------
// Call once per frame before any drawing. Populates segmentProjections + frameSegs.

export function projectRoad(segments, position, playerX, screenW, screenH) {
  _frame.W = screenW; _frame.H = screenH; _frame.playerX = playerX;
  segmentProjections.length = 0;
  frameSegs.length = 0;

  const baseIndex   = Math.floor(position / SEGMENT_LENGTH) % NUM_SEGMENTS;
  const basePercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;

  const baseY = segments[baseIndex].y;
  const nextY = segments[(baseIndex + 1) % NUM_SEGMENTS].y;
  const cameraY = CAMERA_HEIGHT + baseY + (nextY - baseY) * basePercent;
  _frame.cameraY = cameraY;

  let x  = 0;
  let dx = -(segments[baseIndex].curve * basePercent);

  let maxy = screenH;
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const i = (baseIndex + n) % NUM_SEGMENTS;
    const seg = segments[i];
    const nextSeg = segments[(i + 1) % NUM_SEGMENTS];
    const looped = i < baseIndex;
    const camZ = position - (looped ? TRACK_LENGTH : 0);
    const curveX = x;

    const p1 = project(i * SEGMENT_LENGTH,       seg.y,     playerX * ROAD_WIDTH - x,      camZ, cameraY, screenW, screenH);
    const p2 = project((i + 1) * SEGMENT_LENGTH, nextSeg.y, playerX * ROAD_WIDTH - x - dx, camZ, cameraY, screenW, screenH);

    x  += dx;
    dx += seg.curve;

    if (p1.camZ <= CAMERA_DEPTH) continue;

    const clip = maxy;
    maxy = Math.min(maxy, p2.y);

    frameSegs.push({ segIdx: i, p1, p2, color: seg.color, dz: p1.camZ, curveX });
    segmentProjections.push({ segIdx: i, dz: p1.camZ, curveX, elev: seg.y, clip,
                              screenY: p1.y, roadX: p1.x, roadW: p1.w, scale: p1.scale });
  }
}

// ---- Pass 2: draw --------------------------------------------------------
// Draws the grass base + road segments. projectRoad must have been called first.

export function drawRoad(ctx, segments, screenW, screenH) {
  // Base grass — covers the lower half before road segments paint over it.
  ctx.fillStyle = COLORS.grass[0];
  ctx.fillRect(0, screenH / 2, screenW, screenH / 2);

  // Far-to-near so nearer quads overdraw farther ones (painter's algorithm).
  for (let k = frameSegs.length - 1; k >= 0; k--) {
    const f = frameSegs[k];
    renderSegment(ctx, screenW, f.p1, f.p2, f.color, f.dz);
  }
}

// ---- Segment renderer ----------------------------------------------------

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function renderSegment(ctx, screenW, p1, p2, color, dz) {
  const r1 = p1.w / 6,  r2 = p2.w / 6;   // rumble strip half-width
  const l1 = p1.w / 32, l2 = p2.w / 32;  // lane dash half-width
  const s1 = p1.w / 18, s2 = p2.w / 18;  // shoulder half-width

  // Grass band (full screen width)
  ctx.fillStyle = COLORS.grass[color];
  ctx.fillRect(0, p2.y, screenW, p1.y - p2.y);

  // Shoulder — narrow strip between grass and rumble; read from palette each frame
  // so _applyStageColors() can set it to the grass color to hide it on special stages.
  ctx.fillStyle = palette.road.shoulder;
  polygon(ctx, p1.x - p1.w - r1 - s1, p1.y, p1.x - p1.w - r1, p1.y,
               p2.x - p2.w - r2,       p2.y, p2.x - p2.w - r2 - s2, p2.y);
  polygon(ctx, p1.x + p1.w + r1,       p1.y, p1.x + p1.w + r1 + s1, p1.y,
               p2.x + p2.w + r2 + s2,  p2.y, p2.x + p2.w + r2,       p2.y);

  // Rumble strips
  ctx.fillStyle = COLORS.rumble[color];
  polygon(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y);
  polygon(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y);

  // Road surface
  ctx.fillStyle = COLORS.road[color];
  polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y);

  // Lane dashes
  if (COLORS.dash[color]) {
    ctx.fillStyle = COLORS.dash[color];
    polygon(ctx, p1.x - l1, p1.y, p1.x + l1, p1.y, p2.x + l2, p2.y, p2.x - l2, p2.y);
  }

  // Distance fog overlay — blends this band toward the horizon haze color
  const fog = fogAlpha(dz);
  if (fog > 0.004) {
    ctx.globalAlpha = fog;
    ctx.fillStyle = palette.sky.fog;
    ctx.fillRect(0, p2.y, screenW, p1.y - p2.y);
    ctx.globalAlpha = 1;
  }
}

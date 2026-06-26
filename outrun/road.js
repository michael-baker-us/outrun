// Pseudo-3D road renderer using projected trapezoid segments.
// Each segment is projected near→far; the road is drawn as quads between
// successive projected points, with curve accumulated across the draw distance.

const SEGMENT_LENGTH = 200;
const NUM_SEGMENTS   = 500;  // longer track -> more variety before it repeats
const CAMERA_HEIGHT  = 1000;
const CAMERA_DEPTH   = 0.84;  // ~1/tan(FOV/2)
const ROAD_WIDTH     = 2000;  // world half-width of the road
const DRAW_DISTANCE  = 120;   // segments drawn per frame
const TRACK_LENGTH   = NUM_SEGMENTS * SEGMENT_LENGTH;

const STRIPE = 3; // segments per alternating color block (coarser = scrolls, doesn't strobe)

const COLORS = {
  // Low contrast between the two shades so the alternation reads as gentle
  // motion rather than a per-frame strobe. Rumble stays vivid (edges only).
  grass:  ['#1ba62b', '#149d22'],
  rumble: ['#cc2b2b', '#efefef'],
  road:   ['#8a8a8a', '#848484'],
  dash:   ['#ffffff', null],
};

// Per-frame projection cache for visible segments, in near->far order (ascending dz).
// Each entry: { segIdx, dz, curveX, screenY, roadX, roadW, scale }.
// curveX is the road centerline's world-x at that segment (for following curves).
const segmentProjections = [];

// Frame context captured by drawRoad so projectObject() can place sprites/cars.
const _frame = { W: 0, H: 0, playerX: 0, cameraY: CAMERA_HEIGHT };

// Linearly interpolate a stored per-segment field (curveX / elev) at depth dz.
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

// Project an object (car/sprite) from its exact camera depth `dz` and lateral
// `offset` (in road half-widths). Continuous in dz -> no segment-snapping stutter.
// Rides the road's curve and elevation at that depth.
function projectObject(dz, offset) {
  if (dz <= CAMERA_DEPTH) return null;
  const scale = CAMERA_DEPTH / dz;
  const W = _frame.W, H = _frame.H;
  const w = scale * ROAD_WIDTH * W / 2;
  const centerX = W / 2 + scale * (interpByDepth(dz, 'curveX') - _frame.playerX * ROAD_WIDTH) * W / 2;
  const y = H / 2 - scale * (interpByDepth(dz, 'elev') - _frame.cameraY) * H / 2;
  // clip = screen Y of the highest nearer terrain; sprites below it are hidden by a hill.
  return { x: centerX + offset * w, y, w, scale, clip: interpByDepth(dz, 'clip') };
}

let _skyGrad = null;
function drawSky(ctx, screenW, screenH) {
  if (!_skyGrad) {
    _skyGrad = ctx.createLinearGradient(0, 0, 0, screenH / 2);
    _skyGrad.addColorStop(0,   '#1a4d8f');
    _skyGrad.addColorStop(0.6, '#72d7ee');
    _skyGrad.addColorStop(1,   '#ffd9a0');
  }
  ctx.fillStyle = _skyGrad;
  ctx.fillRect(0, 0, screenW, screenH / 2);
}

// Curve strengths (curvature added per segment while turning).
const CURVE = { gentle: 1.5, medium: 3, hard: 4.5 };
const HILL  = { low: 650, med: 1150, high: 1650 }; // crest/dip heights in world units

const easeCurve = (a, b, p) => a + (b - a) * (1 - Math.cos(p * Math.PI)) / 2;

// Mulberry32 seeded PRNG -> deterministic tracks from a seed.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Apply a smooth curve onto the track: ease in to `curve`, hold, ease back to 0.
// Easing the ends keeps straights and curves from meeting at a kink.
function addCurve(segs, start, enter, hold, leave, curve) {
  let n = start;
  for (let k = 0; k < enter && n < NUM_SEGMENTS; k++, n++) segs[n].curve = easeCurve(0, curve, k / enter);
  for (let k = 0; k < hold  && n < NUM_SEGMENTS; k++, n++) segs[n].curve = curve;
  for (let k = 0; k < leave && n < NUM_SEGMENTS; k++, n++) segs[n].curve = easeCurve(curve, 0, k / leave);
  return n;
}

// A self-contained hill: elevation rises (or falls) to `height` at the middle and
// returns to 0 at both ends, so it never leaves a vertical step at the seam.
function addHill(segs, start, len, height) {
  for (let k = 0; k < len && start + k < NUM_SEGMENTS; k++) {
    segs[start + k].y = height * Math.sin((k / len) * Math.PI);
  }
  return start + len;
}

function buildSegments(seed) {
  const rng  = makeRng(seed >>> 0);
  const rnd  = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const segs = [];

  for (let i = 0; i < NUM_SEGMENTS; i++) {
    // Roadside scenery: trees with occasional billboards (kept sparse to
    // avoid a crowded, shimmering treeline at the horizon).
    const sprites = [];
    if (i % 8 === 0) {
      const side = (i % 16 === 0) ? -1 : 1;
      const type = (i % 24 === 0) ? 'billboard' : 'tree';
      sprites.push({ type, offset: side * (type === 'billboard' ? 2.2 : 2.8) });
    }
    if (i % 13 === 0) {
      sprites.push({ type: 'tree', offset: (i % 26 === 0 ? 1 : -1) * 3.6 });
    }
    segs.push({ curve: 0, y: 0, color: Math.floor(i / STRIPE) % 2, sprites });
  }

  // Curve features: straights interleaved with a mix of curves. Leave a short
  // straight tail so the loop seam (last segment -> first) stays smooth.
  let i = rnd(6, 14);
  while (i < NUM_SEGMENTS - 12) {
    const dir = rng() < 0.5 ? -1 : 1;
    const roll = rng();
    if (roll < 0.34) {
      i = addCurve(segs, i, rnd(6, 10), rnd(24, 44), rnd(6, 10), CURVE.gentle * dir); // long sweeper
    } else if (roll < 0.62) {
      i = addCurve(segs, i, rnd(4, 8), rnd(12, 22), rnd(4, 8), CURVE.medium * dir);   // medium curve
    } else if (roll < 0.82) {
      i = addCurve(segs, i, rnd(3, 5), rnd(6, 12), rnd(3, 5), CURVE.hard * dir);      // sharp twist
    } else {
      i = addCurve(segs, i, rnd(3, 5), rnd(8, 14), rnd(3, 4), CURVE.medium * dir);    // S-curve...
      i = addCurve(segs, i, rnd(3, 4), rnd(8, 14), rnd(3, 5), CURVE.medium * -dir);   // ...the other way
    }
    i += rnd(6, 18);
  }

  // Hill features: fewer but more pronounced crests/dips, with long flat gaps
  // between them (weighted toward the bigger magnitudes).
  let h = rnd(20, 50);
  while (h < NUM_SEGMENTS - 18) {
    const r = rng();
    const mag = (r < 0.5 ? HILL.high : r < 0.8 ? HILL.med : HILL.low) * (rng() < 0.5 ? -1 : 1);
    h = addHill(segs, h, rnd(16, 34), mag);
    h += rnd(45, 100);
  }

  return segs;
}

// Project a road point at world depth `worldZ` and elevation `worldY`, given the
// camera's world-x/y. Returns screen-space x/y/width + scale.
function project(worldZ, worldY, cameraXWorld, cameraZ, cameraY, screenW, screenH) {
  const camZ  = worldZ - cameraZ;
  const scale = CAMERA_DEPTH / camZ;
  const x = Math.round(screenW / 2 + scale * (0 - cameraXWorld) * screenW / 2);
  const y = Math.round(screenH / 2 - scale * (worldY - cameraY) * screenH / 2);
  const w = Math.round(scale * ROAD_WIDTH * screenW / 2);
  return { camZ, scale, x, y, w };
}

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function renderSegment(ctx, screenW, p1, p2, color) {
  const r1 = p1.w / 6,  r2 = p2.w / 6;   // rumble strip width
  const l1 = p1.w / 32, l2 = p2.w / 32;  // lane dash width

  // Grass band (full width)
  ctx.fillStyle = COLORS.grass[color];
  ctx.fillRect(0, p2.y, screenW, p1.y - p2.y);

  // Rumble strips
  ctx.fillStyle = COLORS.rumble[color];
  polygon(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y);
  polygon(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y);

  // Road surface
  ctx.fillStyle = COLORS.road[color];
  polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y);

  // Center lane dashes
  if (COLORS.dash[color]) {
    ctx.fillStyle = COLORS.dash[color];
    polygon(ctx, p1.x - l1, p1.y, p1.x + l1, p1.y, p2.x + l2, p2.y, p2.x - l2, p2.y);
  }
}

function drawRoad(ctx, segments, position, playerX, screenW, screenH) {
  drawSky(ctx, screenW, screenH);
  // Base grass fill for the lower half so there are no seams behind the road.
  ctx.fillStyle = COLORS.grass[0];
  ctx.fillRect(0, screenH / 2, screenW, screenH / 2);

  _frame.W = screenW; _frame.H = screenH; _frame.playerX = playerX;
  segmentProjections.length = 0;

  const baseIndex   = Math.floor(position / SEGMENT_LENGTH) % NUM_SEGMENTS;
  const basePercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;

  // Camera rides the road's elevation at its current position.
  const baseY = segments[baseIndex].y;
  const nextY = segments[(baseIndex + 1) % NUM_SEGMENTS].y;
  const cameraY = CAMERA_HEIGHT + baseY + (nextY - baseY) * basePercent;
  _frame.cameraY = cameraY;

  let x  = 0;
  let dx = -(segments[baseIndex].curve * basePercent);

  // Pass 1: project every segment near->far, accumulating curve. Only segments
  // behind the camera are dropped -- no occlusion cull on the road itself, so
  // the set is stable frame-to-frame (the old cull flickered far segments).
  // `maxy` tracks the highest road silhouette so far -> the clip line that
  // sprites use to hide behind hills (the road overdraws itself for free).
  const frameSegs = [];
  let maxy = screenH;
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const i = (baseIndex + n) % NUM_SEGMENTS;
    const seg = segments[i];
    const nextSeg = segments[(i + 1) % NUM_SEGMENTS];
    const looped = i < baseIndex;
    const camZ = position - (looped ? TRACK_LENGTH : 0);
    const curveX = x; // road centerline world-x at this segment's near edge

    const p1 = project(i * SEGMENT_LENGTH,       seg.y,     playerX * ROAD_WIDTH - x,      camZ, cameraY, screenW, screenH);
    const p2 = project((i + 1) * SEGMENT_LENGTH, nextSeg.y, playerX * ROAD_WIDTH - x - dx, camZ, cameraY, screenW, screenH);

    x  += dx;
    dx += seg.curve;

    if (p1.camZ <= CAMERA_DEPTH) continue; // behind the camera only

    const clip = maxy;                 // occlusion from nearer terrain
    maxy = Math.min(maxy, p2.y);       // this segment's top raises the silhouette

    frameSegs.push({ segIdx: i, p1, p2, color: seg.color, dz: p1.camZ, curveX });
    segmentProjections.push({ segIdx: i, dz: p1.camZ, curveX, elev: seg.y, clip,
                              screenY: p1.y, roadX: p1.x, roadW: p1.w, scale: p1.scale });
  }

  // Pass 2: draw far->near so nearer trapezoids overdraw farther ones (painter's
  // algorithm). No conditional culling means no flicker.
  for (let k = frameSegs.length - 1; k >= 0; k--) {
    const f = frameSegs[k];
    renderSegment(ctx, screenW, f.p1, f.p2, f.color);
  }
}

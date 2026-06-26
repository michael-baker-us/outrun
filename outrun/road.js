// Pseudo-3D road renderer using projected trapezoid segments.
// Each segment is projected near→far; the road is drawn as quads between
// successive projected points, with curve accumulated across the draw distance.

const SEGMENT_LENGTH = 200;
const NUM_SEGMENTS   = 200;
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

// Per-frame projection cache for visible segments, read by scenery.js / opponents.js.
// Each entry: { segIdx, screenY, roadX, roadW, scale }.
const segmentProjections = [];

function drawSky(ctx, screenW, screenH) {
  const grad = ctx.createLinearGradient(0, 0, 0, screenH / 2);
  grad.addColorStop(0,   '#1a4d8f');
  grad.addColorStop(0.6, '#72d7ee');
  grad.addColorStop(1,   '#ffd9a0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, screenW, screenH / 2);
}

function buildSegments() {
  const segs = [];
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    let curve = 0;
    if (i > 20  && i < 60)  curve =  2;
    if (i > 80  && i < 120) curve = -3;
    if (i > 140 && i < 170) curve =  4;

    // Roadside scenery: trees with occasional billboards.
    const sprites = [];
    if (i % 5 === 0) {
      const side = (i % 10 === 0) ? -1 : 1;
      const type = (i % 20 === 0) ? 'billboard' : 'tree';
      sprites.push({ type, offset: side * (type === 'billboard' ? 2.2 : 2.8) });
    }
    if (i % 7 === 0) {
      sprites.push({ type: 'tree', offset: (i % 14 === 0 ? 1 : -1) * 3.4 });
    }

    segs.push({ curve, color: Math.floor(i / STRIPE) % 2, sprites });
  }
  return segs;
}

// Project a road point at world depth `worldZ`, given the camera's world-x
// (cameraXWorld) and world-z (cameraZ). Returns screen-space x/y/width + scale.
function project(worldZ, cameraXWorld, cameraZ, screenW, screenH) {
  const camZ  = worldZ - cameraZ;
  const scale = CAMERA_DEPTH / camZ;
  const x = Math.round(screenW / 2 + scale * (0 - cameraXWorld) * screenW / 2);
  const y = Math.round(screenH / 2 + scale * CAMERA_HEIGHT * screenH / 2);
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

  segmentProjections.length = 0;

  const baseIndex   = Math.floor(position / SEGMENT_LENGTH) % NUM_SEGMENTS;
  const basePercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;

  let x  = 0;
  let dx = -(segments[baseIndex].curve * basePercent);
  let maxy = screenH;

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const i = (baseIndex + n) % NUM_SEGMENTS;
    const seg = segments[i];
    const looped = i < baseIndex;
    const camZ = position - (looped ? TRACK_LENGTH : 0);

    const p1 = project(i * SEGMENT_LENGTH,       playerX * ROAD_WIDTH - x,      camZ, screenW, screenH);
    const p2 = project((i + 1) * SEGMENT_LENGTH, playerX * ROAD_WIDTH - x - dx, camZ, screenW, screenH);

    x  += dx;
    dx += seg.curve;

    // Skip segments behind the camera, inverted, or already occluded by a nearer one.
    if (p1.camZ <= CAMERA_DEPTH || p2.y >= p1.y || p2.y >= maxy) continue;

    renderSegment(ctx, screenW, p1, p2, seg.color);
    segmentProjections.push({ segIdx: i, screenY: p1.y, roadX: p1.x, roadW: p1.w, scale: p1.scale });
    maxy = p2.y;
  }
}

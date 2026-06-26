// Pseudo-3D road renderer using the scanline projection technique.
// Each road segment has a curve value; accumulated curve shifts scanlines horizontally.

const SEGMENT_LENGTH = 200;
const NUM_SEGMENTS = 200;
const CAMERA_HEIGHT = 1500;
const CAMERA_DEPTH = 0.84; // ~1/tan(FOV/2), controls horizon distance
const DRAW_DISTANCE = 100; // segments visible at once

const COLORS = {
  grass:      ['#10aa10', '#009900'],
  rumble:     ['#dd2222', '#eeeeee'],
  road:       ['#777777', '#999999'],
  dash:       ['#ffffff', null],
};

// Per-draw-call projection cache, populated by drawRoad and read by scenery.js.
// Each entry: { segIdx, screenY, roadX, roadW, scale }.
const segmentProjections = [];

function drawSky(ctx, screenW, screenH) {
  const grad = ctx.createLinearGradient(0, 0, 0, screenH / 2);
  grad.addColorStop(0,   '#1a4d8f'); // deep blue top
  grad.addColorStop(0.6, '#72d7ee'); // mid blue
  grad.addColorStop(1,   '#ffd9a0'); // warm haze at horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, screenW, screenH / 2);
}

function buildSegments() {
  const segs = [];
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    let curve = 0;
    // Add gentle curves at specific track sections
    if (i > 20  && i < 60)  curve =  0.5;
    if (i > 80  && i < 120) curve = -0.7;
    if (i > 140 && i < 170) curve =  1.0;

    // Roadside scenery: alternate trees, with occasional billboards.
    const sprites = [];
    if (i % 5 === 0) {
      const side = (i % 10 === 0) ? -1 : 1;
      const type = (i % 20 === 0) ? 'billboard' : 'tree';
      sprites.push({ type, offset: side * (type === 'billboard' ? 2.2 : 2.8) });
    }
    if (i % 7 === 0) {
      sprites.push({ type: 'tree', offset: (i % 14 === 0 ? 1 : -1) * 3.4 });
    }

    segs.push({ curve, color: i % 2, sprites });
  }
  return segs;
}

function projectSegment(seg, segIndex, cameraZ, cameraX, screenW, screenH) {
  const worldZ = segIndex * SEGMENT_LENGTH - cameraZ;
  if (worldZ <= 0) return null;

  const scale = CAMERA_DEPTH / worldZ * CAMERA_HEIGHT;
  const screenY = Math.round((1 - scale) * screenH * 0.5 + screenH * 0.5);
  const roadW  = Math.round(scale * screenW * 0.5);
  const roadX  = Math.round(screenW * 0.5 - cameraX * scale * screenW * 0.5 + roadW * 0);

  return { screenY, roadX, roadW, scale };
}

function drawRoad(ctx, segments, cameraZ, cameraX, screenW, screenH) {
  drawSky(ctx, screenW, screenH);

  segmentProjections.length = 0;
  const startSeg = Math.floor(cameraZ / SEGMENT_LENGTH) % NUM_SEGMENTS;
  let prevY = screenH;

  for (let i = 0; i < DRAW_DISTANCE; i++) {
    const segIdx = (startSeg + i) % NUM_SEGMENTS;
    const seg = segments[segIdx];

    const proj = projectSegment(seg, startSeg + i, cameraZ, cameraX, screenW, screenH);
    if (!proj || proj.screenY >= prevY) continue;
    segmentProjections.push({ segIdx, ...proj });

    const c = seg.color;
    const { screenY, roadX, roadW } = proj;
    const bandH = prevY - screenY;

    // Grass (full width behind road)
    ctx.fillStyle = COLORS.grass[c];
    ctx.fillRect(0, screenY, screenW, bandH);

    // Rumble strips
    const rumbleW = Math.round(roadW * 0.15);
    ctx.fillStyle = COLORS.rumble[c];
    ctx.fillRect(roadX - roadW - rumbleW, screenY, rumbleW, bandH);
    ctx.fillRect(roadX + roadW,           screenY, rumbleW, bandH);

    // Road surface
    ctx.fillStyle = COLORS.road[c];
    ctx.fillRect(roadX - roadW, screenY, roadW * 2, bandH);

    // Center dashes
    if (COLORS.dash[c]) {
      const dashW = Math.round(roadW * 0.02);
      ctx.fillStyle = COLORS.dash[c];
      ctx.fillRect(roadX - dashW / 2, screenY, dashW, bandH);
    }

    prevY = screenY;
  }
}

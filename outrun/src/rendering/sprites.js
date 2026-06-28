// Procedural sprite pre-rendering — draws each sprite type onto an offscreen
// <canvas> once at startup, then blits it scaled during gameplay.
// This avoids path/gradient allocation every frame (same technique as car.js
// drawCarBody). Browser-only; never imported by tests or Node tooling.
//
// Call buildSprites() once before the game loop, then getSprite(key) anywhere.

const _cache = new Map();

export function buildSprites() {
  _cache.set('pine',        makePine());
  _cache.set('palm',        makePalm());
  _cache.set('poplar',      makePoplar());
  _cache.set('bush',        makeBush());
  _cache.set('rock',        makeRock());
  _cache.set('billboard-0', makeBillboard(0));
  _cache.set('billboard-1', makeBillboard(1));
  _cache.set('billboard-2', makeBillboard(2));
  _cache.set('cactus',      makeCactus());
  _cache.set('building-0',  makeBuilding(0));
  _cache.set('building-1',  makeBuilding(1));
  _cache.set('building-2',  makeBuilding(2));
  _cache.set('seagrass',    makeSeagrass());
  _cache.set('lifeguard',   makeLifeguard());
  // Special stage sprites
  _cache.set('buoy',        makeBuoy());
  const _ast = makeAsteroid();
  _cache.set('asteroid',    _ast);
  _cache.set('asteroid-sm', _ast); // same image, size comes from SPRITE_WIDTHS
  _cache.set('asteroid-lg', _ast);
  _cache.set('haybale',     makeHaybale());
  _cache.set('dirtmound',   makeDirtMound());
  _cache.set('courseflag',  makeCourseFlag());
  _cache.set('tirestacks',  makeTireStack());
  _cache.set('leaderboard', makeLeaderboard());
}

export function getSprite(key) { return _cache.get(key) ?? null; }

// ---- Canvas helper -------------------------------------------------------

function mc(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
  ctx.closePath(); ctx.fill();
}

// ---- Pine / fir ----------------------------------------------------------
// Three-tiered conifer on a dark trunk. Canvas: 80 × 180.

function makePine() {
  const [c, ctx] = mc(80, 180);

  // Trunk
  ctx.fillStyle = '#4a2808';
  ctx.fillRect(36, 110, 8, 68);

  // Three stacked canopy tiers — shadow left, lit right
  const tiers = [
    { cy: 110, rx: 38, ry: 30, dark: '#0a6418', light: '#0d8024' },
    { cy: 82,  rx: 28, ry: 24, dark: '#0d8024', light: '#10922a' },
    { cy: 56,  rx: 18, ry: 18, dark: '#10922a', light: '#13a832' },
  ];
  for (const t of tiers) {
    ctx.fillStyle = t.dark;
    tri(ctx, 40, t.cy - t.ry - 6, 40 - t.rx, t.cy, 40, t.cy - 4);
    ctx.fillStyle = t.light;
    tri(ctx, 40, t.cy - t.ry - 6, 40, t.cy - 4, 40 + t.rx, t.cy);
  }

  return c;
}

// ---- Palm tree -----------------------------------------------------------
// Curved trunk with ringed bark, fan fronds. Canvas: 100 × 200.

function makePalm() {
  const [c, ctx] = mc(100, 200);

  // Curved trunk
  const tg = ctx.createLinearGradient(44, 0, 58, 0);
  tg.addColorStop(0, '#7a5020');
  tg.addColorStop(1, '#5a3810');
  ctx.strokeStyle = tg;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, 200);
  ctx.quadraticCurveTo(58, 140, 52, 58);
  ctx.stroke();

  // Bark rings
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const y = 180 - i * 13;
    ctx.beginPath();
    ctx.moveTo(44, y); ctx.lineTo(58, y);
    ctx.stroke();
  }

  // Fronds — pairs of mirrored leaflets along each stem
  const fronds = [
    { dx: -36, dy: -24 }, { dx: -20, dy: -42 }, { dx: 0, dy: -46 },
    { dx: 20, dy: -42 },  { dx: 34, dy: -26 },  { dx: 26, dy: -12 },
    { dx: -26, dy: -10 },
  ];
  for (const f of fronds) {
    const ox = 52, oy = 58;
    const ex = ox + f.dx, ey = oy + f.dy;
    const angle = Math.atan2(f.dy, f.dx) + Math.PI / 2;

    ctx.strokeStyle = '#5a8010';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + f.dx * 0.4, oy + f.dy * 0.3, ex, ey);
    ctx.stroke();

    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const px = ox + f.dx * t, py = oy + f.dy * t;
      const len = 10 - k;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = k % 2 ? '#3a7010' : '#4a8818';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, len, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(Math.PI);
      ctx.fillStyle = k % 2 ? '#3a7010' : '#4a8818';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, len * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  return c;
}

// ---- Poplar / cypress ----------------------------------------------------
// Tall narrow tree with gradient canopy. Canvas: 40 × 180.

function makePoplar() {
  const [c, ctx] = mc(40, 180);

  ctx.fillStyle = '#4a2808';
  ctx.fillRect(18, 140, 4, 40);

  const g = ctx.createLinearGradient(0, 0, 40, 0);
  g.addColorStop(0, '#145a20');
  g.addColorStop(0.55, '#1a7228');
  g.addColorStop(1, '#0f4818');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(20, 80, 12, 76, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rim light
  ctx.fillStyle = 'rgba(50,220,80,0.12)';
  ctx.beginPath();
  ctx.ellipse(25, 58, 6, 42, 0.2, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

// ---- Bush ----------------------------------------------------------------
// Low leafy shrub from stacked ovals. Canvas: 80 × 56.

function makeBush() {
  const [c, ctx] = mc(80, 56);

  const blobs = [
    { cx: 18, cy: 42, rx: 18, ry: 15, col: '#0a5a14' },
    { cx: 40, cy: 38, rx: 22, ry: 18, col: '#0c6818' },
    { cx: 62, cy: 42, rx: 16, ry: 13, col: '#0a5a14' },
    { cx: 30, cy: 28, rx: 16, ry: 13, col: '#0f8022' },
    { cx: 52, cy: 26, rx: 14, ry: 11, col: '#0f8022' },
  ];
  for (const b of blobs) {
    ctx.fillStyle = b.col;
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Specular highlights
  ctx.fillStyle = 'rgba(40,200,60,0.13)';
  for (const [cx, cy] of [[22, 24], [44, 22], [56, 30]]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return c;
}

// ---- Rock ----------------------------------------------------------------
// Rounded boulder with highlight and crevice. Canvas: 80 × 56.

function makeRock() {
  const [c, ctx] = mc(80, 56);

  // Ground shadow (drawn into the sprite so it scales with it)
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(42, 52, 32, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main body
  ctx.fillStyle = '#7a7a7a';
  ctx.beginPath();
  ctx.moveTo(10, 50);
  ctx.bezierCurveTo(2, 30, 14, 8, 32, 6);
  ctx.bezierCurveTo(50, 4, 72, 14, 74, 34);
  ctx.bezierCurveTo(76, 48, 62, 54, 48, 52);
  ctx.bezierCurveTo(34, 54, 14, 58, 10, 50);
  ctx.fill();

  // Lit face
  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath();
  ctx.ellipse(38, 26, 20, 12, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Crevice
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(42, 14);
  ctx.quadraticCurveTo(46, 30, 50, 46);
  ctx.stroke();

  return c;
}

// ---- Billboards ----------------------------------------------------------
// Canvas: 140 × 128.  Three art variants keyed by index 0–2.

const _BOARDS = [
  { bg: '#dd2222', stripe: '#ffffff', label: 'GAS',  body: 'NEXT EXIT',         labelCol: '#ffffff', bodyCol: '#ffee00' },
  { bg: '#f5c542', stripe: '#cc2222', label: 'EAT',  body: 'HOT FOOD  2km',     labelCol: '#cc2222', bodyCol: '#441100' },
  { bg: '#1a44aa', stripe: '#88aaff', label: 'INN',  body: 'SEA BREEZE HOTEL',  labelCol: '#ffffff', bodyCol: '#fffbe0' },
];

function makeBillboard(variant) {
  const [c, ctx] = mc(140, 128);
  const v = _BOARDS[variant % _BOARDS.length];

  // Posts
  ctx.fillStyle = '#484848';
  ctx.fillRect(20, 80, 8, 48);
  ctx.fillRect(112, 80, 8, 48);

  // Board face
  ctx.fillStyle = v.bg;
  ctx.fillRect(6, 6, 128, 74);

  // Header stripe
  ctx.fillStyle = v.stripe;
  ctx.fillRect(6, 6, 128, 16);

  // Bottom stripe
  ctx.fillStyle = v.stripe;
  ctx.fillRect(6, 70, 128, 8);

  // Main label
  ctx.fillStyle = v.labelCol;
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(v.label, 70, 60);

  // Sub-text
  ctx.fillStyle = v.bodyCol;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(v.body, 70, 72);

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 128, 74);

  return c;
}

// ---- Cactus (saguaro) --------------------------------------------------------
// Two-armed desert cactus. Canvas: 60 × 180.

function makeCactus() {
  const [c, ctx] = mc(60, 180);

  // Traces the full silhouette: trunk + left arm (higher) + right arm (lower).
  // Rounded caps are patched on separately as top-semicircles.
  function shape(col, tx, tw, la, lat, ra, rat) {
    const tr = tx + tw, lw = tx - la, rw = ra - tr;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(tx, 180);
    ctx.lineTo(tx, 80);   ctx.lineTo(la, 80);              // trunk down to left arm
    ctx.lineTo(la, lat);  ctx.lineTo(tx, lat);              // up left arm, back to trunk
    ctx.lineTo(tx, 6);
    ctx.quadraticCurveTo(tx + tw / 2, 0, tr, 6);           // rounded trunk top
    ctx.lineTo(tr, rat);  ctx.lineTo(ra, rat);              // down to right arm top
    ctx.lineTo(ra, rat + 30); ctx.lineTo(tr, rat + 30);    // right arm body
    ctx.lineTo(tr, 180);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(la + lw / 2, lat, lw / 2, Math.PI, 0); ctx.fill(); // left cap
    ctx.beginPath(); ctx.arc(ra - rw / 2, rat, rw / 2, Math.PI, 0); ctx.fill(); // right cap
  }

  shape('#1c4a0c', 17, 26,  3, 47, 57, 60); // dark outline/shadow
  shape('#2a6814', 18, 24,  5, 48, 55, 61); // main body
  ctx.fillStyle = '#3d8c22';
  ctx.fillRect(38, 6, 4, 174); // highlight strip on trunk right face

  return c;
}

// ---- City buildings ----------------------------------------------------------
// Three architectural variants for the CITY biome.

function makeBuilding(variant) {
  const V = [
    // 0: Glass tower — tall, blue-tinted, lots of windows
    { w: 80,  h: 280, base: '#131e34', face: '#1e3058', lit: '#2a4880',
      win: '#4a78aa', glint: '#88b4d8', winH: 5, rowH: 10, cols: 4 },
    // 1: Concrete block — wide, grey, horizontal banding
    { w: 100, h: 220, base: '#383838', face: '#585858', lit: '#6e6e6e',
      win: '#3a5a78', glint: '#5e80a0', winH: 6, rowH: 13, cols: 5 },
    // 2: Brick tower — brownish stone, stepped top
    { w: 80,  h: 260, base: '#2e1a0c', face: '#4a2c18', lit: '#6a3e24',
      win: '#4a6898', glint: '#7090c0', winH: 6, rowH: 12, cols: 3 },
  ][variant % 3];

  const [c, ctx] = mc(V.w, V.h);
  const W = V.w, H = V.h;

  // Shadow side (left ~20%)
  ctx.fillStyle = V.base;
  ctx.fillRect(0, 0, W, H);

  // Main facade
  ctx.fillStyle = V.face;
  ctx.fillRect(W * 0.18, 0, W * 0.60, H);

  // Lit side (right ~22%)
  ctx.fillStyle = V.lit;
  ctx.fillRect(W * 0.78, 0, W * 0.22, H);

  // Window grid — deterministic on/off per cell so it doesn't flicker
  const xStart = Math.round(W * 0.22);
  const innerW = Math.round(W * 0.54);
  const colW   = innerW / V.cols;
  const winW   = Math.max(2, Math.round(colW * 0.55));
  for (let row = 1; row * V.rowH < H - 8; row++) {
    const y = H - row * V.rowH - 1;
    for (let col = 0; col < V.cols; col++) {
      const x    = Math.round(xStart + col * colW + (colW - winW) / 2);
      const hash = (row * 13 + col * 7 + variant * 5) % 8;
      ctx.fillStyle = hash > 1 ? V.win : V.base; // 75% windows lit
      ctx.fillRect(x, Math.round(y), winW, V.winH);
      if (hash > 4) { // glint on brightest windows
        ctx.fillStyle = V.glint;
        ctx.fillRect(x + 1, Math.round(y) + 1, Math.max(1, winW - 2), 2);
      }
    }
  }

  // Roofline detail per variant
  if (variant === 0) {
    // Slim antenna spire
    ctx.fillStyle = V.lit;
    ctx.fillRect(Math.round(W * 0.46), 0, Math.round(W * 0.08), 14);
  } else if (variant === 1) {
    // HVAC / rooftop plant room
    ctx.fillStyle = V.base;
    ctx.fillRect(Math.round(W * 0.18), 0, Math.round(W * 0.64), 14);
    ctx.fillStyle = V.face;
    ctx.fillRect(Math.round(W * 0.28), 0, Math.round(W * 0.44), 8);
  } else {
    // Stepped setbacks (art deco)
    ctx.fillStyle = V.face;
    ctx.fillRect(Math.round(W * 0.10), 0, Math.round(W * 0.80), 22);
    ctx.fillRect(Math.round(W * 0.22), 0, Math.round(W * 0.56), 13);
    ctx.fillRect(Math.round(W * 0.34), 0, Math.round(W * 0.32),  6);
  }

  return c;
}

// ---- Beach / sea grass -------------------------------------------------------
// Wispy dune-grass clumps evoking a coastal roadside. Canvas: 80 × 50.

function makeSeagrass() {
  const [c, ctx] = mc(80, 50);
  ctx.lineCap = 'round';

  // [baseX, cpX, cpY, tipX, tipY, color]  — base Y is always 50 (canvas bottom)
  const blades = [
    [10,  8, 28,  4, 10, '#4e7022'],
    [13, 15, 24, 20,  6, '#5e8228'],
    [15, 18, 30, 22, 12, '#4a6a1e'],
    [32, 28, 22, 24,  4, '#5e8228'],
    [36, 36, 18, 38,  2, '#6a9030'],
    [40, 44, 24, 50,  8, '#5e8228'],
    [44, 48, 28, 54, 12, '#4e7022'],
    [60, 56, 26, 52,  8, '#5e8228'],
    [64, 64, 20, 66,  4, '#6a9030'],
    [68, 72, 28, 76, 12, '#4e7022'],
    [71, 74, 24, 78,  8, '#4a6a1e'],
  ];

  for (const [bx, cpx, cpy, tx, ty, col] of blades) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(bx, 50);
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
    ctx.stroke();
  }

  return c;
}

// ---- Buoy -------------------------------------------------------------------
// IALA channel marker buoy: conical float, cage superstructure, beacon light.
// Canvas: 64 × 168.

function makeBuoy() {
  const [c, ctx] = mc(64, 168);
  const cx = 32;

  // Water surface ripples at base
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + (i - 1) * 3, 160 + i * 2, 14 - i * 2, 3 + i * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,30,80,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, 162, 18, 4.5, 0, 0, Math.PI * 2); ctx.fill();

  // Float body — conical bezier (wide at waterline, narrows to cage neck)
  const floatClip = new Path2D();
  floatClip.moveTo(cx - 25, 154);
  floatClip.bezierCurveTo(cx - 29, 126, cx - 22, 98, cx - 10, 76);
  floatClip.lineTo(cx + 10, 76);
  floatClip.bezierCurveTo(cx + 22, 98, cx + 29, 126, cx + 25, 154);
  floatClip.closePath();

  const fg = ctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
  fg.addColorStop(0,    '#7a0f06');
  fg.addColorStop(0.18, '#cc2211');
  fg.addColorStop(0.44, '#ff3322');
  fg.addColorStop(0.65, '#cc1e0e');
  fg.addColorStop(1,    '#7a0f06');
  ctx.fillStyle = fg;
  ctx.fill(floatClip);

  // White horizontal band clipped to float outline
  ctx.save();
  ctx.clip(floatClip);
  ctx.fillStyle = '#dadad0';
  ctx.fillRect(0, 110, 64, 18);
  // Number "4" marking
  ctx.fillStyle = '#5a0a04';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('4', cx, 140);
  ctx.restore();

  // Highlight sheen on left face
  ctx.fillStyle = 'rgba(255,210,190,0.20)';
  ctx.beginPath();
  ctx.ellipse(cx - 10, 118, 8, 28, -0.18, 0, Math.PI * 2);
  ctx.fill();

  // Neck (float top → cage)
  const nk = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
  nk.addColorStop(0, '#660d05'); nk.addColorStop(0.5, '#aa1a0a'); nk.addColorStop(1, '#660d05');
  ctx.fillStyle = nk;
  ctx.fillRect(cx - 9, 66, 18, 14);

  // Cage bottom ring
  ctx.strokeStyle = '#7c7c7c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, 67, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();

  // Cage struts (4 diagonals + cross brace)
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 11, 67); ctx.lineTo(cx - 5, 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 11, 67); ctx.lineTo(cx + 5, 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, 67); ctx.lineTo(cx - 2, 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 4, 67); ctx.lineTo(cx + 2, 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 9, 57); ctx.lineTo(cx + 9, 57); ctx.stroke();
  // Cage top ring
  ctx.beginPath(); ctx.ellipse(cx, 46, 6, 2, 0, 0, Math.PI * 2); ctx.stroke();

  // Lantern housing
  ctx.fillStyle = '#303030';
  ctx.fillRect(cx - 6, 38, 12, 10);
  ctx.fillStyle = '#444';
  ctx.beginPath(); ctx.ellipse(cx, 38, 6, 2, 0, 0, Math.PI * 2); ctx.fill();

  // Beacon glow
  const gg = ctx.createRadialGradient(cx, 33, 0, cx, 33, 18);
  gg.addColorStop(0,    'rgba(255,245,80,0.98)');
  gg.addColorStop(0.22, 'rgba(255,220,30,0.70)');
  gg.addColorStop(0.55, 'rgba(255,180,0,0.25)');
  gg.addColorStop(1,    'rgba(255,150,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(cx, 33, 18, 0, Math.PI * 2); ctx.fill();

  // Light core
  ctx.fillStyle = '#fff8c0';
  ctx.beginPath(); ctx.arc(cx, 33, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, 33, 2, 0, Math.PI * 2); ctx.fill();

  // Antenna shaft + warning ball
  ctx.strokeStyle = '#848484'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, 38); ctx.lineTo(cx, 6); ctx.stroke();
  ctx.fillStyle = '#ff2200';
  ctx.beginPath(); ctx.arc(cx, 6, 3, 0, Math.PI * 2); ctx.fill();

  return c;
}

// ---- Tire stack -------------------------------------------------------------
// Stack of 3 used racing tires. Canvas: 80 × 72.

function makeTireStack() {
  const [c, ctx] = mc(80, 72);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(40, 68, 34, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Draw tires bottom-to-top so upper tires overdraw lower
  for (let i = 2; i >= 0; i--) {
    const cy = 60 - i * 18;
    const rx = 28 - i * 1.5;       // slight fore-shortening going up
    const ry = rx * 0.36;

    // Tread outer ring (black rubber)
    ctx.fillStyle = '#181818';
    ctx.beginPath(); ctx.ellipse(40, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

    // Tread shoulder highlight (worn rubber sheen)
    ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(40, cy, rx - 1.5, ry - 0.8, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();

    // Inner sidewall
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(40, cy, rx * 0.60, ry * 0.60, 0, 0, Math.PI * 2); ctx.fill();

    // Rim (silver metal hub)
    const rg = ctx.createRadialGradient(36, cy - 1, 1, 40, cy, rx * 0.42);
    rg.addColorStop(0, '#c8c8c8'); rg.addColorStop(0.4, '#909090'); rg.addColorStop(1, '#606060');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(40, cy, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill();

    // Rim spokes (4)
    ctx.strokeStyle = '#787878'; ctx.lineWidth = 1.5;
    const spoke_angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (const a of spoke_angles) {
      ctx.beginPath();
      ctx.moveTo(40 + Math.cos(a) * rx * 0.12, cy + Math.sin(a) * ry * 0.12);
      ctx.lineTo(40 + Math.cos(a) * rx * 0.38, cy + Math.sin(a) * ry * 0.38);
      ctx.stroke();
    }

    // Centre cap
    ctx.fillStyle = '#505050';
    ctx.beginPath(); ctx.ellipse(40, cy, rx * 0.10, ry * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  }

  return c;
}

// ---- Leaderboard / timing board -------------------------------------------
// Electronic results display on an A-frame pole stand. Canvas: 96 × 200.

function makeLeaderboard() {
  const [c, ctx] = mc(96, 200);

  // A-frame legs
  ctx.strokeStyle = '#5a5a5a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(20, 196); ctx.lineTo(36, 138); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(76, 196); ctx.lineTo(60, 138); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8, 196); ctx.lineTo(36, 138); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(88, 196); ctx.lineTo(60, 138); ctx.stroke();
  // Cross brace
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(16, 176); ctx.lineTo(80, 176); ctx.stroke();
  ctx.lineCap = 'butt';

  // Board outer frame (aluminium)
  ctx.fillStyle = '#626262';
  ctx.fillRect(4, 8, 88, 132);

  // Board inner screen (dark LED matrix)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(8, 12, 80, 124);

  // Header row
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LAP TIMES', 48, 24);
  ctx.fillStyle = '#444';
  ctx.fillRect(8, 26, 80, 1);

  // Result rows (LED amber color)
  const rows = [
    ['1', 'HAWK', '43.21'],
    ['2', 'SILVA', '43.87'],
    ['3', 'BURNS', '44.10'],
    ['4', 'KATO', '44.82'],
    ['5', 'FORD', '45.13'],
  ];
  ctx.font = '7px monospace';
  rows.forEach(([rank, name, time], i) => {
    const y = 37 + i * 20;
    const isTop = i === 0;
    ctx.fillStyle = isTop ? '#ffdd00' : '#dd7700';
    // Rank
    ctx.textAlign = 'left';
    ctx.fillText(rank + '.', 12, y);
    // Name
    ctx.fillText(name, 24, y);
    // Time
    ctx.textAlign = 'right';
    ctx.fillText(time, 84, y);
    // Separator line
    if (i < rows.length - 1) {
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(10, y + 4, 76, 1);
    }
  });

  // Frame edge highlight (aluminium bevel)
  ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
  ctx.strokeRect(4, 8, 88, 132);
  ctx.strokeStyle = '#383838';
  ctx.strokeRect(8, 12, 80, 124);

  return c;
}

// ---- Asteroid ---------------------------------------------------------------
// Jagged cratered space rock — darker, more irregular than earth rock. Canvas: 96 × 72.

function makeAsteroid() {
  const [c, ctx] = mc(96, 72);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,20,0.30)';
  ctx.beginPath(); ctx.ellipse(50, 68, 36, 7, 0, 0, Math.PI * 2); ctx.fill();

  // Jagged main body using irregular polygon
  ctx.fillStyle = '#3a3540';
  ctx.beginPath();
  const pts = [
    [14, 52], [4, 36], [10, 20], [22, 8], [40, 4], [58, 6],
    [74, 10], [88, 22], [90, 38], [82, 52], [68, 60], [48, 64], [28, 62],
  ];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath(); ctx.fill();

  // Mid-tone face
  ctx.fillStyle = '#52485c';
  ctx.beginPath();
  ctx.moveTo(22, 50); ctx.lineTo(12, 34); ctx.lineTo(20, 18); ctx.lineTo(42, 12);
  ctx.lineTo(62, 14); ctx.lineTo(74, 26); ctx.lineTo(70, 46); ctx.lineTo(52, 56);
  ctx.closePath(); ctx.fill();

  // Lit upper-left patch
  ctx.fillStyle = '#6e6078';
  ctx.beginPath(); ctx.ellipse(36, 24, 18, 11, -0.4, 0, Math.PI * 2); ctx.fill();

  // Craters
  for (const [cx2, cy, r] of [[54, 38, 8], [30, 44, 5], [66, 24, 5], [40, 20, 3]]) {
    ctx.fillStyle = '#29222e';
    ctx.beginPath(); ctx.arc(cx2, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a5060'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx2 - 1, cy - 1, r * 0.6, Math.PI * 1.3, Math.PI * 1.9); ctx.stroke();
  }

  // Surface specks
  ctx.fillStyle = '#8a7890';
  for (const [x, y] of [[28, 18], [60, 18], [70, 36], [44, 48]]) {
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }

  return c;
}

// ---- Space beacon -----------------------------------------------------------
// Glowing navigation pylon — neon blue with antenna. Canvas: 48 × 160.

function makeSpaceBeacon() {
  const [c, ctx] = mc(48, 160);
  const cx = 24;

  // Base glow on ground
  const bg = ctx.createRadialGradient(cx, 155, 0, cx, 155, 22);
  bg.addColorStop(0, 'rgba(80,140,255,0.40)'); bg.addColorStop(1, 'rgba(80,140,255,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 130, 48, 30);

  // Base plinth
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(8, 132, 32, 22);
  ctx.fillStyle = '#2a2a44';
  ctx.fillRect(10, 132, 28, 18);

  // Tower shaft
  const shaftG = ctx.createLinearGradient(12, 0, 36, 0);
  shaftG.addColorStop(0, '#0a1030'); shaftG.addColorStop(0.4, '#1c2860'); shaftG.addColorStop(1, '#0a1030');
  ctx.fillStyle = shaftG;
  ctx.fillRect(16, 28, 16, 106);

  // Neon accent rings every 20px
  for (let y = 40; y < 130; y += 22) {
    const rg = ctx.createLinearGradient(0, y, 48, y);
    rg.addColorStop(0, 'rgba(60,120,255,0)');
    rg.addColorStop(0.5, 'rgba(100,180,255,0.75)');
    rg.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, y, 48, 3);
  }

  // Strobe beacon body
  const bkG = ctx.createRadialGradient(cx, 20, 0, cx, 20, 18);
  bkG.addColorStop(0, '#99ddff'); bkG.addColorStop(0.4, '#3388ff'); bkG.addColorStop(1, '#1133aa');
  ctx.fillStyle = bkG;
  ctx.beginPath(); ctx.arc(cx, 20, 14, 0, Math.PI * 2); ctx.fill();

  // Strobe glow
  const sg = ctx.createRadialGradient(cx, 20, 0, cx, 20, 28);
  sg.addColorStop(0, 'rgba(120,200,255,0.55)'); sg.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, 20, 28, 0, Math.PI * 2); ctx.fill();

  // Antenna tip
  ctx.fillStyle = '#88aacc';
  ctx.fillRect(cx - 1, 0, 2, 8);
  ctx.fillStyle = '#ffdd88';
  ctx.beginPath(); ctx.arc(cx, 2, 2.5, 0, Math.PI * 2); ctx.fill();

  return c;
}

// ---- Hay bale ---------------------------------------------------------------
// Rectangular straw bale: golden tan with binding twine. Canvas: 96 × 64.

function makeHaybale() {
  const [c, ctx] = mc(96, 64);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(48, 61, 38, 6, 0, 0, Math.PI * 2); ctx.fill();

  // Side face (dark)
  ctx.fillStyle = '#8a6410';
  ctx.beginPath();
  ctx.moveTo(74, 16); ctx.lineTo(88, 22); ctx.lineTo(88, 56); ctx.lineTo(74, 50);
  ctx.closePath(); ctx.fill();

  // Top face
  ctx.fillStyle = '#d4a830';
  ctx.beginPath();
  ctx.moveTo(6, 16); ctx.lineTo(74, 16); ctx.lineTo(88, 22); ctx.lineTo(20, 22);
  ctx.closePath(); ctx.fill();

  // Front face gradient
  const fg = ctx.createLinearGradient(0, 16, 0, 56);
  fg.addColorStop(0, '#e0b430'); fg.addColorStop(0.5, '#c89c20'); fg.addColorStop(1, '#a07a14');
  ctx.fillStyle = fg;
  ctx.fillRect(6, 22, 68, 34);

  // Straw texture lines (horizontal, evenly spaced)
  ctx.strokeStyle = 'rgba(180,130,20,0.55)'; ctx.lineWidth = 1.2;
  for (let y = 25; y < 54; y += 4) {
    ctx.beginPath(); ctx.moveTo(7, y); ctx.lineTo(73, y); ctx.stroke();
  }

  // Binding twine (two vertical straps)
  ctx.strokeStyle = '#4a3808'; ctx.lineWidth = 2.5;
  for (const x of [24, 52]) {
    ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, 56); ctx.stroke();
  }

  // Top twine horizontal
  ctx.beginPath(); ctx.moveTo(6, 22); ctx.lineTo(74, 22); ctx.stroke();

  // Edges
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1;
  ctx.strokeRect(6, 22, 68, 34);

  return c;
}

// ---- Dirt mound -------------------------------------------------------------
// Low earthen berm: dark soil colours. Canvas: 96 × 44.

function makeDirtMound() {
  const [c, ctx] = mc(96, 44);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(48, 41, 44, 6, 0, 0, Math.PI * 2); ctx.fill();

  // Main mound body
  const mg = ctx.createLinearGradient(0, 8, 0, 40);
  mg.addColorStop(0, '#7a4a1a'); mg.addColorStop(0.5, '#5e3610'); mg.addColorStop(1, '#3a2008');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(2, 40); ctx.bezierCurveTo(10, 38, 12, 8, 30, 6);
  ctx.bezierCurveTo(48, 4, 52, 4, 66, 6);
  ctx.bezierCurveTo(84, 8, 86, 38, 94, 40);
  ctx.closePath(); ctx.fill();

  // Lit crest
  ctx.fillStyle = '#9a6030';
  ctx.beginPath(); ctx.ellipse(48, 16, 26, 8, 0, 0, Math.PI * 2); ctx.fill();

  // Loose dirt speckles
  ctx.fillStyle = 'rgba(180,120,50,0.45)';
  for (const [x, y] of [[30, 24], [50, 18], [66, 28], [38, 36], [60, 34]]) {
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Tire rut mark across the face
  ctx.strokeStyle = 'rgba(30,10,0,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(14, 34); ctx.bezierCurveTo(30, 30, 62, 30, 82, 34); ctx.stroke();

  return c;
}

// ---- Course flag -----------------------------------------------------------
// Checkered race flag on a pole. Canvas: 72 × 160.

function makeCourseFlag() {
  const [c, ctx] = mc(72, 160);
  const px = 12; // pole x

  // Pole
  ctx.fillStyle = '#888';
  ctx.fillRect(px - 2, 10, 4, 148);

  // Ground plug
  ctx.fillStyle = '#555';
  ctx.beginPath(); ctx.ellipse(px, 155, 5, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Flag body (checkered: 4 cols × 5 rows of 14×14 squares)
  const flagX = px + 2, flagY = 10, fw = 58, fh = 70;
  const cols = 4, rows = 5;
  const cw2 = fw / cols, ch2 = fh / rows;
  for (let r = 0; r < rows; r++) {
    for (let cl = 0; cl < cols; cl++) {
      ctx.fillStyle = (r + cl) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(flagX + cl * cw2, flagY + r * ch2, cw2, ch2);
    }
  }

  // Flag border
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
  ctx.strokeRect(flagX, flagY, fw, fh);

  // Gentle wave — two subtle shading bands across the flag
  for (const waveX of [fw * 0.28, fw * 0.62]) {
    const wg = ctx.createLinearGradient(flagX + waveX, 0, flagX + waveX + fw * 0.18, 0);
    wg.addColorStop(0, 'rgba(0,0,0,0)');
    wg.addColorStop(0.5, 'rgba(0,0,0,0.14)');
    wg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(flagX + waveX, flagY, fw * 0.18, fh);
  }

  return c;
}

// ---- Lifeguard tower ---------------------------------------------------------
// Iconic PCH lifeguard station: stilts, platform, red cabin, flag. Canvas: 80 × 150.

function makeLifeguard() {
  const [c, ctx] = mc(80, 150);

  // Stilts
  ctx.fillStyle = '#8a5820';
  ctx.fillRect(14, 72, 6, 78); ctx.fillRect(60, 72, 6, 78);
  ctx.fillRect(27, 80, 5, 70); ctx.fillRect(48, 80, 5, 70);

  // Cross braces
  ctx.strokeStyle = '#7a4e18'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(14, 95); ctx.lineTo(66, 132);
  ctx.moveTo(66, 95); ctx.lineTo(14, 132);
  ctx.stroke();

  // Platform deck
  ctx.fillStyle = '#b07830';
  ctx.fillRect(8, 64, 64, 10);

  // Railing — top rail + vertical balusters
  ctx.strokeStyle = '#c88838'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(10, 56); ctx.lineTo(70, 56); ctx.stroke();
  ctx.lineWidth = 2;
  for (const x of [14, 22, 30, 38, 46, 54, 62]) {
    ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x, 72); ctx.stroke();
  }

  // Cabin body
  ctx.fillStyle = '#c03010';
  ctx.fillRect(10, 16, 60, 52);

  // Front face highlight
  ctx.fillStyle = '#d84020';
  ctx.fillRect(12, 18, 56, 30);

  // Observation window
  ctx.fillStyle = '#0a1428';
  ctx.fillRect(20, 26, 40, 22);
  ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 26, 40, 22);

  // Roof overhang
  ctx.fillStyle = '#a02010';
  ctx.fillRect(6, 10, 68, 10);

  // Flag pole + triangular flag
  ctx.fillStyle = '#aaaaaa'; ctx.fillRect(38, 0, 3, 14);
  ctx.fillStyle = '#ff3010';
  ctx.beginPath(); ctx.moveTo(41, 1); ctx.lineTo(58, 7); ctx.lineTo(41, 13); ctx.closePath(); ctx.fill();

  return c;
}

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

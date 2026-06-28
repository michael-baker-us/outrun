// Roadside scenery — draws trees, props, and billboards using the road's
// per-segment projection cache (segmentProjections, road.js).
//
// Drawing strategy (per sprite):
//   1. Ground shadow ellipse — anchors each object to the terrain.
//   2. Sprite image: try AssetManager (real PNG if loaded), then getSprite()
//      (pre-rendered procedural canvas from sprites.js).
//
// Fog is applied via globalAlpha at the segment level (same alpha for all
// sprites in that segment), matching the road fog applied in renderSegment.

import { segmentProjections, fogAlpha } from './road.js';
import { getSprite } from './sprites.js';

// Minimum road half-width before skipping sprites (avoids flicker at horizon)
const SCENERY_MIN_ROADW = 18;

// Deterministic per-segment hash for variety within biome remaps.
const _sh = i => (((i * 2654435761) >>> 0) + 1234567891) >>> 0;

// Per-biome sprite remapping applied at draw time so the same baked segment
// data renders differently in COAST vs DESERT vs CITY.
// stageIdx: 0=COAST, 1=DESERT, 2=CITY
function _stageRemap(type, stageIdx, segIdx) {
  if (stageIdx === 0) { // COAST: Pacific coast — palms, dune grass, lifeguard towers
    const h = _sh(segIdx);
    if (type === 'pine')        return (h & 7) < 3 ? 'seagrass' : 'palm';
    if (type === 'bush')        return (h & 3) < 2 ? 'seagrass' : 'bush';
    if (type === 'billboard-2') return 'lifeguard';
    return type;
  }

  if (stageIdx === 1) { // DESERT: saguaro cacti, sparse scrub, rocky
    if (type === 'pine')   return 'cactus'; // forest pines → saguaro cacti
    if (type === 'poplar') return 'bush';   // tall poplars → low desert scrub
    // palm, rock, bush, billboards stay — fits sparse desert highway feel
    return type;
  }

  if (stageIdx === 2) { // CITY: buildings, street trees, urban planters
    if (type === 'pine')  return `building-${_sh(segIdx) % 3}`;
    if (type === 'palm')  return 'poplar';
    if (type === 'rock')  return 'bush';
    return type;
  }

  if (stageIdx === 3) { // SEA: sparse buoys only — wide gaps between them
    const h = _sh(segIdx);
    if ((h & 7) > 2) return null; // keep ~37% of slots
    return 'buoy';
  }

  if (stageIdx === 4) { // SPACE: sparse asteroids, three sizes — no beacons
    const h = _sh(segIdx);
    if ((h & 3) !== 0) return null; // keep ~25% of slots
    const sz = (h >> 8) & 7;
    if (sz < 2) return 'asteroid-sm';
    if (sz < 5) return 'asteroid';
    return 'asteroid-lg';
  }

  if (stageIdx === 5) { // DIRT: leaderboards, tire stacks, hay bales, course flags
    const h = _sh(segIdx);
    if ((h & 1) !== 0) return null; // keep ~50% of slots
    const kind = (h >> 4) & 0xF;
    if (kind < 2) return 'courseflag';
    if (kind < 4) return 'leaderboard';
    if (kind < 6) return 'tirestacks';
    if (kind < 9) return 'dirtmound';
    return 'haybale';
  }

  return type;
}

// How wide each sprite type is, as a multiple of the road half-width.
// Height is derived from the pre-rendered canvas aspect ratio.
const SPRITE_WIDTHS = {
  pine:          2.0,
  palm:          2.4,
  poplar:        0.9,
  bush:          2.0,
  rock:          2.0,
  'billboard-0': 2.8,
  'billboard-1': 2.8,
  'billboard-2': 2.8,
  cactus:        1.4,
  'building-0':  3.0,
  'building-1':  3.5,
  'building-2':  2.8,
  seagrass:      2.2,
  lifeguard:     2.0,
  buoy:          1.0,
  asteroid:      2.6,
  'asteroid-sm': 1.3,
  'asteroid-lg': 4.8,
  haybale:       2.4,
  dirtmound:     2.8,
  courseflag:    0.8,
  tirestacks:    1.8,
  leaderboard:   2.2,
};

// Ground shadow ellipse x-radius as a multiple of road half-width.
const SHADOW_WX = {
  pine:          0.90,
  palm:          0.75,
  poplar:        0.45,
  bush:          1.00,
  rock:          1.00,
  'billboard-0': 0.70,
  'billboard-1': 0.70,
  'billboard-2': 0.70,
  cactus:        0.55,
  'building-0':  1.40,
  'building-1':  1.65,
  'building-2':  1.30,
  seagrass:      0.80,
  lifeguard:     0.85,
  buoy:          0.45,
  asteroid:      1.10,
  'asteroid-sm': 1.10,
  'asteroid-lg': 1.10,
  haybale:       1.00,
  dirtmound:     1.20,
  courseflag:    0.25,
  tirestacks:    0.90,
  leaderboard:   1.00,
};

let _lastSpriteCount = 0;
export function getLastSpriteCount() { return _lastSpriteCount; }

// `assets` is the game.js AssetManager instance. May be null during init.
// `stageIdx` is 0/1/2 for COAST/DESERT/CITY — controls biome sprite remapping.
export function drawScenery(ctx, segments, assets, stageIdx = 0) {
  _lastSpriteCount = 0;

  for (let i = segmentProjections.length - 1; i >= 0; i--) {
    const proj = segmentProjections[i];
    const seg  = segments[proj.segIdx];
    if (!seg.sprites || seg.sprites.length === 0) continue;
    if (proj.roadW < SCENERY_MIN_ROADW) continue;

    const fog = fogAlpha(proj.dz);

    // Clip to the hill silhouette so sprites behind crests are hidden.
    ctx.save();
    ctx.globalAlpha = Math.max(0.02, 1 - fog);
    ctx.beginPath();
    ctx.rect(0, 0, 4096, proj.clip);
    ctx.clip();

    for (const sprite of seg.sprites) {
      const type = _stageRemap(sprite.type, stageIdx, proj.segIdx);
      if (!type) continue; // null = thinned out for this stage
      const sx = proj.roadX + sprite.offset * proj.roadW;
      const sy = proj.screenY;

      _drawShadow(ctx, type, sx, sy, proj.roadW);
      _drawSprite(ctx, assets, type, sx, sy, proj.roadW);
      _lastSpriteCount++;
    }

    ctx.restore();
  }
}

const NO_SHADOW = new Set(['buoy', 'asteroid', 'asteroid-sm', 'asteroid-lg']);

function _drawShadow(ctx, type, x, baseY, roadW) {
  if (NO_SHADOW.has(type)) return;
  const rx = roadW * (SHADOW_WX[type] ?? 0.85);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, baseY, rx, rx * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

function _drawSprite(ctx, assets, type, x, baseY, roadW) {
  // Real PNG (if loaded) overrides the procedural canvas; procedural is the
  // built-in fallback that always works without any asset files present.
  const src = assets?.get(type) ?? getSprite(type);
  if (!src) return;

  const sw = src.naturalWidth  ?? src.width;
  const sh = src.naturalHeight ?? src.height;
  const w  = roadW * (SPRITE_WIDTHS[type] ?? 2.0);
  const h  = w * sh / sw;
  ctx.drawImage(src, x - w / 2, baseY - h, w, h);
}

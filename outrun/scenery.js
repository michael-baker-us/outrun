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
};

let _lastSpriteCount = 0;
export function getLastSpriteCount() { return _lastSpriteCount; }

// `assets` is the game.js AssetManager instance. May be null during init.
export function drawScenery(ctx, segments, assets) {
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
      const sx = proj.roadX + sprite.offset * proj.roadW;
      const sy = proj.screenY;

      _drawShadow(ctx, sprite.type, sx, sy, proj.roadW);
      _drawSprite(ctx, assets, sprite.type, sx, sy, proj.roadW);
      _lastSpriteCount++;
    }

    ctx.restore();
  }
}

function _drawShadow(ctx, type, x, baseY, roadW) {
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

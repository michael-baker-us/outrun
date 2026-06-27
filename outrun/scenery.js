// Roadside scenery — trees and billboards positioned using the road's
// per-segment projection cache (segmentProjections, from road.js).
// Drawn far-to-near so nearer objects overlap farther ones.

import { segmentProjections } from './road.js';

// Below this on-screen road half-width a segment is near the horizon, where
// rounding makes it flicker in and out of the draw set. Skipping sprites there
// stops the distant-tree shimmer; they fade in once they're big enough to be stable.
const SCENERY_MIN_ROADW = 16;

let _lastSpriteCount = 0;
export function getLastSpriteCount() { return _lastSpriteCount; }

export function drawScenery(ctx, segments) {
  _lastSpriteCount = 0;
  for (let i = segmentProjections.length - 1; i >= 0; i--) {
    const proj = segmentProjections[i];
    const seg = segments[proj.segIdx];
    if (!seg.sprites || seg.sprites.length === 0) continue;
    if (proj.roadW < SCENERY_MIN_ROADW) continue;

    // Clip to the hill silhouette in front of this segment so scenery behind a
    // crest is hidden instead of drawing through it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 4096, proj.clip);
    ctx.clip();

    for (const sprite of seg.sprites) {
      const screenX = proj.roadX + sprite.offset * proj.roadW;
      const baseY = proj.screenY;
      // Size scenery relative to the road's on-screen half-width.
      const roadW = proj.roadW;

      if (sprite.type === 'tree') {
        drawTree(ctx, screenX, baseY, roadW);
      } else if (sprite.type === 'billboard') {
        drawBillboard(ctx, screenX, baseY, roadW);
      }
      _lastSpriteCount++;
    }

    ctx.restore();
  }
}

function drawTree(ctx, x, baseY, roadW) {
  const h = roadW * 2.2;
  const trunkW = Math.max(2, h * 0.12);
  const canopyR = h * 0.45;
  if (h < 2) return;

  // Trunk
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x - trunkW / 2, baseY - h * 0.45, trunkW, h * 0.45);

  // Canopy (two stacked triangles)
  ctx.fillStyle = '#0a7a25';
  triangle(ctx, x, baseY - h, x - canopyR, baseY - h * 0.45, x + canopyR, baseY - h * 0.45);
  ctx.fillStyle = '#0c8c2c';
  triangle(ctx, x, baseY - h * 0.75, x - canopyR * 0.8, baseY - h * 0.3, x + canopyR * 0.8, baseY - h * 0.3);
}

function drawBillboard(ctx, x, baseY, roadW) {
  const w = roadW * 2.0;
  const h = w * 0.6;
  const postW = Math.max(2, w * 0.08);
  if (w < 3) return;

  // Posts
  ctx.fillStyle = '#444';
  ctx.fillRect(x - w / 2 + postW, baseY - h * 0.4, postW, h * 0.4);
  ctx.fillRect(x + w / 2 - postW * 2, baseY - h * 0.4, postW, h * 0.4);

  // Board
  ctx.fillStyle = '#f5c542';
  ctx.fillRect(x - w / 2, baseY - h, w, h * 0.6);
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - w / 2 + w * 0.1, baseY - h + h * 0.1, w * 0.8, h * 0.1);
}

function triangle(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

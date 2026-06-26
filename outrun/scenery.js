// Roadside scenery — trees and billboards positioned using the road's
// per-segment projection cache (segmentProjections, from road.js).
// Drawn far-to-near so nearer objects overlap farther ones.

function drawScenery(ctx, segments) {
  for (let i = segmentProjections.length - 1; i >= 0; i--) {
    const proj = segmentProjections[i];
    const seg = segments[proj.segIdx];
    if (!seg.sprites || seg.sprites.length === 0) continue;

    for (const sprite of seg.sprites) {
      const screenX = proj.roadX + sprite.offset * proj.roadW;
      const baseY = proj.screenY;
      const scale = proj.scale;

      if (sprite.type === 'tree') {
        drawTree(ctx, screenX, baseY, scale);
      } else if (sprite.type === 'billboard') {
        drawBillboard(ctx, screenX, baseY, scale);
      }
    }
  }
}

function drawTree(ctx, x, baseY, scale) {
  const h = scale * 220;
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

function drawBillboard(ctx, x, baseY, scale) {
  const w = scale * 260;
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

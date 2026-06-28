// Checkpoint gate — an overhead banner on striped poles, drawn on the road at
// the depth of the next checkpoint (dz = nextCheckpoint - distance ahead).
// Uses projectObject() from road.js so it sits on the road and follows curves.

import { projectObject } from './road.js';

const CHECKPOINT_VISIBLE_DZ = 22000; // only draw once it's within the drawn road

export function drawCheckpoint(ctx, dz) {
  if (dz <= 0 || dz > CHECKPOINT_VISIBLE_DZ) return;

  const pr = projectObject(dz, 0);
  if (!pr) return;

  const w = pr.w;                 // road half-width in px at this depth
  if (w < 1.5) return;

  const baseY  = pr.y;            // road surface
  const poleH  = w * 2.2;         // gate height
  const topY   = baseY - poleH;
  const poleW  = Math.max(2, w * 0.10);
  const leftX  = pr.x - 1.18 * w; // just outside each rumble strip
  const rightX = pr.x + 1.18 * w;

  // Clip to the hill silhouette so a gate beyond a crest is hidden by it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 4096, pr.clip);
  ctx.clip();

  drawStripedPole(ctx, leftX  - poleW / 2, topY, poleW, poleH);
  drawStripedPole(ctx, rightX - poleW / 2, topY, poleW, poleH);

  // Banner spanning the poles
  const bannerX = leftX - poleW / 2;
  const bannerW = (rightX - leftX) + poleW;
  const bannerH = Math.max(6, poleH * 0.24);
  ctx.fillStyle = '#10193a';
  ctx.fillRect(bannerX, topY, bannerW, bannerH);

  // Yellow trim top & bottom
  const trim = Math.max(1, bannerH * 0.14);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(bannerX, topY, bannerW, trim);
  ctx.fillRect(bannerX, topY + bannerH - trim, bannerW, trim);

  // Label
  const fontSize = Math.min(bannerH * 0.58, bannerW * 0.135);
  if (fontSize > 5) {
    ctx.fillStyle = '#ffe44d';
    ctx.font = `bold ${Math.round(fontSize)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHECKPOINT', pr.x, topY + bannerH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function drawStripedPole(ctx, x, y, w, h) {
  const stripes = 9;
  const sh = h / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = (i % 2) ? '#f0f0f0' : '#cc2222';
    ctx.fillRect(x, y + i * sh, w, Math.ceil(sh));
  }
}

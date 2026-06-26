// Opponent traffic — cars travelling forward along the track.
// Positioned with the same per-segment projection cache the road uses,
// so they sit correctly on curves. Collision slows the player.

const OPPONENT_COLORS = ['#2266cc', '#cccc22', '#22aa55', '#aa44cc', '#ee7711'];
const TRACK_LENGTH = NUM_SEGMENTS * SEGMENT_LENGTH;

function buildOpponents(count) {
  const opps = [];
  for (let i = 0; i < count; i++) {
    opps.push({
      z:      Math.random() * TRACK_LENGTH,
      offset: (Math.random() * 1.4 - 0.7),        // lateral position, road is [-1, 1]
      speed:  40 + Math.random() * 80,             // slower than player top speed
      color:  OPPONENT_COLORS[i % OPPONENT_COLORS.length],
    });
  }
  return opps;
}

function updateOpponents(opponents) {
  for (const opp of opponents) {
    opp.z += opp.speed;
    if (opp.z >= TRACK_LENGTH) opp.z -= TRACK_LENGTH;
  }
}

// Returns true if the player collided this frame.
function checkCollisions(opponents, car, cameraZ) {
  let hit = false;
  for (const opp of opponents) {
    let depth = opp.z - cameraZ;
    if (depth < 0) depth += TRACK_LENGTH;
    // Only the band right in front of the player can collide.
    if (depth < SEGMENT_LENGTH * 1.5 && Math.abs(car.x - opp.offset) < 0.7) {
      hit = true;
      car.speed *= 0.25; // hard slowdown on impact
    }
  }
  return hit;
}

function drawOpponents(ctx, opponents, cameraZ) {
  // Build a quick lookup from segment index to its projection.
  const projBySeg = {};
  for (const p of segmentProjections) projBySeg[p.segIdx] = p;

  // Draw far-to-near: sort by descending depth from camera.
  const ordered = opponents
    .map(opp => {
      let depth = opp.z - cameraZ;
      if (depth < 0) depth += TRACK_LENGTH;
      return { opp, depth };
    })
    .filter(o => o.depth < DRAW_DISTANCE * SEGMENT_LENGTH)
    .sort((a, b) => b.depth - a.depth);

  for (const { opp } of ordered) {
    const segIdx = Math.floor(opp.z / SEGMENT_LENGTH) % NUM_SEGMENTS;
    const proj = projBySeg[segIdx];
    if (!proj) continue;

    const x = proj.roadX + opp.offset * proj.roadW;
    const w = proj.scale * 260;
    const h = w * 0.55;
    if (w < 4) continue;

    drawOpponentSprite(ctx, x, proj.screenY, w, h, opp.color);
  }
}

function drawOpponentSprite(ctx, cx, baseY, w, h, color) {
  const x = cx - w / 2;
  const y = baseY - h;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);

  // Rear window
  ctx.fillStyle = 'rgba(20,20,40,0.8)';
  ctx.fillRect(x + w * 0.15, y + h * 0.15, w * 0.7, h * 0.4);

  // Tail lights
  ctx.fillStyle = '#ff3322';
  ctx.fillRect(x + w * 0.05, y + h * 0.65, w * 0.18, h * 0.25);
  ctx.fillRect(x + w * 0.77, y + h * 0.65, w * 0.18, h * 0.25);
}

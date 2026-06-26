// Opponent traffic — cars travelling forward along the track.
// Positioned with the same per-segment projection cache the road uses,
// so they sit correctly on curves. Collision slows and nudges the player.

const OPPONENT_COLORS = ['#2266cc', '#cccc22', '#22aa55', '#aa44cc', '#ee7711'];
// TRACK_LENGTH is defined in road.js.

const OPP_WIDTH_FACTOR = 0.34;   // car width as a fraction of road half-width
const OPP_MAX_WIDTH    = 200;    // px cap so a close car never fills the screen

// Collision is lateral-overlap of the two cars, measured in road half-widths
// (the road spans [-1, 1]). Half-width of each car: opponent = factor/2,
// player ~0.10. Their sum is how close offsets must be to actually touch.
const PLAYER_HALF_OFFSET = 0.10;
const COLLISION_HALF     = OPP_WIDTH_FACTOR / 2 + PLAYER_HALF_OFFSET; // ~0.27

function buildOpponents(count) {
  const opps = [];
  for (let i = 0; i < count; i++) {
    opps.push({
      // Spawn spread down the track but clear of the player's start zone.
      z:      2000 + Math.random() * (TRACK_LENGTH - 4000),
      offset: Math.random() * 1.2 - 0.6,           // lateral position, road is [-1, 1]
      speed:  1500 + Math.random() * 2500,          // world units / second, < player top speed
      color:  OPPONENT_COLORS[i % OPPONENT_COLORS.length],
    });
  }
  return opps;
}

function updateOpponents(opponents, dt) {
  for (const opp of opponents) {
    opp.z += opp.speed * dt;
    if (opp.z >= TRACK_LENGTH) opp.z -= TRACK_LENGTH;
  }
}

// Handle player/traffic contact. A fast hit triggers an OutRun-style spin-out;
// a slow touch just brakes you toward the blocking car's speed and nudges aside.
function checkCollisions(opponents, car, cameraZ, dt) {
  if (car.spinTime > 0) return false; // already spinning out

  let hit = false;
  for (const opp of opponents) {
    let depth = opp.z - cameraZ;
    if (depth < 0) depth += TRACK_LENGTH;
    if (depth < SEGMENT_LENGTH * 1.2 && Math.abs(car.x - opp.offset) < COLLISION_HALF) {
      hit = true;
      if (car.speed > SPIN_TRIGGER_SPEED) {
        const dir = car.x < opp.offset ? -1 : 1;                 // spin away from impact
        startSpinOut(car, dir, car.speed);                       // crash -> spin out
        return true;
      }
      // Slow contact: can't drive through, brake and ease aside.
      if (car.speed > opp.speed) {
        car.speed = Math.max(opp.speed, car.speed - 40000 * dt);
      }
      const dir = car.x < opp.offset ? -1 : 1;
      car.x += dir * 1.3 * dt;
      car.x = Math.max(-2, Math.min(2, car.x));
    }
  }
  return hit;
}

function drawOpponents(ctx, opponents, cameraZ) {
  // Draw far-to-near, projecting each car from its exact depth (continuous, so
  // cars move smoothly instead of snapping between road segments).
  const ordered = opponents
    .map(opp => {
      let depth = opp.z - cameraZ;
      if (depth < 0) depth += TRACK_LENGTH;
      return { opp, depth };
    })
    .filter(o => o.depth < DRAW_DISTANCE * SEGMENT_LENGTH)
    .sort((a, b) => b.depth - a.depth);

  for (const { opp, depth } of ordered) {
    const pr = projectObject(depth, opp.offset);
    if (!pr) continue;

    const w = Math.min(pr.w * OPP_WIDTH_FACTOR, OPP_MAX_WIDTH);
    if (w < 5) continue;

    // Clip to the hill silhouette so a car beyond a crest is hidden by it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 4096, pr.clip);
    ctx.clip();
    drawCar3D(ctx, pr.x, pr.y, w, opp.color);
    ctx.restore();
  }
}

// Opponent traffic — cars travelling forward along the track.
// Positioned with the same per-segment projection cache the road uses,
// so they sit correctly on curves. Collision slows and nudges the player.

import { SEGMENT_LENGTH, TRACK_LENGTH, DRAW_DISTANCE, projectObject, fogAlpha } from './road.js';
import { drawCar3D, drawBrakeLights, drawTailLightGlow, startSpinOut, SPIN_TRIGGER_SPEED, VEHICLE_SHAPES } from './car.js';

const OPPONENT_COLORS = ['#2266cc', '#cccc22', '#22aa55', '#aa44cc', '#ee7711'];
// sports appears twice so the majority of traffic looks like the player's car class
const VEHICLE_TYPES   = ['sports', 'sports', 'sedan', 'compact', 'truck'];

const OPP_WIDTH_FACTOR   = 0.34;
const OPP_MAX_WIDTH      = 200;
const PLAYER_HALF_OFFSET = 0.10;
export const COLLISION_HALF = OPP_WIDTH_FACTOR / 2 + PLAYER_HALF_OFFSET; // ~0.27

export function buildOpponents(count) {
  const opps = [];
  for (let i = 0; i < count; i++) {
    opps.push({
      z:            2000 + Math.random() * (TRACK_LENGTH - 4000),
      offset:       Math.random() * 1.2 - 0.6,
      speed:        1500 + Math.random() * 2500,
      color:        OPPONENT_COLORS[i % OPPONENT_COLORS.length],
      type:         VEHICLE_TYPES[i % VEHICLE_TYPES.length],
      wobblePhase:  Math.random() * Math.PI * 2,
      wobbleOffset: 0,
      braking:      false,
      brakingTimer: 1 + Math.random() * 3, // seconds until next brake-light toggle
    });
  }
  return opps;
}

export function updateOpponents(opponents, dt) {
  for (const opp of opponents) {
    opp.z += opp.speed * dt;
    if (opp.z >= TRACK_LENGTH) opp.z -= TRACK_LENGTH;

    // Subtle sinusoidal drift so traffic isn't locked on rails
    opp.wobblePhase  += dt * 0.4;
    opp.wobbleOffset  = Math.sin(opp.wobblePhase) * 0.06;

    // Randomly toggle brake lights to add visual life to traffic
    opp.brakingTimer -= dt;
    if (opp.brakingTimer <= 0) {
      opp.braking      = !opp.braking;
      opp.brakingTimer = opp.braking
        ? (0.4 + Math.random() * 0.8)   // brake flash lasts ~0.4–1.2s
        : (1.5 + Math.random() * 2.5);  // off period: 1.5–4s
    }
  }
}

// Returns true if a high-speed collision triggered a spin-out.
// Returns false if already spinning, in invuln, or no contact occurred.
export function checkCollisions(opponents, car, cameraZ, dt) {
  if (car.spinTime > 0 || car.invuln > 0) return false;

  let hit = false;
  for (const opp of opponents) {
    let depth = opp.z - cameraZ;
    if (depth < 0) depth += TRACK_LENGTH;
    if (depth < SEGMENT_LENGTH * 1.2 && Math.abs(car.x - opp.offset) < COLLISION_HALF) {
      hit = true;
      if (car.speed > SPIN_TRIGGER_SPEED) {
        const dir = car.x < opp.offset ? -1 : 1;
        startSpinOut(car, dir, car.speed);
        return true;
      }
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

export function drawOpponents(ctx, opponents, cameraZ, nightFactor = 0) {
  const ordered = opponents
    .map(opp => {
      let depth = opp.z - cameraZ;
      if (depth < 0) depth += TRACK_LENGTH;
      return { opp, depth };
    })
    .filter(o => o.depth < DRAW_DISTANCE * SEGMENT_LENGTH)
    .sort((a, b) => b.depth - a.depth);

  for (const { opp, depth } of ordered) {
    const pr = projectObject(depth, opp.offset + opp.wobbleOffset);
    if (!pr) continue;

    const w = Math.min(pr.w * OPP_WIDTH_FACTOR, OPP_MAX_WIDTH);
    if (w < 5) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0.02, 1 - fogAlpha(depth));
    ctx.beginPath();
    ctx.rect(0, 0, 4096, pr.clip);
    ctx.clip();
    drawCar3D(ctx, pr.x, pr.y, w, opp.color, opp.type);
    if (nightFactor > 0.08) drawTailLightGlow(ctx, pr.x, pr.y, w, opp.type, nightFactor);
    if (opp.braking) drawBrakeLights(ctx, pr.x, pr.y, w, opp.type);
    ctx.restore();
  }
}

import { describe, test, expect } from 'vitest';
import { buildOpponents, checkCollisions, COLLISION_HALF } from '../outrun/opponents.js';
import { SEGMENT_LENGTH, TRACK_LENGTH } from '../outrun/road.js';
import { SPIN_TRIGGER_SPEED } from '../outrun/car.js';

function makeCar(overrides = {}) {
  return {
    x: 0,
    speed: 5000,
    maxSpeed: 9000,
    accel: 14000,
    brake: 26000,
    decel: 7000,
    steerRate: 1.6,
    offRoadMax: 3000,
    offRoadDrag: 22000,
    spinTime: 0,
    spinDur: 0,
    spinAngle: 0,
    spinTotal: 0,
    spinDir: 1,
    smoke: [],
    ...overrides,
  };
}

// Opponent positioned just ahead of cameraZ=0, laterally aligned with car.x=0.
function closeOpp(overrides = {}) {
  return { z: 100, offset: 0, speed: 1000, color: '#2266cc', ...overrides };
}

describe('buildOpponents', () => {
  test('returns the requested count', () => {
    expect(buildOpponents(16)).toHaveLength(16);
    expect(buildOpponents(4)).toHaveLength(4);
  });

  test('each opponent has required fields', () => {
    for (const opp of buildOpponents(4)) {
      expect(typeof opp.z).toBe('number');
      expect(typeof opp.offset).toBe('number');
      expect(typeof opp.speed).toBe('number');
      expect(typeof opp.color).toBe('string');
    }
  });

  test('opponents spawn within the track bounds', () => {
    for (const opp of buildOpponents(32)) {
      expect(opp.z).toBeGreaterThanOrEqual(0);
      expect(opp.z).toBeLessThan(TRACK_LENGTH);
    }
  });
});

describe('checkCollisions', () => {
  test('no collision when opponent is far ahead', () => {
    const car = makeCar();
    const far = { z: 50000, offset: 0, speed: 1000, color: '#cc0' };
    // depth = 50000 > SEGMENT_LENGTH * 1.2, so no hit
    expect(checkCollisions([far], car, 0, 0.016)).toBe(false);
  });

  test('no collision when opponent is laterally out of range', () => {
    const car = makeCar({ x: 0 });
    // offset 1.0 -> |0 - 1.0| = 1.0 > COLLISION_HALF (~0.27)
    const far = closeOpp({ offset: 1.0 });
    expect(checkCollisions([far], car, 0, 0.016)).toBe(false);
  });

  test('collision detected when opponent is close and laterally overlapping', () => {
    const car = makeCar({ speed: 1000 }); // below spin trigger
    expect(checkCollisions([closeOpp()], car, 0, 0.016)).toBe(true);
  });

  test('high-speed collision triggers spin-out', () => {
    const car = makeCar({ speed: SPIN_TRIGGER_SPEED + 1 });
    checkCollisions([closeOpp()], car, 0, 0.016);
    expect(car.spinTime).toBeGreaterThan(0);
  });

  test('low-speed collision does not trigger spin-out', () => {
    const car = makeCar({ speed: SPIN_TRIGGER_SPEED - 1 });
    checkCollisions([closeOpp()], car, 0, 0.016);
    expect(car.spinTime).toBe(0);
  });

  test('already spinning: skips collision check', () => {
    const car = makeCar({ speed: 9000, spinTime: 1.0 });
    expect(checkCollisions([closeOpp()], car, 0, 0.016)).toBe(false);
  });

  test('low-speed contact bleeds player speed toward opponent speed', () => {
    // Speed must be below SPIN_TRIGGER_SPEED to get slow-contact branch.
    const car = makeCar({ speed: 2000 });
    const opp = closeOpp({ speed: 1500 });
    checkCollisions([opp], car, 0, 0.016);
    expect(car.speed).toBeLessThan(2000);
  });
});

describe('COLLISION_HALF', () => {
  test('is a positive number less than 1 road half-width', () => {
    expect(COLLISION_HALF).toBeGreaterThan(0);
    expect(COLLISION_HALF).toBeLessThan(1);
  });
});

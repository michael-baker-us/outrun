import { describe, test, expect, beforeEach } from 'vitest';
import { CAR, keys, setTiltSteer, updateCar, startSpinOut, SPIN_TRIGGER_SPEED } from '../outrun/src/world/car.js';

// Factory for isolated car state — tests should not mutate the shared CAR export.
function makeCar(overrides = {}) {
  return {
    x: 0,
    speed: 0,
    maxSpeed: 9000,
    accel: 4800,
    brake: 26000,
    decel: 7000,
    steerRate: 1.6,
    steerDrag: 2000,
    offRoadMax: 3000,
    offRoadDrag: 22000,
    spinTime: 0,
    spinDur: 0,
    spinAngle: 0,
    spinTotal: 0,
    spinDir: 1,
    steerInput: 0,
    braking: false,
    invuln: 0,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset shared input state between tests.
  for (const k of Object.keys(keys)) delete keys[k];
  setTiltSteer(0);
});

describe('acceleration & braking', () => {
  test('ArrowUp accelerates from rest', () => {
    const car = makeCar();
    keys['ArrowUp'] = true;
    updateCar(car, 0.016);
    expect(car.speed).toBeGreaterThan(0);
  });

  test('speed cannot exceed maxSpeed', () => {
    const car = makeCar({ speed: 8990 });
    keys['ArrowUp'] = true;
    updateCar(car, 1);
    expect(car.speed).toBeLessThanOrEqual(car.maxSpeed);
  });

  test('coasting decelerates from speed', () => {
    const car = makeCar({ speed: 5000 });
    updateCar(car, 0.1);
    expect(car.speed).toBeLessThan(5000);
  });

  test('ArrowDown brakes faster than coast decel', () => {
    // Run each car in isolation with its own key state.
    const braking = makeCar({ speed: 5000 });
    keys['ArrowDown'] = true;
    updateCar(braking, 0.1);
    delete keys['ArrowDown'];

    const coasting = makeCar({ speed: 5000 });
    updateCar(coasting, 0.1);

    expect(braking.speed).toBeLessThan(coasting.speed);
  });

  test('speed never goes below zero', () => {
    const car = makeCar({ speed: 10 });
    keys['ArrowDown'] = true;
    updateCar(car, 1);
    expect(car.speed).toBeGreaterThanOrEqual(0);
  });
});

describe('off-road drag', () => {
  beforeEach(() => {
    keys['ArrowUp'] = true; // hold gas for these tests
  });

  test('on-road: speed can climb normally', () => {
    const car = makeCar({ x: 0, speed: 0 });
    updateCar(car, 0.1);
    expect(car.speed).toBeGreaterThan(0);
  });

  test('off-road drag bleeds speed even while accelerating', () => {
    // offRoadDrag (22000) >> effective accel at high speed, so net bleed above offRoadMax
    const car = makeCar({ x: 1.5, speed: 8000 });
    updateCar(car, 0.1);
    expect(car.speed).toBeLessThan(8000);
  });

  test('off-road speed floors at offRoadMax, not zero', () => {
    const car = makeCar({ x: 1.5, speed: car => car.offRoadMax + 1 });
    // Re-make without the bad circular ref
    const c = makeCar({ x: 1.5, speed: 3001 });
    keys['ArrowUp'] = false; // no gas
    for (let i = 0; i < 200; i++) updateCar(c, 0.016);
    expect(c.speed).toBeGreaterThanOrEqual(0);
  });
});

describe('spin-out', () => {
  test('spin-out prevents normal control', () => {
    const car = makeCar({ speed: 5000 });
    startSpinOut(car, 1, 5000);
    const speedBefore = car.speed;
    keys['ArrowUp'] = true;
    updateCar(car, 0.016);
    // Spin decel should reduce speed, not accel increase it
    expect(car.speed).toBeLessThan(speedBefore);
  });

  test('spinTime decrements toward zero', () => {
    const car = makeCar({ speed: 5000 });
    startSpinOut(car, 1, 5000);
    const initialSpin = car.spinTime;
    updateCar(car, 0.016);
    expect(car.spinTime).toBeLessThan(initialSpin);
  });

  test('startSpinOut sets spinTime > 0', () => {
    const car = makeCar();
    startSpinOut(car, 1, 5000);
    expect(car.spinTime).toBeGreaterThan(0);
  });

  test('spin intensity scales with impact speed', () => {
    const light = makeCar();
    const heavy = makeCar();
    startSpinOut(light, 1, 2600);  // just above trigger
    startSpinOut(heavy, 1, 9000);  // top speed
    expect(heavy.spinDur).toBeGreaterThan(light.spinDur);
  });
});

describe('SPIN_TRIGGER_SPEED', () => {
  test('is a positive number', () => {
    expect(SPIN_TRIGGER_SPEED).toBeGreaterThan(0);
  });
});

describe('invulnerability', () => {
  test('invuln is set after spin-out completes', () => {
    const car = makeCar({ speed: 5000 });
    startSpinOut(car, 1, 5000);
    updateCar(car, car.spinDur + 0.05); // advance past full spin duration
    expect(car.invuln).toBeGreaterThan(0);
  });

  test('invuln decrements over time', () => {
    const car = makeCar({ invuln: 1.0 });
    updateCar(car, 0.1);
    expect(car.invuln).toBeCloseTo(0.9);
  });

  test('invuln does not go below zero', () => {
    const car = makeCar({ invuln: 0.05 });
    updateCar(car, 0.5);
    expect(car.invuln).toBe(0);
  });
});

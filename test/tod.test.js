import { describe, test, expect, beforeEach } from 'vitest';
import { updateTOD, setTODPhase, getTODPhase, getNightFactor, resetTOD } from '../outrun/src/systems/tod.js';

beforeEach(() => { resetTOD(); });

describe('getTODPhase', () => {
  test('starts at noon (0.25) after reset', () => {
    expect(getTODPhase()).toBeCloseTo(0.25);
  });

  test('setTODPhase sets an arbitrary phase', () => {
    setTODPhase(0.6);
    expect(getTODPhase()).toBeCloseTo(0.6);
  });

  test('setTODPhase wraps values >= 1', () => {
    setTODPhase(1.3);
    expect(getTODPhase()).toBeCloseTo(0.3);
  });

  test('setTODPhase wraps negative values', () => {
    setTODPhase(-0.1);
    expect(getTODPhase()).toBeCloseTo(0.9);
  });
});

describe('updateTOD', () => {
  test('advances phase proportionally to dt', () => {
    setTODPhase(0);
    updateTOD(60); // 60s of a 180s cycle = +1/3 phase
    expect(getTODPhase()).toBeCloseTo(1 / 3, 4);
  });

  test('wraps at 1', () => {
    setTODPhase(0.9);
    updateTOD(60); // +0.333, total 1.233 → wraps to 0.233
    expect(getTODPhase()).toBeCloseTo(0.9 + 1 / 3 - 1, 3);
  });
});

describe('getNightFactor', () => {
  test('is 0 at noon (phase 0.25)', () => {
    setTODPhase(0.25);
    expect(getNightFactor()).toBeCloseTo(0, 5);
  });

  test('is 1 at midnight (phase 0.75)', () => {
    setTODPhase(0.75);
    expect(getNightFactor()).toBeCloseTo(1, 5);
  });

  test('is 0.5 at dawn (phase 0)', () => {
    setTODPhase(0);
    expect(getNightFactor()).toBeCloseTo(0.5, 5);
  });

  test('is 0.5 at dusk (phase 0.5)', () => {
    setTODPhase(0.5);
    expect(getNightFactor()).toBeCloseTo(0.5, 5);
  });

  test('increases from noon to midnight', () => {
    setTODPhase(0.40);
    const a = getNightFactor();
    setTODPhase(0.60);
    const b = getNightFactor();
    expect(b).toBeGreaterThan(a);
  });
});

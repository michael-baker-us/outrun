import { describe, test, expect } from 'vitest';
import { STAGES, getStageIndex, getStage } from '../outrun/stage.js';

describe('getStageIndex', () => {
  test('returns 0 at distance 0', () => {
    expect(getStageIndex(0)).toBe(0);
  });

  test('returns 0 within first stage', () => {
    expect(getStageIndex(400_000)).toBe(0);
  });

  test('returns 1 exactly at second stage threshold', () => {
    expect(getStageIndex(STAGES[1].startDistance)).toBe(1);
  });

  test('returns 1 within second stage', () => {
    expect(getStageIndex(STAGES[1].startDistance + 100_000)).toBe(1);
  });

  test('returns 2 exactly at third stage threshold', () => {
    expect(getStageIndex(STAGES[2].startDistance)).toBe(2);
  });

  test('returns 2 at very high distance', () => {
    expect(getStageIndex(99_999_999)).toBe(2);
  });
});

describe('getStage', () => {
  test('returns COAST stage at distance 0', () => {
    expect(getStage(0).name).toBe('COAST');
  });

  test('returns DESERT stage', () => {
    expect(getStage(STAGES[1].startDistance).name).toBe('DESERT');
  });

  test('returns CITY stage', () => {
    expect(getStage(STAGES[2].startDistance).name).toBe('CITY');
  });
});

describe('STAGES data', () => {
  test('all stages have required fields', () => {
    for (const s of STAGES) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.subtitle).toBe('string');
      expect(typeof s.startDistance).toBe('number');
      expect(typeof s.trafficMultiplier).toBe('number');
    }
  });

  test('regular stage thresholds are in ascending order', () => {
    const regular = STAGES.filter(s => !s.special);
    for (let i = 1; i < regular.length; i++) {
      expect(regular[i].startDistance).toBeGreaterThan(regular[i - 1].startDistance);
    }
  });

  test('first stage starts at 0', () => {
    expect(STAGES[0].startDistance).toBe(0);
  });

  test('COAST has a road override with sandy colours', () => {
    expect(Array.isArray(STAGES[0].roadOverride?.grass)).toBe(true);
  });

  test('non-COAST stages have road overrides with grass and surface', () => {
    for (const stage of STAGES.filter(s => s.name !== 'COAST')) {
      expect(Array.isArray(stage.roadOverride.grass)).toBe(true);
      expect(Array.isArray(stage.roadOverride.surface)).toBe(true);
    }
  });
});

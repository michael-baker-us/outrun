import { describe, test, expect } from 'vitest';
import { makeRng, buildSegments, SEGMENT_LENGTH, NUM_SEGMENTS, TRACK_LENGTH } from '../outrun/road.js';

describe('makeRng (Mulberry32)', () => {
  test('same seed produces same sequence', () => {
    const rng1 = makeRng(42);
    const rng2 = makeRng(42);
    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  test('different seeds produce different first values', () => {
    const v1 = makeRng(1)();
    const v2 = makeRng(2)();
    expect(v1).not.toBe(v2);
  });

  test('output is in [0, 1)', () => {
    const rng = makeRng(99999);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('seed 0 and seed MAX_UINT produce valid sequences', () => {
    expect(() => makeRng(0)()).not.toThrow();
    expect(() => makeRng(0xffffffff)()).not.toThrow();
  });
});

describe('buildSegments', () => {
  test('returns exactly NUM_SEGMENTS segments', () => {
    const segs = buildSegments(42);
    expect(segs).toHaveLength(NUM_SEGMENTS);
  });

  test('same seed produces identical segment data', () => {
    const a = buildSegments(1234);
    const b = buildSegments(1234);
    // Spot-check first, middle, and last segments.
    expect(a[0]).toEqual(b[0]);
    expect(a[Math.floor(NUM_SEGMENTS / 2)]).toEqual(b[Math.floor(NUM_SEGMENTS / 2)]);
    expect(a[NUM_SEGMENTS - 1]).toEqual(b[NUM_SEGMENTS - 1]);
  });

  test('different seeds produce different layouts', () => {
    const a = buildSegments(1);
    const b = buildSegments(99);
    const differ = a.some((seg, i) => seg.curve !== b[i].curve || seg.y !== b[i].y);
    expect(differ).toBe(true);
  });

  test('every segment has the required fields with correct types', () => {
    const segs = buildSegments(0);
    for (const seg of segs) {
      expect(typeof seg.curve).toBe('number');
      expect(typeof seg.y).toBe('number');
      expect(typeof seg.color).toBe('number');
      expect(Array.isArray(seg.sprites)).toBe(true);
    }
  });

  test('color alternates between 0 and 1', () => {
    const segs = buildSegments(0);
    for (const seg of segs) {
      expect(seg.color === 0 || seg.color === 1).toBe(true);
    }
  });

  test('TRACK_LENGTH equals NUM_SEGMENTS * SEGMENT_LENGTH', () => {
    expect(TRACK_LENGTH).toBe(NUM_SEGMENTS * SEGMENT_LENGTH);
  });
});

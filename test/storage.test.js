import { describe, test, expect, beforeEach } from 'vitest';
import {
  getHighScores, addHighScore, isHighScore,
  saveSettings, loadSettings,
  saveLastSeed, loadLastSeed,
} from '../outrun/src/core/storage.js';

// Fake store so tests don't touch a real DOM / localStorage.
function makeStore() {
  const data = {};
  return {
    getItem(k)    { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = v; },
    removeItem(k) { delete data[k]; },
  };
}

let store;
beforeEach(() => { store = makeStore(); });

describe('getHighScores', () => {
  test('returns empty array when nothing is stored', () => {
    expect(getHighScores(store)).toEqual([]);
  });
});

describe('addHighScore', () => {
  test('adds a score', () => {
    const scores = addHighScore(100, store);
    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBe(100);
  });

  test('each score entry has a numeric date', () => {
    const [s] = addHighScore(500, store);
    expect(typeof s.date).toBe('number');
    expect(s.date).toBeGreaterThan(0);
  });

  test('sorts descending', () => {
    addHighScore(200, store);
    addHighScore(500, store);
    addHighScore(100, store);
    const scores = getHighScores(store);
    expect(scores[0].score).toBe(500);
    expect(scores[1].score).toBe(200);
    expect(scores[2].score).toBe(100);
  });

  test('keeps only the top 5', () => {
    for (let i = 1; i <= 8; i++) addHighScore(i * 100, store);
    const scores = getHighScores(store);
    expect(scores).toHaveLength(5);
    expect(scores[0].score).toBe(800);
    expect(scores[4].score).toBe(400);
  });

  test('returns the updated sorted list', () => {
    addHighScore(100, store);
    const result = addHighScore(200, store);
    expect(result[0].score).toBe(200);
  });
});

describe('isHighScore', () => {
  test('true when board has fewer than 5 entries', () => {
    addHighScore(100, store);
    expect(isHighScore(50, store)).toBe(true);
  });

  test('true when score beats the lowest of 5', () => {
    for (let i = 1; i <= 5; i++) addHighScore(i * 100, store);
    // lowest on the board is 100; 150 > 100 → qualifies
    expect(isHighScore(150, store)).toBe(true);
  });

  test('false when score does not beat the lowest of 5', () => {
    for (let i = 1; i <= 5; i++) addHighScore(i * 1000, store);
    expect(isHighScore(50, store)).toBe(false);
  });
});

describe('settings persistence', () => {
  test('loadSettings returns null when nothing stored', () => {
    expect(loadSettings(store)).toBeNull();
  });

  test('round-trips settings object', () => {
    saveSettings({ motionBlur: false, filmGrain: true, volume: 0.4 }, store);
    const s = loadSettings(store);
    expect(s.motionBlur).toBe(false);
    expect(s.filmGrain).toBe(true);
    expect(s.volume).toBeCloseTo(0.4);
  });
});

describe('seed persistence', () => {
  test('loadLastSeed returns null when nothing stored', () => {
    expect(loadLastSeed(store)).toBeNull();
  });

  test('round-trips seed value', () => {
    saveLastSeed(987654, store);
    expect(loadLastSeed(store)).toBe(987654);
  });
});

import { describe, test, expect, beforeEach } from 'vitest';
import {
  setWeather, getWeatherMode,
  getGripMultiplier, getExtraFogDensity,
  updateWeather, resetWeather,
} from '../outrun/src/systems/weather.js';

beforeEach(() => { resetWeather(); });

describe('weather modes', () => {
  test('starts clear after reset', () => {
    expect(getWeatherMode()).toBe('clear');
  });

  test('setWeather("rain") changes mode', () => {
    setWeather('rain');
    expect(getWeatherMode()).toBe('rain');
  });

  test('setWeather("clear") restores clear', () => {
    setWeather('rain');
    setWeather('clear');
    expect(getWeatherMode()).toBe('clear');
  });
});

describe('getGripMultiplier', () => {
  test('returns 1.0 in clear', () => {
    expect(getGripMultiplier()).toBe(1.0);
  });

  test('returns 0.82 in rain', () => {
    setWeather('rain');
    expect(getGripMultiplier()).toBe(0.82);
  });
});

describe('getExtraFogDensity', () => {
  test('returns 0 in clear', () => {
    expect(getExtraFogDensity()).toBe(0);
  });

  test('returns a positive value in rain', () => {
    setWeather('rain');
    expect(getExtraFogDensity()).toBeGreaterThan(0);
    expect(getExtraFogDensity()).toBeLessThanOrEqual(1);
  });
});

describe('updateWeather', () => {
  test('can advance weather state without throwing', () => {
    setWeather('rain');
    expect(() => updateWeather(0.016)).not.toThrow();
    expect(() => updateWeather(0.016)).not.toThrow();
  });

  test('clear weather update is a no-op', () => {
    expect(() => updateWeather(1.0)).not.toThrow();
  });
});

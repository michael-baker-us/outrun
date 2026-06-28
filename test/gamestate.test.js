import { describe, test, expect, beforeEach } from 'vitest';
import { getGameState, setGameState, onEnterState, onExitState, resetGameState } from '../outrun/src/core/gamestate.js';

beforeEach(() => { resetGameState(); });

describe('getGameState', () => {
  test('starts at title after reset', () => {
    expect(getGameState()).toBe('title');
  });

  test('setGameState changes state', () => {
    setGameState('playing');
    expect(getGameState()).toBe('playing');
  });

  test('setGameState is a no-op if already in that state', () => {
    let count = 0;
    onEnterState('title', () => count++);
    setGameState('title'); // same state — no transition
    expect(count).toBe(0);
  });

  test('supports all named states', () => {
    for (const s of ['playing', 'paused', 'settings', 'gameover', 'title']) {
      setGameState(s);
      expect(getGameState()).toBe(s);
    }
  });
});

describe('onEnterState', () => {
  test('fires when entering the registered state', () => {
    let fired = false;
    onEnterState('playing', () => { fired = true; });
    setGameState('playing');
    expect(fired).toBe(true);
  });

  test('does not fire when entering a different state', () => {
    let fired = false;
    onEnterState('gameover', () => { fired = true; });
    setGameState('playing');
    expect(fired).toBe(false);
  });

  test('fires on every subsequent entry', () => {
    let count = 0;
    onEnterState('paused', () => count++);
    setGameState('playing'); setGameState('paused');
    setGameState('playing'); setGameState('paused');
    expect(count).toBe(2);
  });
});

describe('onExitState', () => {
  test('fires when leaving the registered state', () => {
    let exited = false;
    onExitState('title', () => { exited = true; });
    setGameState('playing');
    expect(exited).toBe(true);
  });

  test('exit fires before enter', () => {
    const order = [];
    onExitState('title',   () => order.push('exit'));
    onEnterState('playing', () => order.push('enter'));
    setGameState('playing');
    expect(order).toEqual(['exit', 'enter']);
  });
});

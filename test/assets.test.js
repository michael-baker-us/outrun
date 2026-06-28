import { describe, test, expect } from 'vitest';
import { AssetManager } from '../outrun/src/world/assets.js';

describe('AssetManager — no assets registered', () => {
  test('progress is 1 when nothing is registered', () => {
    expect(new AssetManager().progress).toBe(1);
  });

  test('ready is true when nothing is registered', () => {
    expect(new AssetManager().ready).toBe(true);
  });

  test('get returns null for any unregistered key', () => {
    expect(new AssetManager().get('nonexistent')).toBeNull();
  });

  test('getFallback returns null for unregistered key', () => {
    expect(new AssetManager().getFallback('nonexistent')).toBeNull();
  });
});

describe('AssetManager — successful load', () => {
  test('get returns the resolved image after load', async () => {
    const mockImg = { naturalWidth: 64, naturalHeight: 64 };
    const am = new AssetManager({ loader: () => Promise.resolve(mockImg) });
    am.add('tree', 'assets/tree.png');
    await am.load();
    expect(am.get('tree')).toBe(mockImg);
  });

  test('ready is true and progress is 1 after load', async () => {
    const am = new AssetManager({ loader: () => Promise.resolve({}) });
    am.add('a', 'a.png');
    await am.load();
    expect(am.ready).toBe(true);
    expect(am.progress).toBe(1);
  });
});

describe('AssetManager — failed load (404 / fallback)', () => {
  test('get returns null when loader rejects', async () => {
    const am = new AssetManager({ loader: () => Promise.reject(new Error('404')) });
    am.add('tree', 'assets/tree.png', () => 'fallback');
    await am.load();
    expect(am.get('tree')).toBeNull();
  });

  test('getFallback returns the registered function', async () => {
    const fb = () => 'procedural';
    const am = new AssetManager({ loader: () => Promise.reject() });
    am.add('tree', 'assets/tree.png', fb);
    await am.load();
    expect(am.getFallback('tree')).toBe(fb);
    expect(am.getFallback('tree')()).toBe('procedural');
  });

  test('ready is true and progress is 1 even when all assets fail', async () => {
    const am = new AssetManager({ loader: () => Promise.reject() });
    am.add('a', 'a.png');
    am.add('b', 'b.png');
    await am.load();
    expect(am.ready).toBe(true);
    expect(am.progress).toBe(1);
  });
});

describe('AssetManager — mixed success and failure', () => {
  test('good asset resolves, bad asset falls back', async () => {
    const good = { naturalWidth: 32, naturalHeight: 32 };
    const am = new AssetManager({
      loader: (url) => url.includes('bad') ? Promise.reject() : Promise.resolve(good),
    });
    am.add('good', 'good.png');
    am.add('bad',  'bad.png', () => 'fb');
    await am.load();
    expect(am.get('good')).toBe(good);
    expect(am.get('bad')).toBeNull();
    expect(am.getFallback('bad')()).toBe('fb');
  });
});

describe('AssetManager — progress tracking', () => {
  test('progress increments as each asset settles', async () => {
    const resolvers = [];
    const loader = () => new Promise(r => resolvers.push(r));
    const am = new AssetManager({ loader });
    am.add('a', 'a.png');
    am.add('b', 'b.png');

    const loadPromise = am.load();
    expect(am.progress).toBe(0);
    expect(am.ready).toBe(false);

    resolvers[0]({});
    // Drain the microtask queue: loader resolves → .then() → .finally() = 3 ticks.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(am.progress).toBeCloseTo(0.5);
    expect(am.ready).toBe(false);

    resolvers[1]({});
    await loadPromise;
    expect(am.progress).toBe(1);
    expect(am.ready).toBe(true);
  });
});

describe('AssetManager — chaining', () => {
  test('add() returns the instance for chaining', () => {
    const am = new AssetManager();
    expect(am.add('a', 'a.png')).toBe(am);
  });
});

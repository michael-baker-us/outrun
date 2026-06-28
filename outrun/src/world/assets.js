// Asset manager — async image/audio loading with progress tracking and
// procedural fallbacks. The injectable `loader` option lets tests run without
// a DOM by supplying a mock that resolves or rejects synchronously.
//
// Usage:
//   const am = new AssetManager();
//   am.add('pine', 'assets/pine.png', proceduralFallbackFn);
//   await am.load();
//   const img = am.get('pine');  // null if 404 → caller uses fallback

const _defaultLoader = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`404: ${url}`));
    img.src = url;
  });

export class AssetManager {
  constructor({ loader = _defaultLoader } = {}) {
    this._loader   = loader;
    this._manifest = [];         // { key, url, fallback? }
    this._assets   = new Map();  // key → Image | null (null = use fallback)
    this._done     = 0;
  }

  // Register an asset.  fallback(ctx, x, baseY, roadW, opts) is called when
  // the URL fails.  Returns `this` for chaining.
  add(key, url, fallback = null) {
    this._manifest.push({ key, url, fallback });
    return this;
  }

  // Begin loading all registered assets.  Returns a Promise that resolves
  // once every asset has settled (success or graceful failure).
  load() {
    if (this._manifest.length === 0) return Promise.resolve();
    const tasks = this._manifest.map(({ key, url }) =>
      this._loader(url)
        .then(img => { this._assets.set(key, img); })
        .catch(() => {
          console.warn(`[AssetManager] "${url}" unavailable — procedural fallback for "${key}"`);
          this._assets.set(key, null);
        })
        .finally(() => { this._done++; })
    );
    return Promise.all(tasks);
  }

  // True once every registered asset has settled.
  get ready() { return this._done >= this._manifest.length; }

  // 0..1 fraction of assets settled.
  get progress() { return this._manifest.length ? this._done / this._manifest.length : 1; }

  // The loaded Image, or null when the URL failed (caller uses procedural fallback).
  get(key) { return this._assets.get(key) ?? null; }

  // The registered fallback function for key, or null.
  getFallback(key) {
    return this._manifest.find(e => e.key === key)?.fallback ?? null;
  }
}

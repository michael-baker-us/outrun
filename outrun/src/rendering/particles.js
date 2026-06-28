// Pooled particle system: smoke, dust, sparks, exhaust.
// All positions are back-buffer screen-space pixels.
// When the pool is full the particle furthest through its lifespan is evicted,
// so fresh effects always displace stale ones rather than being dropped.

const MAX = 200;
const _pool = [];

function _spawn(p) {
  p.age = 0;
  if (_pool.length < MAX) { _pool.push(p); return; }
  // Evict the particle furthest through its lifespan.
  let evict = 0;
  for (let i = 1; i < _pool.length; i++) {
    if (_pool[i].age / _pool[i].max > _pool[evict].age / _pool[evict].max) evict = i;
  }
  _pool[evict] = p;
}

export function emitSmoke(cx, cy) {
  for (let k = 0; k < 2; k++) {
    _spawn({
      type: 'smoke',
      x:  cx + (Math.random() * 64 - 32), y: cy + (Math.random() * 16 - 8),
      vx: (Math.random() - 0.5) * 22,     vy: -32 - Math.random() * 18,
      max: 0.6 + Math.random() * 0.5,
      r0: 7 + Math.random() * 9,          r1: 28 + Math.random() * 14,
      color: '#d8d8d8',
    });
  }
}

export function emitDust(cx, cy) {
  for (let k = 0; k < 2; k++) {
    _spawn({
      type: 'dust',
      x:  cx + (Math.random() * 80 - 40), y: cy + (Math.random() * 12 - 6),
      vx: (Math.random() - 0.5) * 60,     vy: -25 - Math.random() * 30,
      max: 0.35 + Math.random() * 0.3,
      r0: 5 + Math.random() * 8,          r1: 20 + Math.random() * 10,
      color: '#c8a060',
    });
  }
}

export function emitSparks(cx, cy, count = 14) {
  const colors = ['#ffffff', '#ffee44', '#ff8800'];
  for (let k = 0; k < count; k++) {
    const angle = Math.PI + Math.random() * Math.PI; // 180°–360° → upward arc
    const speed = 100 + Math.random() * 200;
    _spawn({
      type: 'spark',
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      max: 0.18 + Math.random() * 0.22,
      r0: 2 + Math.random() * 3,   r1: 0,
      color: colors[k % 3],
    });
  }
}

export function emitExhaust(cx, cy) {
  _spawn({
    type: 'exhaust',
    x:  cx + (Math.random() - 0.5) * 18, y: cy,
    vx: (Math.random() - 0.5) * 10,      vy: -14 - Math.random() * 12,
    max: 0.22 + Math.random() * 0.14,
    r0: 3 + Math.random() * 3,            r1: 12 + Math.random() * 6,
    color: '#383838',
  });
}

const GRAVITY = 45; // pixels/s² downward, sparks only

export function updateParticles(dt) {
  for (let i = _pool.length - 1; i >= 0; i--) {
    const p = _pool[i];
    p.age += dt;
    if (p.age >= p.max) { _pool.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'spark') p.vy += GRAVITY * dt;
  }
}

const _ALPHA = { smoke: 0.45, dust: 0.50, spark: 0.92, exhaust: 0.35 };

export function drawParticles(ctx) {
  for (const p of _pool) {
    const t = p.age / p.max;
    const r = p.r0 + (p.r1 - p.r0) * t;
    if (r <= 0.5) continue;
    ctx.globalAlpha = (1 - t) * (_ALPHA[p.type] ?? 0.45);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function resetParticles()   { _pool.length = 0; }
export function getParticleCount() { return _pool.length; }

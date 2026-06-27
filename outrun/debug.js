// Dev debug overlay — toggle with backtick/~ or force on with ?debug=1.
// Tracks FPS, frame time, physics steps per frame, and draw counts.

let _visible = false;
let _frameStartMs = 0;
let _lastFrameMs = 0;
let _physicsStepCounter = 0;
let _physicsStepsLastFrame = 0;
let _fpsFrameCount = 0;
let _fpsWindowStart = 0;
let _fpsDisplay = 0;

export function initDebug() {
  const forceOn = new URLSearchParams(location.search).has('debug');
  if (forceOn) _visible = true;
  document.addEventListener('keydown', e => {
    if (e.key === '`' || e.key === '~') _visible = !_visible;
  });
  _fpsWindowStart = performance.now();
}

export function recordFrameStart(now) {
  _frameStartMs = now;
  _physicsStepCounter = 0;
}

export function recordPhysicsStep() {
  _physicsStepCounter++;
}

export function recordFrameEnd(now) {
  _lastFrameMs = now - _frameStartMs;
  _physicsStepsLastFrame = _physicsStepCounter;
  _fpsFrameCount++;
  const elapsed = now - _fpsWindowStart;
  if (elapsed >= 500) {
    _fpsDisplay = Math.round(_fpsFrameCount * 1000 / elapsed);
    _fpsFrameCount = 0;
    _fpsWindowStart = now;
  }
}

export function isDebugVisible() { return _visible; }

export function drawDebugOverlay(ctx, w, h, { seed, car, segmentsDrawn, spritesDrawn, particles }) {
  if (!_visible) return;

  const lines = [
    `FPS: ${_fpsDisplay}  frame: ${_lastFrameMs.toFixed(1)}ms`,
    `physics steps/frame: ${_physicsStepsLastFrame}`,
    `segs: ${segmentsDrawn}  sprites: ${spritesDrawn}  particles: ${particles ?? 0}`,
    `seed: ${seed}`,
    `spd: ${Math.round(car.speed)}  x: ${car.x.toFixed(2)}  spin: ${car.spinTime.toFixed(2)}  invuln: ${car.invuln?.toFixed(1) ?? 0}`,
  ];

  ctx.save();
  const lh = 18, px = 8, py = 6;
  const bw = 310, bh = lines.length * lh + py * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(w - bw - 8, 8, bw, bh);
  ctx.fillStyle = '#00ff88';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w - bw - 8 + px, 8 + py + (i + 0.5) * lh);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

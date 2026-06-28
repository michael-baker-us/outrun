// Renderer — owns the display canvas and an offscreen back-buffer.
//
// All game draw calls go to the back-buffer (WIDTH × HEIGHT at logical resolution).
// endFrame() blits it to the display canvas, which is sized to the viewport at
// the device's pixel ratio for sharp rendering on HiDPI/Retina screens.
//
// This two-canvas pattern is the hook Phase 5 needs: post-fx passes (bloom,
// vignette, motion blur) can read the finished back-buffer and composite the
// result before it reaches the display.

export const WIDTH  = 800;
export const HEIGHT = 500;

let _display    = null;  // the DOM canvas element
let _displayCtx = null;  // its 2D context (only used in endFrame / resize)
let _back       = null;  // offscreen back-buffer (always WIDTH × HEIGHT)
let _backCtx    = null;  // context passed to all game drawing code
let _ghost      = null;  // previous-frame copy for motion-blur ghosting
let _ghostCtx   = null;

export function initRenderer(canvasEl) {
  _display    = canvasEl;
  _displayCtx = canvasEl.getContext('2d', { alpha: false });

  // Fixed-size back-buffer: all game code draws here at logical resolution.
  _back        = document.createElement('canvas');
  _back.width  = WIDTH;
  _back.height = HEIGHT;
  _backCtx     = _back.getContext('2d');

  _ghost       = document.createElement('canvas');
  _ghost.width  = WIDTH;
  _ghost.height = HEIGHT;
  _ghostCtx    = _ghost.getContext('2d');

  _resizeDisplay();
  window.addEventListener('resize', _resizeDisplay);
}

// The context every game module should draw on.
export function getCtx() { return _backCtx; }

// Copy the finished back-buffer into the ghost canvas so the next frame can
// composite it at low opacity to create a motion-blur trailing-frame effect.
// Call after render() and before the next beginFrame().
export function captureGhost() {
  _ghostCtx.clearRect(0, 0, WIDTH, HEIGHT);
  _ghostCtx.drawImage(_back, 0, 0);
}

export function getGhostCanvas() { return _ghost; }

// Clear the back-buffer at the start of each render pass.
// The sky + road overdraw covers most pixels, but without a clear any region
// that isn't painted (e.g. the strip between the sky gradient bottom and the
// road horizon when going over hills) retains stale data from the prior frame.
export function beginFrame() {
  _backCtx.clearRect(0, 0, WIDTH, HEIGHT);
}

// Blit the finished back-buffer to the DPR-scaled display canvas.
export function endFrame() {
  // Nearest-neighbour upscaling preserves the pixel-art aesthetic.
  // Swap to `true` when Phase 3 adds higher-res sprites.
  _displayCtx.imageSmoothingEnabled = false;
  _displayCtx.drawImage(_back, 0, 0, _display.width, _display.height);
}

// Resize and reposition the display canvas to fill the viewport while keeping
// the logical aspect ratio. DPR scaling means the physical canvas is always at
// the display's native resolution — no blurry CSS upscaling.
function _resizeDisplay() {
  const dpr    = window.devicePixelRatio || 1;
  const aspect = WIDTH / HEIGHT;

  let cssW = window.innerWidth;
  let cssH = window.innerHeight;

  if (cssW / cssH >= aspect) {
    // Viewport is wider than the game — constrain by height.
    cssH = Math.round(cssH);
    cssW = Math.round(cssH * aspect);
  } else {
    // Viewport is taller than the game — constrain by width.
    cssW = Math.round(cssW);
    cssH = Math.round(cssW / aspect);
  }

  // Physical pixel count = CSS size × DPR.
  _display.width  = cssW * dpr;
  _display.height = cssH * dpr;

  // CSS size controls what the user sees.
  _display.style.width    = cssW + 'px';
  _display.style.height   = cssH + 'px';

  // Centre in the viewport.
  _display.style.position = 'absolute';
  _display.style.left     = Math.round((window.innerWidth  - cssW) / 2) + 'px';
  _display.style.top      = Math.round((window.innerHeight - cssH) / 2) + 'px';

  // Setting .width/.height resets the context state — re-apply after resize.
  _displayCtx.imageSmoothingEnabled = false;
}

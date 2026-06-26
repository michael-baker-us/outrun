// Touch controls: map the on-screen buttons to the same `keys` the keyboard
// drives, so the game logic is untouched. Uses pointer events (mouse + touch).

(function () {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  const gameOver = () => typeof state !== 'undefined' && state === 'gameover';

  function bind(id, key) {
    const el = document.getElementById(id);
    if (!el) return;

    const press = (e) => {
      e.preventDefault();
      if (gameOver()) { resetGame(); return; } // tap any control to retry
      keys[key] = true;
      el.classList.add('active');
      if (el.setPointerCapture && e.pointerId != null) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };
    const release = (e) => {
      e.preventDefault();
      keys[key] = false;
      el.classList.remove('active');
    };

    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- Tilt steering --------------------------------------------------------
  // Roll the phone like a wheel to steer. iOS 13+ needs permission requested
  // from a tap. We calibrate a neutral angle when enabled, then feed an analog
  // value into `tiltSteer`. Axis differs portrait vs landscape; sign/range are
  // easy to tune below if a real device steers the wrong way or too far.
  const TILT_RANGE = 22;   // degrees from neutral for full lock
  const TILT_DEAD   = 2.5; // degrees of deadzone around neutral
  const TILT_INVERT = 1;   // flip to -1 if steering is reversed on device

  let tiltOn = false;
  let tiltNeutral = null;

  function tiltAxis(e) {
    // In landscape (the play orientation) the left/right roll is `beta`;
    // in portrait it's `gamma`. Sign set per landscape direction.
    const angle = (screen.orientation && screen.orientation.angle != null)
      ? screen.orientation.angle
      : (window.orientation || 0);
    if (angle === 90)  return -e.beta;
    if (angle === 270 || angle === -90) return e.beta;
    if (angle === 180) return -e.gamma;
    return e.gamma; // portrait
  }

  function onOrient(e) {
    let raw = tiltAxis(e);
    if (raw == null || Number.isNaN(raw)) return;
    if (tiltNeutral === null) tiltNeutral = raw; // calibrate to however it's held
    let d = raw - tiltNeutral;
    if (Math.abs(d) < TILT_DEAD) { tiltSteer = 0; return; }
    d -= Math.sign(d) * TILT_DEAD;
    tiltSteer = TILT_INVERT * Math.max(-1, Math.min(1, d / TILT_RANGE));
  }

  async function enableTilt() {
    try {
      const D = window.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function') {
        const res = await D.requestPermission(); // must be inside the tap
        if (res !== 'granted') return false;
      }
      tiltNeutral = null;
      window.addEventListener('deviceorientation', onOrient);
      return true;
    } catch (_) { return false; }
  }

  function disableTilt() {
    window.removeEventListener('deviceorientation', onOrient);
    tiltSteer = 0;
  }

  window.addEventListener('load', () => {
    bind('btn-left',  'ArrowLeft');
    bind('btn-right', 'ArrowRight');
    bind('btn-gas',   'ArrowUp');
    bind('btn-brake', 'ArrowDown');

    const tiltBtn = document.getElementById('btn-tilt');
    if (tiltBtn) {
      tiltBtn.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        if (!tiltOn) {
          if (await enableTilt()) {
            tiltOn = true;
            document.body.classList.add('tilt');
            tiltBtn.classList.add('on');
          }
        } else {
          tiltOn = false;
          disableTilt();
          document.body.classList.remove('tilt');
          tiltBtn.classList.remove('on');
        }
      });
    }

    // Tap the play area to restart after a game over.
    const canvas = document.getElementById('game');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (gameOver()) { e.preventDefault(); resetGame(); }
      });
    }
  });
})();

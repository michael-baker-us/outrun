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
  // Steer by rolling the phone left/right. Uses gravity (devicemotion) rather
  // than tilt angles: it directly measures which way the phone leans, with no
  // gimbal-lock, and works however you hold it. iOS 13+ needs permission from a
  // tap, AND device sensors only fire over HTTPS (GitHub Pages is fine).
  const TILT_FULL   = 4.2;  // m/s^2 of sideways gravity for full steering lock
  const TILT_DEAD   = 0.45; // deadzone so a level phone doesn't drift
  const TILT_INVERT = 1;    // set to -1 if it steers the wrong way on your phone

  let tiltOn = false;
  let tiltNeutral = null;
  let knob = null, status = null;

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
    return 0;
  }

  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || (g.x == null && g.y == null)) return;
    const a = screenAngle();
    // Map device gravity to the screen's lateral axis; each landscape orientation
    // rotates the device axes in opposite directions, so they need opposite signs.
    let h = a === 90 ? -g.y : a === 270 ? g.y : a === 180 ? -g.x : g.x;
    if (h == null || Number.isNaN(h)) return;

    if (tiltNeutral === null) tiltNeutral = h;          // calibrate to current hold
    let d = h - tiltNeutral;
    if (Math.abs(d) < TILT_DEAD) d = 0;
    else d -= Math.sign(d) * TILT_DEAD;
    tiltSteer = TILT_INVERT * Math.max(-1, Math.min(1, d / TILT_FULL));

    if (knob) knob.style.left = (50 + tiltSteer * 50) + '%';
    if (status && !status.dataset.live) { status.dataset.live = '1'; status.textContent = 'tilt: move it!'; }
  }

  async function enableTilt() {
    try {
      const M = window.DeviceMotionEvent;
      if (M && typeof M.requestPermission === 'function') {
        const res = await M.requestPermission(); // must be inside the gesture
        if (res !== 'granted') { if (status) status.textContent = 'tilt: permission denied'; return false; }
      } else if (!M) {
        if (status) status.textContent = 'tilt: not supported';
        return false;
      }
      tiltNeutral = null;
      window.addEventListener('devicemotion', onMotion);
      return true;
    } catch (_) {
      if (status) status.textContent = 'tilt: needs HTTPS';
      return false;
    }
  }

  function disableTilt() {
    window.removeEventListener('devicemotion', onMotion);
    tiltSteer = 0;
  }

  window.addEventListener('load', () => {
    bind('btn-left',  'ArrowLeft');
    bind('btn-right', 'ArrowRight');
    bind('btn-gas',   'ArrowUp');
    bind('btn-brake', 'ArrowDown');

    knob   = document.getElementById('tilt-knob');
    status = document.getElementById('tilt-status');

    const tiltBtn = document.getElementById('btn-tilt');
    if (tiltBtn) {
      // 'click' is the most reliable user gesture for iOS permission prompts.
      tiltBtn.addEventListener('click', async () => {
        if (!tiltOn) {
          if (status) { status.textContent = 'tilt: requesting...'; delete status.dataset.live; }
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

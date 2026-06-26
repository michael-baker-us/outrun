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

  window.addEventListener('load', () => {
    bind('btn-left',  'ArrowLeft');
    bind('btn-right', 'ArrowRight');
    bind('btn-gas',   'ArrowUp');
    bind('btn-brake', 'ArrowDown');

    // Tap the play area to restart after a game over.
    const canvas = document.getElementById('game');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (gameOver()) { e.preventDefault(); resetGame(); }
      });
    }
  });
})();

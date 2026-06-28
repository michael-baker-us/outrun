// WebAudio engine: procedural engine drone + SFX. All synthesis — no external
// audio files. Silent if AudioContext is unavailable or not yet unlocked.
// Call unlockAudio() from a user gesture; returns true if the context is live.

let _ctx        = null;
let _masterGain = null;

// Engine oscillators + filter chain
let _engOsc = null, _engOsc2 = null;
let _engGain = null, _engFilter = null;

// Ambient music chord
let _musicGain = null;

export function unlockAudio() {
  if (_ctx) {
    if (_ctx.state === 'suspended') _ctx.resume();
    return true;
  }
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return false; }

  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.55;
  _masterGain.connect(_ctx.destination);

  // iOS Safari requires a real audio buffer to be played (even silent) before
  // the AudioContext is truly unlocked. Oscillators with gain=0 don't suffice.
  const silentBuf = _ctx.createBuffer(1, 1, 22050);
  const silentSrc = _ctx.createBufferSource();
  silentSrc.buffer = silentBuf;
  silentSrc.connect(_ctx.destination);
  silentSrc.start(0);

  if (_ctx.state === 'suspended') _ctx.resume();

  _setupEngine();
  _setupMusic();
  return true;
}

function _setupEngine() {
  _engFilter = _ctx.createBiquadFilter();
  _engFilter.type = 'lowpass';
  _engFilter.frequency.value = 600;
  _engFilter.Q.value = 1.8;
  _engFilter.connect(_masterGain);

  _engGain = _ctx.createGain();
  _engGain.gain.value = 0;
  _engGain.connect(_engFilter);

  _engOsc = _ctx.createOscillator();
  _engOsc.type = 'sawtooth';
  _engOsc.frequency.value = 80;
  _engOsc.connect(_engGain);
  _engOsc.start();

  const g2 = _ctx.createGain();
  g2.gain.value = 0.30;
  _engOsc2 = _ctx.createOscillator();
  _engOsc2.type = 'square';
  _engOsc2.frequency.value = 120;
  _engOsc2.connect(g2);
  g2.connect(_engGain);
  _engOsc2.start();
}

function _setupMusic() {
  _musicGain = _ctx.createGain();
  _musicGain.gain.value = 0;
  _musicGain.connect(_masterGain);
  // A-minor ambient chord: A2, E3, A3
  for (const [f, v] of [[110, 0.55], [164.81, 0.35], [220, 0.30]]) {
    const osc = _ctx.createOscillator();
    const g   = _ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.value = v;
    osc.connect(g);
    g.connect(_musicGain);
    osc.start();
  }
}

// Call once per frame during gameplay. speedFraction: 0..1
export function updateEngineSound(speedFraction) {
  if (!_ctx) return;
  const t    = _ctx.currentTime;
  const freq = 80 + 320 * Math.pow(speedFraction, 0.65);
  const gain = speedFraction > 0.005 ? 0.13 + speedFraction * 0.28 : 0;
  _engOsc.frequency.setTargetAtTime(freq,         t, 0.08);
  _engOsc2.frequency.setTargetAtTime(freq * 1.5,  t, 0.08);
  _engGain.gain.setTargetAtTime(gain,              t, 0.06);
  _engFilter.frequency.setTargetAtTime(400 + 1100 * speedFraction, t, 0.10);
}

// key: 'checkpoint' | 'crash'
export function playSFX(key) {
  if (!_ctx) return;
  const t = _ctx.currentTime;
  if (key === 'checkpoint') _chime(t);
  else if (key === 'crash') _crash(t);
}

function _chime(t) {
  [523.25, 659.25, 783.99].forEach((freq, i) => { // C5, E5, G5
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0,    t + i * 0.13);
    gain.gain.linearRampToValueAtTime(0.38, t + i * 0.13 + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.55);
    osc.connect(gain); gain.connect(_masterGain);
    osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.65);
  });
}

function _crash(t) {
  const osc  = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.35);
  gain.gain.setValueAtTime(0.65, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain); gain.connect(_masterGain);
  osc.start(t); osc.stop(t + 0.55);
}

export function startMusic() {
  if (!_ctx) return;
  _musicGain.gain.setTargetAtTime(0.10, _ctx.currentTime, 1.5);
}

export function stopMusic() {
  if (!_ctx) return;
  _musicGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.8);
}

export function setMasterVolume(v) {
  if (!_masterGain) return;
  _masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), _ctx.currentTime, 0.05);
}

export function getMasterVolume() {
  return _masterGain ? _masterGain.gain.value : 0.55;
}

export function resetAudio() {
  if (!_ctx) return;
  updateEngineSound(0);
}

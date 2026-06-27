// Game-wide effect toggles. Mutated by the auto-downgrade system and keyboard
// shortcuts (T = advance TOD, W = cycle weather). Will be persisted to
// localStorage in Phase 6.

export const settings = {
  weather:       'clear',  // 'clear' | 'rain'
  timeOfDay:     'auto',   // 'auto' | fixed phase passed to setTODPhase()
  motionBlur:    true,
  filmGrain:     true,
  bloom:         true,
  autoDowngrade: true,
};

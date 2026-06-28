# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

The game uses native ES modules, so it **must be served over HTTP** — `file://` URLs won't work.

```bash
# Serve and open:
python3 -m http.server 8000 --directory outrun
open http://localhost:8000

# Or with npx:
npx serve outrun
```

For mobile/tilt features the page must also be served over **HTTPS** (e.g. GitHub Pages), since `DeviceMotionEvent` is blocked on plain HTTP in iOS Safari.

Replay a specific track layout by appending `?seed=<n>` to the URL. The current seed is printed to the console on each load and rendered in the bottom-left corner of the canvas.

Toggle the **debug overlay** with the backtick key `` ` ``, or force it on with `?debug=1`. It shows FPS, frame ms, physics steps/frame, segment and sprite counts, live car state, current TOD phase, and active weather.

Dev shortcuts (active during play): **T** = advance TOD phase by 10%, **W** = cycle weather (clear → rain → clear).

## Running Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Tests are in `test/` and cover pure game logic (road generation, car physics, collision detection). No browser required — Vitest runs them in Node.

## Architecture

The game is vanilla JS with **native ES modules** (`<script type="module">`). Entry point is `outrun/main.js`; all other files use explicit `import`/`export`.

### Module graph

```
main.js
├── game.js
│   ├── renderer.js     (back-buffer + DPR-scaled display canvas + ghost for motion blur)
│   ├── palette.js      (all colour constants + 4 TOD stage palettes + applyTODPalette())
│   ├── tod.js     →    palette.js, sky.js (3-min cycle, nightFactor, T-key shortcut)
│   ├── weather.js      (rain drops, wet road, grip/fog modifiers, W-key shortcut)
│   ├── settings.js     (effect toggles: motionBlur, filmGrain, bloom, autoDowngrade, volume)
│   ├── gamestate.js    (state machine: title/playing/paused/settings/gameover)
│   ├── audio.js        (WebAudio: engine drone, checkpoint/crash SFX, ambient music)
│   ├── storage.js      (localStorage: high scores, settings, last seed)
│   ├── stage.js        (COAST/DESERT/CITY biomes — road colour overrides, traffic density)
│   ├── sky.js     →    palette.js (starfield, moon, sun fade, parallax mountains)
│   ├── road.js    →    palette.js
│   ├── assets.js       (AssetManager — async load, 404 fallback, progress)
│   ├── sprites.js      (procedural sprite pre-rendering — pine/palm/rock/etc.)
│   ├── car.js          (physics, input, car renderer, VEHICLE_SHAPES, gripMultiplier)
│   ├── particles.js    (pooled particle system — smoke/dust/sparks/exhaust)
│   ├── scenery.js  →   road.js, sprites.js
│   ├── checkpoint.js → road.js
│   ├── opponents.js →  road.js, car.js
│   └── debug.js        (FPS overlay, backtick toggle, getFPS() for auto-downgrade)
└── controls.js →       car.js, game.js, audio.js
```

No circular dependencies. `debug.js` and `audio.js` are browser-only and never imported by tests.

### Key exports

| Symbol | Module | Used by |
|---|---|---|
| `segmentProjections[]` | `road.js` | `scenery.js` (exported array ref — mutations visible to all holders) |
| `projectObject(dz, offset)` | `road.js` | `checkpoint.js`, `opponents.js` |
| `projectRoad(segs, pos, playerX, W, H)` | `road.js` | `game.js` (projection pre-pass in `render()`) |
| `drawRoad(ctx, segs, W, H)` | `road.js` | `game.js` (draw-only pass, no projection) |
| `fogAlpha(dz)` | `road.js` | `scenery.js`, `opponents.js` (sprite/car depth fade) |
| `getHorizonCurveX()` | `road.js` | `game.js` → `sky.js` (parallax scroll offset) |
| `SEGMENT_LENGTH`, `NUM_SEGMENTS`, `TRACK_LENGTH`, `DRAW_DISTANCE` | `road.js` | `game.js`, `opponents.js` |
| `makeRng(seed)` | `road.js` | tests |
| `buildSegments(seed)` | `road.js` | `game.js`, tests |
| `drawBackground(ctx, W, H, curveX, nightFactor)` | `sky.js` | `game.js` (sky LAYER) |
| `invalidateSkyGradient()` | `sky.js` | `tod.js` (called after every palette mutation) |
| `PALETTES`, `applyTODPalette(phase)` | `palette.js` | `tod.js` |
| `updateTOD(dt)`, `getNightFactor()`, `setTODPhase(p)` | `tod.js` | `game.js` |
| `setWeather(mode)`, `getGripMultiplier()`, `drawWeather(ctx,W,H)` | `weather.js` | `game.js` |
| `captureGhost()`, `getGhostCanvas()` | `renderer.js` | `game.js` (motion blur) |
| `settings` | `settings.js` | `game.js` (effect toggles, auto-downgrade) |
| `getFPS()` | `debug.js` | `game.js` (auto-downgrade threshold check) |
| `CAR`, `keys{}` | `car.js` | `game.js`, `controls.js` |
| `setTiltSteer(v)` | `car.js` | `controls.js` (can't assign a `let` across module boundary) |
| `VEHICLE_SHAPES` | `car.js` | `opponents.js` (shape table for sedan/truck/etc.) |
| `SPIN_TRIGGER_SPEED`, `startSpinOut()` | `car.js` | `opponents.js`, tests |
| `drawCar3D(ctx, cx, by, w, color, type)` | `car.js` | `opponents.js` |
| `drawBrakeLights(ctx, cx, by, w, type)` | `car.js` | `opponents.js`, `game.js` |
| `drawTailLightGlow(ctx, cx, by, w, type, nf)` | `car.js` | `opponents.js` (night glow) |
| `emitSmoke/emitDust/emitSparks/emitExhaust` | `particles.js` | `game.js` |
| `updateParticles(dt)`, `drawParticles(ctx)` | `particles.js` | `game.js` |
| `resetParticles()`, `getParticleCount()` | `particles.js` | `game.js` |
| `getLastSpriteCount()` | `scenery.js` | `game.js` (debug overlay) |
| `init()`, `resetGame()`, `startGame()`, `getState()` | `game.js` | `main.js`, `controls.js` |
| `initControls()` | `controls.js` | `main.js` |
| `getGameState()`, `setGameState(s)`, `onEnterState`, `onExitState` | `gamestate.js` | `game.js` |
| `unlockAudio()`, `updateEngineSound(sf)`, `playSFX(key)` | `audio.js` | `game.js`, `controls.js` |
| `startMusic()`, `stopMusic()`, `setMasterVolume(v)` | `audio.js` | `game.js` |
| `addHighScore(score)`, `getHighScores()`, `isHighScore(score)` | `storage.js` | `game.js` |
| `saveSettings(s)`, `loadSettings()`, `saveLastSeed(n)` | `storage.js` | `game.js` |
| `STAGES[]`, `getStageIndex(dist)`, `getStage(dist)` | `stage.js` | `game.js`, tests |

### Physics loop (fixed timestep)

`game.js` runs a **120 Hz fixed-timestep accumulator** so physics is frame-rate independent:

```
loop(now):
  elapsed = min((now - lastTime) / 1000, 0.05)
  accumulator += elapsed
  while accumulator >= 1/120:
    update(1/120)        // physics + collision + timer
    accumulator -= 1/120
  render()               // always once per rAF
```

### Rendering pipeline (per frame)

`game.js:render()` runs a **projection pre-pass** followed by named draw layers:

**Pre-pass (no drawing):**
- `projectRoad(segments, cameraZ, CAR.x, W, H)` — populates `segmentProjections[]` and the internal `frameSegs[]`. Called once before any layer draws, so sky.js can read `segmentProjections` for current-frame parallax.

**Draw layers (painter's order, background → foreground):**

1. `drawBackground()` — sky gradient + starfield (night) + sun (fades at night) + moon (night) + clouds + two parallax mountain ranges.
2. `drawRoad()` — base grass fill, then road segments **far-to-near** with fog overlay per segment.
3. `_drawNightLights()` — two headlight cones in `'lighter'` composite mode; drawn before scenery so trees/road are illuminated.
4. `drawScenery()` — trees/billboards using `segmentProjections`, far-to-near. Fog-faded via `globalAlpha`.
5. `drawCheckpoint()` — gate banner at `dz = nextCheckpoint − distance` ahead.
6. `drawOpponents()` — traffic cars projected via `projectObject`. Tail-light glow in 'lighter' mode at night.
7. `drawWeather()` — rain streaks + wet-road overlay (no-op in clear).
8. `drawParticles()` — pooled smoke/dust/sparks/exhaust.
9. `drawCar()` — player car sprite at the bottom-center of the canvas.
10. `drawSpeedFX()` — cached radial vignette + 14 animated speed-line streaks (>65% speed).
11. `_drawMotionBlur()` — ghost canvas at low opacity (>72% speed, if `settings.motionBlur`).
12. `drawHUD()` — time, score, speed, stage name, seed overlay (playing state only).
13. `_drawFilmGrain()` — 96-px tiled noise canvas, updated at 20 fps (if `settings.filmGrain`).
14. `drawDebugOverlay()` — dev stats (hidden unless toggled).

**Post-layers overlays (drawn outside shake transform, state-gated):**

- `drawTitleScreen()` — logo, blinking prompt, high scores, attract-mode world behind.
- `drawPauseScreen()` — semi-transparent panel with RESUME / SETTINGS / QUIT items.
- `drawSettingsScreen()` — Motion Blur / Film Grain / Auto FPS / Volume / BACK.
- `drawGameOver()` — score, distance, stage, ★NEW HIGH SCORE if applicable.

### Pseudo-3D projection

Road segments are projected near→far using a simple perspective divide (`scale = CAMERA_DEPTH / camZ`). Curve accumulates as a lateral screen offset (`dx`) across the draw distance. Hills accumulate as a `worldY` offset. The `project()` function in `road.js` returns screen-space `x, y, w, scale`.

`projectObject(dz, offset)` is the continuous version for non-segment objects: it interpolates `curveX` and `elev` from `segmentProjections` at an arbitrary depth, so cars and gates track the road smoothly without segment-snapping stutter.

Hill occlusion uses the `clip` field in each `segmentProjections` entry — the highest (lowest Y) road silhouette of all nearer segments. Sprites save/clip/restore to `clip` so they disappear behind crests.

### Track generation

`buildSegments(seed)` in `road.js` uses a Mulberry32 seeded PRNG (`makeRng`) to place `addCurve()` and `addHill()` features procedurally. Each segment stores `{ curve, y, color, sprites[] }`. The color field alternates every `STRIPE` segments to produce the scrolling road stripe effect without strobing.

### Car rendering

`drawCarBody()` draws a gradient-shaded rear-view car onto an **offscreen canvas** (one per color). `drawCar3D()` blits that sprite scaled to the requested width. This avoids allocating gradients every frame, which caused GC hitches near traffic. `drawCarSpinning()` applies `ctx.scale(cos(angle), 1)` to fake yaw rotation.

### Game state machine

`gamestate.js` owns the current state (`'title'|'playing'|'paused'|'settings'|'gameover'`). Transitions fire `onExitState` → `onEnterState` callbacks. `game.js` drives transitions via keyboard and calls `setGameState()`. `controls.js` reads `getState()` (re-exported from `game.js`) to gate touch input.

The title screen renders a **live attract mode** — the world animates at 2200 u/s on a separate `_attractZ` camera so the background looks dynamic before first play.

### Biome / stage system

`stage.js` defines 3 stages at distance thresholds 0 / 750 000 / 1 500 000 units (~15 checkpoints apart). Each stage may supply a `roadOverride` object (grass/surface/shoulder hex values) that `game.js` splices into `palette.road` each frame **after** `applyTODPalette()`, so biome colours stack on top of the TOD interpolation.

### Audio

`audio.js` creates an `AudioContext` lazily on the first user gesture (`unlockAudio()`). Engine sound is a sawtooth oscillator + square at 1.5× frequency, run through a lowpass filter; frequency and gain are mapped to `CAR.speed / CAR.maxSpeed` via `setTargetAtTime`. Checkpoint chime = 3-note ascending arpeggio; crash = frequency-ramping sawtooth. Ambient music = 3 sine oscillators (A-minor chord) mixed at low volume during gameplay.

### Persistence

`storage.js` wraps `localStorage` with an injectable `store` argument for unit tests. High scores are kept as a JSON array (top 5, sorted descending). Settings (motionBlur, filmGrain, autoDowngrade, volume) are saved whenever the settings screen changes a value.

### Mobile / tilt controls

`controls.js` exports `initControls()`, called from `main.js` on window load. It adds `touch` or `tilt` CSS classes to `<body>` to show/hide the on-screen buttons and tilt meter. It bridges pointer events to the same `keys{}` object the keyboard uses, so `updateCar()` in `car.js` is unchanged. Tilt reads `DeviceMotionEvent.accelerationIncludingGravity`, remapped per `screen.orientation.angle` to handle all four landscape/portrait orientations. A `setInterval(16 ms)` polls `navigator.getGamepads()` and writes gamepad axes/buttons directly into `keys` so the car responds to a controller with no changes to physics code.

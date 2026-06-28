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

Enable the **WebGL road renderer** with `?renderer=webgl` (or toggle "WebGL Road" in the Settings screen during play). Falls back to Canvas 2D automatically if WebGL2 is unsupported.

Toggle the **debug overlay** with the backtick key `` ` ``, or force it on with `?debug=1`. It shows FPS, frame ms, physics steps/frame, segment and sprite counts, live car state, current TOD phase, and active weather.

Dev shortcuts (active during play): **T** = advance TOD phase by 10%, **W** = cycle weather (clear → rain → clear).

## Running Tests

```bash
npm test                              # run once
npm run test:watch                    # watch mode
npx vitest run test/road.test.js      # single test file
npx vitest run -t "specific test name"  # single test by name
```

Tests are in `test/` and cover pure game logic (road generation, car physics, collision detection, state machines, storage, weather, stages). No browser required — Vitest runs them in Node.

## Architecture

The game is vanilla JS with **native ES modules** (`<script type="module">`). Entry point is `outrun/main.js`; all other files use explicit `import`/`export`.

### Module graph

Source files are organized under `outrun/src/` into four subdirectories. Entry point is `outrun/main.js`.

```
main.js
├── src/core/game.js         (main loop, render layers, HUD, attract mode, screen overlays)
│   ├── src/rendering/renderer.js    (back-buffer + DPR-scaled display canvas + ghost for motion blur)
│   ├── src/rendering/palette.js     (all colour constants + 4 TOD stage palettes + applyTODPalette())
│   ├── src/systems/tod.js      →    palette.js, sky.js (3-min cycle, nightFactor, T-key shortcut)
│   ├── src/systems/weather.js       (rain drops, wet road, grip/fog modifiers, W-key shortcut)
│   ├── src/core/settings.js         (effect toggles: motionBlur, filmGrain, bloom, autoDowngrade, volume, webglRoad)
│   ├── src/core/gamestate.js        (state machine: title/playing/paused/settings/gameover)
│   ├── src/systems/audio.js         (WebAudio: engine drone, checkpoint/crash SFX, ambient music)
│   ├── src/core/storage.js          (localStorage: high scores, settings, last seed)
│   ├── src/world/stage.js           (COAST/DESERT/CITY biomes — road colour overrides, traffic density)
│   ├── src/rendering/sky.js    →    palette.js (starfield, moon, sun fade, parallax mountains)
│   ├── src/rendering/road.js   →    palette.js
│   ├── src/rendering/webgl-road.js → road.js, palette.js (WebGL2 hybrid — road geometry only)
│   ├── src/world/assets.js          (AssetManager — async load, 404 fallback, progress)
│   ├── src/rendering/sprites.js     (procedural sprite pre-rendering — pine/palm/rock/etc.)
│   ├── src/world/car.js             (physics, input, car renderer, VEHICLE_SHAPES, gripMultiplier)
│   ├── src/rendering/particles.js   (pooled particle system — smoke/dust/sparks/exhaust)
│   ├── src/rendering/scenery.js →   road.js, sprites.js
│   ├── src/world/checkpoint.js →    road.js
│   ├── src/world/opponents.js  →    road.js, car.js
│   └── src/debug.js                 (FPS overlay, backtick toggle, getFPS() for auto-downgrade)
└── src/controls.js →       car.js, game.js, audio.js
```

No circular dependencies. `src/debug.js` and `src/systems/audio.js` are browser-only and never imported by tests.

### WebGL road renderer

`src/rendering/webgl-road.js` is a hybrid WebGL2 renderer for the road layer only. All other layers (sky, scenery, HUD, particles) remain on Canvas 2D. It batches up to ~5046 vertices (grass bands, shoulders, rumble strips, road surface, lane dashes for 120 segments) into a single `gl.drawArrays(TRIANGLES)` call via a pre-allocated `Float32Array` VBO updated with `gl.bufferSubData` each frame. The WebGL canvas (transparent above the road) is composited onto the 2D back-buffer via `ctx.drawImage()`. Initialized lazily on first toggle — zero overhead when disabled. GLSL fog via `mix(v_col, u_fog_col, v_fog)` matches the Canvas 2D fog exactly.

### Key exports

| Symbol | Module (under `src/`) | Used by |
|---|---|---|
| `segmentProjections[]`, `frameSegs[]` | `rendering/road.js` | `scenery.js`; `frameSegs` also by `webgl-road.js` |
| `projectObject(dz, offset)` | `rendering/road.js` | `world/checkpoint.js`, `world/opponents.js` |
| `projectRoad(segs, pos, playerX, W, H)` | `rendering/road.js` | `core/game.js` (projection pre-pass) |
| `drawRoad(ctx, segs, W, H)` | `rendering/road.js` | `core/game.js` (draw-only pass) |
| `fogAlpha(dz)` | `rendering/road.js` | `rendering/scenery.js`, `world/opponents.js` |
| `getHorizonCurveX()` | `rendering/road.js` | `core/game.js` → `rendering/sky.js` |
| `SEGMENT_LENGTH`, `TRACK_LENGTH`, `DRAW_DISTANCE` | `rendering/road.js` | `core/game.js`, `world/opponents.js` |
| `makeRng(seed)`, `buildSegments(seed)` | `rendering/road.js` | `core/game.js`, tests |
| `drawBackground(ctx, W, H, curveX, nightFactor)` | `rendering/sky.js` | `core/game.js` |
| `invalidateSkyGradient()` | `rendering/sky.js` | `systems/tod.js` (after every palette mutation) |
| `PALETTES`, `applyTODPalette(phase)` | `rendering/palette.js` | `systems/tod.js` |
| `updateTOD(dt)`, `getNightFactor()`, `setTODPhase(p)` | `systems/tod.js` | `core/game.js` |
| `setWeather(mode)`, `getGripMultiplier()`, `drawWeather(ctx,W,H)` | `systems/weather.js` | `core/game.js` |
| `captureGhost()`, `getGhostCanvas()` | `rendering/renderer.js` | `core/game.js` (motion blur) |
| `isWebGLSupported()`, `initWebGL()`, `drawRoadGL()`, `getWebGLCanvas()` | `rendering/webgl-road.js` | `core/game.js` |
| `settings` | `core/settings.js` | `core/game.js` (effect toggles, auto-downgrade, webglRoad) |
| `getFPS()` | `debug.js` | `core/game.js` (auto-downgrade threshold) |
| `CAR`, `keys{}` | `world/car.js` | `core/game.js`, `controls.js` |
| `setTiltSteer(v)` | `world/car.js` | `controls.js` (can't assign a `let` across module boundary) |
| `VEHICLE_SHAPES` | `world/car.js` | `world/opponents.js` |
| `SPIN_TRIGGER_SPEED`, `startSpinOut()` | `world/car.js` | `world/opponents.js`, tests |
| `drawCar3D`, `drawBrakeLights`, `drawTailLightGlow` | `world/car.js` | `world/opponents.js`, `core/game.js` |
| `emitSmoke/emitDust/emitSparks/emitExhaust` | `rendering/particles.js` | `core/game.js` |
| `updateParticles(dt)`, `drawParticles(ctx)`, `resetParticles()`, `getParticleCount()` | `rendering/particles.js` | `core/game.js` |
| `getLastSpriteCount()` | `rendering/scenery.js` | `core/game.js` (debug overlay) |
| `init()`, `resetGame()`, `startGame()`, `getState()` | `core/game.js` | `main.js`, `controls.js` |
| `initControls()` | `controls.js` | `main.js` |
| `getGameState()`, `setGameState(s)`, `onEnterState`, `onExitState` | `core/gamestate.js` | `core/game.js` |
| `unlockAudio()`, `updateEngineSound(sf)`, `playSFX(key)` | `systems/audio.js` | `core/game.js`, `controls.js` |
| `startMusic()`, `stopMusic()`, `setMasterVolume(v)` | `systems/audio.js` | `core/game.js` |
| `addHighScore(score)`, `getHighScores()`, `isHighScore(score)` | `core/storage.js` | `core/game.js` |
| `saveSettings(s)`, `loadSettings()`, `saveLastSeed(n)` | `core/storage.js` | `core/game.js` |
| `STAGES[]`, `getStageIndex(dist)`, `getStage(dist)` | `world/stage.js` | `core/game.js`, tests |

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

### Roadmap

`MODERNIZATION_PLAN.md` is the authoritative planning document. It tracks 7 phases (all complete as of June 2026): module conversion, renderer pipeline, world fidelity, sprites/asset manager, car fidelity, lighting/TOD/weather, game systems/audio/UX, and WebGL2 renderer. Check it for phase acceptance criteria, locked architectural decisions, and the progress log before proposing structural changes.

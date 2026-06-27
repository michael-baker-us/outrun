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

Toggle the **debug overlay** with the backtick key `` ` ``, or force it on with `?debug=1`. It shows FPS, frame ms, physics steps/frame, segment and sprite counts, and live car state.

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
│   ├── road.js         (geometry, projection, track gen)
│   ├── car.js          (physics, input, car renderer)
│   ├── scenery.js  →   road.js
│   ├── checkpoint.js → road.js
│   ├── opponents.js →  road.js, car.js
│   └── debug.js        (FPS overlay, backtick toggle)
└── controls.js →       car.js, game.js
```

No circular dependencies. `debug.js` is browser-only and never imported by tests.

### Key exports

| Symbol | Module | Used by |
|---|---|---|
| `segmentProjections[]` | `road.js` | `scenery.js` (exported array ref — mutations visible to all holders) |
| `projectObject(dz, offset)` | `road.js` | `checkpoint.js`, `opponents.js` |
| `SEGMENT_LENGTH`, `NUM_SEGMENTS`, `TRACK_LENGTH`, `DRAW_DISTANCE` | `road.js` | `game.js`, `opponents.js` |
| `makeRng(seed)` | `road.js` | tests |
| `buildSegments(seed)` | `road.js` | `game.js`, tests |
| `CAR`, `keys{}` | `car.js` | `game.js`, `controls.js` |
| `setTiltSteer(v)` | `car.js` | `controls.js` (can't assign a `let` across module boundary) |
| `SPIN_TRIGGER_SPEED`, `startSpinOut()` | `car.js` | `opponents.js`, tests |
| `drawCar3D()` | `car.js` | `opponents.js` |
| `getLastSpriteCount()` | `scenery.js` | `game.js` (debug overlay) |
| `init()`, `resetGame()`, `getState()` | `game.js` | `main.js`, `controls.js` |
| `initControls()` | `controls.js` | `main.js` |

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

`game.js:render()` calls these in painter's-algorithm order (background → foreground):

1. `drawRoad()` — sky gradient, then road segments **far-to-near** (overdraw handles occlusion). Populates `segmentProjections[]` as a side effect.
2. `drawScenery()` — trees/billboards using `segmentProjections`, far-to-near.
3. `drawCheckpoint()` — gate banner at `dz = nextCheckpoint − distance` ahead.
4. `drawOpponents()` — traffic cars, each projected via `projectObject(depth, offset)`.
5. `drawSmoke()` — tire-smoke particles above the player car.
6. `drawCar()` — player car sprite at the bottom-center of the canvas.
7. `drawHUD()` — time, score, speed, seed overlay.
8. `drawDebugOverlay()` — dev stats (hidden unless toggled).

### Pseudo-3D projection

Road segments are projected near→far using a simple perspective divide (`scale = CAMERA_DEPTH / camZ`). Curve accumulates as a lateral screen offset (`dx`) across the draw distance. Hills accumulate as a `worldY` offset. The `project()` function in `road.js` returns screen-space `x, y, w, scale`.

`projectObject(dz, offset)` is the continuous version for non-segment objects: it interpolates `curveX` and `elev` from `segmentProjections` at an arbitrary depth, so cars and gates track the road smoothly without segment-snapping stutter.

Hill occlusion uses the `clip` field in each `segmentProjections` entry — the highest (lowest Y) road silhouette of all nearer segments. Sprites save/clip/restore to `clip` so they disappear behind crests.

### Track generation

`buildSegments(seed)` in `road.js` uses a Mulberry32 seeded PRNG (`makeRng`) to place `addCurve()` and `addHill()` features procedurally. Each segment stores `{ curve, y, color, sprites[] }`. The color field alternates every `STRIPE` segments to produce the scrolling road stripe effect without strobing.

### Car rendering

`drawCarBody()` draws a gradient-shaded rear-view car onto an **offscreen canvas** (one per color). `drawCar3D()` blits that sprite scaled to the requested width. This avoids allocating gradients every frame, which caused GC hitches near traffic. `drawCarSpinning()` applies `ctx.scale(cos(angle), 1)` to fake yaw rotation.

### Mobile / tilt controls

`controls.js` exports `initControls()`, called from `main.js` on window load. It adds `touch` or `tilt` CSS classes to `<body>` to show/hide the on-screen buttons and tilt meter. It bridges pointer events to the same `keys{}` object the keyboard uses, so `updateCar()` in `car.js` is unchanged. Tilt reads `DeviceMotionEvent.accelerationIncludingGravity`, remapped per `screen.orientation.angle` to handle all four landscape/portrait orientations.

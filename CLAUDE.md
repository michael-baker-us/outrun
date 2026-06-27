# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

No build step, no dependencies, no package manager. Open `outrun/index.html` directly in a browser:

```
open outrun/index.html
```

For mobile/tilt features, the page must be served over HTTPS (e.g. GitHub Pages), since `DeviceMotionEvent` is blocked on plain `file://` in iOS Safari.

Replay a specific track layout by appending `?seed=<n>` to the URL. The current seed is printed to the console on each load and rendered in the bottom-left corner of the canvas.

## Architecture

The game is vanilla JS with no ES modules — every file is a plain `<script>` tag that appends to a shared global scope. **Script load order in `index.html` is the dependency order:**

1. `road.js` — road geometry, projection math, scenery segment data
2. `scenery.js` — reads `segmentProjections` from road.js to draw trees/billboards
3. `checkpoint.js` — draws the overhead gate using `projectObject()` from road.js
4. `opponents.js` — collision logic, draws traffic using `projectObject()` and `drawCar3D()`
5. `car.js` — player physics, spin-out state, shared `drawCar3D()` / `drawCarBody()` renderer
6. `game.js` — main loop, HUD, game state machine (`'playing'` | `'gameover'`)
7. `controls.js` — pointer/touch event bindings + tilt steering via `DeviceMotionEvent`

### Shared globals (the module interface)

| Symbol | Defined in | Read by |
|---|---|---|
| `segmentProjections[]` | `road.js` (rebuilt each frame by `drawRoad`) | `scenery.js`, `checkpoint.js`, `opponents.js` |
| `projectObject(dz, offset)` | `road.js` | `checkpoint.js`, `opponents.js` |
| `SEGMENT_LENGTH`, `NUM_SEGMENTS`, `TRACK_LENGTH` | `road.js` | `game.js`, `opponents.js` |
| `DRAW_DISTANCE` | `road.js` | `opponents.js` |
| `CAR` | `car.js` | `game.js`, `controls.js` |
| `keys{}` | `car.js` | `controls.js` |
| `tiltSteer` | `car.js` | `controls.js` (writes it) |
| `drawCar3D()`, `drawCarBody()` | `car.js` | `opponents.js` |
| `startSpinOut()`, `SPIN_TRIGGER_SPEED` | `car.js` | `opponents.js` |
| `state`, `resetGame()` | `game.js` | `controls.js` |

### Rendering pipeline (per frame)

`game.js:render()` calls these in painter's-algorithm order (background → foreground):

1. `drawRoad()` — sky gradient, then road segments **far-to-near** (overdraw handles occlusion). Populates `segmentProjections[]` as a side effect.
2. `drawScenery()` — trees/billboards using `segmentProjections`, far-to-near.
3. `drawCheckpoint()` — gate banner at `dz = nextCheckpoint − distance` ahead.
4. `drawOpponents()` — traffic cars, each projected via `projectObject(depth, offset)`.
5. `drawSmoke()` — tire-smoke particles above the player car.
6. `drawCar()` — player car sprite at the bottom-center of the canvas.
7. `drawHUD()` — time, score, speed, seed overlay.

### Pseudo-3D projection

Road segments are projected near→far using a simple perspective divide (`scale = CAMERA_DEPTH / camZ`). Curve accumulates as a lateral screen offset (`dx`) across the draw distance. Hills accumulate as a `worldY` offset. The `project()` function in `road.js` returns screen-space `x, y, w, scale`.

`projectObject(dz, offset)` is the continuous version for non-segment objects: it interpolates `curveX` and `elev` from `segmentProjections` at an arbitrary depth, so cars and gates track the road smoothly without segment-snapping stutter.

Hill occlusion uses the `clip` field in each `segmentProjections` entry — the highest (lowest Y) road silhouette of all nearer segments. Sprites save/clip/restore to `clip` so they disappear behind crests.

### Track generation

`buildSegments(seed)` in `road.js` uses a Mulberry32 seeded PRNG to place `addCurve()` and `addHill()` features procedurally. Each segment stores `{ curve, y, color, sprites[] }`. The color field alternates every `STRIPE` segments to produce the scrolling road stripe effect without strobing.

### Car rendering

`drawCarBody()` draws a gradient-shaded rear-view car onto an **offscreen canvas** (one per color). `drawCar3D()` blits that sprite scaled to the requested width. This avoids allocating gradients every frame, which caused GC hitches near traffic. `drawCarSpinning()` applies `ctx.scale(cos(angle), 1)` to fake yaw rotation.

### Mobile / tilt controls

`controls.js` is an IIFE that adds `touch` or `tilt` CSS classes to `<body>` to show/hide the on-screen buttons and tilt meter. It bridges pointer events to the same `keys{}` object the keyboard uses, so `updateCar()` in `car.js` is unchanged. Tilt reads `DeviceMotionEvent.accelerationIncludingGravity`, remapped per `screen.orientation.angle` to handle all four landscape/portrait orientations.

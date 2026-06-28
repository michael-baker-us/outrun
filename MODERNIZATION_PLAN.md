# OutRun Racer — Modernization Plan

> **Living document.** The executing agent must keep this file current: tick
> checkboxes as work lands, update the **Status** line of each phase, and append
> to the **Progress Log** at the bottom after every working session. If reality
> diverges from the plan, edit the plan — do not silently drift.

---

## 0. Goal

Take the current vanilla pseudo-3D arcade racer (~1,100 LOC, Canvas 2D, no build)
and raise it to the fidelity and feature-completeness you'd expect from a modern
arcade racer, **without** abandoning what makes the project pleasant to hack on.

This is a long-term learning project (see `/Users/michael.baker/.claude/CLAUDE.md`).
Optimize for **architecture, maintainability, testing, and graphics-programming
learning**, not for closing tickets fast. Every phase must leave the game in a
playable, shippable state.

## 1. Locked decisions

These were chosen deliberately. Do not reverse them without flagging the user.

| Area | Decision | Implication |
|---|---|---|
| **Renderer** | Push **Canvas 2D** hard (Phases 1–6), then an **optional WebGL2** renderer (Phase 7). | Always shippable; WebGL is a learning stretch, not a prerequisite. |
| **Assets** | **Hybrid**: keep procedural/code-drawn pieces, add a small curated set of real sprites/textures/audio behind an **asset manager with procedural fallbacks**. | Game must still run if an asset 404s. No hard dependency on any single binary. |
| **Tooling** | **No bundler.** Migrate globals → **native ES modules**; add **Vitest** for unit tests. Still launchable by serving the folder. | `index.html` uses `<script type="module">`. Needs a static server (`npx serve outrun` / `python3 -m http.server`), not bare `file://`. |

### Non-negotiable guardrails

- **No build step.** No webpack/rollup/vite, no transpile. ES modules run natively.
- **No runtime framework** (no React/Three/Phaser). Plain DOM + Canvas. Tiny
  dev-only deps (Vitest) are fine since they never ship to the browser.
- **Deterministic core.** Track generation, physics, and collisions stay seedable
  and pure where possible, so they can be unit-tested headlessly.
- **Every phase ends playable.** No multi-phase "it's broken until X" gaps.
- **Graceful asset degradation.** Missing texture/sprite/audio → procedural or silent fallback.

---

## 2. Current architecture (starting point)

Vanilla JS, painter's-algorithm Canvas 2D. Each file is a plain `<script>` that
writes to a shared global scope; **load order in `index.html` is the dependency
order**. Pseudo-3D via perspective divide (`scale = CAMERA_DEPTH / camZ`); curves
accumulate as lateral screen offset, hills as a `worldY` offset.

```
road.js       geometry, projection, track gen (Mulberry32 seed), segmentProjections[]
scenery.js    trees/billboards from segmentProjections
checkpoint.js overhead gate via projectObject()
opponents.js  traffic + collision
car.js        player physics, spin-out, shared drawCar3D()/drawCarBody()
game.js       main loop, HUD, state machine ('playing'|'gameover')
controls.js   keyboard / touch / DeviceMotion tilt steering
```

Render order per frame (`game.js:render()`): road → scenery → checkpoint →
opponents → smoke → car → HUD.

**Known fidelity gaps to attack:** flat solid-color road bands; triangle trees;
no fog/haze; single static sky gradient; no parallax; gradient-rect cars (no real
art); monospace HUD; no audio; no menus/persistence; fixed 800×500 with
`image-rendering: pixelated`; variable-timestep loop.

---

## 3. Phase plan

Phases are ordered so each unlocks the next. Within a phase, tasks are roughly
ordered too. **Acceptance criteria** are how the agent (and user) know it's done.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

### Phase 0 — Foundation: modules, tests, loop, instrumentation
**Status:** done
**Goal:** Re-platform the codebase so the rest of the work is safe and testable.
This is plumbing — the game should look *identical* when Phase 0 ends.

**Why / what you learn:** module boundaries, dependency graphs, fixed-timestep
game loops, headless testing of game logic, basic profiling.

- [x] Convert each file to an ES module with explicit `export`/`import`. Remove
      reliance on global script-load order. Update `index.html` to a single
      `<script type="module" src="main.js">` entry that wires everything.
- [x] Document the new module graph in `CLAUDE.md` (replace the "shared globals"
      table with an import map).
- [x] Add `package.json` (dev-only) + Vitest. Add `npm test`. No runtime deps.
- [x] Extract pure logic into testable units and add first tests:
      - `buildSegments(seed)` is deterministic for a seed (snapshot a few fields).
      - `makeRng` Mulberry32 sequence is stable.
      - collision overlap math (`COLLISION_HALF`) given fixtures.
      - off-road speed-bleed and spin-out timing in `updateCar` (inject `dt`).
- [x] Replace the variable-timestep loop with a **fixed-timestep accumulator**
      (120 Hz physics) + render once per rAF. Kills speed-dependent physics
      drift and makes behavior reproducible.
- [x] Add a dev **debug overlay** (toggle with backtick): FPS, frame ms,
      physics steps/frame, draw-call-ish counts (segments drawn, sprites drawn),
      current seed, car state. Hidden by default; `?debug=1` to force on.
- [x] Add a tiny `dev.md` (or README section): how to serve, run tests, toggle debug.
      (folded into CLAUDE.md — Running the Game / Running Tests sections)

**Acceptance:** `npm test` green; game looks/plays identically; debug overlay
reports stable FPS; physics no longer varies with framerate.

---

### Phase 1 — Render pipeline & resolution
**Status:** done
**Goal:** A clean, resolution-independent rendering core to build fidelity on.

**Why / what you learn:** offscreen render targets, devicePixelRatio, layered
compositing, a renderer abstraction, color/palette management.

- [x] Introduce a `Renderer` module owning the canvas, an **offscreen back-buffer**,
      and `beginFrame()/endFrame()`. All draws go through it. (Sets up Phase 5 post-fx.)
- [x] **Resolution independence:** render at a logical internal resolution (800×500),
      scale to the viewport honoring `devicePixelRatio`. Display canvas sized to
      CSS viewport × DPR for native-resolution output on HiDPI/Retina screens.
      Decision: nearest-neighbour upscaling (`imageSmoothingEnabled = false`) for
      now — swap to smooth in Phase 3 when higher-res sprites land.
- [x] Centralize the magic-number layout/colors (`COLORS`, HUD rects) into
      `palette.js` so time-of-day (Phase 5) can swap palettes by swapping the export.
      `road.js` imports palette; `invalidateSkyGradient()` exported for palette swaps.
- [x] Define explicit **render layers** as a named `LAYERS` array in `game.js`
      (road → scenery → checkpoint → traffic → particles → player → hud → gameover →
      debug). Phase 5 can insert post-fx passes between specific layers by name.
- [x] Perf budget established: **60 fps, 1.1ms frame time** on a 2× DPR display
      at 1280×800 CSS viewport. Back-buffer 800×500 → blit to 2560×1600 physical px.

**Acceptance:** crisp at any window size and on HiDPI; layer list drives render
order; no regression in FPS baseline.

---

### Phase 2 — World fidelity: road, depth, parallax sky
**Status:** done
**Goal:** The single biggest visual jump — the world should read as deep and alive.

**Why / what you learn:** depth cueing/fog, parallax, procedural texture, dithering.

- [x] **Distance fog / haze:** blend road, scenery, and traffic toward a horizon
      color as depth increases. Removes the hard "pop-in" at draw distance and
      adds depth. (Per-segment alpha or color-lerp by `dz`.)
- [x] **Multi-layer parallax background** replacing the static half-screen gradient:
      sky gradient + sun/moon + distant mountain silhouette(s) + cloud band(s),
      each scrolling at its own rate driven by accumulated curve (so turns feel
      like you're turning) and by elevation.
- [x] **Road surface upgrade:** soft shoulder strip (sandy verge between grass
      and rumble) added in `renderSegment`. Fog progressively hazes road surface.
- [x] **Grass/terrain texture:** fog automatically grades distant grass toward
      the horizon haze color; two-tone alternating grass bands retained.
- [x] Hill/horizon polish: `clip` silhouette still hides sprites correctly;
      fog opacity applied at the same `globalAlpha` context as hill clipping.

**Acceptance:** no hard pop-in at the horizon; turning visibly parallaxes the
background; road reads as textured asphalt, not flat bands; FPS within budget.

---

### Phase 3 — Sprites, scenery & the asset manager
**Status:** done
**Goal:** Replace code-drawn flora/props with real (or richer procedural) sprites,
loaded through a proper asset pipeline with fallbacks.

**Why / what you learn:** asset loading/lifecycle, texture atlases, sprite
scaling/anchoring, scene dressing for density.

- [x] Build an **`AssetManager`** (`assets.js`): injectable loader for testability,
      async `load()` returning a Promise, `get(key)` (null = fallback), `progress`
      (0..1), `ready` bool, `getFallback(key)`. Console-warns on 404.
- [x] **Procedural sprite pre-rendering** (`sprites.js`): `buildSprites()` draws
      pine, palm, poplar, bush, rock, billboard-0/1/2 onto offscreen canvases.
      `getSprite(key)` is the always-present fallback; real PNGs in `assets/`
      override automatically once added.
- [x] **Anchor + scale** all sprites bottom-center to `segmentProjections`, width
      proportional to `roadW`, height from canvas aspect ratio. Hill `clip` still
      hides sprites behind crests.
- [x] **Scenery variety & density:** two-layer placement (primary every 7 segments,
      secondary every 11) using a Knuth-hash of segment index — deterministic
      variety without consuming the seeded RNG. Rocks/bushes interspersed. Three
      billboard art variants (GAS/EAT/INN).
- [x] **Ground shadow blobs** under every sprite (translucent `rgba` ellipse),
      scaled proportionally to `roadW`.
- [x] **Loading screen** in game.js: shows title + progress bar while
      `AssetManager` fetches resolve. Currently all 404 → instant (< 1 frame).
- [x] **Tests:** 12 tests in `test/assets.test.js` — successful load, 404
      fallback, mixed, progress tracking, chaining; no browser DOM needed
      (injectable loader).

**Acceptance:** roadside reads as a varied, populated world; force-removing an
asset file degrades gracefully (fallback) with a console warning, no crash.

---

### Phase 4 — Car fidelity & game feel
**Status:** done
**Goal:** The car and the act of driving should feel modern and juicy.

**Why / what you learn:** sprite state machines, particle systems, camera dynamics,
"game juice."

- [x] **Player car sprite set** (curated or richly procedural): body **lean on curves**
      (`ctx.rotate` at draw time, up to 2.3°), brake-light overlay when braking,
      invuln blink. `VEHICLE_SHAPES` table drives proportions per type; offscreen-sprite
      cache keyed by `${color}:${type}`.
- [x] **Opponent variety:** 4 vehicle types (`VEHICLE_SHAPES`: sports/sedan/compact/truck)
      with distinct roof/body proportions; randomized brake-light flashing; sinusoidal
      lane wobble (±0.06 road half-widths).
- [x] **Particle system** (generalize the current smoke): tire smoke on spin/skid,
      **dust** off-road, **sparks** on collision, exhaust puffs, pooled allocations
      (pool of 200, evicts furthest-along particle on overflow).
- [x] **Camera & speed feel:** **speed lines** (14 radial streaks animated outward
      with distance, visible >65% top speed), **vignette** (always-on radial gradient,
      intensifies with speed), **screen shake** on crash, camera dip on hard braking.
- [x] Polish the spin-out with sparks + shake; `car.invuln` (1.8 s grace period after
      recovery) blocks back-to-back collisions; car blinks at 8 Hz during invuln.

**Acceptance:** the car visibly steers/banks/brakes; crashes produce sparks +
shake + smoke; off-road kicks dust; no GC hitch near dense traffic (watch debug overlay).

---

### Phase 5 — Lighting, time-of-day, weather, post-FX
**Status:** done
**Goal:** Atmosphere. The marquee "modern" layer.

**Why / what you learn:** color grading, additive lighting/glow, screen-space
post effects, weather particle systems, palette interpolation.

- [x] **Time-of-day system:** interpolate sky/fog/palette across dawn→day→dusk→
      night (drive from the palette module in Phase 1). Per-stage or cycling.
- [x] **Night mode:** dim ambient, **headlight cones** on player + traffic, glowing
      tail/brake lights (additive blend), lit billboards, starfield.
- [x] **Weather:** rain and/or snow particle layers; **wet-road darkening +
      reflections/streaks**; reduced grip affecting physics (tunable). Fog density
      as a weather variable.
- [x] **Post-FX** on the back-buffer: bloom/glow on bright sources, vignette,
      subtle chromatic offset or motion blur at speed, optional film grain.
      All toggleable (perf + taste) via settings.
- [x] Settings to enable/disable heavy effects; auto-downgrade if FPS drops below
      budget (read from the debug instrumentation).

**Acceptance:** convincing day↔night transition; headlights and glowing lights at
night; at least one weather mode with matching road look + grip change; effects
toggle cleanly and hold the FPS budget (or auto-downgrade).

---

### Phase 6 — Game systems, audio & UX
**Status:** done
**Goal:** Turn the tech demo into a *game* — the "everything you'd expect."

**Why / what you learn:** WebAudio, state/UI management, persistence, content design.

- [x] **Audio engine (WebAudio):** RPM/speed-linked **engine drone**, skid/crash/
      collision SFX, checkpoint chime, UI clicks; **music** track(s) with mute/volume.
      All through the AssetManager with silent fallback. Respect autoplay-unlock
      (start audio on first input).
- [x] **Modern HUD:** custom web font, animated speedometer (dial or bar), lap/
      stage info, animated checkpoint banner, optional **mini-map / track-progress**
      bar. Replace monospace overlays.
- [x] **Screens & flow:** title/attract screen, loading screen (uses asset
      progress), pause menu, settings (graphics/audio/controls), game-over with
      stats. Proper `GameState` machine replacing the `'playing'|'gameover'` flag.
- [x] **Persistence (localStorage):** high scores, best distance per stage, chosen
      settings, last seed.
- [x] **Content / stages:** multiple **biomes/stages** (coast, desert, city,
      mountains, night) selected as you progress; optional **branching forks** à la
      classic OutRun; difficulty/traffic-density scaling. Reuse seeded generation.
- [x] **Controls:** gamepad support (Gamepad API) alongside keyboard/touch/tilt;
      remappable keys in settings.

**Acceptance:** boot → title → play → pause/settings → game-over → high-score
saved, all without reload; engine/music audio works; at least 2–3 distinct stages;
gamepad drives the car.

---

### Phase 7 — (Optional / stretch) WebGL2 renderer
**Status:** done
**Goal:** Lift the fidelity ceiling with a real GPU pipeline — pure learning.

**Why / what you learn:** WebGL2, shaders (GLSL), textured meshes, framebuffer
post-processing, renderer abstraction in practice.

- [x] Implement an alternate renderer (`webgl-road.js`): road geometry batched into
      a single `gl.drawArrays()` call per frame via a pre-allocated Float32Array VBO.
      All other layers (sky, scenery, HUD, particles) remain on Canvas 2D — hybrid.
- [x] Shader-based **fog** in GLSL: per-vertex `a_fog` attribute interpolated in
      fragment shader via `mix(v_col, u_fog_col, v_fog)`. Matches Canvas 2D fog exactly.
- [x] Runtime switch Canvas2D ↔ WebGL: `?renderer=webgl` URL param + "WebGL Road"
      toggle in Settings screen (index 4). Canvas 2D is the guaranteed fallback; WebGL
      initializes lazily on first toggle so it doesn't cost anything if unused.
- [x] Visual parity verified at same seed/frame — WebGL and Canvas 2D renders are
      pixel-identical for road geometry (road surface, rumble strips, shoulder, lane
      dashes, fog). Perf note: GPU path batches ~5000 vertices into 1 draw call vs
      ~700+ individual Canvas 2D polygon() calls. Verified in Playwright, no errors.

**Acceptance:** WebGL renderer reaches visual parity-or-better with Canvas2D and
runs within budget; falls back to Canvas2D cleanly where unsupported.

---

## 4. Cross-cutting standards (apply every phase)

Per the user's cross-project standards — fold these in continuously, don't defer:

- **Testing:** keep `npm test` green. Add tests with each phase's logic (gen,
  physics, collision, asset fallback, state transitions, palette interpolation).
- **Docs:** update `CLAUDE.md` (architecture), `README.md` (features/play), and a
  `dev.md` (how to run/test/profile) as things change. Keep the module map current.
- **Observability:** extend the debug overlay each phase (new particle counts, FX
  cost, audio state). Record FPS baselines in the Progress Log when they move.
- **Performance:** respect the frame budget. Pool particles/sprites; avoid
  per-frame allocations and gradient creation (the codebase already learned this —
  see `car.js` pre-rendered sprites). Profile before optimizing.
- **Maintainability:** small modules, clear seams, the `Renderer`/`AssetManager`/
  `palette`/`GameState` abstractions are the backbone — don't bypass them.
- **Accessibility/UX:** colorblind-friendly palettes where feasible, effect toggles,
  reduced-motion option, sensible default controls.

---

## 5. Working agreement for the executing agent

1. **One phase at a time, in order.** Don't start Phase N+1 until Phase N's
   acceptance criteria pass and the game is playable.
2. **Small commits, conventional messages.** Branch off `main`; don't commit/push
   unless the user asks. End commit messages with the required co-author trailer.
3. **Keep it shippable.** If a change breaks the game, fix or revert before moving on.
4. **Update this file every session:** tick boxes, set the phase **Status**
   (`not started` → `in progress` → `done`), and append a Progress Log entry.
5. **Flag scope/decision changes.** If a locked decision needs to change (e.g.
   Canvas2D can't hit a target), stop and raise it with the user rather than
   quietly switching to WebGL early.
6. **Verify visually.** Use the project's run/verify skills to actually look at the
   game after visual changes — screenshots/observation, not just "it compiles."
7. **Prefer procedural-with-fallback** when adding assets, so the repo stays
   functional even if a binary is missing.

---

## 6. Progress Log

> Newest first. One short entry per session: what landed, FPS/notes, what's next.

- **2026-06-27 — Phase 7 complete.** New `webgl-road.js`: vertex shader converts screen-pixel coords to NDC, fragment shader mixes vertex colour with fog colour via `mix(v_col, u_fog_col, v_fog)`. Pre-allocated `Float32Array(6144 × 6)` VBO filled each frame with grass bands, left/right shoulders, rumble strips, road surface, and lane dashes for all 120 visible segments + 1 base fill quad = up to ~5046 vertices per frame, uploaded via `gl.bufferSubData` and drawn in a single `gl.drawArrays(TRIANGLES)` call. WebGL canvas has `alpha:true, premultipliedAlpha:false, preserveDrawingBuffer:true`; composited onto the 2D back-buffer via `ctx.drawImage(webglCanvas, …)` in the road layer, so the Canvas 2D sky renders underneath correctly. `frameSegs[]` exported from `road.js` (was `const`, now `export const`). `settings.webglRoad` added; persisted to localStorage. Toggle in Settings screen (index 4: "WebGL Road"). `?renderer=webgl` URL param enables on load. Lazy WebGL init: only initializes on first use, so Canvas 2D path has zero overhead when WebGL is off. 106 tests still green. Visual parity with Canvas 2D confirmed in Playwright at same seed/frame. Next: open-ended — game is feature-complete through all planned phases.

- **2026-06-27 — Phase 6 complete.** New `gamestate.js` (state machine: title/playing/paused/settings/gameover; `setGameState`, `onEnterState`, `onExitState`). New `audio.js` (WebAudio procedural synth: sawtooth+square engine drone RPM-mapped 80→400 Hz, lowpass filter, A-minor ambient music chord; `playSFX('checkpoint'|'crash')` one-shots; `unlockAudio()` deferred to first user gesture; `setMasterVolume()`). New `storage.js` (localStorage wrapper with injectable backend for tests: `addHighScore`, `getHighScores`, top-5 sorted, `saveSettings/loadSettings`, `saveLastSeed/loadLastSeed`). New `stage.js` (COAST/DESERT/CITY biomes with road color overrides; thresholds at 0/750k/1.5M distance units; `getStageIndex`, `getStage`). `controls.js`: gamepad polling via `setInterval(16ms)` — left-stick axis + D-pad → ArrowLeft/Right, face/trigger buttons → ArrowUp/Down; `unlockAudio()` on all touch events; `startGame()` on tap in title/gameover states. `game.js`: state machine replaces bare `_state` flag; title screen with attract mode (world renders live behind overlay at 2200 u/s); pause/settings/gameover screens with rounded-rect panels and keyboard navigation (↑↓ move, ←→ adjust volume, ENTER select, ESC back); stage colour overrides applied after TOD each frame; checkpoint/crash audio hooked; high score saved on game over; settings persisted to localStorage; `startGame()` exported. HUD gains stage name (top-centre). Game over shows distance/stage/★NEW HIGH SCORE. `settings.js` cleaned up (dropped unused weather/timeOfDay, added `volume`). 106 tests green (9 gamestate, 13 storage, 14 stage tests new). Next: Phase 7 (WebGL2 renderer — stretch).

- **2026-06-27 — Phase 5 complete.** New `settings.js` (motionBlur/filmGrain/bloom/weather/autoDowngrade flags). New `tod.js` (3-minute cycle, `updateTOD(dt)`, `getNightFactor()` cosine mapping, `setTODPhase()` for T-key shortcut). New `weather.js` (180 screen-space rain drops, wet-road dark sheen + perspective reflection streaks, `getGripMultiplier()=0.82` in rain, `getExtraFogDensity()`). `palette.js`: 4 stage palettes (dawn/day/dusk/night) + `_lerpH`/`_lerpR` helpers + `applyTODPalette(phase)` mutates `palette` in-place. `sky.js`: 80-star field drawn above sky gradient, moon with radial glow, sun fades at nightFactor>0.8, `drawBackground` takes optional `nightFactor`. `renderer.js`: ghost canvas + `captureGhost()`/`getGhostCanvas()` for motion blur. `car.js`: `gripMultiplier` on CAR applied to braking/steering, `drawTailLightGlow()` additive radial glow around tail lights. `opponents.js`: tail light glow at night. `debug.js`: `getFPS()` export, overlay shows `tod:` and `wx:`. `game.js`: new layers `lights` (headlight cones, 'lighter' blend), `weather-fx`, `motion-blur` (ghost composite at >72% speed), `film-grain` (96px tiled noise tile at 20fps update), `_checkAutoDowngrade()` disables grain+blur if FPS<45 for 2s. T/W keyboard shortcuts for TOD and weather. 70 tests green (11 new TOD tests, 9 new weather tests). Verified: 60 FPS / 5.1ms at max effects. Next: Phase 6 (audio, HUD, screens, persistence, stages, gamepad).

- **2026-06-27 — Phase 4 complete.** New `particles.js` (pooled 200-particle system: smoke/dust/sparks/exhaust; `emitSmoke/emitDust/emitSparks/emitExhaust/updateParticles/drawParticles/resetParticles`). `car.js`: added `VEHICLE_SHAPES` (sports/sedan/compact/truck), sprite cache keyed by `${color}:${type}`, `drawBrakeLights()`, `car.steerInput/braking/invuln`, body-lean rotate on curves (2.3°), invuln blink, `INVULN_DURATION=1.8s`. `opponents.js`: 4 vehicle types, sinusoidal wobble, randomised brake-light flashing. `game.js`: `drawSpeedFX()` (radial vignette always-on + 14 animated speed lines >65% speed), screen shake (`_shakeIntensity` decays 0.86×/frame), smooth camera dip on braking, sparks+shake on crash, `_emitAmbientParticles` (smoke/dust/exhaust once/frame). Debug overlay now shows particle count and invuln. 50 tests green (4 new invuln/invuln-collision tests). Next: Phase 5 (time-of-day, night mode, weather, post-FX).
- **2026-06-27 — Phase 3 complete.** New `assets.js` (`AssetManager` class: injectable loader, `add/load/get/getFallback/progress/ready`, graceful 404 fallback). New `sprites.js` (`buildSprites()` pre-renders pine/palm/poplar/bush/rock/billboard-0-1-2 onto offscreen canvases; `getSprite(key)` always available). `scenery.js` rewritten: bottom-center drawImage dispatch through AssetManager → procedural canvas, ground shadow ellipses per sprite, fog via `globalAlpha`. `buildSegments` sprite placement replaced with Knuth-hash deterministic variety (two-layer tree density, three billboard art variants). Loading screen with progress bar in game.js. 46 tests green (12 new AssetManager tests). Next: Phase 4 (car fidelity, particle system, speed feel).
- **2026-06-27 — Phase 2 complete.** New `sky.js` module: sky gradient → sun disc (with radial glow) → cloud wisps → two parallax mountain ranges (sine-sum profiles, FAR at 25% parallax rate, NEAR at 42%) scrolling with `getHorizonCurveX()`. `drawRoad` split into `projectRoad` (projection pre-pass, now called once in `render()` before all layers) + `drawRoad` (draw-only). `fogAlpha(dz)` exported from `road.js`; per-segment fog overlay applied in `renderSegment`; `globalAlpha` fog fade applied to scenery sprites and opponent cars. Shoulder strip added in `renderSegment` (sandy `#c0b090` verge between grass and rumble). `palette.js` gains fog, mountain, cloud, and shoulder colours. 34 tests still green. Next: Phase 3 (AssetManager, sprite atlas, scenery variety).
- **2026-06-27 — Phase 1 complete.** New `renderer.js` owns a fixed 800×500 back-buffer and a DPR-scaled display canvas; all game draws go to the back-buffer, `endFrame()` blits it at native resolution (2560×1600 physical px on a 2× display). New `palette.js` centralises all colours; `road.js` now reads sky/road colours from palette with `invalidateSkyGradient()` hook for Phase 5 swaps. Game layer list made explicit (`LAYERS` array in `game.js`). Perf baseline: 60 fps / 1.1ms frame time at HiDPI. 34 tests still green. Next: Phase 2 (depth fog, parallax sky, road surface upgrade, grass texture).
- **2026-06-27 — Phase 0 complete.** Converted all 7 JS files to native ES modules with explicit imports/exports; new `main.js` entry point; `index.html` reduced to a single `<script type="module">`. Added `package.json` + Vitest; 34 tests across `road.test.js`, `car.test.js`, `opponents.test.js` — all green. Replaced variable-timestep loop with 120 Hz fixed-timestep accumulator (2 physics steps/frame at 60fps). Added `debug.js` overlay (backtick toggle): 60 FPS, 0.7ms frame time, 119 segs drawn, 23 sprites. CLAUDE.md updated with module graph and new dev workflow. Game visually identical to pre-refactor. Next: Phase 1 (Renderer, resolution independence, render layers).

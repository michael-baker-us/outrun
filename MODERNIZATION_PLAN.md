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
**Status:** not started
**Goal:** Re-platform the codebase so the rest of the work is safe and testable.
This is plumbing — the game should look *identical* when Phase 0 ends.

**Why / what you learn:** module boundaries, dependency graphs, fixed-timestep
game loops, headless testing of game logic, basic profiling.

- [ ] Convert each file to an ES module with explicit `export`/`import`. Remove
      reliance on global script-load order. Update `index.html` to a single
      `<script type="module" src="main.js">` entry that wires everything.
- [ ] Document the new module graph in `CLAUDE.md` (replace the "shared globals"
      table with an import map).
- [ ] Add `package.json` (dev-only) + Vitest. Add `npm test`. No runtime deps.
- [ ] Extract pure logic into testable units and add first tests:
      - `buildSegments(seed)` is deterministic for a seed (snapshot a few fields).
      - `makeRng` Mulberry32 sequence is stable.
      - collision overlap math (`COLLISION_HALF`) given fixtures.
      - off-road speed-bleed and spin-out timing in `updateCar` (inject `dt`).
- [ ] Replace the variable-timestep loop with a **fixed-timestep accumulator**
      (e.g. 120 Hz physics) + interpolated render. Kills speed-dependent physics
      drift and makes behavior reproducible.
- [ ] Add a dev **debug overlay** (toggle with `~`/backtick): FPS, frame ms,
      physics steps/frame, draw-call-ish counts (segments drawn, sprites drawn),
      current seed, car state. Hidden by default; `?debug=1` to force on.
- [ ] Add a tiny `dev.md` (or README section): how to serve, run tests, toggle debug.

**Acceptance:** `npm test` green; game looks/plays identically; debug overlay
reports stable FPS; physics no longer varies with framerate.

---

### Phase 1 — Render pipeline & resolution
**Status:** not started
**Goal:** A clean, resolution-independent rendering core to build fidelity on.

**Why / what you learn:** offscreen render targets, devicePixelRatio, layered
compositing, a renderer abstraction, color/palette management.

- [ ] Introduce a `Renderer` module owning the canvas, an **offscreen back-buffer**,
      and `beginFrame()/endFrame()`. All draws go through it. (Sets up Phase 5 post-fx.)
- [ ] **Resolution independence:** render at a logical internal resolution,
      scale to the viewport honoring `devicePixelRatio`. Make 800×500 a default,
      not a hard constant. Decide pixel-art vs. smooth (likely drop
      `image-rendering: pixelated` once art is higher-res) — document the choice.
- [ ] Centralize the magic-number layout/colors (HUD rects, `COLORS`) into a
      **theme/palette module** so time-of-day (Phase 5) can swap palettes.
- [ ] Define explicit **render layers** (sky, far-parallax, road, scenery,
      traffic, particles, player, post-fx, HUD) as an ordered pass list, replacing
      the hand-ordered calls in `render()`.
- [ ] Perf budget: establish a target (60 fps on the user's machine) and record a
      baseline in the debug overlay / Progress Log.

**Acceptance:** crisp at any window size and on HiDPI; layer list drives render
order; no regression in FPS baseline.

---

### Phase 2 — World fidelity: road, depth, parallax sky
**Status:** not started
**Goal:** The single biggest visual jump — the world should read as deep and alive.

**Why / what you learn:** depth cueing/fog, parallax, procedural texture, dithering.

- [ ] **Distance fog / haze:** blend road, scenery, and traffic toward a horizon
      color as depth increases. Removes the hard "pop-in" at draw distance and
      adds depth. (Per-segment alpha or color-lerp by `dz`.)
- [ ] **Multi-layer parallax background** replacing the static half-screen gradient:
      sky gradient + sun/moon + distant mountain silhouette(s) + cloud band(s),
      each scrolling at its own rate driven by accumulated curve (so turns feel
      like you're turning) and by elevation.
- [ ] **Road surface upgrade:** anti-aliased segment edges, subtler stripe
      contrast, optional asphalt texture/noise, smoother rumble, and a soft
      shoulder. Consider per-segment ambient occlusion into dips.
- [ ] **Grass/terrain texture:** replace flat green with a subtle dithered/noise
      or banded texture; vary terrain color by biome (prep for Phase 6 stages).
- [ ] Hill/horizon polish: ensure the `clip` silhouette still hides sprites
      correctly with fog applied.

**Acceptance:** no hard pop-in at the horizon; turning visibly parallaxes the
background; road reads as textured asphalt, not flat bands; FPS within budget.

---

### Phase 3 — Sprites, scenery & the asset manager
**Status:** not started
**Goal:** Replace code-drawn flora/props with real (or richer procedural) sprites,
loaded through a proper asset pipeline with fallbacks.

**Why / what you learn:** asset loading/lifecycle, texture atlases, sprite
scaling/anchoring, scene dressing for density.

- [ ] Build an **`AssetManager`**: async preload of images/audio, a manifest,
      progress reporting (feeds a loading screen later), and **procedural
      fallback** registration so a missing asset never crashes the game.
- [ ] Create/curate a small **sprite atlas** (`assets/`): palms/trees variants,
      rocks, bushes, road signs, billboards, distant buildings. Keep the existing
      triangle-tree as the registered fallback.
- [ ] Anchor + scale sprites correctly against `segmentProjections` (bottom-center
      anchor, scale by road half-width) with smooth (bilinear) downscaling and the
      existing hill `clip`.
- [ ] **Scenery variety & density:** weighted placement by biome, near/far layers,
      occasional clusters, ground shadow blobs under sprites.
- [ ] Real **billboard art** (a few designs) via the atlas, fallback to current
      drawn billboard.
- [ ] Tests: asset manifest loads & fallback path triggers on a forced 404
      (mock `Image`).

**Acceptance:** roadside reads as a varied, populated world; force-removing an
asset file degrades gracefully (fallback) with a console warning, no crash.

---

### Phase 4 — Car fidelity & game feel
**Status:** not started
**Goal:** The car and the act of driving should feel modern and juicy.

**Why / what you learn:** sprite state machines, particle systems, camera dynamics,
"game juice."

- [ ] **Player car sprite set** (curated or richly procedural): straight + left/right
      steering frames, brake-light-on frame, body **bank/lean on curves**. Keep
      `drawCarBody()` pre-render trick as fallback. Maintain offscreen-sprite cache.
- [ ] **Opponent variety:** multiple vehicle silhouettes/colors; brake lights;
      slight lane-keeping/AI wobble so traffic isn't on rails.
- [ ] **Particle system** (generalize the current smoke): tire smoke on spin/skid,
      **dust** off-road, **sparks** on collision, exhaust puffs, speed-scaled
      intensity. Pooled allocations (avoid GC hitches — see existing smoke note).
- [ ] **Camera & speed feel:** subtle FOV/scale push at high speed, **speed lines**
      / vignette tightening near top speed, **screen shake** on crash, camera dip on
      hard braking.
- [ ] Polish the spin-out (Phase already has yaw fake) with the new particles +
      shake; add a brief recovery flash/invuln so back-to-back spins aren't punishing.

**Acceptance:** the car visibly steers/banks/brakes; crashes produce sparks +
shake + smoke; off-road kicks dust; no GC hitch near dense traffic (watch debug overlay).

---

### Phase 5 — Lighting, time-of-day, weather, post-FX
**Status:** not started
**Goal:** Atmosphere. The marquee "modern" layer.

**Why / what you learn:** color grading, additive lighting/glow, screen-space
post effects, weather particle systems, palette interpolation.

- [ ] **Time-of-day system:** interpolate sky/fog/palette across dawn→day→dusk→
      night (drive from the palette module in Phase 1). Per-stage or cycling.
- [ ] **Night mode:** dim ambient, **headlight cones** on player + traffic, glowing
      tail/brake lights (additive blend), lit billboards, starfield.
- [ ] **Weather:** rain and/or snow particle layers; **wet-road darkening +
      reflections/streaks**; reduced grip affecting physics (tunable). Fog density
      as a weather variable.
- [ ] **Post-FX** on the back-buffer: bloom/glow on bright sources, vignette,
      subtle chromatic offset or motion blur at speed, optional film grain.
      All toggleable (perf + taste) via settings.
- [ ] Settings to enable/disable heavy effects; auto-downgrade if FPS drops below
      budget (read from the debug instrumentation).

**Acceptance:** convincing day↔night transition; headlights and glowing lights at
night; at least one weather mode with matching road look + grip change; effects
toggle cleanly and hold the FPS budget (or auto-downgrade).

---

### Phase 6 — Game systems, audio & UX
**Status:** not started
**Goal:** Turn the tech demo into a *game* — the "everything you'd expect."

**Why / what you learn:** WebAudio, state/UI management, persistence, content design.

- [ ] **Audio engine (WebAudio):** RPM/speed-linked **engine drone**, skid/crash/
      collision SFX, checkpoint chime, UI clicks; **music** track(s) with mute/volume.
      All through the AssetManager with silent fallback. Respect autoplay-unlock
      (start audio on first input).
- [ ] **Modern HUD:** custom web font, animated speedometer (dial or bar), lap/
      stage info, animated checkpoint banner, optional **mini-map / track-progress**
      bar. Replace monospace overlays.
- [ ] **Screens & flow:** title/attract screen, loading screen (uses asset
      progress), pause menu, settings (graphics/audio/controls), game-over with
      stats. Proper `GameState` machine replacing the `'playing'|'gameover'` flag.
- [ ] **Persistence (localStorage):** high scores, best distance per stage, chosen
      settings, last seed.
- [ ] **Content / stages:** multiple **biomes/stages** (coast, desert, city,
      mountains, night) selected as you progress; optional **branching forks** à la
      classic OutRun; difficulty/traffic-density scaling. Reuse seeded generation.
- [ ] **Controls:** gamepad support (Gamepad API) alongside keyboard/touch/tilt;
      remappable keys in settings.

**Acceptance:** boot → title → play → pause/settings → game-over → high-score
saved, all without reload; engine/music audio works; at least 2–3 distinct stages;
gamepad drives the car.

---

### Phase 7 — (Optional / stretch) WebGL2 renderer
**Status:** not started
**Goal:** Lift the fidelity ceiling with a real GPU pipeline — pure learning.

**Why / what you learn:** WebGL2, shaders (GLSL), textured meshes, framebuffer
post-processing, renderer abstraction in practice.

- [ ] Implement an alternate `Renderer` (the Phase 1 abstraction pays off here):
      road as a textured mesh/strip, sprites as textured quads, batched draws.
- [ ] Shader-based **fog, lighting, post-FX** (bloom/vignette/grade in GLSL).
- [ ] Runtime switch Canvas2D ↔ WebGL (settings + `?renderer=`), with Canvas2D as
      the guaranteed fallback when WebGL is unavailable.
- [ ] Perf comparison logged in the Progress Log.

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

- _(empty — first executing session appends here)_

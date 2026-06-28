// Centralized color palette — all game colors live here so Phase 5 (time-of-day,
// weather) can swap the entire palette by exporting a different object.
// Call sky.invalidateSkyGradient() after a palette swap.

// ---- TOD color-lerp helpers (used only by applyTODPalette below) ----------

function _lerpH(a, b, t) {
  const n = parseInt(a.slice(1), 16), m = parseInt(b.slice(1), 16);
  const r  = Math.round(((n >> 16) & 255) + (((m >> 16) & 255) - ((n >> 16) & 255)) * t);
  const g  = Math.round(((n >>  8) & 255) + (((m >>  8) & 255) - ((n >>  8) & 255)) * t);
  const bl = Math.round( (n        & 255) + ( (m        & 255) - (n        & 255))  * t);
  return '#' + r.toString(16).padStart(2, '0')
             + g.toString(16).padStart(2, '0')
             + bl.toString(16).padStart(2, '0');
}

function _lerpR(a, b, t) {
  const p = s => s.match(/[\d.]+/g).map(Number);
  const [ar, ag, ab, aa] = p(a), [br, bg, bb, ba] = p(b);
  return `rgba(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)},${(aa+(ba-aa)*t).toFixed(2)})`;
}

// ---- Stage palettes: dawn / day / dusk / night ----------------------------
// phase: 0 = dawn, 0.25 = day, 0.5 = dusk, 0.75 = night (then wraps to dawn)

export const PALETTES = {
  dawn: {
    sky: {
      top:          '#150d2a',
      mid:          '#8a3a18',
      horizon:      '#ff9955',
      fog:          '#cc7744',
      mountainFar:  '#1a0d08',
      mountainNear: '#2a160e',
      cloud:        'rgba(255,190,130,0.22)',
    },
    road: { grass: ['#175d1a', '#126015'], surface: ['#6a6a6a', '#626262'] },
  },
  day: {
    sky: {
      top:          '#1a4d8f',
      mid:          '#72d7ee',
      horizon:      '#ffd9a0',
      fog:          '#c0d0d8',
      mountainFar:  '#1d3a54',
      mountainNear: '#254868',
      cloud:        'rgba(255,255,255,0.18)',
    },
    road: { grass: ['#1ba62b', '#149d22'], surface: ['#8a8a8a', '#848484'] },
  },
  dusk: {
    sky: {
      top:          '#180e50',
      mid:          '#c04420',
      horizon:      '#ff5500',
      fog:          '#aa5530',
      mountainFar:  '#140a20',
      mountainNear: '#200f30',
      cloud:        'rgba(255,160,80,0.28)',
    },
    road: { grass: ['#187020', '#126818'], surface: ['#707070', '#686868'] },
  },
  night: {
    sky: {
      top:          '#010408',
      mid:          '#040c18',
      horizon:      '#0a1428',
      fog:          '#060c1a',
      mountainFar:  '#020610',
      mountainNear: '#040a18',
      cloud:        'rgba(80,100,160,0.08)',
    },
    road: { grass: ['#0c3a10', '#0a320d'], surface: ['#383838', '#303030'] },
  },
};

// Mutates `palette` in-place to the interpolated state for the given phase.
// Called every frame by tod.js; callers must also call sky.invalidateSkyGradient().
export function applyTODPalette(phase) {
  let a, b, t;
  if      (phase < 0.25) { a = PALETTES.dawn;  b = PALETTES.day;   t =  phase          / 0.25; }
  else if (phase < 0.5)  { a = PALETTES.day;   b = PALETTES.dusk;  t = (phase - 0.25)  / 0.25; }
  else if (phase < 0.75) { a = PALETTES.dusk;  b = PALETTES.night; t = (phase - 0.5)   / 0.25; }
  else                   { a = PALETTES.night; b = PALETTES.dawn;  t = (phase - 0.75)  / 0.25; }

  const s = a.sky, e = b.sky;
  palette.sky.top          = _lerpH(s.top,          e.top,          t);
  palette.sky.mid          = _lerpH(s.mid,          e.mid,          t);
  palette.sky.horizon      = _lerpH(s.horizon,      e.horizon,      t);
  palette.sky.fog          = _lerpH(s.fog,          e.fog,          t);
  palette.sky.mountainFar  = _lerpH(s.mountainFar,  e.mountainFar,  t);
  palette.sky.mountainNear = _lerpH(s.mountainNear, e.mountainNear, t);
  palette.sky.cloud        = _lerpR(s.cloud,        e.cloud,        t);

  palette.road.grass[0]   = _lerpH(a.road.grass[0],   b.road.grass[0],   t);
  palette.road.grass[1]   = _lerpH(a.road.grass[1],   b.road.grass[1],   t);
  palette.road.surface[0] = _lerpH(a.road.surface[0], b.road.surface[0], t);
  palette.road.surface[1] = _lerpH(a.road.surface[1], b.road.surface[1], t);
}

export const palette = {
  sky: {
    top:     '#1a4d8f',  // zenith blue
    mid:     '#72d7ee',  // horizon blue
    horizon: '#ffd9a0',  // warm glow at the horizon
    fog:     '#c0d0d8',  // horizon haze — fog blends road/scenery toward this
    mountainFar:  '#1d3a54',  // distant range (dark blue-grey)
    mountainNear: '#254868',  // nearer range (slightly lighter)
    cloud:   'rgba(255,255,255,0.18)',  // wispy cloud tint
  },

  road: {
    grass:    ['#1ba62b', '#149d22'],  // alternating grass bands
    rumble:   ['#cc2b2b', '#efefef'],  // left/right rumble strips
    surface:  ['#8a8a8a', '#848484'],  // tarmac (two shades, gentle contrast)
    dash:     ['#ffffff', null],       // center lane dashes (null = no dash)
    shoulder: '#c0b090',              // narrow verge strip between grass and rumble
  },

  hud: {
    bg:         'rgba(0,0,0,0.45)',
    time:       '#ffe44d',
    timeLow:    '#ff4444',  // flashes red when < 10 s remain
    text:       '#fff',
    checkpoint: '#cfe8ff',
    flash:      '#ffe44d',
    seed:       'rgba(255,255,255,0.55)',
  },

  gameover: {
    overlay: 'rgba(0,0,0,0.65)',
    title:   '#ff4444',
    text:    '#fff',
    prompt:  '#ffe44d',
  },
};

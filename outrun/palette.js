// Centralized color palette — all game colors live here so Phase 5 (time-of-day,
// weather) can swap the entire palette by exporting a different object.
// Call sky.invalidateSkyGradient() after a palette swap.

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

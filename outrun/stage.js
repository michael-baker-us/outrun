// Stage/biome definitions. CHECKPOINT_GAP is 50,000 distance units; regular
// stages change every 15 checkpoints. Special stages (special:true) keep their
// theme for the entire run regardless of distance.

export const STAGES = [
  // ── Regular stages ──────────────────────────────────────────────────────────
  {
    name:             'COAST',
    subtitle:         'Pacific Coast Highway',
    startDistance:    0,
    trafficMultiplier: 1.0,
    roadOverride: {
      grass:    ['#c8b870', '#bca860'],
      shoulder: '#d4c47a',
    },
  },
  {
    name:             'DESERT',
    subtitle:         'Nevada Flats',
    startDistance:    750_000,
    trafficMultiplier: 0.75,
    roadOverride: {
      grass:    ['#b8a045', '#a89038'],
      surface:  ['#8a7858', '#806e50'],
      shoulder: '#c0a855',
    },
  },
  {
    name:             'CITY',
    subtitle:         'Downtown',
    startDistance:    1_500_000,
    trafficMultiplier: 1.6,
    roadOverride: {
      grass:    ['#3c3c3c', '#343434'],
      surface:  ['#4e4e4e', '#464646'],
      shoulder: '#525252',
    },
  },

  // ── Special stages ──────────────────────────────────────────────────────────
  {
    name:              'SEA',
    subtitle:          'Ocean Sprint',
    label:             '★ SPECIAL',
    startDistance:     0,
    special:           true,
    theme:             'sea',
    trafficMultiplier: 0.8,
    playerVehicle:     'jetski',
    playerColor:       '#00aacc',
    opponentTypes:     ['jetski', 'jetski', 'jetski', 'powerboat', 'jetski'],
    opponentColors:    ['#ee4411', '#ffffff', '#22aacc', '#ffcc00', '#cc2266'],
    roadOverride: {
      grass:    ['#0a5a9f', '#084e8a'],
      surface:  ['#1a9abf', '#168fb0'],
      rumble:   ['#ff8800', '#ff6600'],
      shoulder: '#12789a',
    },
  },
  {
    name:              'SPACE',
    subtitle:          'Asteroid Belt',
    label:             '★ SPECIAL',
    startDistance:     0,
    special:           true,
    theme:             'space',
    trafficMultiplier: 0.6,
    playerVehicle:     'spacecart',
    playerColor:       '#4488ff',
    opponentTypes:     ['spacecart', 'aliencraft', 'spacecart', 'aliencraft', 'spacecart'],
    opponentColors:    ['#cc44ff', '#44ff88', '#ff4488', '#ffcc00', '#88ccff'],
    roadOverride: {
      grass:    ['#000008', '#00000c'], // near-black: star field bleeds through
      surface:  ['#0c0c22', '#08081a'], // dark space-blue platform
      rumble:   ['#cc44ff', '#aa22dd'],
      shoulder: '#0a0818',
    },
  },
  {
    name:              'DIRT',
    subtitle:          'MX Enduro',
    label:             '★ SPECIAL',
    startDistance:     0,
    special:           true,
    theme:             'dirt',
    trafficMultiplier: 1.0,
    playerVehicle:     'dirtbike',
    playerColor:       '#cc4411',
    opponentTypes:     ['dirtbike', 'dirtbike', 'atv', 'dirtbike', 'atv'],
    opponentColors:    ['#2266aa', '#ffcc00', '#aa2222', '#228833', '#ff8800'],
    roadOverride: {
      grass:    ['#5a3a1a', '#4e3015'],
      surface:  ['#8a5a28', '#7a5020'],
      rumble:   ['#f0f0f0', '#cc8844'],
      shoulder: '#6e4a1e',
    },
  },
];

export function getStageIndex(distance) {
  // Only apply to the first 3 regular stages
  for (let i = 2; i >= 0; i--) {
    if (distance >= STAGES[i].startDistance) return i;
  }
  return 0;
}

export function getStage(distance) {
  return STAGES[getStageIndex(distance)];
}

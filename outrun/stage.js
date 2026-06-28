// Stage/biome definitions. CHECKPOINT_GAP is 50,000 distance units; stages
// change every 15 checkpoints — roughly 90 s of full-speed driving each.

export const STAGES = [
  {
    name:             'COAST',
    subtitle:         'Pacific Coast Highway',
    startDistance:    0,
    trafficMultiplier: 1.0,
    roadOverride: {
      grass:    ['#c8b870', '#bca860'], // sandy dune grass
      shoulder: '#d4c47a',              // lighter sand shoulder
      // surface omitted — keep TOD asphalt colour
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
];

export function getStageIndex(distance) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (distance >= STAGES[i].startDistance) return i;
  }
  return 0;
}

export function getStage(distance) {
  return STAGES[getStageIndex(distance)];
}

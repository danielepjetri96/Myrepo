// One Tower Defense data: edit this file to tune the Torretta, the spells, the enemies and the levels.
// No logic here.
const OneTowerData = {
  tower: {
    hp: 20,             // Salute, full at the start of every level
    size: 24,           // side of the square the enemies stop against
  },

  // The Bolt (Dardo): always available, fired toward the cursor while the button is held.
  bolt: {
    fireRate: 2,        // shots per second
    damage: 1,
    speed: 200,         // px/s
    size: 3,            // hitbox side
  },

  // Enemies walk straight to the Torretta, stop against it and hit it every `attackEvery` seconds.
  enemies: {
    goblin: { hp: 4, speed: 15, damage: 1, attackEvery: 1, size: 10 },
  },

  // One entry per level, easiest first. waves: waves in the level; perWave: [min, max] enemies per wave;
  // types: spawn weights by enemy type.
  levels: [
    { waves: 3, perWave: [4, 5], types: { goblin: 1 } },
  ],

  firstWaveDelay: 1,    // s before the first wave of a level
  waveDelay: 3,         // s between a defeated wave and the next one
  spawnEvery: 0.7,      // s between two enemies of the same wave
  spawnWarning: 0.6,    // s an enemy blinks at its entry point on the edge before it walks in
};

// One Tower Defense data: edit this file to tune the Torretta, the spells, the enemies and the levels.
// No logic here.
const OneTowerData = {
  tower: {
    hp: 20,             // Salute, full at the start of every level
    size: 24,           // side of the square the enemies stop against
  },

  // Incantesimi, in the order of the keys 1-5. Each has its own Ricarica (recharge, s) before it can be cast again.
  spells: {
    // Dardo: always available, fired toward the cursor while the button is held.
    bolt: {
      fireRate: 2,      // shots per second (its Ricarica is 1 / fireRate)
      damage: 1,
      speed: 200,       // px/s
      size: 3,          // hitbox side
    },
    // Palla di fuoco: flies from the Torretta and explodes where clicked, or on the first enemy in its way.
    fireball: { recharge: 4, damage: 3, radius: 20, speed: 180, size: 5 },
    // Gelo: an area where clicked that slows enemies down (slow: fraction of speed taken away) for a while. No damage.
    frost: { recharge: 8, slow: 0.6, duration: 4, radius: 30 },
    // Fulmine: strikes the enemy closest to the cursor at once, then jumps to the closest enemies within `jump` px.
    lightning: { recharge: 6, damage: [4, 3, 2], jump: 40 },
    // Meteora: falls where clicked after `delay` seconds of warning.
    meteor: { recharge: 20, delay: 1, damage: 12, radius: 40 },
  },

  // Enemies walk straight to the Torretta, stop against it (or `range` px from it) and hit it every `attackEvery` seconds.
  enemies: {
    goblin:  { hp: 4,  speed: 15, damage: 1, attackEvery: 1, size: 10 },
    wolf:    { hp: 2,  speed: 30, damage: 1, attackEvery: 1, size: 10 },   // fast and fragile
    orc:     { hp: 15, speed: 9,  damage: 3, attackEvery: 1, size: 14 },   // slow and tough
    shaman:  { hp: 5,  speed: 12, damage: 1, attackEvery: 2, size: 10, range: 60 },   // stops at a distance and strikes from there
    // The Boss: the last wave of the last level, alone. Every `summon.every` s it calls `count` enemies around itself;
    // Frost slows it only by `frostFactor` of the usual amount.
    boss:    { hp: 120, speed: 6, damage: 5, attackEvery: 1, size: 22, frostFactor: 0.5, summon: { every: 10, type: 'goblin', count: 3 } },
  },

  // One entry per level, easiest first. waves: waves in the level; perWave: [min, max] enemies per wave;
  // types: spawn weights by enemy type; boss: one more wave at the end, the Boss alone.
  levels: [
    { waves: 3, perWave: [4, 5], types: { goblin: 1 } },
  ],

  firstWaveDelay: 1,    // s before the first wave of a level
  waveDelay: 3,         // s between a defeated wave and the next one
  spawnEvery: 0.7,      // s between two enemies of the same wave
  spawnWarning: 0.6,    // s an enemy blinks at its entry point on the edge before it walks in
};

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
    // burns / burn: the ground left on fire after the blast (unlocked by a Potenziamento).
    fireball: { recharge: 4, damage: 3, radius: 20, speed: 180, size: 5, burns: false, burn: { duration: 3, dps: 1 } },
    // Gelo: an area where clicked that slows enemies down (slow: fraction of speed taken away) for a while.
    // No damage unless `hurts` (a Potenziamento): then `dps` per second while slowed.
    frost: { recharge: 8, slow: 0.6, duration: 4, radius: 30, hurts: false, dps: 1 },
    // Fulmine: strikes the enemy closest to the cursor at once, then makes `jumps` jumps to the closest enemy within `reach` px.
    // damage: per strike, in order (one more entry than the most jumps it can get).
    lightning: { recharge: 6, jumps: 2, damage: [4, 3, 2, 1], reach: 40 },
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

  // Potenziamenti, offered 3 at a time. target: a spell or 'tower'; add / mul / set: the values they change
  // (add on a list adds to every entry); repeatable: can be taken more than once.
  upgrades: {
    boltDamage:       { target: 'bolt',      name: 'BOLT: +1 DAMAGE',           add: { damage: 1 } },
    boltRate:         { target: 'bolt',      name: 'BOLT: +50% FIRE RATE',      mul: { fireRate: 1.5 } },
    boltPierce:       { target: 'bolt',      name: 'BOLT: PIERCES ENEMIES',     set: { pierce: true } },
    fireballRadius:   { target: 'fireball',  name: 'FIREBALL: +30% RADIUS',     mul: { radius: 1.3 } },
    fireballBurn:     { target: 'fireball',  name: 'FIREBALL: LEAVES FIRE',     set: { burns: true } },
    fireballRecharge: { target: 'fireball',  name: 'FIREBALL: -25% RECHARGE',   mul: { recharge: 0.75 } },
    frostDuration:    { target: 'frost',     name: 'FROST: +2 S',               add: { duration: 2 } },
    frostDamage:      { target: 'frost',     name: 'FROST: 1 DAMAGE PER S',     set: { hurts: true } },
    frostRadius:      { target: 'frost',     name: 'FROST: +30% RADIUS',        mul: { radius: 1.3 } },
    lightningJump:    { target: 'lightning', name: 'LIGHTNING: +1 JUMP',        add: { jumps: 1 } },
    lightningDamage:  { target: 'lightning', name: 'LIGHTNING: +2 DAMAGE',      add: { damage: 2 } },
    meteorRecharge:   { target: 'meteor',    name: 'METEOR: -30% RECHARGE',     mul: { recharge: 0.7 } },
    meteorDamage:     { target: 'meteor',    name: 'METEOR: +50% DAMAGE',       mul: { damage: 1.5 } },
    towerHealth:      { target: 'tower',     name: 'TORRETTA: +5 MAX HEALTH',   add: { hp: 5 }, repeatable: true },
  },

  // One entry per level, easiest first. waves: waves in the level; perWave: [min, max] enemies per wave;
  // types: spawn weights by enemy type; spell: the spell it unlocks (usable from its start);
  // boss: one more wave at the end, the Boss alone.
  levels: [
    { waves: 3, perWave: [4, 5],  types: { goblin: 1 },                                spell: 'bolt' },
    { waves: 4, perWave: [5, 7],  types: { goblin: 3, wolf: 2 },                       spell: 'fireball' },
    { waves: 5, perWave: [6, 8],  types: { goblin: 3, wolf: 2, orc: 1 },               spell: 'frost' },
    { waves: 6, perWave: [7, 10], types: { goblin: 3, wolf: 2, orc: 1, shaman: 2 },    spell: 'lightning' },
    { waves: 6, perWave: [8, 12], types: { goblin: 3, wolf: 3, orc: 2, shaman: 2 },    spell: 'meteor', boss: true },
  ],

  firstWaveDelay: 1,    // s before the first wave of a level
  waveDelay: 3,         // s between a defeated wave and the next one
  spawnEvery: 0.7,      // s between two enemies of the same wave
  spawnWarning: 0.6,    // s an enemy blinks at its entry point on the edge before it walks in
};

// Clear the Room data: edit this file to tune the player, the enemies, the levels and the room layouts.
// No logic here.
const ClearTheRoomData = {
  player: {
    speed: 90,          // px/s
    maxHp: 5,           // hearts of Salute per attempt at a level
    size: 10,           // hitbox side
    fireRate: 4,        // shots per second while the button is held
    damage: 1,
    bulletSpeed: 260,   // px/s
    range: 200,         // px a bullet travels before it disappears
    invuln: 1,          // s of invulnerability after being hit
  },

  // All enemies chase the player in a straight line. dropChance: probability of leaving a heart.
  enemies: {
    grunt: { hp: 3, speed: 40, damage: 1, size: 12, dropChance: 0 },
  },

  // One entry per level. rooms: rooms in the chain; waves: waves per room; perWave: [min, max] enemies per wave;
  // types: spawn weights by enemy type. (Level 1 only for now: more rooms, levels and types come with later tickets.)
  levels: [
    { rooms: 1, waves: 2, perWave: [3, 4], types: { grunt: 1 } },
  ],

  waveDelay: 1,         // s between a cleared wave and the next one
  spawnWarning: 0.6,    // s an enemy blinks at its spawn point before it becomes active

  // Room layouts, 32 x 18 tiles of 20 px (a 640 x 360 room).
  // '#' wall, '.' floor, 'S' enemy spawn point (floor), 'P' player start (floor).
  layouts: [
    [
      "################################",
      "#S............................S#",
      "#..............................#",
      "#....##..................##....#",
      "#....##..................##....#",
      "#..............................#",
      "#..........####....####........#",
      "#..........#..........#........#",
      "#S.........#.....P....#.......S#",
      "#..........#..........#........#",
      "#..........####....####........#",
      "#..............................#",
      "#....##..................##....#",
      "#....##..................##....#",
      "#..............................#",
      "#..............................#",
      "#S............................S#",
      "################################"
    ],
  ],
};

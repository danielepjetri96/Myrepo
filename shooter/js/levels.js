// Level definitions. kills = enemies to defeat to clear the level.
// mix = spawn weights per enemy type. floor/wall = [base, dark, light] colors.
const LEVELS = [
  {
    name: 'THE YARD', kills: 12, spawnEvery: 1.3, maxAlive: 6,
    mix: { slime: 1 },
    floor: ['#257179', '#1e5c63', '#38b764'], wall: ['#566c86', '#333c57', '#94b0c2'],
  },
  {
    name: 'THE SEWERS', kills: 20, spawnEvery: 1.0, maxAlive: 8,
    mix: { slime: 3, bat: 2 },
    floor: ['#333c57', '#29366f', '#566c86'], wall: ['#5d275d', '#3a1a3a', '#b13e53'],
  },
  {
    name: 'THE DUNES', kills: 28, spawnEvery: 0.9, maxAlive: 10,
    mix: { slime: 3, bat: 3, brute: 1 },
    floor: ['#b86f50', '#9a5a40', '#ef7d57'], wall: ['#73464c', '#4a2c30', '#ffcd75'],
  },
  {
    name: 'THE LAB', kills: 34, spawnEvery: 0.8, maxAlive: 12,
    mix: { slime: 2, bat: 3, brute: 1, robot: 2 },
    floor: ['#566c86', '#333c57', '#94b0c2'], wall: ['#29366f', '#1a1c2c', '#41a6f6'],
  },
  {
    name: 'THE CRYPT', kills: 42, spawnEvery: 0.7, maxAlive: 14,
    mix: { slime: 2, bat: 4, brute: 2, robot: 2 },
    floor: ['#3b2a3a', '#2a1d29', '#5d275d'], wall: ['#333c57', '#1a1c2c', '#566c86'],
  },
  {
    name: 'THE CORE', kills: 50, spawnEvery: 0.6, maxAlive: 16,
    mix: { slime: 2, bat: 4, brute: 3, robot: 3 },
    floor: ['#5d275d', '#45193f', '#b13e53'], wall: ['#1a1c2c', '#0d0e17', '#ef7d57'],
  },
];

// Levels past the last one become endless: same look on rotation, but harder.
function getLevel(n) {
  if (n <= LEVELS.length) return { ...LEVELS[n - 1], hpMul: 1, speedMul: 1 };
  const extra = n - LEVELS.length;
  const look = LEVELS[(n - 1) % LEVELS.length];
  const last = LEVELS[LEVELS.length - 1];
  return {
    ...look,
    name: 'ENDLESS ' + extra,
    kills: last.kills + extra * 8,
    spawnEvery: Math.max(0.3, last.spawnEvery - extra * 0.04),
    maxAlive: Math.min(30, last.maxAlive + extra * 2),
    mix: last.mix,
    hpMul: 1 + extra * 0.25,
    speedMul: Math.min(1.5, 1 + extra * 0.04),
  };
}

function pickWeighted(mix) {
  const entries = Object.entries(mix);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[0][0];
}

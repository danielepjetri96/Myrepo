// One Tower Defense simulation: a fixed 320 x 180 field with the Torretta in the middle and enemies walking in from the edges.
// No canvas, no DOM, no storage: a level is stepped with a fixed dt and reports only 'passed' or 'lost'.
// Visual/audio cues (shots, hits, kills...) are queued in sim.fx for the shell to drain.
const OneTower = {
  W: 320,
  H: 180,

  // Lists the enemy types of each wave for a level config ({ waves, perWave: [min, max], types: { id: weight } }).
  buildWaves(cfg, rng) {
    rng = rng || Math.random;
    const ids = Object.keys(cfg.types), total = ids.reduce((s, id) => s + cfg.types[id], 0);
    const pick = () => {
      let r = rng() * total;
      for (const id of ids) { r -= cfg.types[id]; if (r < 0) return id; }
      return ids[ids.length - 1];
    };
    const [min, max] = cfg.perWave;
    return Array.from({ length: cfg.waves }, () => Array.from({ length: min + Math.floor(rng() * (max - min + 1)) }, pick));
  },

  // waves: lists of enemy types, one list per wave (see buildWaves).
  create({ waves, rng }) {
    const D = OneTowerData, B = D.bolt;
    rng = rng || Math.random;
    const sim = {
      tower: { x: OneTower.W / 2, y: OneTower.H / 2, size: D.tower.size, hp: D.tower.hp, maxHp: D.tower.hp },
      enemies: [],
      bolts: [],
      fx: [],                 // { type: 'shoot' | 'hit' | 'kill' | 'hurt', x, y }
      state: 'running',       // running | lost | passed
      waveIndex: 0,           // waves started so far
      waveCount: waves.length,
      waveTimer: D.firstWaveDelay,
      queue: [],              // enemy types of the current wave still to walk in
      spawnTimer: 0,
      fireCd: 0,

      // input: { aimX, aimY (field coordinates), fire }. Returns 'passed', 'lost' or null.
      update(dt, input) {
        if (sim.state !== 'running') return null;
        sim.fireCd = Math.max(-dt, sim.fireCd - dt);   // may go slightly negative so the cadence does not drift
        if (input.fire && sim.fireCd <= 0) {
          sim.fireCd += 1 / B.fireRate;
          const t = sim.tower, dx = input.aimX - t.x, dy = input.aimY - t.y, d = Math.hypot(dx, dy) || 1;
          sim.bolts.push({ x: t.x, y: t.y, vx: dx / d * B.speed, vy: dy / d * B.speed });
          sim.fx.push({ type: 'shoot', x: t.x, y: t.y });
        }
        sim.updateBolts(dt);
        sim.updateEnemies(dt);
        if (sim.tower.hp <= 0) { sim.state = 'lost'; return 'lost'; }
        return sim.updateWaves(dt);
      },

      updateBolts(dt) {
        for (const b of sim.bolts) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < 0 || b.x > OneTower.W || b.y < 0 || b.y > OneTower.H) { b.dead = true; continue; }
          for (const e of sim.enemies) {
            if (e.spawnT > 0 || e.hp <= 0) continue;
            if (Math.abs(b.x - e.x) < (e.size + B.size) / 2 && Math.abs(b.y - e.y) < (e.size + B.size) / 2) {
              b.dead = true; e.hp -= B.damage; e.flash = 0.08;
              sim.fx.push({ type: e.hp <= 0 ? 'kill' : 'hit', x: e.x, y: e.y });
              break;
            }
          }
        }
        sim.bolts = sim.bolts.filter(b => !b.dead);
        sim.enemies = sim.enemies.filter(e => e.hp > 0);
      },

      // Enemies walk straight to the Torretta, stop when they touch it and hit it every attackEvery seconds (the first hit on arrival).
      updateEnemies(dt) {
        const t = sim.tower;
        for (const e of sim.enemies) {
          e.flash = Math.max(0, e.flash - dt);
          if (e.spawnT > 0) { e.spawnT -= dt; continue; }
          const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1, axis = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
          const gap = axis - (t.size + e.size) / 2;   // distance left before touching, on the dominant axis
          if (gap > 1e-9) {
            const s = Math.min(e.speed * dt, gap * d / axis);   // the last step lands exactly against the Torretta
            e.x += dx / d * s; e.y += dy / d * s;
          } else {
            e.attackT -= dt;
            if (e.attackT <= 0) {
              e.attackT += e.attackEvery;
              t.hp -= e.damage;
              sim.fx.push({ type: 'hurt', x: e.x, y: e.y });
            }
          }
        }
      },

      // A wave starts after a pause, then its enemies walk in one at a time. Returns 'passed' once the last wave is defeated.
      updateWaves(dt) {
        if (sim.queue.length > 0) {
          sim.spawnTimer -= dt;
          if (sim.spawnTimer <= 0) { sim.spawn(sim.queue.shift()); sim.spawnTimer = D.spawnEvery; }
          return null;
        }
        if (sim.enemies.length > 0) return null;
        if (sim.waveIndex >= waves.length) { sim.state = 'passed'; return 'passed'; }
        sim.waveTimer -= dt;
        if (sim.waveTimer <= 0) {
          sim.queue = waves[sim.waveIndex++].slice();
          sim.spawnTimer = 0; sim.waveTimer = D.waveDelay;
        }
        return null;
      },

      // An enemy appears at a random point of the field's edge and blinks there before it walks in.
      spawn(id) {
        const def = D.enemies[id], m = def.size / 2, W = OneTower.W - 2 * m, H = OneTower.H - 2 * m;
        let r = rng() * 2 * (W + H), x, y;
        if (r < W) { x = r; y = 0; }
        else if ((r -= W) < H) { x = W; y = r; }
        else if ((r -= H) < W) { x = W - r; y = H; }
        else { x = 0; y = H - (r - W); }
        sim.enemies.push({ type: id, x: x + m, y: y + m, size: def.size, hp: def.hp, speed: def.speed, damage: def.damage, attackEvery: def.attackEvery, attackT: 0, spawnT: D.spawnWarning, flash: 0 });
      },
    };
    return sim;
  },
};

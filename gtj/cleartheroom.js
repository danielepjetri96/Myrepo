// Clear the Room simulation: top-down room, WASD movement, mouse aim and shoot, enemies that chase.
// No canvas, no DOM, no storage: a room is stepped with a fixed dt and reports only 'passed' or 'lost'.
// Visual/audio cues (shots, hits, kills...) are queued in sim.fx for the shell to drain.
const ClearTheRoom = {
  TILE: 20,
  CLEAR_DELAY: 0.6,   // s between the last enemy dying and 'passed'

  // Turns the character grid into { width, height, start, spawns, hits(cx, cy, half) }.
  parseLayout(rows) {
    const T = ClearTheRoom.TILE;
    const solid = rows.map(r => [...r].map(ch => ch === '#'));
    const spawns = [];
    let start = null;
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      const c = { x: i * T + T / 2, y: j * T + T / 2 };
      if (ch === 'S') spawns.push(c);
      if (ch === 'P') start = c;
    }));
    return {
      width: rows[0].length * T,
      height: rows.length * T,
      start,
      spawns,
      solid,
      // True when the square centered on (cx, cy) with the given half side touches a wall (or leaves the room).
      hits(cx, cy, half) {
        const x0 = Math.floor((cx - half) / T), x1 = Math.floor((cx + half - 1e-6) / T);
        const y0 = Math.floor((cy - half) / T), y1 = Math.floor((cy + half - 1e-6) / T);
        for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
          if (j < 0 || j >= solid.length || i < 0 || i >= solid[0].length || solid[j][i]) return true;
        }
        return false;
      },
    };
  },

  // Lists the enemy types of each wave for a level config ({ waves, perWave: [min, max], types: { id: weight } }).
  buildWaves(cfg, rng) {
    rng = rng || Math.random;
    const ids = Object.keys(cfg.types), total = ids.reduce((s, id) => s + cfg.types[id], 0);
    const pick = () => {
      let r = rng() * total;
      for (const id of ids) { r -= cfg.types[id]; if (r < 0) return id; }
      return ids[ids.length - 1];
    };
    const waves = [];
    for (let w = 0; w < cfg.waves; w++) {
      const n = cfg.perWave[0] + Math.floor(rng() * (cfg.perWave[1] - cfg.perWave[0] + 1));
      waves.push(Array.from({ length: n }, pick));
    }
    return waves;
  },

  // layout: rows of characters; waves: result of buildWaves (spawn points are used in a fixed, distance-based order).
  create({ layout, waves }) {
    const D = ClearTheRoomData, P = D.player;
    const room = ClearTheRoom.parseLayout(layout);
    const sim = {
      room,
      player: { x: room.start.x, y: room.start.y, size: P.size, hp: P.maxHp, maxHp: P.maxHp, invuln: 0, fireCd: 0, dirX: 1, dirY: 0 },
      enemies: [],
      bullets: [],
      fx: [],                 // { type: 'shoot' | 'hit' | 'kill' | 'hurt', x, y }
      state: 'running',       // running | lost | passed
      waveIndex: 0,
      waveTimer: D.waveDelay,
      clearTimer: ClearTheRoom.CLEAR_DELAY,
      time: 0,

      // input: { moveX, moveY (-1..1), aimX, aimY (room coordinates), fire }. Returns 'passed' or 'lost' once.
      update(dt, input) {
        if (sim.state !== 'running') return null;
        sim.time += dt;
        const p = sim.player;

        // movement (diagonals are normalized)
        let mx = input.moveX || 0, my = input.moveY || 0;
        const len = Math.hypot(mx, my);
        if (len > 1) { mx /= len; my /= len; }
        sim.move(p, mx * P.speed * dt, my * P.speed * dt);

        // aiming and shooting
        const ax = input.aimX - p.x, ay = input.aimY - p.y, al = Math.hypot(ax, ay);
        if (al > 1) { p.dirX = ax / al; p.dirY = ay / al; }
        p.invuln = Math.max(0, p.invuln - dt);
        p.fireCd = Math.max(-dt, p.fireCd - dt);   // may go slightly negative so the cadence does not drift
        if (input.fire && p.fireCd <= 0) {
          p.fireCd += 1 / P.fireRate;
          sim.bullets.push({ x: p.x, y: p.y, vx: p.dirX * P.bulletSpeed, vy: p.dirY * P.bulletSpeed, left: P.range });
          sim.fx.push({ type: 'shoot', x: p.x, y: p.y });
        }

        sim.updateBullets(dt);
        if (sim.updateEnemies(dt)) { sim.state = 'lost'; return 'lost'; }
        return sim.updateWaves(dt);
      },

      // Moves an entity axis by axis so it slides along walls.
      move(e, dx, dy) {
        const half = e.size / 2;
        e.x += dx; if (room.hits(e.x, e.y, half)) e.x -= dx;
        e.y += dy; if (room.hits(e.x, e.y, half)) e.y -= dy;
      },

      updateBullets(dt) {
        for (const b of sim.bullets) {
          const step = Math.hypot(b.vx, b.vy) * dt;
          b.x += b.vx * dt; b.y += b.vy * dt; b.left -= step;
          if (b.left <= 0 || room.hits(b.x, b.y, 1)) { b.dead = true; continue; }
          for (const e of sim.enemies) {
            if (e.spawnT > 0 || e.hp <= 0) continue;
            if (Math.abs(b.x - e.x) < e.size / 2 + 1 && Math.abs(b.y - e.y) < e.size / 2 + 1) {
              b.dead = true; e.hp -= P.damage; e.flash = 0.08;
              sim.fx.push({ type: e.hp <= 0 ? 'kill' : 'hit', x: e.x, y: e.y });
              break;
            }
          }
        }
        sim.bullets = sim.bullets.filter(b => !b.dead);
        sim.enemies = sim.enemies.filter(e => e.hp > 0);
      },

      // Returns true when the player's health reaches zero.
      updateEnemies(dt) {
        const p = sim.player;
        for (const e of sim.enemies) {
          e.flash = Math.max(0, (e.flash || 0) - dt);
          if (e.spawnT > 0) { e.spawnT -= dt; continue; }
          const [dx, dy] = sim.chaseVector(e);
          const d = Math.hypot(dx, dy) || 1;
          let vx = dx / d, vy = dy / d;
          for (const o of sim.enemies) { // keep enemies from stacking on each other
            if (o === e || o.spawnT > 0) continue;
            const sx = e.x - o.x, sy = e.y - o.y, sd = Math.hypot(sx, sy);
            if (sd > 0 && sd < e.size) { vx += (sx / sd) * 0.8; vy += (sy / sd) * 0.8; }
          }
          const vl = Math.hypot(vx, vy) || 1;
          sim.move(e, (vx / vl) * e.speed * dt, (vy / vl) * e.speed * dt);

          if (p.invuln <= 0 && Math.abs(p.x - e.x) < (p.size + e.size) / 2 - 1 && Math.abs(p.y - e.y) < (p.size + e.size) / 2 - 1) {
            p.hp -= e.damage;
            p.invuln = P.invuln;
            sim.fx.push({ type: 'hurt', x: p.x, y: p.y });
            if (p.hp <= 0) return true;
          }
        }
        return false;
      },

      // Direction an enemy walks to reach the player: straight when nothing is in the way,
      // otherwise toward the neighbouring tile that is closest to the player by walking distance.
      chaseVector(e) {
        const p = sim.player, T = ClearTheRoom.TILE;
        if (sim.clearLine(e, p)) return [p.x - e.x, p.y - e.y];
        const field = sim.distanceField();
        const ci = Math.floor(e.x / T), cj = Math.floor(e.y / T);
        let best = null, bestD = field[cj] && field[cj][ci] !== undefined ? field[cj][ci] : Infinity;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const d = field[cj + dj] && field[cj + dj][ci + di];
          if (d !== undefined && d < bestD) { bestD = d; best = [ci + di, cj + dj]; }
        }
        if (!best) return [p.x - e.x, p.y - e.y];
        return [best[0] * T + T / 2 - e.x, best[1] * T + T / 2 - e.y];
      },

      // True when a box the size of e can walk in a straight line to the player (checked by sampling the segment).
      clearLine(e, p) {
        const dx = p.x - e.x, dy = p.y - e.y, n = Math.ceil(Math.hypot(dx, dy) / 6);
        for (let k = 1; k < n; k++) if (room.hits(e.x + dx * k / n, e.y + dy * k / n, e.size / 2)) return false;
        return true;
      },

      // Walking distance (in tiles) from the player's tile, recomputed only when the player changes tile.
      distanceField() {
        const T = ClearTheRoom.TILE, pi = Math.floor(sim.player.x / T), pj = Math.floor(sim.player.y / T);
        if (sim.field && sim.fieldKey === pi + ',' + pj) return sim.field;
        const field = room.solid.map(r => r.map(() => undefined));
        field[pj][pi] = 0;
        const queue = [[pi, pj]];
        for (let q = 0; q < queue.length; q++) {
          const [i, j] = queue[q];
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (room.solid[nj] && room.solid[nj][ni] === false && field[nj][ni] === undefined) { field[nj][ni] = field[j][i] + 1; queue.push([ni, nj]); }
          }
        }
        sim.field = field; sim.fieldKey = pi + ',' + pj;
        return field;
      },

      updateWaves(dt) {
        if (sim.enemies.length > 0) return null;
        if (sim.waveIndex < waves.length) {
          sim.waveTimer -= dt;
          if (sim.waveTimer <= 0) { sim.spawnWave(waves[sim.waveIndex++]); sim.waveTimer = D.waveDelay; }
          return null;
        }
        sim.clearTimer -= dt;
        if (sim.clearTimer <= 0) { sim.state = 'passed'; return 'passed'; }
        return null;
      },

      // Enemies appear at the spawn points farthest from the player first, each point used once before any repeats.
      spawnWave(types) {
        const p = sim.player;
        const points = room.spawns.slice().sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
        types.forEach((id, i) => {
          const def = D.enemies[id], pt = points[i % points.length];
          sim.enemies.push({ type: id, x: pt.x, y: pt.y, size: def.size, hp: def.hp, speed: def.speed, damage: def.damage, spawnT: D.spawnWarning, flash: 0 });
        });
      },
    };
    return sim;
  },
};

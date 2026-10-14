// Clear the Room simulation: top-down room, WASD movement, mouse aim and shoot, enemies that chase.
// No canvas, no DOM, no storage: a room is stepped with a fixed dt; a level (a chain of rooms) reports only
// 'passed' or 'lost' (plus 'room' when the player walks into the next room).
// Visual/audio cues (shots, hits, kills...) are queued in sim.fx for the shell to drain.
const ClearTheRoom = {
  TILE: 20,
  ROOM_TRANSITION: 0.5,   // s of fade between two rooms
  CLEAR_DELAY: 0.6,   // s between the last enemy dying and 'passed'

  // Turns the character grid into { width, height, start, spawns, doors, solid, hits(cx, cy, half), ... }.
  // Door tiles ('D') are walls until openDoors() is called.
  parseLayout(rows) {
    const T = ClearTheRoom.TILE;
    const solid = rows.map(r => [...r].map(ch => ch === '#' || ch === 'D'));
    const spawns = [], doors = [];
    let start = null;
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      const c = { x: i * T + T / 2, y: j * T + T / 2 };
      if (ch === 'S') spawns.push(c);
      if (ch === 'P') start = c;
      if (ch === 'D') doors.push({ i, j });
    }));
    return {
      width: rows[0].length * T,
      height: rows.length * T,
      start,
      spawns,
      doors,
      solid,
      openDoors() { for (const d of doors) solid[d.j][d.i] = false; },
      // True when the point is inside a door tile.
      inDoor(x, y) { const i = Math.floor(x / T), j = Math.floor(y / T); return doors.some(d => d.i === i && d.j === j); },
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
    // A count is either a number or a [min, max] range.
    const count = v => Array.isArray(v) ? v[0] + Math.floor(rng() * (v[1] - v[0] + 1)) : v;
    return Array.from({ length: count(cfg.waves) }, () => Array.from({ length: count(cfg.perWave) }, pick));
  },

  // A level: a chain of rooms, each picked at random (never the same layout twice in a row).
  // Health carries over from room to room. Exposes the current room's room/player/enemies/bullets/fx.
  // update returns 'passed', 'lost' or 'room' (just entered the next room); during the short transition it returns null.
  createLevel({ cfg, rng }) {
    rng = rng || Math.random;
    const layouts = ClearTheRoomData.layouts, picks = [];
    for (let r = 0; r < cfg.rooms; r++) {
      let k;
      do { k = Math.floor(rng() * layouts.length); } while (layouts.length > 1 && k === picks[r - 1]);
      picks.push(k);
    }
    const waves = picks.map(() => ClearTheRoom.buildWaves(cfg, rng));
    const make = (index, carry) => ClearTheRoom.create({ layout: layouts[picks[index]], waves: waves[index], final: index === cfg.rooms - 1, carry, rng });
    const T = ClearTheRoom.ROOM_TRANSITION;
    const level = {
      roomIndex: 0,
      roomCount: cfg.rooms,
      layoutIndexes: picks,   // which layout each room uses
      sim: make(0),
      transition: 0,   // s left of the change-of-room fade; the rooms are swapped halfway through
      get fade() { return level.transition > 0 ? 1 - Math.abs(level.transition - T / 2) / (T / 2) : 0; },
      get room() { return level.sim.room; },
      get player() { return level.sim.player; },
      get enemies() { return level.sim.enemies; },
      get bullets() { return level.sim.bullets; },
      get fx() { return level.sim.fx; },
      get pickups() { return level.sim.pickups; },
      get cleared() { return level.transition <= 0 && level.sim.cleared; },
      update(dt, input) {
        if (level.transition > 0) {
          const before = level.transition;
          level.transition = Math.max(0, level.transition - dt);
          if (before > T / 2 && level.transition <= T / 2) {
            level.roomIndex++;
            level.sim = make(level.roomIndex, level.sim.player);
          }
          return null;
        }
        const ev = level.sim.update(dt, input);
        if (ev === 'exit') { level.transition = T; return 'room'; }
        return ev;
      },
    };
    return level;
  },

  // layout: rows of characters; waves: result of buildWaves (spawn points are used in a fixed, distance-based order).
  // final: the last room of a level (clearing it passes the level); otherwise clearing it opens the doors.
  // carry: the player of the previous room; its health and invulnerability time carry over.
  create({ layout, waves, final = true, carry, rng }) {
    const D = ClearTheRoomData, P = D.player;
    rng = rng || Math.random;
    const room = ClearTheRoom.parseLayout(layout);
    const sim = {
      room,
      player: { x: room.start.x, y: room.start.y, size: P.size, hp: carry ? carry.hp : P.maxHp, maxHp: P.maxHp, invuln: carry ? carry.invuln : 0, fireCd: 0, dirX: 1, dirY: 0 },
      enemies: [],
      pickups: [],            // hearts left by dead enemies: { x, y }
      bullets: [],
      fx: [],                 // { type: 'shoot' | 'hit' | 'kill' | 'hurt', x, y }
      state: 'running',       // running | lost | passed
      cleared: false,         // every wave defeated; doors open (non-final rooms)
      waveIndex: 0,
      waveTimer: D.waveDelay,
      clearTimer: ClearTheRoom.CLEAR_DELAY,
      time: 0,

      // input: { moveX, moveY (-1..1), aimX, aimY (room coordinates), fire }.
      // Returns 'passed' (final room cleared), 'lost', or 'exit' (player walked through an open door).
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
        sim.updatePickups();
        const ev = sim.updateWaves(dt);
        if (ev) return ev;
        if (sim.cleared && room.inDoor(p.x, p.y)) return 'exit';
        return null;
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
        const killed = sim.enemies.filter(e => e.hp <= 0);
        sim.enemies = sim.enemies.filter(e => e.hp > 0);
        for (const e of killed) sim.onKill(e);
      },

      // Enemies that split spawn their children; some enemies leave a heart.
      onKill(e) {
        const def = D.enemies[e.type];
        if (def.splits) {
          // Children appear on opposite sides of the corpse (when there is room) and blink briefly before they attack.
          for (let k = 0; k < def.splits.count; k++) {
            const a = (k / def.splits.count) * Math.PI * 2, half = D.enemies[def.splits.type].size / 2;
            const x = e.x + Math.cos(a) * 8, y = e.y + Math.sin(a) * 8;
            const free = !room.hits(x, y, half);
            sim.enemies.push(sim.makeEnemy(def.splits.type, free ? x : e.x, free ? y : e.y, D.splitWarning));
          }
        }
        if (def.dropChance > 0 && rng() < def.dropChance) sim.pickups.push({ x: e.x, y: e.y });
      },

      makeEnemy(id, x, y, spawnT) {
        const def = D.enemies[id];
        return { type: id, x, y, size: def.size, hp: def.hp, speed: def.speed, damage: def.damage, spawnT, flash: 0 };
      },

      // Hearts are picked up by touching them, but only when there is health to restore.
      updatePickups() {
        const p = sim.player;
        sim.pickups = sim.pickups.filter(h => {
          if (p.hp < p.maxHp && Math.hypot(p.x - h.x, p.y - h.y) < p.size / 2 + 5) { p.hp++; sim.fx.push({ type: 'heal', x: h.x, y: h.y }); return false; }
          return true;
        });
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
        if (!final) {
          if (!sim.cleared) { sim.cleared = true; room.openDoors(); sim.field = null; }
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
          const pt = points[i % points.length];
          sim.enemies.push(sim.makeEnemy(id, pt.x, pt.y, D.spawnWarning));
        });
      },
    };
    return sim;
  },
};

// One Tower Defense simulation: a fixed 320 x 180 field with the Torretta in the middle and enemies walking in from the edges.
// No canvas, no DOM, no storage: a level is stepped with a fixed dt and reports only 'passed' or 'lost'.
// Visual/audio cues (shots, hits, kills...) are queued in sim.fx for the shell to drain.
const OneTower = {
  W: 320,
  H: 180,
  SPELLS: ['bolt', 'fireball', 'frost', 'lightning', 'meteor'],   // keys 1-5

  // Lists the enemy types of each wave for a level config ({ waves, perWave: [min, max], types: { id: weight }, boss }).
  buildWaves(cfg, rng) {
    rng = rng || Math.random;
    const ids = Object.keys(cfg.types), total = ids.reduce((s, id) => s + cfg.types[id], 0);
    const pick = () => {
      let r = rng() * total;
      for (const id of ids) { r -= cfg.types[id]; if (r < 0) return id; }
      return ids[ids.length - 1];
    };
    const [min, max] = cfg.perWave;
    const waves = Array.from({ length: cfg.waves }, () => Array.from({ length: min + Math.floor(rng() * (max - min + 1)) }, pick));
    if (cfg.boss) waves.push(['boss']);
    return waves;
  },

  // The spells unlocked by the time level n (from 1) starts.
  levelSpells(n) {
    return OneTowerData.levels.slice(0, n).map(l => l.spell);
  },

  // The spell and Torretta values with the given upgrades applied: { spells, tower }. The data is not changed.
  stats(upgrades) {
    const D = OneTowerData, out = JSON.parse(JSON.stringify({ spells: D.spells, tower: D.tower }));
    const round = v => Math.round(v * 100) / 100;
    for (const id of upgrades) {
      const u = D.upgrades[id], o = u.target === 'tower' ? out.tower : out.spells[u.target];
      for (const k in u.add || {}) o[k] = Array.isArray(o[k]) ? o[k].map(v => v + u.add[k]) : o[k] + u.add[k];
      for (const k in u.mul || {}) o[k] = round(o[k] * u.mul[k]);
      Object.assign(o, u.set);
    }
    return out;
  },

  // Up to 3 different upgrades to choose from: for the Torretta or an unlocked spell, never one already taken unless repeatable.
  offerUpgrades({ spells, taken, rng }) {
    rng = rng || Math.random;
    const all = OneTowerData.upgrades;
    const pool = Object.keys(all).filter(id => (all[id].target === 'tower' || spells.includes(all[id].target)) && (all[id].repeatable || !taken.includes(id)));
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return offer;
  },

  // waves: lists of enemy types, one list per wave (see buildWaves). spells: the unlocked spells; upgrades: the ones taken.
  create({ waves, spells = ['bolt'], upgrades = [], rng }) {
    const D = OneTowerData, ST = OneTower.stats(upgrades), SP = ST.spells, B = SP.bolt;
    rng = rng || Math.random;
    const sim = {
      tower: { x: OneTower.W / 2, y: OneTower.H / 2, size: ST.tower.size, hp: ST.tower.hp, maxHp: ST.tower.hp },
      enemies: [],
      bolts: [],
      fireballs: [],          // { x, y, vx, vy, left: px to the click point }
      meteors: [],            // { x, y, t: s left before it falls }
      fires: [],              // burning ground left by a Fireball: { x, y, radius, ticks: hits left, t: s to the next }
      fx: [],                 // { type: 'shoot' | 'cast' | 'deny' | 'blast' | 'hit' | 'kill' | 'hurt', x, y, ... }
      state: 'running',       // running | lost | passed
      waveIndex: 0,           // waves started so far
      waveCount: waves.length,
      waveTimer: D.firstWaveDelay,
      queue: [],              // enemy types of the current wave still to walk in
      spawnTimer: 0,
      stats: ST,              // spell and Torretta values with the upgrades applied (see stats)
      spells,                 // unlocked spells
      selected: 'bolt',
      firing: false,          // the button was held at the previous step
      recharge: Object.fromEntries(OneTower.SPELLS.map(id => [id, 0])),   // s left of each spell's Ricarica

      get boss() { return sim.enemies.find(e => e.type === 'boss') || null; },

      // input: { aimX, aimY (field coordinates), fire, select (key 1-5 pressed this step) }. Returns 'passed', 'lost' or null.
      update(dt, input) {
        if (sim.state !== 'running') return null;
        const r = sim.recharge;
        for (const id in r) r[id] = Math.max(id === 'bolt' ? -dt : 0, r[id] - dt);   // the Bolt's may go slightly negative so its cadence does not drift
        if (input.select) sim.select(OneTower.SPELLS[input.select - 1]);
        const pressed = !!input.fire && !sim.firing;   // the button went down this step
        sim.firing = !!input.fire;
        if (input.fire && r[sim.selected] <= 0) sim.cast(sim.selected, input.aimX, input.aimY, pressed);
        sim.updateBolts(dt);
        sim.updateFireballs(dt);
        sim.updateMeteors(dt);
        sim.updateFires(dt);
        sim.enemies = sim.enemies.filter(e => e.hp > 0);
        sim.updateEnemies(dt);
        if (sim.tower.hp <= 0) { sim.state = 'lost'; return 'lost'; }
        return sim.updateWaves(dt);
      },

      // Only an unlocked spell that is not recharging can be selected; the Bolt always can.
      select(id) {
        if (spells.includes(id) && (id === 'bolt' || sim.recharge[id] <= 0)) sim.selected = id;
        else sim.fx.push({ type: 'deny', x: sim.tower.x, y: sim.tower.y });
      },

      // Casts a spell toward (x, y) and starts its Ricarica; after any spell but the Bolt the selection goes back to the Bolt.
      // pressed: the button has just gone down (a refusal is signalled only then, not while it is held).
      cast(id, x, y, pressed) {
        const t = sim.tower;
        if (id === 'bolt') {
          sim.recharge.bolt += 1 / B.fireRate;
          const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy) || 1;
          sim.bolts.push({ x: t.x, y: t.y, vx: dx / d * B.speed, vy: dy / d * B.speed, struck: [] });
          sim.fx.push({ type: 'shoot', x: t.x, y: t.y });
          return;
        }
        const S = SP[id];
        const strike = id === 'lightning' && sim.nearest(sim.active(), x, y);
        if (id === 'lightning' && !strike) { if (pressed) sim.fx.push({ type: 'deny', x, y }); return; }   // nothing to strike: keep it
        sim.recharge[id] = S.recharge;
        sim.selected = 'bolt';
        sim.fx.push({ type: 'cast', spell: id, x, y });
        if (id === 'lightning') {
          // each jump goes to the closest enemy not struck yet, if within reach
          const struck = [strike];
          for (let k = 1; k <= S.jumps; k++) {
            const last = struck[k - 1], next = sim.nearest(sim.active().filter(e => !struck.includes(e)), last.x, last.y);
            if (!next || Math.hypot(next.x - last.x, next.y - last.y) > S.reach) break;
            struck.push(next);
          }
          struck.forEach((e, k) => sim.hurt(e, S.damage[k]));
          sim.fx.push({ type: 'lightning', points: struck.map(e => ({ x: e.x, y: e.y })), x: t.x, y: t.y });
        } else if (id === 'fireball') {
          const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy) || 1;
          sim.fireballs.push({ x: t.x, y: t.y, vx: dx / d * S.speed, vy: dy / d * S.speed, left: d });
        } else if (id === 'meteor') {
          sim.meteors.push({ x, y, t: S.delay });
        } else if (id === 'frost') {
          for (const e of sim.active()) if (Math.hypot(e.x - x, e.y - y) <= S.radius) { e.slow = S.slow * e.frostFactor; e.slowT = S.duration; e.chill = S.hurts ? { ticks: Math.floor(S.duration), t: 1 } : null; }
        }
      },

      // Damages an enemy; it is removed at the end of the step.
      hurt(e, damage) {
        e.hp -= damage; e.flash = 0.08;
        sim.fx.push({ type: e.hp <= 0 ? 'kill' : 'hit', x: e.x, y: e.y });
      },
      active: () => sim.enemies.filter(e => e.spawnT <= 0 && e.hp > 0),
      nearest: (list, x, y) => list.reduce((best, e) => !best || Math.hypot(e.x - x, e.y - y) < Math.hypot(best.x - x, best.y - y) ? e : best, null),
      touches: (e, x, y, size) => Math.abs(x - e.x) < (e.size + size) / 2 && Math.abs(y - e.y) < (e.size + size) / 2,
      // Damages every active enemy whose centre is within radius of (x, y).
      blast(x, y, radius, damage) {
        for (const e of sim.active()) if (Math.hypot(e.x - x, e.y - y) <= radius) sim.hurt(e, damage);
        sim.fx.push({ type: 'blast', x, y, radius });
      },

      // Burning ground hurts what stands in it once a second.
      updateFires(dt) {
        for (const f of sim.fires) {
          f.t -= dt;
          if (f.t <= 0) {
            f.t += 1; f.ticks--;
            for (const e of sim.active()) if (Math.hypot(e.x - f.x, e.y - f.y) <= f.radius) sim.hurt(e, SP.fireball.burn.dps);
          }
        }
        sim.fires = sim.fires.filter(f => f.ticks > 0);
      },

      updateMeteors(dt) {
        const M = SP.meteor;
        for (const m of sim.meteors) { m.t -= dt; if (m.t <= 0) sim.blast(m.x, m.y, M.radius, M.damage); }
        sim.meteors = sim.meteors.filter(m => m.t > 0);
      },

      // A fireball explodes on the first enemy it touches, or when it reaches the click point.
      updateFireballs(dt) {
        const F = SP.fireball;
        for (const f of sim.fireballs) {
          const step = Math.min(F.speed * dt, f.left), s = step / F.speed;
          f.x += f.vx * s; f.y += f.vy * s; f.left -= step;
          if (f.left <= 0 || sim.active().some(e => sim.touches(e, f.x, f.y, F.size))) {
            f.dead = true; sim.blast(f.x, f.y, F.radius, F.damage);
            if (F.burns) sim.fires.push({ x: f.x, y: f.y, radius: F.radius, ticks: F.burn.duration, t: 1 });
          }
        }
        sim.fireballs = sim.fireballs.filter(f => !f.dead);
      },

      updateBolts(dt) {
        for (const b of sim.bolts) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < 0 || b.x > OneTower.W || b.y < 0 || b.y > OneTower.H) { b.dead = true; continue; }
          // a piercing Bolt goes on, hitting each enemy once
          const e = sim.active().find(e => !b.struck.includes(e) && sim.touches(e, b.x, b.y, B.size));
          if (e) { b.struck.push(e); sim.hurt(e, B.damage); if (!B.pierce) b.dead = true; }
        }
        sim.bolts = sim.bolts.filter(b => !b.dead);
      },

      // Enemies walk straight to the Torretta, stop when they touch it (or get within their range) and hit it every attackEvery
      // seconds (the first hit on arrival). Frost slows them down while it lasts.
      updateEnemies(dt) {
        const t = sim.tower, called = [];
        for (const e of sim.enemies) {
          e.flash = Math.max(0, e.flash - dt);
          if (e.spawnT > 0) { e.spawnT -= dt; continue; }
          if (e.summon) {   // the Boss calls enemies around itself; they blink before they walk in
            e.summonT -= dt;
            if (e.summonT <= 0) {
              e.summonT += e.summon.every;
              for (let k = 0; k < e.summon.count; k++) {
                const a = k / e.summon.count * Math.PI * 2;
                called.push([e.summon.type, ...sim.awayFromTower(e.x + Math.cos(a) * e.size, e.y + Math.sin(a) * e.size, D.enemies[e.summon.type].size)]);
              }
              sim.fx.push({ type: 'summon', x: e.x, y: e.y });
            }
          }
          e.slowT = Math.max(0, e.slowT - dt);
          if (e.chill && (e.chill.t -= dt) <= 0) {   // a hurting Frost: 1 hit a second while it lasts
            e.chill.t += 1;
            sim.hurt(e, SP.frost.dps);
            if (--e.chill.ticks <= 0) e.chill = null;
          }
          if (e.hp <= 0) continue;
          const speed = e.speed * (e.slowT > 0 ? 1 - e.slow : 1);
          const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1, axis = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
          const gap = axis - (t.size + e.size) / 2 - e.range;   // distance left before touching (or reaching its range), on the dominant axis
          if (gap > 1e-9) {
            const s = Math.min(speed * dt, gap * d / axis);   // the last step lands exactly against the Torretta
            e.x += dx / d * s; e.y += dy / d * s;
          } else {
            e.attackT -= dt;
            if (e.attackT <= 0) {
              e.attackT += e.attackEvery;
              t.hp -= e.damage;
              sim.fx.push({ type: 'hurt', x: e.x, y: e.y });
              if (e.range > 0) sim.fx.push({ type: 'zap', x: e.x, y: e.y, tx: t.x, ty: t.y });   // a strike from a distance
            }
          }
        }
        for (const [id, x, y] of called) sim.addEnemy(id, x, y, D.spawnWarning);
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
        const m = D.enemies[id].size / 2, W = OneTower.W - 2 * m, H = OneTower.H - 2 * m;
        let r = rng() * 2 * (W + H), x, y;
        if (r < W) { x = r; y = 0; }
        else if ((r -= W) < H) { x = W; y = r; }
        else if ((r -= H) < W) { x = W - r; y = H; }
        else { x = 0; y = H - (r - W); }
        sim.addEnemy(id, x + m, y + m, D.spawnWarning);
      },

      // A point no closer to the Torretta than a small gap (for an enemy of the given size), pushed straight out from its centre.
      awayFromTower(x, y, size) {
        const t = sim.tower, min = (t.size + size) / 2 + 8;
        let dx = x - t.x, dy = y - t.y;
        if (!dx && !dy) dx = 1;
        const axis = Math.max(Math.abs(dx), Math.abs(dy));
        if (axis >= min) return [x, y];
        return [t.x + dx * min / axis, t.y + dy * min / axis];
      },

      // Puts an enemy on the field; it blinks for spawnT seconds before it moves. Returns it.
      addEnemy(id, x, y, spawnT) {
        const def = D.enemies[id];
        const e = { type: id, x, y, size: def.size, hp: def.hp, maxHp: def.hp, speed: def.speed, damage: def.damage, attackEvery: def.attackEvery,
          range: def.range || 0, frostFactor: def.frostFactor || 1, summon: def.summon, summonT: def.summon ? def.summon.every : 0,
          attackT: 0, spawnT, flash: 0, slow: 0, slowT: 0, chill: null };
        sim.enemies.push(e);
        return e;
      },
    };
    return sim;
  },
};

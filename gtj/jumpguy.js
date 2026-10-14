// Jump Guy simulation: auto-scrolling runner with a single jump button.
// No canvas, no DOM, no storage: a level is stepped with fixed dt and reports only 'passed' or 'hit'.
const JumpGuy = {
  GROUND: 140,      // y of the floor (logical 320x180 space)
  PLAYER_X: 48,     // screen x of the runner
  PLAYER_W: 16,
  PLAYER_H: 20,
  MIN_GAP: 0.95,    // seconds of scroll between two patterns (airtime plus reaction)
  GRAVITY: 900,
  JUMP_V: 330,      // initial upward speed: ~60px high, ~0.73s in the air
  COYOTE: 0.1,      // s after leaving the ground in which a jump still works
  BUFFER: 0.12,     // s before landing in which a pressed jump is remembered
  FORGIVE: 3,       // px trimmed off each side of the hitboxes

  LEAD_IN: 300,     // px of empty course before the first pattern
  LEAD_OUT: 200,    // px of empty course before the finish

  // Builds a level from JumpGuyData: patterns in random order, spaced so that each one can be jumped separately.
  // Returns { length, speed, obstacles, groups: [{ x, span }] }.
  buildLevel(n, rng) {
    const J = JumpGuy, cfg = JumpGuyData.levels[n - 1];
    rng = rng || Math.random;
    const pool = JumpGuyData.patterns.filter(p => p.tier <= cfg.maxTier);
    const obstacles = [], groups = [];
    let x = J.LEAD_IN;
    for (;;) {
      const p = pool[Math.floor(rng() * pool.length)];
      const span = Math.max(...p.o.map(([dx, w]) => dx + w));
      if (x + span > cfg.length - J.LEAD_OUT) break;
      for (const [dx, w, h] of p.o) obstacles.push({ x: x + dx, w, h });
      groups.push({ x, span });
      x += span + Math.round(cfg.speed * J.MIN_GAP + cfg.gapExtra[0] + rng() * (cfg.gapExtra[1] - cfg.gapExtra[0]));
    }
    return { length: cfg.length, speed: cfg.speed, obstacles, groups };
  },

  create(def) {
    const J = JumpGuy;
    const sim = {
      def,
      dist: 0,                  // how far the course has scrolled
      y: J.GROUND,              // feet position
      vy: 0,
      grounded: true,
      state: 'running',         // running | hit | passed
      sinceGround: 0,
      sinceJumpPress: Infinity,

      get finishX() { return def.length; },

      // input: { pressed: bool (jump button went down this step) }. Returns the event that ended the level, if any.
      update(dt, input) {
        if (sim.state !== 'running') return null;
        if (input && input.pressed) sim.sinceJumpPress = 0; else sim.sinceJumpPress += dt;

        if (sim.grounded) sim.sinceGround = 0; else sim.sinceGround += dt;
        if (sim.sinceJumpPress <= J.BUFFER && sim.sinceGround <= J.COYOTE && sim.vy >= 0) {
          sim.vy = -J.JUMP_V;
          sim.grounded = false;
          sim.sinceGround = Infinity;       // coyote time is spent
          sim.sinceJumpPress = Infinity;    // buffered press is spent
        }

        sim.vy += J.GRAVITY * dt;
        sim.y += sim.vy * dt;
        if (sim.y >= J.GROUND) { sim.y = J.GROUND; sim.vy = 0; sim.grounded = true; }
        else sim.grounded = false;

        sim.dist += def.speed * dt;

        if (sim.hitsObstacle()) { sim.state = 'hit'; return 'hit'; }
        if (sim.dist + J.PLAYER_X >= def.length) { sim.state = 'passed'; return 'passed'; }
        return null;
      },

      hitsObstacle() {
        const f = J.FORGIVE;
        const left = sim.dist + J.PLAYER_X + f, right = sim.dist + J.PLAYER_X + J.PLAYER_W - f;
        const bottom = sim.y - f;
        for (const o of def.obstacles) {
          if (right > o.x + f && left < o.x + o.w - f && bottom > J.GROUND - o.h + f) return true;
        }
        return false;
      },
    };
    return sim;
  },
};

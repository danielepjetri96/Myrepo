// Jump Guy simulation: auto-scrolling runner with a single jump button.
// No canvas, no DOM, no storage: a level is stepped with fixed dt and reports only 'passed' or 'hit'.
const JumpGuy = {
  GROUND: 140,      // y of the floor (logical 320x180 space)
  PLAYER_X: 48,     // screen x of the runner
  PLAYER_W: 16,
  PLAYER_H: 20,
  SPEED: 96,        // px/s of auto-scroll
  GRAVITY: 900,
  JUMP_V: 330,      // initial upward speed: ~60px high, ~0.73s in the air
  COYOTE: 0.1,      // s after leaving the ground in which a jump still works
  BUFFER: 0.12,     // s before landing in which a pressed jump is remembered
  FORGIVE: 3,       // px trimmed off each side of the hitboxes

  // Level 1: obstacle x positions along the course (all the same small spike, widely spaced).
  LEVELS: [
    { length: 1800, obstacles: [260, 420, 560, 700, 780, 940, 1080, 1160, 1320, 1460, 1540, 1660].map(x => ({ x, w: 14, h: 14 })) },
  ],

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

        sim.dist += J.SPEED * dt;

        if (sim.hitsObstacle()) { sim.state = 'hit'; return 'hit'; }
        if (sim.dist + J.PLAYER_X >= def.length) { sim.state = 'passed'; return 'passed'; }
        return null;
      },

      hitsObstacle() {
        const f = J.FORGIVE;
        const left = sim.dist + J.PLAYER_X + f, right = sim.dist + J.PLAYER_X + J.PLAYER_W - f;
        const bottom = sim.y, top = sim.y - J.PLAYER_H + f;
        for (const o of def.obstacles) {
          if (right > o.x + f && left < o.x + o.w - f && bottom > J.GROUND - o.h + f && top < J.GROUND) return true;
        }
        return false;
      },
    };
    return sim;
  },
};

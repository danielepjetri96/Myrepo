const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VIEW_SCALE = 1;

// Fit the 320x180 game to the window, using whole-number scaling when possible
// so the pixels stay square. The backing store is rendered at full resolution.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  let s = Math.min(innerWidth / W, innerHeight / H);
  if (s >= 1) s = Math.floor(s);
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  VIEW_SCALE = s * dpr;
}
addEventListener('resize', resize);
resize();

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Pre-render the tiled floor and brick walls for a level.
function buildBackground(def, seed) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const [f0, f1, f2] = def.floor;
  const [w0, w1, w2] = def.wall;

  g.fillStyle = f0;
  g.fillRect(0, 0, W, H);
  for (let ty = 0; ty < H; ty += 16) {
    for (let tx = 0; tx < W; tx += 16) {
      if (rnd() < 0.25) {
        g.globalAlpha = 0.35; g.fillStyle = f1; g.fillRect(tx, ty, 16, 16); g.globalAlpha = 1;
      }
      g.fillStyle = f1;
      g.fillRect(tx + 15, ty, 1, 16);
      g.fillRect(tx, ty + 15, 16, 1);
      const specks = 2 + Math.floor(rnd() * 5);
      for (let i = 0; i < specks; i++) {
        g.fillStyle = rnd() < 0.6 ? f1 : f2;
        g.fillRect(tx + 1 + Math.floor(rnd() * 13), ty + 1 + Math.floor(rnd() * 13), 1, 1);
      }
      if (rnd() < 0.1) { // crack
        g.fillStyle = f1;
        let cx = tx + 3 + Math.floor(rnd() * 8), cy = ty + 3 + Math.floor(rnd() * 8);
        for (let i = 0; i < 6; i++) {
          g.fillRect(cx, cy, 1, 1);
          if (rnd() < 0.5) cx++; else cy++;
        }
      }
    }
  }

  const wall = (x, y, w, h) => {
    g.fillStyle = w0; g.fillRect(x, y, w, h);
    g.fillStyle = w1;
    for (let yy = y; yy < y + h; yy += 4) {
      g.fillRect(x, yy + 3, w, 1);
      const off = (yy / 4) % 2 ? 4 : 0;
      for (let xx = x + off; xx < x + w; xx += 8) g.fillRect(xx, yy, 1, 3);
    }
  };
  wall(0, 0, W, ARENA.y0);
  wall(0, ARENA.y1, W, H - ARENA.y1);
  wall(0, 0, ARENA.x0, H);
  wall(ARENA.x1, 0, W - ARENA.x1, H);
  // Inner edge highlight + shadow cast onto the floor
  g.fillStyle = w2;
  g.fillRect(ARENA.x0, ARENA.y0 - 1, ARENA.x1 - ARENA.x0, 1);
  g.fillRect(ARENA.x0 - 1, ARENA.y0, 1, ARENA.y1 - ARENA.y0);
  g.fillRect(ARENA.x1, ARENA.y0, 1, ARENA.y1 - ARENA.y0);
  g.fillRect(ARENA.x0, ARENA.y1, ARENA.x1 - ARENA.x0, 1);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(ARENA.x0, ARENA.y0, ARENA.x1 - ARENA.x0, 3);
  g.fillRect(ARENA.x0, ARENA.y0 + 3, 2, ARENA.y1 - ARENA.y0 - 3);
  return c;
}

function drawFrame(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

function drawCrosshair() {
  const x = Math.round(Input.mouse.x), y = Math.round(Input.mouse.y);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 6, y - 1, 5, 3); ctx.fillRect(x + 2, y - 1, 5, 3);
  ctx.fillRect(x - 1, y - 6, 3, 5); ctx.fillRect(x - 1, y + 2, 3, 5);
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(x - 5, y, 3, 1); ctx.fillRect(x + 3, y, 3, 1);
  ctx.fillRect(x, y - 5, 1, 3); ctx.fillRect(x, y + 3, 1, 3);
  ctx.fillStyle = '#b13e53';
  ctx.fillRect(x, y, 1, 1);
}

const BASE_STATS = { maxHp: 5, damage: 1, fireRate: 0.22, speed: 80, spread: 0, bulletSpeed: 230 };

const UPGRADES = [
  { name: 'POWER',   color: '#b13e53', lines: ['BULLETS DO', '+1 DAMAGE'],  apply: g => { g.stats.damage += 1; } },
  { name: 'TRIGGER', color: '#ffcd75', lines: ['SHOOT', '25% FASTER'],     apply: g => { g.stats.fireRate *= 0.75; } },
  { name: 'BOOTS',   color: '#41a6f6', lines: ['MOVE', '15% FASTER'],      apply: g => { g.stats.speed *= 1.15; } },
  { name: 'ARMOR',   color: '#94b0c2', lines: ['+1 MAX', 'HEALTH'],        apply: g => { g.stats.maxHp += 1; g.hp += 1; } },
  { name: 'SPREAD',  color: '#a7f070', lines: ['+1 EXTRA', 'BULLET'],      ok: g => g.stats.spread < 4, apply: g => { g.stats.spread += 1; } },
  { name: 'MEDKIT',  color: '#ef7d57', lines: ['RESTORE', 'ALL HEALTH'],   ok: g => g.hp < g.stats.maxHp, apply: g => { g.hp = g.stats.maxHp; } },
];

const Game = {
  state: 'title', stateT: 0, t: 0,
  buttons: [], choices: [],
  stats: null, hp: BASE_STATS.maxHp, level: 1, def: null, score: 0,
  player: null, enemies: [], bullets: [], particles: [], pickups: [], floats: [],
  kills: 0, spawned: 0, spawnTimer: 0, banner: 0, clearTimer: 0, deathTimer: 0,
  combo: 0, comboTimer: 0, shake: 0,
  bg: null, titleBg: null, decals: null,

  // ------------------------------------------------------------ flow
  setState(s) {
    this.state = s;
    this.stateT = 0;
    this.makeButtons();
  },

  snapshot(level) {
    Save.data.run = { level, score: this.score, hp: this.hp, stats: { ...this.stats } };
    Save.data.maxLevel = Math.max(Save.data.maxLevel, level);
    Save.data.best = Math.max(Save.data.best, this.score);
    Save.save();
  },

  newGame() {
    this.stats = { ...BASE_STATS };
    this.score = 0;
    this.hp = BASE_STATS.maxHp;
    this.startLevel(1, false);
  },

  continueRun() {
    const r = Save.data.run;
    if (!r) return this.newGame();
    this.stats = { ...r.stats };
    this.score = r.score;
    this.hp = r.hp;
    this.startLevel(r.level, false);
  },

  startLevel(n, heal = true) {
    this.level = n;
    this.def = getLevel(n);
    if (heal) this.hp = Math.min(this.stats.maxHp, this.hp + 1);
    this.enemies = []; this.bullets = []; this.particles = []; this.pickups = []; this.floats = [];
    this.kills = 0; this.spawned = 0; this.spawnTimer = 0;
    this.banner = 2.2; this.clearTimer = 0; this.deathTimer = 0;
    this.combo = 0; this.comboTimer = 0; this.shake = 0;
    this.player = new Player((ARENA.x0 + ARENA.x1) / 2, (ARENA.y0 + ARENA.y1) / 2, this.stats, this.hp);
    this.bg = buildBackground(this.def, n * 9973);
    this.decals.getContext('2d').clearRect(0, 0, W, H);
    this.snapshot(n);
    this.setState('play');
  },

  levelCleared() {
    this.hp = this.player.hp;
    const pool = UPGRADES.filter(u => !u.ok || u.ok(this)).sort(() => Math.random() - 0.5);
    this.choices = pool.slice(0, 3);
    Sfx.levelUp();
    this.setState('clear');
  },

  pickUpgrade(u) {
    u.apply(this);
    if (this.level === LEVELS.length) {
      this.snapshot(this.level + 1); // "continue" now leads into endless mode
      this.setState('victory');
    } else {
      this.startLevel(this.level + 1);
    }
  },

  gameOver() {
    Save.data.best = Math.max(Save.data.best, this.score);
    Save.save();
    Sfx.gameOver();
    this.setState('over');
  },

  // ------------------------------------------------------------ menus
  makeButtons() {
    const b = [];
    const btn = (label, y, key, action) => b.push({ label, x: 70, y, w: 180, h: 16, key, action });
    const run = Save.data.run;
    switch (this.state) {
      case 'title':
        btn('[ENTER] NEW GAME', 100, 'Enter', () => this.newGame());
        if (run) btn('[C] CONTINUE LV ' + run.level, 120, 'KeyC', () => this.continueRun());
        break;
      case 'pause':
        btn('[P] RESUME', 88, 'KeyP', () => this.setState('play'));
        btn('[Q] QUIT TO TITLE', 108, 'KeyQ', () => this.setState('title'));
        break;
      case 'over':
        btn('[ENTER] RETRY LV ' + run.level, 116, 'Enter', () => this.continueRun());
        btn('[T] TITLE', 136, 'KeyT', () => this.setState('title'));
        break;
      case 'victory':
        btn('[ENTER] ENDLESS MODE', 116, 'Enter', () => this.continueRun());
        btn('[T] TITLE', 136, 'KeyT', () => this.setState('title'));
        break;
      case 'clear':
        this.choices.forEach((u, i) => b.push({
          card: u, x: 16 + i * 100, y: 60, w: 88, h: 76, key: 'Digit' + (i + 1),
          action: () => this.pickUpgrade(u),
        }));
        break;
    }
    this.buttons = b;
  },

  hovered(b) {
    const m = Input.mouse;
    return m.x >= b.x && m.x < b.x + b.w && m.y >= b.y && m.y < b.y + b.h;
  },

  updateButtons() {
    if (this.stateT < 0.35) return; // avoid accidental clicks right after a screen appears
    for (const b of this.buttons) {
      if ((Input.mouse.clicked && this.hovered(b)) || Input.pressed[b.key]) {
        Sfx.select();
        b.action();
        return;
      }
    }
  },

  // ------------------------------------------------------------ gameplay
  addShake(n) { this.shake = Math.min(8, this.shake + n); },
  mult() { return Math.min(5, 1 + Math.floor(this.combo / 5)); },

  spawnEnemy() {
    const kind = pickWeighted(this.def.mix);
    let x, y;
    switch (Math.floor(Math.random() * 4)) {
      case 0: x = rand(20, W - 20); y = -12; break;      // top
      case 1: x = W + 12; y = rand(28, H - 20); break;   // right
      case 2: x = rand(20, W - 20); y = H + 12; break;   // bottom
      default: x = -12; y = rand(28, H - 20);            // left
    }
    this.enemies.push(new Enemy(kind, x, y, this.def));
    this.spawned++;
  },

  splat(x, y, colors) {
    const g = this.decals.getContext('2d');
    g.globalAlpha = 0.55;
    for (let i = 0; i < 12; i++) {
      g.fillStyle = pick(colors);
      g.fillRect(Math.round(x + rand(-7, 7)), Math.round(y + rand(-5, 6)), Math.random() < 0.3 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
  },

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    this.combo++;
    this.comboTimer = 2.2;
    const mult = this.mult();
    const pts = e.t.score * mult;
    this.score += pts;
    this.floats.push(new FloatText(e.x, e.y - 10, '+' + pts, mult > 1 ? '#ffcd75' : '#f4f4f4'));
    for (let i = 0; i < 14; i++) {
      this.particles.push(new Particle(e.x, e.y, pick(e.t.blood), 90, rand(0.3, 0.7), Math.random() < 0.3 ? 2 : 1));
    }
    this.splat(e.x, e.y, e.t.blood);
    if (Math.random() < 0.1) {
      const hurt = this.player.hp < this.stats.maxHp;
      this.pickups.push(new Pickup(e.x, e.y, hurt && Math.random() < 0.6 ? 'heart' : 'bolt'));
    }
    this.addShake(e.kind === 'brute' ? 4 : 2);
    Sfx.kill();
  },

  collect(k) {
    const p = this.player;
    if (k.type === 'heart') {
      p.hp = Math.min(this.stats.maxHp, p.hp + 1);
      this.floats.push(new FloatText(p.x, p.y - 14, '+1 HP', '#b13e53'));
    } else {
      p.rapid = 6;
      this.floats.push(new FloatText(p.x, p.y - 14, 'RAPID!', '#ffcd75'));
    }
    Sfx.pickup();
  },

  separate() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2, nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  },

  updatePlay(dt) {
    if (Input.pressed.KeyP || Input.pressed.Escape) { this.setState('pause'); return; }
    const p = this.player, d = this.def;
    this.banner -= dt;

    p.update(dt, this);

    if (this.banner <= 0 && !p.dead && this.spawned < d.kills && this.enemies.length < d.maxAlive) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.spawnTimer = d.spawnEvery * rand(0.6, 1.4);
      }
    }

    for (const e of this.enemies) e.update(dt, this);
    this.separate();
    for (const b of this.bullets) b.update(dt);

    // Bullets vs enemies / player
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.enemy) {
        if (!p.dead && touching(b, p)) { b.dead = true; p.hurt(1, this); }
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || !touching(b, e)) continue;
        b.dead = true;
        e.hit(b.dmg, Math.atan2(b.vy, b.vx));
        for (let i = 0; i < 3; i++) this.particles.push(new Particle(b.x, b.y, pick(e.t.blood), 60, 0.25, 1));
        Sfx.hit();
        if (e.hp <= 0) this.killEnemy(e);
        break;
      }
    }

    // Enemies touching the player
    if (!p.dead) {
      for (const e of this.enemies) {
        if (e.dead || !touching(e, p)) continue;
        p.hurt(1, this);
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.kx += Math.cos(a) * 160;
        e.ky += Math.sin(a) * 160;
      }
    }

    for (const k of this.pickups) {
      k.update(dt);
      if (!p.dead && !k.dead && touching(k, p)) { k.dead = true; this.collect(k); }
    }
    for (const q of this.particles) q.update(dt);
    for (const f of this.floats) f.update(dt);

    this.enemies = this.enemies.filter(e => !e.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.pickups = this.pickups.filter(k => !k.dead);
    this.particles = this.particles.filter(q => !q.dead);
    this.floats = this.floats.filter(f => !f.dead);

    if ((this.comboTimer -= dt) <= 0) this.combo = 0;
    this.shake = Math.max(0, this.shake - dt * 20);

    if (p.dead) {
      if ((this.deathTimer -= dt) <= 0) this.gameOver();
    } else if (this.kills >= d.kills && this.enemies.length === 0) {
      if ((this.clearTimer += dt) > 1.2) this.levelCleared();
    }
  },

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    if (Input.pressed.KeyM) {
      Sfx.muted = !Sfx.muted;
      Save.data.muted = Sfx.muted;
      Save.save();
    }
    if (this.state === 'play') {
      this.updatePlay(dt);
    } else {
      if (this.state === 'pause' && Input.pressed.Escape && this.stateT > 0.1) { this.setState('play'); return; }
      this.updateButtons();
    }
  },

  // ------------------------------------------------------------ drawing
  drawWorld() {
    ctx.drawImage(this.bg, 0, 0);
    ctx.drawImage(this.decals, 0, 0);
    for (const k of this.pickups) k.draw(ctx);
    const actors = [...this.enemies, this.player].sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const q of this.particles) q.draw(ctx);
    for (const f of this.floats) f.draw(ctx);
  },

  drawHUD() {
    const p = this.player;
    ctx.fillStyle = 'rgba(26,28,44,0.6)';
    ctx.fillRect(0, 0, W, 15);
    for (let i = 0; i < this.stats.maxHp; i++) {
      drawSprite(ctx, i < p.hp ? SPR.heart : SPR.heartEmpty, 8 + i * 9, 7);
    }
    drawText(ctx, 'LV ' + this.level, 160, 1);
    const frac = Math.min(1, this.kills / this.def.kills);
    ctx.fillStyle = '#333c57'; ctx.fillRect(120, 11, 80, 3);
    ctx.fillStyle = '#a7f070'; ctx.fillRect(120, 11, Math.round(80 * frac), 3);
    drawText(ctx, String(this.score).padStart(6, '0'), 314, 4, { align: 'right' });

    const mult = this.mult();
    if (mult > 1) drawText(ctx, 'COMBO x' + mult, 314, 18, { color: '#ffcd75', align: 'right' });
    if (p.rapid > 0) {
      drawSprite(ctx, SPR.bolt, 14, 24);
      drawText(ctx, Math.ceil(p.rapid) + 's', 22, 20, { align: 'left', color: '#ffcd75' });
    }
    if (Sfx.muted) drawText(ctx, 'MUTED', 12, 164, { align: 'left', color: '#94b0c2' });

    if (this.state !== 'play') return;
    if (this.banner > 0) {
      ctx.globalAlpha = Math.min(1, this.banner * 2);
      drawText(ctx, 'LEVEL ' + this.level, 160, 60, { size: 16, color: '#ffcd75' });
      drawText(ctx, this.def.name, 160, 84);
      ctx.globalAlpha = 1;
    }
    if (this.clearTimer > 0) drawText(ctx, 'LEVEL CLEAR!', 160, 70, { size: 16, color: '#a7f070' });
  },

  drawButtons() {
    for (const b of this.buttons) {
      const hover = this.hovered(b);
      ctx.fillStyle = hover ? '#29366f' : '#1a1c2c';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.card) {
        const u = b.card;
        drawFrame(b.x, b.y, b.w, b.h, hover ? u.color : '#566c86');
        drawText(ctx, u.name, b.x + b.w / 2, b.y + 10, { color: u.color });
        drawText(ctx, u.lines[0], b.x + b.w / 2, b.y + 30);
        drawText(ctx, u.lines[1], b.x + b.w / 2, b.y + 42);
        drawText(ctx, '[' + b.key.slice(-1) + ']', b.x + b.w / 2, b.y + 60, { color: '#94b0c2' });
      } else {
        drawFrame(b.x, b.y, b.w, b.h, hover ? '#f4f4f4' : '#566c86');
        drawText(ctx, b.label, b.x + b.w / 2, b.y + 4, { color: hover ? '#ffcd75' : '#f4f4f4' });
      }
    }
  },

  dim() {
    ctx.fillStyle = 'rgba(26,28,44,0.75)';
    ctx.fillRect(0, 0, W, H);
  },

  drawTitle() {
    ctx.drawImage(this.titleBg, 0, 0);
    this.dim();
    drawText(ctx, 'PIXEL SIEGE', 160, 18, { size: 24, color: '#ffcd75', shadow: '#b13e53' });
    drawText(ctx, 'A RETRO TOP-DOWN SHOOTER', 160, 48, { color: '#94b0c2' });

    const drawBig = (spr, x, y, flip) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(2, 2);
      drawSprite(ctx, spr, 0, 0, { flip });
      ctx.restore();
    };
    const f = Math.floor(this.t * 8);
    drawBig(SPR.playerWalk[f % 4], 160, 76, false);
    drawBig(SPR.slime[Math.floor(this.t * 4) % 2], 104, 80, false);
    drawBig(SPR.bat[f % 2], 216, 72, false);

    this.drawButtons();
    drawText(ctx, 'BEST ' + Save.data.best, 160, 144, { color: '#a7f070' });
    drawText(ctx, 'WASD MOVE  MOUSE AIM+SHOOT', 160, 158, { color: '#94b0c2' });
    drawText(ctx, 'P PAUSE  M MUTE', 160, 168, { color: '#94b0c2' });
  },

  draw() {
    ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(0, 0, W, H);

    if (this.state === 'title') {
      this.drawTitle();
    } else {
      const s = this.state === 'play' ? this.shake : 0;
      ctx.save();
      if (s > 0) ctx.translate(Math.round(rand(-s, s)), Math.round(rand(-s, s)));
      this.drawWorld();
      ctx.restore();
      this.drawHUD();

      if (this.state === 'pause') {
        this.dim();
        drawText(ctx, 'PAUSED', 160, 50, { size: 16 });
      } else if (this.state === 'clear') {
        this.dim();
        drawText(ctx, 'LEVEL ' + this.level + ' CLEAR!', 160, 20, { size: 16, color: '#a7f070' });
        drawText(ctx, 'CHOOSE AN UPGRADE', 160, 42, { color: '#94b0c2' });
        drawText(ctx, 'CLICK OR PRESS 1-3', 160, 150, { color: '#94b0c2' });
      } else if (this.state === 'over') {
        this.dim();
        drawText(ctx, 'GAME OVER', 160, 34, { size: 16, color: '#b13e53' });
        drawText(ctx, 'SCORE ' + this.score, 160, 62);
        drawText(ctx, 'BEST ' + Save.data.best, 160, 76, { color: '#a7f070' });
        drawText(ctx, 'REACHED LEVEL ' + this.level, 160, 90, { color: '#94b0c2' });
      } else if (this.state === 'victory') {
        this.dim();
        drawText(ctx, 'YOU WIN!', 160, 30, { size: 16, color: '#ffcd75' });
        drawText(ctx, 'ALL ' + LEVELS.length + ' LEVELS CLEARED', 160, 58);
        drawText(ctx, 'SCORE ' + this.score, 160, 74, { color: '#a7f070' });
        drawText(ctx, 'HOW LONG CAN YOU LAST?', 160, 94, { color: '#94b0c2' });
      }
      this.drawButtons();
    }
    drawCrosshair();
  },
};

// ------------------------------------------------------------ boot
Save.load();
Sfx.muted = !!Save.data.muted;
Input.init(canvas);
addEventListener('mousedown', () => Sfx.init());
addEventListener('keydown', () => Sfx.init());
addEventListener('blur', () => { if (Game.state === 'play') Game.setState('pause'); });

Game.decals = document.createElement('canvas');
Game.decals.width = W; Game.decals.height = H;
Game.titleBg = buildBackground(LEVELS[0], 7);
Game.setState('title');

const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    Game.update(STEP);
    Input.endFrame();
    acc -= STEP;
  }
  Game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

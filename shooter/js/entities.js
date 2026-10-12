const W = 320, H = 180;
// Playable floor area inside the walls (top wall is taller to fit the HUD).
const ARENA = { x0: 8, y0: 16, x1: 312, y1: 172 };

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function touching(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawShadow(ctx, x, y, w) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - w, y - 1, w * 2, 2);
  ctx.fillRect(x - w + 1, y - 2, w * 2 - 2, 4);
}

// ---------------------------------------------------------------- Player
class Player {
  constructor(x, y, stats, hp) {
    this.x = x; this.y = y; this.r = 5;
    this.stats = stats;
    this.hp = hp;
    this.aim = 0;
    this.cool = 0;      // time until next shot
    this.inv = 0;       // invincibility after being hit
    this.hitFlash = 0;
    this.flashT = 0;    // muzzle flash
    this.rapid = 0;     // rapid-fire pickup timer
    this.anim = 0;
    this.moving = false;
    this.dead = false;
  }

  get facing() { return Math.cos(this.aim) >= 0 ? 1 : -1; }
  gunPivot() { return { x: this.x + this.facing * 2, y: this.y + 2 }; }

  update(dt, game) {
    if (this.dead) return;
    const k = Input.keys;
    let dx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let dy = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (Input.stick.x || Input.stick.y) { dx = Input.stick.x; dy = Input.stick.y; } // analog, length <= 1
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy), mag = Math.min(1, len);
      this.x += dx / len * mag * this.stats.speed * dt;
      this.y += dy / len * mag * this.stats.speed * dt;
    }
    this.x = clamp(this.x, ARENA.x0 + 6, ARENA.x1 - 6);
    this.y = clamp(this.y, ARENA.y0 + 6, ARENA.y1 - 8);

    const p = this.gunPivot();
    this.aim = Math.atan2(Input.mouse.y - p.y, Input.mouse.x - p.x);
    this.anim += dt * (this.moving ? 10 : 2);

    this.cool -= dt; this.inv -= dt; this.hitFlash -= dt; this.flashT -= dt; this.rapid -= dt;
    if (Input.mouse.down && this.cool <= 0) this.shoot(game);
  }

  muzzle() {
    const p = this.gunPivot();
    const lx = GUN_TIP.x, ly = GUN_TIP.y * this.facing;
    const c = Math.cos(this.aim), s = Math.sin(this.aim);
    return { x: p.x + c * lx - s * ly, y: p.y + s * lx + c * ly };
  }

  shoot(game) {
    const s = this.stats;
    this.cool = s.fireRate * (this.rapid > 0 ? 0.5 : 1);
    const m = this.muzzle();
    const n = 1 + s.spread, gap = 0.12;
    for (let i = 0; i < n; i++) {
      const a = this.aim + (i - (n - 1) / 2) * gap + rand(-0.03, 0.03);
      game.bullets.push(new Bullet(m.x, m.y, a, s.bulletSpeed, s.damage, false));
    }
    this.flashT = 0.05;
    game.addShake(1);
    Sfx.shoot();
  }

  hurt(dmg, game) {
    if (this.inv > 0 || this.dead) return;
    this.hp -= dmg;
    this.inv = 1.0;
    this.hitFlash = 0.1;
    game.addShake(6);
    Sfx.hurt();
    for (let i = 0; i < 8; i++) game.particles.push(new Particle(this.x, this.y, '#b13e53', 70, 0.5, 1));
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.deathTimer = 1.6;
      for (let i = 0; i < 30; i++) {
        game.particles.push(new Particle(this.x, this.y, pick(['#b13e53', '#3b5dc9', '#38b764', '#f4b483']), 110, rand(0.5, 1.2), 2));
      }
      game.splat(this.x, this.y, ['#b13e53', '#73464c']);
      Sfx.kill();
    }
  }

  draw(ctx) {
    if (this.dead) return;
    drawShadow(ctx, this.x, this.y + 7, 5);
    if (this.inv > 0 && Math.floor(this.inv * 16) % 2 === 0) return; // blink

    let spr = SPR.playerIdle, bob = 0;
    if (this.moving) {
      const i = Math.floor(this.anim) % 4;
      spr = SPR.playerWalk[i];
      bob = i % 2 === 0 ? -1 : 0;
    }
    const behind = Math.sin(this.aim) < -0.35; // aiming up: gun goes behind the body
    if (behind) this.drawGun(ctx);
    drawSprite(ctx, spr, this.x, this.y + bob, { flip: this.facing < 0, white: this.hitFlash > 0 });
    if (!behind) this.drawGun(ctx);
  }

  drawGun(ctx) {
    const p = this.gunPivot();
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(this.aim);
    if (this.facing < 0) ctx.scale(1, -1);
    ctx.drawImage(SPR.gun.img, -GUN_PIVOT.x, -GUN_PIVOT.y);
    if (this.flashT > 0) ctx.drawImage(SPR.flash.img, GUN_TIP.x, GUN_TIP.y - 2);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Bullet
class Bullet {
  constructor(x, y, angle, speed, dmg, enemy) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.dmg = dmg;
    this.enemy = enemy;
    this.r = enemy ? 2.5 : 2;
    this.life = 2.5;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < -20 || this.x > W + 20 || this.y < -20 || this.y > H + 20) this.dead = true;
  }

  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.enemy) {
      ctx.fillStyle = '#b13e53';
      ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = Math.floor(performance.now() / 80) % 2 ? '#ef7d57' : '#ffcd75';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    } else {
      ctx.fillStyle = '#ef7d57';
      ctx.fillRect(Math.round(this.x - this.vx * 0.012) - 1, Math.round(this.y - this.vy * 0.012) - 1, 2, 2);
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ---------------------------------------------------------------- Enemies
const ENEMY_TYPES = {
  slime: { hp: 2, speed: 26, r: 5, score: 10, anim: 4, blood: ['#38b764', '#a7f070', '#257179'] },
  bat:   { hp: 1, speed: 55, r: 5, score: 15, anim: 10, blood: ['#b13e53', '#ef7d57'], flying: true },
  brute: { hp: 9, speed: 17, r: 7, score: 50, anim: 3, blood: ['#5d275d', '#b13e53'], resist: 0.8 },
  robot: { hp: 3, speed: 30, r: 5, score: 30, anim: 4, blood: ['#566c86', '#94b0c2', '#ffcd75'], ranged: true },
};

class Enemy {
  constructor(kind, x, y, def) {
    const t = ENEMY_TYPES[kind];
    this.kind = kind; this.t = t;
    this.x = x; this.y = y; this.r = t.r;
    this.hp = Math.ceil(t.hp * (def.hpMul || 1));
    this.speed = t.speed * (def.speedMul || 1) * rand(0.9, 1.1);
    this.kx = 0; this.ky = 0;     // knockback velocity
    this.flash = 0;
    this.anim = Math.random() * 10;
    this.face = 1;
    this.fireCd = rand(1.5, 3);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.wobble = Math.random() * 6.28;
    this.entered = false;         // once inside the arena, stay inside
    this.dead = false;
  }

  update(dt, game) {
    const p = game.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let mx = dx / d, my = dy / d;

    if (this.t.ranged) {
      // Keep a medium distance: back off when close, circle around in between.
      if (d < 70) { mx = -mx; my = -my; }
      else if (d < 105) { const sx = -my * this.strafe, sy = mx * this.strafe; mx = sx; my = sy; }
      this.fireCd -= dt;
      if (this.fireCd <= 0 && this.entered && !p.dead) {
        this.fireCd = rand(1.8, 2.8);
        game.bullets.push(new Bullet(this.x, this.y, Math.atan2(dy, dx), 75, 1, true));
        Sfx.enemyShoot();
      }
    }
    if (this.t.flying) {
      this.wobble += dt * 6;
      const w = Math.sin(this.wobble) * 0.7;
      const px = -my, py = mx;
      mx += px * w; my += py * w;
    }

    this.x += (mx * this.speed + this.kx) * dt;
    this.y += (my * this.speed + this.ky) * dt;
    const decay = Math.exp(-8 * dt);
    this.kx *= decay; this.ky *= decay;

    if (!this.entered) {
      if (this.x > ARENA.x0 + this.r && this.x < ARENA.x1 - this.r && this.y > ARENA.y0 + this.r && this.y < ARENA.y1 - this.r) this.entered = true;
    } else {
      this.x = clamp(this.x, ARENA.x0 + this.r, ARENA.x1 - this.r);
      this.y = clamp(this.y, ARENA.y0 + this.r, ARENA.y1 - this.r);
    }

    this.flash -= dt;
    this.anim += dt * this.t.anim;
    if (Math.abs(dx) > 2) this.face = dx < 0 ? -1 : 1;
  }

  hit(dmg, angle) {
    this.hp -= dmg;
    this.flash = 0.08;
    const k = 140 * (1 - (this.t.resist || 0));
    this.kx += Math.cos(angle) * k;
    this.ky += Math.sin(angle) * k;
  }

  draw(ctx) {
    const frames = SPR[this.kind];
    const spr = frames[Math.floor(this.anim) % frames.length];
    drawShadow(ctx, this.x, this.y + spr.h / 2 + (this.t.flying ? 5 : 0), Math.ceil(this.r * 0.9));
    drawSprite(ctx, spr, this.x, this.y, { flip: this.face < 0 && !this.t.flying, white: this.flash > 0 });
  }
}

// ---------------------------------------------------------------- Effects
class Particle {
  constructor(x, y, color, speed, life, size) {
    const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed;
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * v; this.vy = Math.sin(a) * v;
    this.color = color; this.life = this.max = life; this.size = size;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    const f = Math.exp(-4 * dt);
    this.vx *= f; this.vy *= f;
    if ((this.life -= dt) <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life / this.max * 2);
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

class FloatText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.life = 0.8; this.dead = false;
  }
  update(dt) {
    this.y -= 20 * dt;
    if ((this.life -= dt) <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life * 3);
    drawText(ctx, this.text, Math.round(this.x), Math.round(this.y), { color: this.color });
    ctx.globalAlpha = 1;
  }
}

class Pickup {
  constructor(x, y, type) {
    this.x = clamp(x, ARENA.x0 + 8, ARENA.x1 - 8);
    this.y = clamp(y, ARENA.y0 + 8, ARENA.y1 - 8);
    this.type = type; // 'heart' | 'bolt'
    this.r = 6; this.life = 8; this.t = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    if ((this.life -= dt) <= 0) this.dead = true;
  }
  draw(ctx) {
    if (this.life < 2 && Math.floor(this.life * 8) % 2) return;
    drawShadow(ctx, this.x, this.y + 6, 3);
    drawSprite(ctx, this.type === 'heart' ? SPR.heart : SPR.bolt, this.x, this.y + Math.round(Math.sin(this.t * 4) * 1.5));
  }
}

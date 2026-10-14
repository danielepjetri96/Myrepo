// GtJ shell: menu, Jump Guy chapter, drawing, input and synthesized sound.
// Self-contained on purpose: nothing here depends on the Pixel Siege code.
const W = 320, H = 180;

// Chapter data for Progression. Jump Guy has a single level for now; the others are locked placeholders.
const CHAPTERS = [
  { id: 'jumpguy', name: 'JUMP GUY', levels: 1 },
  { id: 'cleartheroom', name: 'CLEAR THE ROOM', levels: 1 },
  { id: 'onetowerdefense', name: 'ONE TOWER DEFENSE', levels: 1 },
];
const PLAYABLE = { jumpguy: true };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const NO_STORAGE = { getItem: () => null, setItem() {}, removeItem() {} };
let progression;
try { progression = Progression.create({ storage: window.localStorage, chapters: CHAPTERS }); }
catch (e) { progression = Progression.create({ storage: NO_STORAGE, chapters: CHAPTERS }); }

// ---- sound (synthesized, created on first input) ----
const Sfx = {
  ac: null,
  init() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.ac) return;
    const t = this.ac.currentTime + (delay || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + dur);
  },
  jump() { this.tone(260, 620, 0.14, 'square', 0.08); },
  hit() { this.tone(220, 40, 0.4, 'sawtooth', 0.14); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.16, 'square', 0.09, i * 0.11)); },
  over() { [330, 262, 196, 130].forEach((f, i) => this.tone(f, f * 0.9, 0.22, 'triangle', 0.14, i * 0.18)); },
  select() { this.tone(440, 660, 0.08, 'square', 0.07); },
  deny() { this.tone(120, 100, 0.12, 'square', 0.07); },
};

// ---- input: keyboard and mouse only ----
const pressedKeys = new Set();
let click = null;
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
addEventListener('keydown', e => {
  Sfx.init();
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressedKeys.add(e.code);
});
canvas.addEventListener('mousedown', e => { Sfx.init(); click = toLogical(e); });
const wasPressed = (...codes) => codes.some(c => pressedKeys.has(c));
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];

// ---- state ----
let scene = 'menu';           // menu | play | dying | cleared | over
let menuIndex = 0;
let hud = { lives: 0, level: 1 };   // what the HUD shows, kept apart from Progression (which resets on game over)
let clearedChapter = false;
let sim = null, deathTimer = 0, sceneTime = 0, shake = 0, gameOver = false;

function startJumpGuy() {
  let run = progression.run;
  if (!(run && run.chapter === 'jumpguy' && JumpGuy.LEVELS[run.level - 1])) { progression.startChapter('jumpguy'); run = progression.run; }
  if (run) beginLevel();
}
function beginLevel() {
  const run = progression.run;
  sim = JumpGuy.create(JumpGuy.LEVELS[run.level - 1]);
  hud = { lives: run.lives, level: run.level };
  scene = 'play'; sceneTime = 0; gameOver = false;
}
function toMenu() { scene = 'menu'; sceneTime = 0; }

// ---- menu ----
const CARD = i => ({ x: 40, y: 56 + i * 36, w: 240, h: 30 });
const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function activateChapter(i) {
  const c = CHAPTERS[i];
  if (!progression.isChapterUnlocked(c.id) || !PLAYABLE[c.id]) { Sfx.deny(); return; }
  Sfx.select();
  startJumpGuy();
}

function updateMenu() {
  const n = CHAPTERS.length;
  if (wasPressed('ArrowDown', 'KeyS')) menuIndex = (menuIndex + 1) % n;
  if (wasPressed('ArrowUp', 'KeyW')) menuIndex = (menuIndex + n - 1) % n;
  if (click) {
    for (let i = 0; i < n; i++) if (inRect(click, CARD(i))) { menuIndex = i; activateChapter(i); break; }
  } else if (wasPressed('Enter', 'Space')) activateChapter(menuIndex);
}

// ---- update (fixed 60 Hz) ----
const DT = 1 / 60;
function update() {
  sceneTime += DT;
  if (shake > 0) shake = Math.max(0, shake - DT);
  if (scene === 'menu') updateMenu();
  else if (scene === 'play') {
    if (wasPressed('Escape')) toMenu();
    else {
      const pressed = wasPressed(...JUMP_KEYS) || !!click;
      const wasGrounded = sim.grounded;
      const ev = sim.update(DT, { pressed });
      if (pressed && wasGrounded && !sim.grounded) Sfx.jump();
      if (ev === 'hit') {
        Sfx.hit(); shake = 0.3; deathTimer = 0.9; scene = 'dying'; sceneTime = 0;
        hud.lives = Math.max(0, hud.lives - 1);
        const lost = progression.lifeLost();
        gameOver = !!(lost && lost.gameOver);
      } else if (ev === 'passed') {
        Sfx.win(); const passed = progression.levelPassed(); clearedChapter = !!(passed && passed.chapterCompleted); scene = 'cleared'; sceneTime = 0;
      }
    }
  } else if (scene === 'dying') {
    deathTimer -= DT;
    if (deathTimer <= 0) {
      if (gameOver) { Sfx.over(); scene = 'over'; sceneTime = 0; }
      else beginLevel();
    }
  } else if (scene === 'cleared') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space', 'Escape') || click)) toMenu();
  } else if (scene === 'over') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space') || click)) startJumpGuy();
    else if (wasPressed('Escape')) toMenu();
  }
  pressedKeys.clear(); click = null;
}

// ---- drawing ----
function text(s, x, y, color, size, align) {
  ctx.font = 'bold ' + (size || 8) + "px 'Courier New', monospace";
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#000'; ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color || '#fff'; ctx.fillText(s, Math.round(x), Math.round(y));
}
function pixels(rows, pal, x, y, s) {
  s = s || 1;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    ctx.fillStyle = pal[ch]; ctx.fillRect(Math.round(x) + i * s, Math.round(y) + j * s, s, s);
  }));
}

const RUNNER = [
  '..hhhh..',
  '.hhhhhh.',
  '.sssssss',
  '.sess.s.',
  '..ssss..',
  '.bbbbbb.',
  'sbbbbbbs',
  '.bbbbbb.',
  '.bb..bb.',
  '.dd..dd.',
];
const RUNNER2 = RUNNER.slice(0, 8).concat(['..bb.bb.', '..dd.dd.']);
const PAL = { h: '#b13e53', s: '#ffcd75', e: '#1a1c2c', b: '#3b5dc9', d: '#333c57' };
const SPIKE = ['...#...', '..###..', '..###..', '.#####.', '.#####.', '#######', '#######'];
const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];

function drawBackground(dist) {
  ctx.fillStyle = '#29366f'; ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = '#3b5dc9'; ctx.fillRect(0, 70, W, 40);
  ctx.fillStyle = '#41a6f6'; ctx.fillRect(0, 110, W, 30);
  // two hill layers with parallax, drawn as 3px columns
  for (let layer = 0; layer < 2; layer++) {
    const speed = layer ? 0.5 : 0.2, height = layer ? 26 : 38, base = JumpGuy.GROUND - (layer ? 0 : 14);
    const off = (dist * speed) % 160;
    ctx.fillStyle = layer ? '#38b764' : '#257179';
    for (let x = -160; x < W + 160; x += 80) {
      const hx = x - off + (layer ? 40 : 0);
      for (let i = 0; i < 30; i++) {
        const t = i / 29, hh = Math.round(Math.sin(t * Math.PI) * height);
        ctx.fillRect(Math.round(hx + t * 80), base - hh, 3, hh);
      }
    }
  }
}
function drawGround(dist) {
  const g = JumpGuy.GROUND;
  ctx.fillStyle = '#566c86'; ctx.fillRect(0, g, W, H - g);
  ctx.fillStyle = '#73eff7'; ctx.fillRect(0, g, W, 2);
  ctx.fillStyle = '#333c57';
  const off = Math.floor(dist) % 16;
  for (let x = -off; x < W; x += 16) { ctx.fillRect(x, g + 10, 8, 2); ctx.fillRect(x + 8, g + 24, 8, 2); }
}

function drawLevel() {
  const J = JumpGuy;
  drawBackground(sim.dist);
  drawGround(sim.dist);
  const fx = Math.round(sim.def.length - sim.dist);
  if (fx > -30 && fx < W + 20) {
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(fx, J.GROUND - 56, 2, 56);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
      ctx.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#1a1c2c'; ctx.fillRect(fx + 2 + i * 4, J.GROUND - 56 + j * 4, 4, 4);
    }
    text('FINISH', fx - 8, J.GROUND - 70, '#ffcd75', 8);
  }
  for (const o of sim.def.obstacles) {
    const ox = Math.round(o.x - sim.dist);
    if (ox > -20 && ox < W) pixels(SPIKE, { '#': '#ef7d57' }, ox, J.GROUND - o.h, 2);
  }
  const flashHidden = scene === 'dying' && Math.floor(sceneTime * 20) % 2 === 1;
  if (!flashHidden) {
    const frame = sim.grounded && Math.floor(sim.dist / 8) % 2 ? RUNNER2 : RUNNER;
    pixels(frame, PAL, J.PLAYER_X, sim.y - J.PLAYER_H, 2);
  }
}

function drawLives() {
  text('LIVES', 6, 6, '#fff', 8);
  for (let i = 0; i < Progression.LIVES; i++) pixels(HEART, { r: i < hud.lives ? '#ef4444' : '#333c57' }, 46 + i * 10, 5);
  text('LEVEL ' + hud.level, W - 6, 6, '#fff', 8, 'right');
}
function drawProgressBar() {
  const p = Math.min(1, (sim.dist + JumpGuy.PLAYER_X) / sim.def.length);
  ctx.fillStyle = '#000'; ctx.fillRect(90, 18, 140, 4);
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(91, 19, Math.round(138 * p), 2);
}

function panel(title, lines, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
  text(title, W / 2, 50, color, 20, 'center');
  lines.forEach((l, i) => text(l, W / 2, 96 + i * 14, '#fff', 8, 'center'));
}

function drawMenu() {
  drawBackground(sceneTime * 40); drawGround(sceneTime * 40);
  text('GtJ', W / 2, 8, '#ffcd75', 26, 'center');
  text('SELECT A CHAPTER', W / 2, 40, '#fff', 8, 'center');
  CHAPTERS.forEach((c, i) => {
    const r = CARD(i), unlocked = progression.isChapterUnlocked(c.id);
    ctx.fillStyle = i === menuIndex && unlocked ? '#ffcd75' : '#1a1c2c'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    ctx.fillStyle = unlocked ? '#3b5dc9' : '#333c57'; ctx.fillRect(r.x, r.y, r.w, r.h);
    text((i + 1) + '. ' + c.name, r.x + 10, r.y + 4, unlocked ? '#fff' : '#94a3b8', 10);
    let sub;
    if (!unlocked) sub = 'LOCKED';
    else if (!PLAYABLE[c.id]) sub = 'COMING SOON';
    else if (progression.isChapterCompleted(c.id)) sub = 'COMPLETED - PLAY AGAIN';
    else if (progression.run && progression.run.chapter === c.id) sub = 'CONTINUE - LEVEL ' + progression.run.level + ', ' + progression.run.lives + ' LIVES';
    else sub = 'NEW GAME';
    text(sub, r.x + 10, r.y + 18, unlocked ? '#a7f070' : '#94a3b8', 8);
  });
  text('UP/DOWN + ENTER, OR CLICK', W / 2, 166, '#cbd5e1', 8, 'center');
}

function draw() {
  ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6));
  if (scene === 'menu') drawMenu();
  else drawLevel();
  ctx.restore();
  if (scene === 'menu') return;
  drawLives();
  if (scene === 'play') {
    drawProgressBar();
    if (sim.dist < 120) text('SPACE / UP / CLICK TO JUMP', W / 2, 30, '#fff', 8, 'center');
  } else if (scene === 'cleared') {
    panel('LEVEL CLEARED!', [clearedChapter ? 'CHAPTER 1 COMPLETE - CHAPTER 2 UNLOCKED' : 'GET READY FOR THE NEXT LEVEL', '', 'PRESS ENTER OR CLICK'], '#a7f070');
  } else if (scene === 'over') {
    panel('GAME OVER', ['NO LIVES LEFT', 'YOU RESTART FROM LEVEL 1', '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], '#ef4444');
  }
}

// ---- canvas scaling and main loop ----
let VIEW_SCALE = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  let s = Math.min(innerWidth / W, innerHeight / H);
  if (s >= 1) s = Math.floor(s);
  canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
  canvas.width = Math.round(W * s * dpr); canvas.height = Math.round(H * s * dpr);
  VIEW_SCALE = s * dpr;
}
addEventListener('resize', resize);
resize();

let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { update(); acc -= DT; }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

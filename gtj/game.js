// GtJ shell: menu, Jump Guy chapter, drawing, input and synthesized sound.
// Self-contained on purpose: nothing here depends on the Pixel Siege code.
const W = 320, H = 180;

// Chapter data for Progression. Jump Guy's level count comes from its data file; the others are placeholders.
const CHAPTERS = [
  { id: 'jumpguy', name: 'JUMP GUY', levels: JumpGuyData.levels.length },
  { id: 'cleartheroom', name: 'CLEAR THE ROOM', levels: 1 },
  { id: 'onetowerdefense', name: 'ONE TOWER DEFENSE', levels: 1 },
];
const PLAYABLE = { jumpguy: true };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const NO_STORAGE = { getItem: () => null, setItem() {}, removeItem() {} };
let storage;
try { storage = window.localStorage; } catch (e) { storage = NO_STORAGE; }
const progression = Progression.create({ storage, chapters: CHAPTERS });
const settings = Settings.create({ storage });

// ---- sound (synthesized, created on first input) ----
const Sfx = {
  ac: null,
  init() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.ac || settings.muted) return;
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
let scene = 'menu';           // menu | play | pause | confirm | dying | cleared | over
let menuIndex = 0;
let hud = { lives: 0, level: 1 };   // what the HUD shows, kept apart from Progression (which resets on game over)
let clearedChapter = false;
let mode = 'chapter';               // chapter | endless
let endlessResult = null;           // { score, record, newRecord } after an endless run
let sim = null, deathTimer = 0, sceneTime = 0, shake = 0, gameOver = false;

function startJumpGuy() {
  endlessResult = null;
  let run = progression.run;
  if (!(run && run.chapter === 'jumpguy' && JumpGuyData.levels[run.level - 1])) { progression.startChapter('jumpguy'); run = progression.run; }
  if (run) { mode = 'chapter'; beginLevel(); }
}
function beginLevel() {
  const run = progression.run;
  sim = JumpGuy.create(JumpGuy.buildLevel(run.level));
  hud = { lives: run.lives, level: run.level };
  scene = 'play'; sceneTime = 0; gameOver = false;
}
function startEndless() {
  mode = 'endless'; endlessResult = null;
  sim = JumpGuy.create(JumpGuy.buildEndless());
  scene = 'play'; sceneTime = 0; gameOver = false;
}
const meters = dist => Math.floor(dist * JumpGuyData.endless.metersPerPx);
function toMenu() { scene = 'menu'; sceneTime = 0; }

// ---- menu ----
// Menu rows: the three chapters, with Jump Guy's Endless right after Jump Guy.
const MENU = [
  { kind: 'chapter', i: 0 },
  { kind: 'endless', id: 'jumpguy', name: 'JUMP GUY ENDLESS', indent: 12 },
  { kind: 'chapter', i: 1 },
  { kind: 'chapter', i: 2 },
];
const CARD = i => ({ x: 40, y: 50 + i * 28, w: 240, h: 24 });
const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function activateItem(i) {
  const item = MENU[i];
  if (item.kind === 'endless') {
    if (!progression.isEndlessUnlocked(item.id)) { Sfx.deny(); return; }
    Sfx.select(); startEndless(); return;
  }
  const c = CHAPTERS[item.i];
  if (!progression.isChapterUnlocked(c.id) || !PLAYABLE[c.id]) { Sfx.deny(); return; }
  Sfx.select();
  startJumpGuy();
}

// Clickable buttons: rectangles shared by update (hit-testing) and draw.
const BTN = {
  sound: { x: 40, y: 164, w: 112, h: 12 },
  reset: { x: 168, y: 164, w: 112, h: 12 },
  resume: { x: 90, y: 84, w: 140, h: 16 },
  pauseSound: { x: 90, y: 106, w: 140, h: 16 },
  quit: { x: 90, y: 128, w: 140, h: 16 },
  yes: { x: 60, y: 132, w: 90, h: 16 },
  no: { x: 170, y: 132, w: 90, h: 16 },
};
const hit = r => click && inRect(click, r);
const soundLabel = () => 'M  SOUND: ' + (settings.muted ? 'OFF' : 'ON');

function updateMenu() {
  if (hit(BTN.sound)) { settings.toggleMuted(); Sfx.select(); return; }
  if (hit(BTN.reset) || wasPressed('KeyR')) { Sfx.select(); scene = 'confirm'; sceneTime = 0; return; }
  const n = MENU.length;
  if (wasPressed('ArrowDown', 'KeyS')) menuIndex = (menuIndex + 1) % n;
  if (wasPressed('ArrowUp', 'KeyW')) menuIndex = (menuIndex + n - 1) % n;
  if (click) {
    for (let i = 0; i < n; i++) if (inRect(click, CARD(i))) { menuIndex = i; activateItem(i); break; }
  } else if (wasPressed('Enter', 'Space')) activateItem(menuIndex);
}

// ---- update (fixed 60 Hz) ----
const DT = 1 / 60;
function update() {
  sceneTime += DT;
  if (wasPressed('KeyM')) { settings.toggleMuted(); Sfx.select(); }
  if (shake > 0) shake = Math.max(0, shake - DT);
  if (scene === 'menu') updateMenu();
  else if (scene === 'play') {
    if (wasPressed('Escape', 'KeyP')) { scene = 'pause'; sceneTime = 0; }
    else {
      const pressed = wasPressed(...JUMP_KEYS) || !!click;
      const wasGrounded = sim.grounded;
      const ev = sim.update(DT, { pressed });
      if (pressed && wasGrounded && !sim.grounded) Sfx.jump();
      if (ev === 'hit') {
        Sfx.hit(); shake = 0.3; deathTimer = 0.9; scene = 'dying'; sceneTime = 0;
        if (mode === 'endless') {
          const score = meters(sim.dist);
          const newRecord = progression.submitEndless('jumpguy', score);
          endlessResult = { score, record: progression.record('jumpguy'), newRecord };
          gameOver = true;
        } else {
          hud.lives = Math.max(0, hud.lives - 1);
          const lost = progression.lifeLost();
          gameOver = !!(lost && lost.gameOver);
        }
      } else if (ev === 'passed') {
        Sfx.win(); const passed = progression.levelPassed(); clearedChapter = !!(passed && passed.chapterCompleted); scene = 'cleared'; sceneTime = 0;
      }
    }
  } else if (scene === 'pause') {
    if (hit(BTN.pauseSound)) { settings.toggleMuted(); Sfx.select(); }
    if (wasPressed('Escape', 'KeyP', 'Enter') || hit(BTN.resume)) { scene = 'play'; sceneTime = 0; }
    else if (wasPressed('KeyQ') || hit(BTN.quit)) toMenu();
  } else if (scene === 'confirm') {
    if (wasPressed('KeyY') || hit(BTN.yes)) { progression.reset(); menuIndex = 0; endlessResult = null; Sfx.select(); toMenu(); }
    else if (wasPressed('KeyN', 'Escape') || hit(BTN.no)) toMenu();
  } else if (scene === 'dying') {
    deathTimer -= DT;
    if (deathTimer <= 0) {
      if (gameOver) { Sfx.over(); scene = 'over'; sceneTime = 0; }
      else beginLevel();
    }
  } else if (scene === 'cleared') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space', 'Escape') || click)) {
      if (clearedChapter || wasPressed('Escape')) toMenu(); else beginLevel();
    }
  } else if (scene === 'over') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space') || click)) { if (mode === 'endless') startEndless(); else startJumpGuy(); }
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
  if (mode === 'endless') {
    text('ONE LIFE', 6, 6, '#fff', 8);
    text(meters(sim.dist) + ' M', W - 6, 6, '#fff', 8, 'right');
    text('BEST ' + progression.record('jumpguy') + ' M', W - 6, 18, '#ffcd75', 8, 'right');
    return;
  }
  text('LIVES', 6, 6, '#fff', 8);
  for (let i = 0; i < Progression.LIVES; i++) pixels(HEART, { r: i < hud.lives ? '#ef4444' : '#333c57' }, 46 + i * 10, 5);
  text('LEVEL ' + hud.level + '/' + JumpGuyData.levels.length, W - 6, 6, '#fff', 8, 'right');
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

function button(r, label, color) {
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  ctx.fillStyle = color || '#333c57'; ctx.fillRect(r.x, r.y, r.w, r.h);
  text(label, r.x + r.w / 2, r.y + (r.h - 8) / 2 + 1, '#fff', 8, 'center');
}

function drawMenu() {
  drawBackground(sceneTime * 40); drawGround(sceneTime * 40);
  text('GtJ', W / 2, 8, '#ffcd75', 26, 'center');
  text('CHOOSE WHAT TO PLAY', W / 2, 36, '#fff', 8, 'center');
  MENU.forEach((item, i) => {
    const r = CARD(i);
    let title, sub, unlocked;
    if (item.kind === 'endless') {
      unlocked = progression.isEndlessUnlocked(item.id);
      title = item.name;
      sub = unlocked ? 'BEST: ' + progression.record(item.id) + ' M' : 'LOCKED - COMPLETE JUMP GUY';
    } else {
      const c = CHAPTERS[item.i];
      unlocked = progression.isChapterUnlocked(c.id);
      title = (item.i + 1) + '. ' + c.name;
      if (!unlocked) sub = 'LOCKED';
      else if (!PLAYABLE[c.id]) sub = 'COMING SOON';
      else if (progression.isChapterCompleted(c.id)) sub = 'COMPLETED - PLAY AGAIN';
      else if (progression.run && progression.run.chapter === c.id) sub = 'CONTINUE - LEVEL ' + progression.run.level + ', ' + progression.run.lives + ' LIVES';
      else sub = 'NEW GAME';
    }
    ctx.fillStyle = i === menuIndex && unlocked ? '#ffcd75' : '#1a1c2c'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    ctx.fillStyle = unlocked ? '#3b5dc9' : '#333c57'; ctx.fillRect(r.x, r.y, r.w, r.h);
    const ix = item.indent || 0;
    text(title, r.x + 8 + ix, r.y + 3, unlocked ? '#fff' : '#94a3b8', 8);
    text(sub, r.x + 8 + ix, r.y + 13, unlocked ? '#a7f070' : '#94a3b8', 8);
  });
  button(BTN.sound, soundLabel());
  button(BTN.reset, 'R  RESET PROGRESS');
}

function draw() {
  ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6));
  if (scene === 'menu' || scene === 'confirm') drawMenu();
  else drawLevel();
  ctx.restore();
  if (scene === 'confirm') {
    ctx.fillStyle = '#0d0e17'; ctx.fillRect(0, 0, W, H);
    panel('RESET PROGRESS?', ['ALL UNLOCKS, RECORDS AND SAVED LEVELS', 'WILL BE ERASED. SOUND SETTING IS KEPT.'], '#ef4444');
    button(BTN.yes, 'Y  YES, RESET', '#b13e53'); button(BTN.no, 'N  CANCEL');
    return;
  }
  if (scene === 'menu') return;
  drawLives();
  if (scene === 'pause') {
    panel('PAUSED', [], '#ffcd75');
    button(BTN.resume, 'P  RESUME', '#3b5dc9'); button(BTN.pauseSound, soundLabel()); button(BTN.quit, 'Q  QUIT TO MENU');
    return;
  }
  if (scene === 'play') {
    if (mode === 'chapter') drawProgressBar();
    if (sim.dist < 120) text('SPACE / UP / CLICK TO JUMP', W / 2, 30, '#fff', 8, 'center');
  } else if (scene === 'cleared') {
    panel(clearedChapter ? 'CHAPTER CLEARED!' : 'LEVEL CLEARED!', [clearedChapter ? 'CHAPTER 1 COMPLETE - CHAPTER 2 UNLOCKED' : 'GET READY FOR THE NEXT LEVEL', '', clearedChapter ? 'PRESS ENTER OR CLICK FOR THE MENU' : 'ENTER / CLICK: NEXT LEVEL   ESC: MENU'], '#a7f070');
  } else if (scene === 'over') {
    if (mode === 'endless') {
      const r = endlessResult;
      panel(r.newRecord ? 'NEW RECORD!' : 'GAME OVER', ['DISTANCE: ' + r.score + ' M', r.newRecord ? 'BEST BEATEN' : 'BEST: ' + r.record + ' M', '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], r.newRecord ? '#ffcd75' : '#ef4444');
    } else {
      panel('GAME OVER', ['NO LIVES LEFT', 'YOU RESTART FROM LEVEL 1', '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], '#ef4444');
    }
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

// GtJ shell: menu, the playable chapters, drawing, input and synthesized sound.
// Self-contained on purpose: nothing here depends on the Pixel Siege code.
const W = 320, H = 180;

// Chapter data for Progression. Level counts come from each chapter's data file.
const CHAPTERS = [
  { id: 'jumpguy', name: 'JUMP GUY', levels: JumpGuyData.levels.length },
  { id: 'cleartheroom', name: 'CLEAR THE ROOM', levels: ClearTheRoomData.levels.length },
  { id: 'onetowerdefense', name: 'ONE TOWER DEFENSE', levels: OneTowerData.levels.length },
];
const PLAYABLE = { jumpguy: true, cleartheroom: true, onetowerdefense: true };

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
  shoot() { this.tone(520, 220, 0.07, 'square', 0.04); },
  enemyHit() { this.tone(180, 120, 0.06, 'square', 0.06); },
  kill() { this.tone(300, 60, 0.18, 'sawtooth', 0.08); },
  heal() { this.tone(660, 990, 0.12, 'triangle', 0.08); },
  select() { this.tone(440, 660, 0.08, 'square', 0.07); },
  deny() { this.tone(120, 100, 0.12, 'square', 0.07); },
  warn() { [0, 0.25, 0.5, 0.75].forEach(d => this.tone(880, 880, 0.08, 'square', 0.06, d)); },
  summon() { this.tone(90, 400, 0.4, 'sawtooth', 0.1); },
  boom() { this.tone(160, 40, 0.35, 'sawtooth', 0.12); },
  // one tone per spell: [from Hz, to Hz, s, wave, volume]
  CAST_TONES: { fireball: [300, 150, 0.2, 'sawtooth', 0.07], frost: [1200, 600, 0.3, 'triangle', 0.08], lightning: [1500, 80, 0.15, 'square', 0.08], meteor: [900, 120, 0.9, 'sawtooth', 0.07] },
  cast(spell) { if (this.CAST_TONES[spell]) this.tone(...this.CAST_TONES[spell]); },
};

// ---- input: keyboard and mouse only ----
const pressedKeys = new Set();
let click = null;
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
const keysDown = new Set();
const mouse = { x: W / 2, y: H / 2, down: false };
addEventListener('keydown', e => {
  Sfx.init();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressedKeys.add(e.code);
  keysDown.add(e.code);
});
addEventListener('keyup', e => keysDown.delete(e.code));
addEventListener('blur', () => { keysDown.clear(); mouse.down = false; });
canvas.addEventListener('mousedown', e => { Sfx.init(); click = toLogical(e); mouse.down = true; });
addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('mousemove', e => { Object.assign(mouse, toLogical(e)); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const wasPressed = (...codes) => codes.some(c => pressedKeys.has(c));
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];

// ---- state ----
let scene = 'menu';           // menu | play | pause | confirm | dying | cleared | over
let menuIndex = 0;
let hud = { lives: 0, level: 1 };   // what the HUD shows, kept apart from Progression (which resets on game over)
let clearedChapter = false;
let chapterId = 'jumpguy';           // chapter being played: jumpguy | cleartheroom
let mode = 'chapter';               // chapter | endless
let endlessResult = null;           // { score, record, newRecord } after an endless run
let controlsHint = 0;               // seconds left of the controls hint shown at the start of play
let sim = null, deathTimer = 0, sceneTime = 0, shake = 0, gameOver = false;
let upgradeOffer = [];              // the upgrades to choose from after a One Tower Defense level
let sparks = [];                    // short-lived lines and rings drawn over the field (lightning, distant strikes, blasts, Frost)

// Starts (or resumes, if a saved run exists) a chapter at its saved level.
function startChapter(id) {
  endlessResult = null;
  const chapter = CHAPTERS.find(c => c.id === id);
  let run = progression.run;
  if (!(run && run.chapter === id && Number.isInteger(run.level) && run.level >= 1 && run.level <= chapter.levels)) { progression.startChapter(id); run = progression.run; }
  if (run) { chapterId = id; mode = 'chapter'; beginLevel(); }
}
function beginLevel() {
  const run = progression.run;
  sim = PLAY[chapterId].level(run.level);
  hud = { lives: run.lives, level: run.level };
  enterPlay();
}
function startEndless(id) {
  chapterId = id; mode = 'endless'; endlessResult = null;
  sim = ENDLESS[id].create();
  enterPlay();
}
// Common start of play, once sim is ready.
function enterPlay() {
  controlsHint = 4;
  particles = []; sparks = []; mouse.down = false;   // a button still held from the menu must not fire
  scene = 'play'; sceneTime = 0; gameOver = false;
}
const meters = dist => Math.floor(dist * JumpGuyData.endless.metersPerPx);
// What differs between the Endless modes: how a run is built, its score (metres run, rooms cleared) and how the score reads.
const ENDLESS = {
  jumpguy: { create: () => JumpGuy.create(JumpGuy.buildEndless()), score: s => meters(s.dist), unit: ' M', result: n => 'DISTANCE: ' + n + ' M' },
  cleartheroom: { create: () => ClearTheRoom.createEndless({}), score: s => s.roomsCleared, unit: ' ROOMS', result: n => 'ROOMS CLEARED: ' + n },
  onetowerdefense: {
    create: () => OneTower.createEndless({}), score: s => s.wavesCleared, unit: ' WAVES', result: n => 'WAVES CLEARED: ' + n,
    // every few waves the run pauses for an upgrade, taken by the simulation itself
    offerUpgrades: () => OneTower.offerUpgrades({ spells: sim.spells, taken: sim.upgrades }),
    chooseUpgrade: id => sim.chooseUpgrade(id),
  },
};
function toMenu() { scene = 'menu'; sceneTime = 0; }

// ---- menu ----
// Menu rows: the three chapters, each playable chapter followed by its Endless.
const MENU = [
  { kind: 'chapter', i: 0 },
  { kind: 'endless', id: 'jumpguy', name: 'JUMP GUY ENDLESS', indent: 12 },
  { kind: 'chapter', i: 1 },
  { kind: 'endless', id: 'cleartheroom', name: 'CLEAR THE ROOM ENDLESS', indent: 12 },
  { kind: 'chapter', i: 2 },
  { kind: 'endless', id: 'onetowerdefense', name: 'ONE TOWER DEFENSE ENDLESS', indent: 12 },
];
const CARD = i => ({ x: 40, y: 45 + i * 20, w: 240, h: 18 });
const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function activateItem(i) {
  const item = MENU[i];
  if (item.kind === 'endless') {
    if (!progression.isEndlessUnlocked(item.id)) { Sfx.deny(); return; }
    Sfx.select(); startEndless(item.id); return;
  }
  const c = CHAPTERS[item.i];
  if (!progression.isChapterUnlocked(c.id) || !PLAYABLE[c.id]) { Sfx.deny(); return; }
  Sfx.select();
  startChapter(c.id);
}

// Clickable buttons: rectangles shared by update (hit-testing) and draw.
const BTN = {
  sound: { x: 40, y: 166, w: 112, h: 12 },
  reset: { x: 168, y: 166, w: 112, h: 12 },
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

// updateRunner and updateRoom both return 'hit' (a life lost), 'passed' (level cleared) or null.
function updateRunner() {
  const pressed = wasPressed(...JUMP_KEYS) || !!click;
  const wasGrounded = sim.grounded;
  const ev = sim.update(DT, { pressed });
  if (pressed && wasGrounded && !sim.grounded) Sfx.jump();
  return ev;
}

function camera() {
  const r = sim.room;
  return {
    x: Math.max(0, Math.min(r.width - W, sim.player.x - W / 2)),
    y: Math.max(0, Math.min(r.height - H, sim.player.y - H / 2)),
  };
}

// What differs between the chapters while playing: how a level is built, how a step reads the input, and how the
// field, the HUD and the in-play messages are drawn. hearts: Salute is shown as hearts on the first HUD row.
const PLAY = {
  jumpguy: {
    level: n => JumpGuy.create(JumpGuy.buildLevel(n)),
    update: updateRunner, draw: drawLevel, hud: drawLivesAndLevel, messages: drawRunnerMessages,
  },
  cleartheroom: {
    level: n => ClearTheRoom.createLevel({ cfg: ClearTheRoomData.levels[n - 1] }),
    update: updateRoom, draw: drawRoom, hud: drawRoomHud, messages: drawRoomMessages, hearts: true, hideCursor: true,
  },
  onetowerdefense: {
    level: n => OneTower.create({ waves: OneTower.buildWaves(OneTowerData.levels[n - 1]), spells: OneTower.levelSpells(n), upgrades: progression.run.upgrades }),
    update: updateTower, draw: drawField, hud: drawFieldHud, messages: drawFieldMessages, hideCursor: true,
    // after a level: 3 upgrades for the spells of the next one
    offerUpgrades: () => OneTower.offerUpgrades({ spells: OneTower.levelSpells(progression.run.level + 1), taken: progression.run.upgrades }),
  },
};

// Plays the sounds and particles queued by the simulation, then ages the controls hint and the particles.
function playFx() {
  for (const f of sim.fx) {
    if (f.type === 'shoot') Sfx.shoot();
    else if (f.type === 'hit') { Sfx.enemyHit(); burst(f.x, f.y, '#a7f070', 3); }
    else if (f.type === 'kill') { Sfx.kill(); burst(f.x, f.y, '#a7f070', 10); }
    else if (f.type === 'hurt') { Sfx.hit(); shake = 0.15; }
    else if (f.type === 'heal') { Sfx.heal(); burst(f.x, f.y, '#ef4444', 6); }
    else if (f.type === 'warn') Sfx.warn();
    else if (f.type === 'summon') { Sfx.summon(); burst(f.x, f.y, '#ef4444', 14); }
    else if (f.type === 'deny') Sfx.deny();
    else if (f.type === 'cast') { Sfx.cast(f.spell); if (f.spell === 'frost') sparks.push({ ring: true, x: f.x, y: f.y, r: sim.stats.spells.frost.radius, color: '#73eff7', life: 0.4 }); }
    else if (f.type === 'blast') { Sfx.boom(); burst(f.x, f.y, '#ef7d57', 14); sparks.push({ ring: true, x: f.x, y: f.y, r: f.radius, color: '#ffcd75', life: 0.25 }); }
    else if (f.type === 'lightning') sparks.push({ points: [{ x: f.x, y: f.y }, ...f.points], color: '#ffffff', life: 0.2 });
    else if (f.type === 'zap') sparks.push({ points: [{ x: f.x, y: f.y }, { x: f.tx, y: f.ty }], color: '#b55dff', life: 0.15 });
  }
  for (const k of sparks) k.life -= DT;
  sparks = sparks.filter(k => k.life > 0);
  sim.fx.length = 0;
  if (controlsHint > 0) controlsHint -= DT;
  updateParticles();
}

function updateRoom() {
  const cam = camera();
  const k = c => keysDown.has(c);
  const ev = sim.update(DT, {
    moveX: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
    moveY: (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0),
    aimX: mouse.x + cam.x,
    aimY: mouse.y + cam.y,
    fire: mouse.down,
  });
  playFx();
  if (ev === 'room') { Sfx.select(); particles = []; return null; }
  return ev === 'lost' ? 'hit' : ev;
}

function updateTower() {
  const key = [1, 2, 3, 4, 5].find(k => wasPressed('Digit' + k, 'Numpad' + k));
  const ev = sim.update(DT, { aimX: mouse.x, aimY: mouse.y, fire: mouse.down, select: key });
  playFx();
  return ev === 'lost' ? 'hit' : ev;
}

// Small visual particles (not part of the simulation).
let particles = [];
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 60;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.2, color });
  }
}
function updateParticles() {
  for (const p of particles) { p.x += p.vx * DT; p.y += p.vy * DT; p.life -= DT; }
  particles = particles.filter(p => p.life > 0);
}
function update() {
  sceneTime += DT;
  if (wasPressed('KeyM')) { settings.toggleMuted(); Sfx.select(); }
  if (shake > 0) shake = Math.max(0, shake - DT);
  if (scene === 'menu') updateMenu();
  else if (scene === 'play') {
    if (wasPressed('Escape', 'KeyP')) { scene = 'pause'; sceneTime = 0; }
    else {
      const ev = PLAY[chapterId].update();
      if (ev === 'upgrade') {   // an Endless pausing for an upgrade (never an empty offer: Torretta health repeats)
        upgradeOffer = ENDLESS[chapterId].offerUpgrades();
        Sfx.win(); scene = 'upgrade'; sceneTime = 0;
      } else if (ev === 'hit') {
        Sfx.hit(); shake = 0.3; deathTimer = 0.9; scene = 'dying'; sceneTime = 0;
        if (mode === 'endless') {
          const score = ENDLESS[chapterId].score(sim);
          const newRecord = progression.submitEndless(chapterId, score);
          endlessResult = { score, record: progression.record(chapterId), newRecord };
          gameOver = true;
        } else {
          hud.lives = Math.max(0, hud.lives - 1);
          const lost = progression.lifeLost();
          gameOver = !!(lost && lost.gameOver);
        }
      } else if (ev === 'passed') {
        Sfx.win(); sceneTime = 0;
        // Between levels some chapters offer an upgrade first: the level is saved as passed only once one is chosen,
        // so leaving on that screen replays the level rather than losing the choice.
        const run = progression.run, offer = PLAY[chapterId].offerUpgrades;
        const lastLevel = run && run.level >= CHAPTERS.find(c => c.id === chapterId).levels;
        upgradeOffer = run && offer && !lastLevel ? offer() : [];
        if (upgradeOffer.length) scene = 'upgrade';
        else { const passed = progression.levelPassed(); clearedChapter = !!(passed && passed.chapterCompleted); scene = 'cleared'; }
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
  } else if (scene === 'upgrade') {
    // one must be chosen (no way out): it belongs to the run from now on
    const k = sceneTime > 0.4 ? upgradeOffer.findIndex((id, i) => wasPressed('Digit' + (i + 1), 'Numpad' + (i + 1)) || hit(upgradeButton(i))) : -1;
    if (k >= 0 && mode === 'endless') { ENDLESS[chapterId].chooseUpgrade(upgradeOffer[k]); Sfx.select(); mouse.down = false; scene = 'play'; sceneTime = 0; }
    else if (k >= 0) { progression.addUpgrade(upgradeOffer[k]); progression.levelPassed(); clearedChapter = false; Sfx.select(); beginLevel(); }
  } else if (scene === 'cleared') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space', 'Escape') || click)) {
      if (clearedChapter || wasPressed('Escape')) toMenu(); else beginLevel();
    }
  } else if (scene === 'over') {
    if (sceneTime > 0.4 && (wasPressed('Enter', 'Space') || click)) { if (mode === 'endless') startEndless(chapterId); else startChapter(chapterId); }
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

// Enemy art: pixel rows drawn at 2x, centered on the enemy. Letter c is the body color, e the eyes (dark unless set).
const ENEMY_ART = {
  grunt: { c: '#38b764', rows: ['.cccccc.', 'cccccccc', 'ceccccec', 'cccccccc', '.cccccc.', '.c.cc.c.'] },
  runner: { c: '#ef4444', rows: ['.ccc.', 'ccccc', 'cecec', 'ccccc', '.c.c.'] },
  brute: { c: '#8b5cf6', rows: ['..ccccc..', '.ccccccc.', 'cceccccec', 'ccccccccc', 'ccccccccc', '.ccccccc.', '.cc.c.cc.', '.cc...cc.'] },
  splitter: { c: '#ef7d57', rows: ['.cccc.', 'cccccc', 'ceccec', 'cccccc', '.cccc.', '.c..c.'] },
  minirunner: { c: '#ef7d57', rows: ['.cc.', 'cccc', 'cecc', '.cc.'] },
  boss: { c: '#b13e53', e: '#ffcd75', rows: ['c...........c', 'cc..ccccc..cc', '.ccccccccccc.', 'ccccccccccccc', 'ccceeccceeccc', 'ccceeccceeccc', 'ccccccccccccc', 'cccc.....cccc', 'ccccc...ccccc', '.ccccccccccc.', '.ccc.ccc.ccc.', '.cc...c...cc.', '.cc.......cc.'] },
};
const HERO = [
  '..hhhh..',
  '.hssssh.',
  '.sesses.',
  '..ssss..',
  '.bbbbbb.',
  'sbbbbbbs',
  '.bb..bb.',
  '.dd..dd.',
];

const TOWER = [
  '....bb....',
  '...bbbb...',
  '..bbbbbb..',
  '.wwwwwwww.',
  '.w.ww.ww.w',
  '.wwwwwwww.',
  '.wwgwwgww.',
  '.wwwwwwww.',
  '.wwwddwww.',
  '.wwwddwww.',
  'wwwwddwwww',
];
// One Tower Defense art: pixel rows drawn at 2x, centered on the enemy. Letter c is the body color, e the eyes.
const FIELD_ART = {
  goblin: { c: '#38b764', rows: ['c......c', '.cccccc.', 'cceccecc', '.cccccc.', '..cccc..', '.cc..cc.'] },
  wolf:   { c: '#94a3b8', rows: ['c.......', 'cc..cccc', '.ccccecc', '.cccccc.', '.c.c.c.c'] },
  orc:    { c: '#257179', rows: ['..ccccc..', '.ccccccc.', 'ccecccecc', 'ccccccccc', 'c.ccccc.c', '.ccccccc.', '.cc...cc.', '.cc...cc.'] },
  shaman: { c: '#b55dff', rows: ['..cc.y', '.cccc|', 'cecce|', '.cccc|', '.c..c|'] },
  boss:   { c: '#b13e53', rows: ['c...........c', 'cc..ccccc..cc', '.ccccccccccc.', 'ccceecccceecc', 'ccceecccceecc', 'ccccccccccccc', 'cccc.....cccc', '.ccccccccccc.', '.ccc.ccc.ccc.', '.cc...c...cc.', '.cc.......cc.'] },
};

function ring(x, y, r, color) { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2); ctx.stroke(); }

function drawField() {
  ctx.fillStyle = '#5a8f3c'; ctx.fillRect(0, 0, W, H);
  for (let j = 0; j < H; j += 12) for (let i = (j / 12) % 2 * 6; i < W; i += 12) { ctx.fillStyle = '#4f8235'; ctx.fillRect(i, j, 2, 2); }
  // burning ground and falling meteors (a blinking circle where it will land)
  for (const f of sim.fires) { ctx.fillStyle = 'rgba(239,125,87,0.35)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill(); }
  for (const m of sim.meteors) if (Math.floor(m.t * 10) % 2 === 0) ring(m.x, m.y, sim.stats.spells.meteor.radius, '#ef4444');
  const t = sim.tower;
  ctx.fillStyle = '#7c6a4f'; ctx.fillRect(t.x - t.size / 2 - 2, t.y - t.size / 2 - 2, t.size + 4, t.size + 4);   // the ground the enemies stop at
  pixels(TOWER, { b: '#3b5dc9', w: '#c2c3c7', g: '#1a1c2c', d: '#b13e53' }, Math.round(t.x - 15), Math.round(t.y - 22), 3);
  // Salute bar under the Torretta
  ctx.fillStyle = '#000'; ctx.fillRect(t.x - 16, t.y + t.size / 2 + 4, 32, 4);
  ctx.fillStyle = t.hp > t.maxHp * 0.3 ? '#a7f070' : '#ef4444'; ctx.fillRect(t.x - 15, t.y + t.size / 2 + 5, Math.round(30 * Math.max(0, t.hp) / t.maxHp), 2);
  for (const e of sim.enemies) {
    const art = FIELD_ART[e.type], w = art.rows[0].length * 2, h = art.rows.length * 2;
    const x = Math.round(e.x - w / 2), y = Math.round(e.y - h / 2);
    if (e.spawnT > 0) {
      if (Math.floor(e.spawnT * 15) % 2) { ctx.strokeStyle = '#ffcd75'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      continue;
    }
    const body = e.flash > 0 ? '#ffffff' : e.slowT > 0 ? '#73eff7' : art.c;   // white when hit, icy while slowed
    pixels(art.rows, { c: body, e: e.flash > 0 ? '#ffffff' : '#ef4444', y: '#ffcd75', '|': '#7c6a4f' }, x, y, 2);
  }
  for (const b of sim.bolts) { ctx.fillStyle = '#73eff7'; ctx.fillRect(Math.round(b.x - 1.5), Math.round(b.y - 1.5), 3, 3); }
  for (const f of sim.fireballs) { ctx.fillStyle = '#ef7d57'; ctx.fillRect(Math.round(f.x - 3), Math.round(f.y - 3), 6, 6); ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - 1), 2, 2); }
  for (const k of sparks) {
    if (k.ring) { ring(k.x, k.y, k.r, k.color); continue; }
    ctx.strokeStyle = k.color; ctx.beginPath(); ctx.moveTo(k.points[0].x, k.points[0].y);
    for (const q of k.points.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  for (const q of particles) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
  if (scene === 'play') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(mouse.x) - 3, Math.round(mouse.y), 7, 1); ctx.fillRect(Math.round(mouse.x), Math.round(mouse.y) - 3, 1, 7);
  }
  // spell bar: keys 1-5, the selected one highlighted, a dark cover shrinking while a spell recharges
  OneTower.SPELLS.forEach((id, i) => {
    const x = W / 2 - 37 + i * 15, y = H - 14, on = sim.spells.includes(id), sel = sim.selected === id;
    ctx.fillStyle = sel ? '#ffcd75' : '#1a1c2c'; ctx.fillRect(x - 1, y - 1, 14, 13);
    ctx.fillStyle = on ? '#3b5dc9' : '#333c57'; ctx.fillRect(x, y, 12, 11);
    const left = id === 'bolt' ? 0 : Math.max(0, sim.recharge[id]) / sim.stats.spells[id].recharge;
    if (on && left > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, 12, Math.ceil(11 * left)); }
    text(String(i + 1), x + 6, y + 2, on ? '#fff' : '#566c86', 8, 'center');
  });
  text(sim.selected.toUpperCase(), W / 2, H - 25, '#fff', 8, 'center');
}

function drawRoom() {
  const cam = camera(), r = sim.room, T = ClearTheRoom.TILE;
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(0, 0, W, H);
  const i0 = Math.floor(cam.x / T), i1 = Math.ceil((cam.x + W) / T), j0 = Math.floor(cam.y / T), j1 = Math.ceil((cam.y + H) / T);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x = Math.round(i * T - cam.x), y = Math.round(j * T - cam.y);
    if (r.inDoor(x + cam.x + 1, y + cam.y + 1)) {
      if (r.solid[j][i]) { // closed door
        ctx.fillStyle = '#b13e53'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#ef7d57'; ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
        ctx.fillStyle = '#b13e53'; ctx.fillRect(x + 8, y + 2, 4, T - 4);
      } else {            // open door
        ctx.fillStyle = '#0d0e17'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#a7f070'; ctx.fillRect(x + 8, y + 8, 4, 4);
      }
    } else if (r.solid[j] && r.solid[j][i]) {
      ctx.fillStyle = '#566c86'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(x, y, T, 2);
      ctx.fillStyle = '#333c57'; ctx.fillRect(x, y + T - 3, T, 3);
    } else {
      ctx.fillStyle = (i + j) % 2 ? '#29366f' : '#2f3d7c'; ctx.fillRect(x, y, T, T);
    }
  }
  // enemies (blinking outline while they spawn)
  for (const e of sim.enemies) {
    const art = ENEMY_ART[e.type] || ENEMY_ART.grunt, w = art.rows[0].length * 2, h = art.rows.length * 2;
    const x = Math.round(e.x - cam.x - w / 2), y = Math.round(e.y - cam.y - h / 2);
    if (e.spawnT > 0) {
      if (Math.floor(e.spawnT * 15) % 2) { ctx.strokeStyle = '#a7f070'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      continue;
    }
    const warning = e.state === 'warning' && Math.floor(e.timer * 12) % 2;   // the Boss blinks before it charges
    pixels(art.rows, e.flash > 0 || warning ? { c: '#ffffff', e: '#ffffff' } : { c: art.c, e: art.e || '#1a1c2c' }, x, y, 2);
  }
  for (const h of sim.pickups) pixels(HEART, { r: '#ef4444' }, Math.round(h.x - cam.x - 3.5), Math.round(h.y - cam.y - 3), 1);
  for (const b of sim.bullets) { ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(b.x - cam.x - 1.5), Math.round(b.y - cam.y - 1.5), 3, 3); }
  // player (blinks while invulnerable)
  const p = sim.player;
  if (!(p.invuln > 0 && Math.floor(p.invuln * 15) % 2)) pixels(HERO, PAL, Math.round(p.x - cam.x - 8), Math.round(p.y - cam.y - 8), 2);
  for (const q of particles) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x - cam.x), Math.round(q.y - cam.y), 2, 2); }
  // crosshair at the mouse position
  if (scene === 'play') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(mouse.x) - 3, Math.round(mouse.y), 7, 1); ctx.fillRect(Math.round(mouse.x), Math.round(mouse.y) - 3, 1, 7);
  }
  if (sim.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + sim.fade + ')'; ctx.fillRect(0, 0, W, H); }
}

function drawLives() {
  const c = PLAY[chapterId];
  if (c.hearts) for (let i = 0; i < sim.player.maxHp; i++) pixels(HEART, { r: i < sim.player.hp ? '#ef4444' : '#333c57' }, 6 + i * 10, 5);
  if (mode === 'endless') {
    const e = ENDLESS[chapterId];
    text('ONE LIFE', 6, c.hearts ? 16 : 6, '#fff', 8);
    text(e.score(sim) + e.unit, W - 6, 6, '#fff', 8, 'right');
    text('BEST ' + progression.record(chapterId) + e.unit, W - 6, 18, '#ffcd75', 8, 'right');
    return;
  }
  c.hud();
}
const drawLevelCount = () => text('LEVEL ' + hud.level + '/' + CHAPTERS.find(c => c.id === chapterId).levels, W - 6, 6, '#fff', 8, 'right');
function drawLivesAndLevel() {
  text('LIVES', 6, 6, '#fff', 8);
  for (let i = 0; i < Progression.LIVES; i++) pixels(HEART, { r: i < hud.lives ? '#ef4444' : '#333c57' }, 46 + i * 10, 5);
  drawLevelCount();
}
function drawRoomHud() {
  text('LIVES ' + hud.lives, 6, 16, '#fff', 8);
  if (sim.boss) drawBossBar(sim.boss);
  else text('ROOM ' + (sim.roomIndex + 1) + '/' + sim.roomCount, W / 2, 6, '#fff', 8, 'center');
  drawLevelCount();
}
function drawFieldHud() {
  drawLivesAndLevel();
  if (sim.boss) drawBossBar(sim.boss);
  else text('WAVE ' + Math.max(1, sim.waveIndex) + '/' + sim.waveCount, W / 2, 6, '#fff', 8, 'center');
}
function drawRunnerMessages() {
  if (mode === 'chapter') drawProgressBar();
  if (sim.dist < 120) text('SPACE / UP / CLICK TO JUMP', W / 2, 30, '#fff', 8, 'center');
}
function drawRoomMessages() {
  if (sim.cleared) text('ROOM CLEARED - TAKE THE OPEN DOOR', W / 2, 160, '#a7f070', 8, 'center');
  else if (controlsHint > 0) text('WASD MOVE   MOUSE AIM + HOLD CLICK TO SHOOT', W / 2, 160, '#fff', 8, 'center');
}
function drawFieldMessages() {
  if (controlsHint > 0) text(sim.spells.length > 1 ? 'KEYS 1-' + sim.spells.length + ' CHOOSE A SPELL, CLICK TO CAST' : 'AIM WITH THE MOUSE, HOLD CLICK TO CAST THE BOLT', W / 2, 30, '#fff', 8, 'center');
  const next = 'WAVE ' + (sim.waveIndex + 1) + (sim.waveCount < Infinity ? '/' + sim.waveCount : '');
  if (sim.enemies.length === 0 && sim.waveIndex < sim.waveCount && !sim.awaitingUpgrade) text(next, W / 2, 60, '#ffcd75', 16, 'center');
}
function drawBossBar(b) {
  text('BOSS', W / 2, 4, '#ef4444', 8, 'center');
  ctx.fillStyle = '#000'; ctx.fillRect(100, 14, 120, 6);
  ctx.fillStyle = '#b13e53'; ctx.fillRect(101, 15, Math.round(118 * Math.max(0, b.hp) / b.maxHp), 4);
}
function drawProgressBar() {
  const p = Math.min(1, (sim.dist + JumpGuy.PLAYER_X) / sim.def.length);
  ctx.fillStyle = '#000'; ctx.fillRect(90, 18, 140, 4);
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(91, 19, Math.round(138 * p), 2);
}

function chapterEndText() {
  const i = CHAPTERS.findIndex(c => c.id === chapterId), next = CHAPTERS[i + 1];
  return 'CHAPTER ' + (i + 1) + ' COMPLETE' + (next ? ' - CHAPTER ' + (i + 2) + ' UNLOCKED' : '');
}

const upgradeButton = i => ({ x: 50, y: 108 + i * 20, w: 220, h: 16 });
function drawUpgradeChoice() {
  if (mode === 'endless') panel(sim.wavesCleared + ' WAVES HELD!', ['CHOOSE AN UPGRADE (1-' + upgradeOffer.length + '), +' + OneTowerData.endless.heal + ' TOWER HEALTH'], '#a7f070');
  else panel('LEVEL CLEARED!', ['CHOOSE AN UPGRADE (1-' + upgradeOffer.length + ')'], '#a7f070');
  upgradeOffer.forEach((id, i) => button(upgradeButton(i), (i + 1) + '  ' + OneTowerData.upgrades[id].name, '#3b5dc9'));
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
      sub = unlocked ? 'BEST: ' + progression.record(item.id) + ENDLESS[item.id].unit : 'LOCKED - COMPLETE ' + CHAPTERS.find(c => c.id === item.id).name;
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
    text(title, r.x + 8 + ix, r.y + 1, unlocked ? '#fff' : '#94a3b8', 8);
    text(sub, r.x + 8 + ix, r.y + 10, unlocked ? '#a7f070' : '#94a3b8', 8);
  });
  button(BTN.sound, soundLabel());
  button(BTN.reset, 'R  RESET PROGRESS');
}

function draw() {
  canvas.style.cursor = scene === 'play' && PLAY[chapterId].hideCursor ? 'none' : '';
  ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6));
  if (scene === 'menu' || scene === 'confirm') drawMenu();
  else PLAY[chapterId].draw();
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
  if (scene === 'play') PLAY[chapterId].messages();
  else if (scene === 'upgrade') drawUpgradeChoice();
  else if (scene === 'cleared' && clearedChapter && chapterId === CHAPTERS[CHAPTERS.length - 1].id) {
    panel('GtJ COMPLETE!', ['ALL THREE CHAPTERS CLEARED', 'ONE TOWER DEFENSE ENDLESS UNLOCKED', '', 'PRESS ENTER OR CLICK FOR THE MENU'], '#ffcd75');
  } else if (scene === 'cleared') {
    panel(clearedChapter ? 'CHAPTER CLEARED!' : 'LEVEL CLEARED!', [clearedChapter ? chapterEndText() : 'GET READY FOR THE NEXT LEVEL', '', clearedChapter ? 'PRESS ENTER OR CLICK FOR THE MENU' : 'ENTER / CLICK: NEXT LEVEL   ESC: MENU'], '#a7f070');
  } else if (scene === 'over') {
    if (mode === 'endless') {
      const r = endlessResult;
      const e = ENDLESS[chapterId];
      panel(r.newRecord ? 'NEW RECORD!' : 'GAME OVER', [e.result(r.score), r.newRecord ? 'BEST BEATEN' : 'BEST: ' + r.record + e.unit, '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], r.newRecord ? '#ffcd75' : '#ef4444');
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

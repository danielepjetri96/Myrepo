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
// Synthesized sound effects, one family: square and triangle waves with a soft attack, plus short filtered noise for
// blasts and blows. Nothing is played while muted.
const Sfx = {
  ac: null,
  init() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  // A tone gliding from f0 to f1 Hz over dur seconds; the 5 ms attack avoids clicks.
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.ac || settings.muted) return;
    const t = this.ac.currentTime + (delay || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + dur + 0.01);
  },
  // A burst of noise through a low-pass filter falling from f0 to f1 Hz: thuds, puffs and explosions.
  noise(f0, f1, dur, vol, delay) {
    if (!this.ac || settings.muted) return;
    const t = this.ac.currentTime + (delay || 0), n = Math.ceil(this.ac.sampleRate * dur);
    if (!this.noiseBuf || this.noiseBuf.length < n) {
      this.noiseBuf = this.ac.createBuffer(1, Math.ceil(this.ac.sampleRate), this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    src.buffer = this.noiseBuf; f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.ac.destination); src.start(t); src.stop(t + dur + 0.01);
  },
  jump() { this.tone(300, 620, 0.12, 'triangle', 0.09); },
  hit() { this.noise(1800, 200, 0.25, 0.12); this.tone(220, 90, 0.25, 'square', 0.05); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.09, i * 0.1)); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.94, 0.24, 'triangle', 0.1, i * 0.18)); },
  shoot() { this.tone(880, 520, 0.06, 'triangle', 0.035); },
  enemyHit() { this.tone(240, 160, 0.06, 'square', 0.03); },
  kill() { this.noise(2400, 300, 0.16, 0.07); this.tone(330, 110, 0.14, 'triangle', 0.05); },
  heal() { this.tone(660, 990, 0.1, 'triangle', 0.07); this.tone(990, 1320, 0.1, 'triangle', 0.05, 0.08); },
  select() { this.tone(520, 780, 0.06, 'square', 0.04); },
  deny() { this.tone(160, 120, 0.1, 'square', 0.04); },
  warn() { [0, 0.25, 0.5, 0.75].forEach(d => this.tone(880, 880, 0.07, 'triangle', 0.07, d)); },
  summon() { this.tone(130, 390, 0.35, 'triangle', 0.09); this.noise(600, 2000, 0.3, 0.04); },
  boom() { this.noise(1200, 80, 0.4, 0.14); this.tone(110, 40, 0.3, 'triangle', 0.1); },
  // one tone per spell: [from Hz, to Hz, s, wave, volume]
  CAST_TONES: { fireball: [420, 210, 0.18, 'triangle', 0.08], frost: [1320, 660, 0.28, 'triangle', 0.06], lightning: [1600, 220, 0.12, 'square', 0.05], meteor: [1000, 160, 0.8, 'triangle', 0.07] },
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
let chapterId = 'jumpguy';           // chapter being played: jumpguy | cleartheroom | onetowerdefense
let mode = 'chapter';               // chapter | endless
let endlessResult = null;           // { score, record, newRecord } after an endless run
let controlsHint = 0;               // seconds left of the controls hint shown at the start of play
let sim = null, deathTimer = 0, sceneTime = 0, shake = 0, gameOver = false;
let upgradeChoice = null;           // the upgrade on offer, after a level or mid-Endless (see upgradeChoiceOf)
let sparks = [];
const FADE = 0.35;                  // s of the fade from black
let fadeIn = FADE, fadeSim = null;  // seconds left of it, and the run it was last shown for
let mageTrail = { x: 0, y: 0 };      // where the Mago was last drawn in Clear the Room (to tell walking from standing)
let mageCastT = 0;                  // seconds left of the Mago's casting pose in One Tower Defense                    // short-lived lines and rings drawn over the field (lightning, distant strikes, blasts, Frost)

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
// What differs between the Endless modes: how a run is built, its score (metres run, rooms cleared, waves cleared), how the
// score reads, an extra HUD line, and the upgrade offered when a run pauses for one.
const ENDLESS = {
  jumpguy: { create: () => JumpGuy.create(JumpGuy.buildEndless()), score: s => meters(s.dist), unit: ' M', result: n => 'DISTANCE: ' + n + ' M' },
  cleartheroom: { create: () => ClearTheRoom.createEndless({}), score: s => s.roomsCleared, unit: ' ROOMS', result: n => 'ROOMS CLEARED: ' + n },
  onetowerdefense: {
    create: () => OneTower.createEndless({}), score: s => s.wavesCleared, unit: ' WAVES', result: n => 'WAVES CLEARED: ' + n,
    hud: s => text('WAVE ' + Math.max(1, s.waveIndex), W / 2, 6, COLORS.white, 8, 'center'),
    // every few waves the run pauses for an upgrade, taken by the simulation itself, then play resumes
    upgradeChoice: s => upgradeChoiceOf(s.wavesCleared + ' WAVES HELD!', '+' + OneTowerData.endless.heal + ' TOWER HEALTH',
      OneTower.offerUpgrades({ spells: s.spells, taken: s.upgrades }),
      id => { s.chooseUpgrade(id); mouse.down = false; scene = 'play'; sceneTime = 0; }),
  },
};
// Records the score of the Endless run in progress (on game over, or when quitting it).
function submitEndlessScore() {
  const score = ENDLESS[chapterId].score(sim);
  const newRecord = progression.submitEndless(chapterId, score);
  endlessResult = { score, record: progression.record(chapterId), newRecord };
}
// An upgrade on offer: the screen's title and note, the upgrade ids with their names, and what taking one does.
function upgradeChoiceOf(title, note, offer, choose) {
  return { title, note, offer, labels: offer.map(id => OneTowerData.upgrades[id].name), choose };
}
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
const CARD = i => ({ x: 10, y: 40 + i * 20, w: 182, h: 18 });
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
  sound: { x: 10, y: 164, w: 82, h: 13 },
  reset: { x: 98, y: 164, w: 94, h: 13 },
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
  if (pressed && wasGrounded && !sim.grounded) { Sfx.jump(); burst(JumpGuy.PLAYER_X + JumpGuy.PLAYER_W / 2, JumpGuy.GROUND, 'dust', 6); }
  updateParticles();
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
    // after a level: 3 upgrades for the spells of the next one; the level is saved as passed once one is taken
    upgradeChoice: run => upgradeChoiceOf('LEVEL CLEARED!', '',
      OneTower.offerUpgrades({ spells: OneTower.levelSpells(run.level + 1), taken: run.upgrades }),
      id => { progression.addUpgrade(id); progression.levelPassed(); clearedChapter = false; beginLevel(); }),
  },
};

// Plays the sounds and particles queued by the simulation, then ages the controls hint and the particles.
function playFx() {
  mageCastT = Math.max(0, mageCastT - DT);
  for (const f of sim.fx) {
    if (f.type === 'shoot' || f.type === 'cast') mageCastT = 0.2;
    if (f.type === 'shoot') { Sfx.shoot(); burst(f.x, f.y, 'magic', 3); }
    else if (f.type === 'hit') { Sfx.enemyHit(); burst(f.x, f.y, 'spark', 4); }
    else if (f.type === 'kill') { Sfx.kill(); burst(f.x, f.y, 'puff', 8); burst(f.x, f.y, 'spark', 6); }
    else if (f.type === 'hurt') { Sfx.hit(); shake = 0.15; burst(f.x, f.y, 'hurt', 8); }
    else if (f.type === 'heal') { Sfx.heal(); burst(f.x, f.y, 'heal', 8); }
    else if (f.type === 'warn') Sfx.warn();
    else if (f.type === 'summon') { Sfx.summon(); burst(f.x, f.y, 'dark', 16); }
    else if (f.type === 'deny') Sfx.deny();
    else if (f.type === 'cast') { Sfx.cast(f.spell); if (f.spell === 'frost') sparks.push({ ring: true, x: f.x, y: f.y, r: sim.stats.spells.frost.radius, color: COLORS.cyan, life: 0.4 }); }
    else if (f.type === 'blast') { Sfx.boom(); burst(f.x, f.y, 'fire', 18); burst(f.x, f.y, 'puff', 6); sparks.push({ ring: true, x: f.x, y: f.y, r: f.radius, color: COLORS.yellow, life: 0.25 }); }
    else if (f.type === 'lightning') for (const q of f.points) burst(q.x, q.y, 'magic', 5);
    if (f.type === 'lightning') sparks.push({ points: [{ x: f.x, y: f.y }, ...f.points], color: COLORS.white, life: 0.2 });
    else if (f.type === 'zap') sparks.push({ points: [{ x: f.x, y: f.y }, { x: f.tx, y: f.ty }], color: COLORS.purple, life: 0.15 });
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

// Small visual particles (not part of the simulation). Each kind of effect: the colors it fades through (bright to
// dark), how many pixels wide, how fast, how long, and its gravity (negative rises).
let particles = [];
const EFFECTS = {
  spark: { colors: ['white', 'yellow', 'orange'], size: 1, speed: [40, 90], life: 0.25, gravity: 0 },
  puff:  { colors: ['white', 'silver', 'grey'],   size: 2, speed: [15, 45], life: 0.45, gravity: -20 },
  fire:  { colors: ['yellow', 'orange', 'red'],   size: 2, speed: [30, 90], life: 0.45, gravity: 40 },
  heal:  { colors: ['white', 'red'],              size: 1, speed: [5, 20],  life: 0.6,  gravity: -60 },
  magic: { colors: ['white', 'cyan', 'sky'],      size: 1, speed: [20, 50], life: 0.3,  gravity: 0 },
  dark:  { colors: ['red', 'purple', 'black'],    size: 2, speed: [20, 60], life: 0.5,  gravity: 0 },
  hurt:  { colors: ['white', 'red', 'purple'],    size: 1, speed: [40, 80], life: 0.3,  gravity: 60 },
  dust:  { colors: ['white', 'silver'],           size: 1, speed: [10, 30], life: 0.3,  gravity: 30 },
};
function burst(x, y, kind, n) {
  const k = EFFECTS[kind];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]), life = k.life * (0.7 + Math.random() * 0.6);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, kind: k });
  }
}
function updateParticles() {
  for (const p of particles) { p.vy += p.kind.gravity * DT; p.x += p.vx * DT; p.y += p.vy * DT; p.life -= DT; }
  particles = particles.filter(p => p.life > 0);
}
// Draws the particles shifted by (-ox, -oy) (a camera); each one darkens through its colors and shrinks as it fades.
function drawParticles(ox, oy) {
  for (const p of particles) {
    const c = p.kind.colors, k = 1 - p.life / p.max, size = k > 0.6 && p.kind.size > 1 ? p.kind.size - 1 : p.kind.size;
    ctx.fillStyle = COLORS[c[Math.min(c.length - 1, Math.floor(k * c.length))]];
    ctx.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), size, size);
  }
}
function update() {
  const before = scene;
  update1();
  // a new level or run (a new sim), or a return to the menu, comes in from black
  if (sim !== fadeSim || (scene === 'menu' && before !== 'menu' && before !== 'confirm')) { fadeIn = FADE; fadeSim = sim; }
  fadeIn = Math.max(0, fadeIn - DT);
}
function update1() {
  sceneTime += DT;
  if (wasPressed('KeyM')) { settings.toggleMuted(); Sfx.select(); }
  if (shake > 0) shake = Math.max(0, shake - DT);
  if (scene === 'menu') updateMenu();
  else if (scene === 'play') {
    if (wasPressed('Escape', 'KeyP')) { scene = 'pause'; sceneTime = 0; }
    else {
      const ev = PLAY[chapterId].update();
      if (ev === 'upgrade') {   // an Endless pausing for an upgrade (never an empty offer: Torretta health repeats)
        upgradeChoice = ENDLESS[chapterId].upgradeChoice(sim);
        Sfx.win(); scene = 'upgrade'; sceneTime = 0;
      } else if (ev === 'hit') {
        Sfx.hit(); shake = 0.3; deathTimer = 0.9; scene = 'dying'; sceneTime = 0;
        if (mode === 'endless') {
          submitEndlessScore();
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
        const run = progression.run, choice = PLAY[chapterId].upgradeChoice;
        const lastLevel = run && run.level >= CHAPTERS.find(c => c.id === chapterId).levels;
        upgradeChoice = run && choice && !lastLevel ? choice(run) : null;
        if (upgradeChoice && upgradeChoice.offer.length) scene = 'upgrade';
        else { const passed = progression.levelPassed(); clearedChapter = !!(passed && passed.chapterCompleted); scene = 'cleared'; }
      }
    }
  } else if (scene === 'pause') {
    if (hit(BTN.pauseSound)) { settings.toggleMuted(); Sfx.select(); }
    if (wasPressed('Escape', 'KeyP', 'Enter') || hit(BTN.resume)) { scene = 'play'; sceneTime = 0; }
    else if (wasPressed('KeyQ') || hit(BTN.quit)) { if (mode === 'endless') submitEndlessScore(); toMenu(); }   // an Endless run still counts
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
    const offer = upgradeChoice.offer;
    const k = sceneTime > 0.4 ? offer.findIndex((id, i) => wasPressed('Digit' + (i + 1), 'Numpad' + (i + 1)) || hit(upgradeButton(i))) : -1;
    if (k >= 0) { Sfx.select(); upgradeChoice.choose(offer[k]); }
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
// Text in the pixel font, from its top edge, with a dark shadow. size 8 is the font at 1x; 16 doubles it, 20+ triples it.
function text(s, x, y, color, size, align) {
  s = String(s);
  const k = Math.max(1, Math.round((size || 8) / 8)), w = PixelFont.width(s) * k;
  const x0 = Math.round(x) - (align === 'center' ? Math.round(w / 2) : align === 'right' ? w : 0), y0 = Math.round(y);
  for (const [c, d] of [[COLORS.black, k], [color || COLORS.white, 0]]) {   // the shadow first, then the letters
    ctx.fillStyle = c;
    PixelFont.draw(s, (px, py) => ctx.fillRect(x0 + px * k + d, y0 + py * k + d, k, k));
  }
}
// A palette color made see-through, for overlays.
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
// Draws pixel rows (one character per pixel, colors from pal) at scale s; flip mirrors them left to right.
function pixels(rows, pal, x, y, s, flip) {
  s = s || 1;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!pal[ch]) return;
    const col = flip ? row.length - 1 - i : i;
    ctx.fillStyle = pal[ch]; ctx.fillRect(Math.round(x) + col * s, Math.round(y) + j * s, s, s);
  }));
}

// The Mago, the protagonist of the three chapters: 12 x 18 px, facing right (mirrored to face left).
// h hat, H hat shade, s skin, e eye, r robe, R robe shade, w staff, o staff orb, b boots.
const MAGE_W = 12, MAGE_H = 18;
const MAGE_TOP = [
  '.....hh.....',
  '....hhH.....',
  '....hhhH....',
  '...hhhhH....',
  '.hhhhhhhhhh.',
  '...sssss..o.',
  '...sssesoooo',
  '...sssss..o.',
  '..rrrrrrr.w.',
  '.rrrrrrrssw.',
  '.rrrrrrr..w.',
  '.rrrrrrr..w.',
  '.RrrrrrR..w.',
  '.RRRRRRR..w.',
];
// legs and the bottom of the staff, 4 rows under MAGE_TOP
const MAGE_LEGS = {
  stand: ['..bb.bb...w.', '..bb.bb...w.', '..bb.bb...w.', '.bbb.bbb....'],
  run0:  ['..bb..bb..w.', '.bb....bb.w.', 'bb......b.w.', 'b.......bb..'],
  run1:  ['..bbbb....w.', '..bb.bb...w.', '..bb..b...w.', '.bb...bb....'],
  run2:  ['...bbb....w.', '...bbb....w.', '...bb.....w.', '..bbb.......'],
  run3:  ['..bbbb....w.', '.bb..bb...w.', '.b...bb...w.', 'bb....b.....'],
  jump:  ['.bbbbbb...w.', '..bb.bb...w.', '...b..b...w.', '............'],
  fall:  ['..bb.bb...w.', '.bb...bb..w.', '.b.....b..w.', '............'],
};
const MAGE_PAL = { h: COLORS.red, H: COLORS.purple, s: COLORS.yellow, e: COLORS.black, r: COLORS.blue, R: COLORS.navy,
  w: COLORS.orange, o: COLORS.cyan, b: COLORS.black };
const MAGE_HAT = ['....hh', '..hhhH', 'hhhhhhhh'];

// Draws the Mago with its top-left corner at (x, y). pose: idle | run | jump | fall | cast; t: seconds, for animation.
function drawMage(x, y, pose, t, flip) {
  const legs = pose === 'run' ? MAGE_LEGS['run' + (Math.floor(t * 10) % 4)] : MAGE_LEGS[pose] || MAGE_LEGS.stand;
  const pal = pose === 'cast' ? { ...MAGE_PAL, o: COLORS.white }   // the orb flares while casting
    : pose === 'idle' && Math.floor(t * 2) % 2 ? { ...MAGE_PAL, o: COLORS.sky } : MAGE_PAL;   // and pulses at rest
  pixels(MAGE_TOP.concat(legs), pal, x, y, 1, flip);
  if (pose === 'cast') {   // a few sparks around the orb
    ctx.fillStyle = COLORS.yellow;
    const ox = Math.round(x) + (flip ? 1 : 10), oy = Math.round(y) + 6;
    for (const [dx, dy] of [[-2, -2], [2, -2], [0, -3], [3, 1]]) ctx.fillRect(ox + (flip ? -dx : dx), oy + dy, 1, 1);
  }
}

// A magic bolt from the Mago's staff: a bright core with a short trail behind it.
function drawMagicBolt(x, y, vx, vy) {
  const d = Math.hypot(vx, vy) || 1, tx = -vx / d, ty = -vy / d;
  ctx.fillStyle = COLORS.sky; ctx.fillRect(Math.round(x + tx * 4) - 1, Math.round(y + ty * 4) - 1, 2, 2);
  ctx.fillStyle = COLORS.cyan; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  ctx.fillStyle = COLORS.white; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
}

// A Jump Guy obstacle filling exactly its box (x, y, w, h): low and wide ones are logs, tall ones fences,
// the rest rocks or thorn bushes (seed picks which, so the same obstacle always looks the same).
function drawObstacle(x, y, w, h, seed) {
  if (h <= 10) {   // a log lying on the grass
    ctx.fillStyle = COLORS.orange; ctx.fillRect(x, y + 1, w, h - 1);
    ctx.fillStyle = COLORS.red; ctx.fillRect(x, y + h - 2, w, 2); for (let k = 4; k < w - 4; k += 7) ctx.fillRect(x + k, y + 3, 3, 1);
    ctx.fillStyle = COLORS.yellow; ctx.fillRect(x + w - 4, y + 2, 3, h - 4);   // the cut end with its rings
    ctx.fillStyle = COLORS.orange; ctx.fillRect(x + w - 3, y + 4, 1, h - 7);
  } else if (h >= 20) {   // a fence post with its rails
    ctx.fillStyle = COLORS.orange; ctx.fillRect(x + 2, y, 4, h); ctx.fillRect(x + w - 6, y, 4, h);
    ctx.fillRect(x, y + 4, w, 3); ctx.fillRect(x, y + h - 9, w, 3);
    ctx.fillStyle = COLORS.red; ctx.fillRect(x + 5, y, 1, h); ctx.fillRect(x + w - 3, y, 1, h);
    ctx.fillStyle = COLORS.yellow; ctx.fillRect(x + 2, y, 4, 1); ctx.fillRect(x + w - 6, y, 4, 1);
  } else if (hash(seed, 3) < 0.5) {   // a rock
    for (let r = 0; r < h; r++) {
      const inset = r < 3 ? 3 - r : 0;
      ctx.fillStyle = r < 2 ? COLORS.silver : r > h - 3 ? COLORS.slate : COLORS.grey;
      ctx.fillRect(x + inset, y + r, w - inset * 2, 1);
    }
    ctx.fillStyle = COLORS.silver; ctx.fillRect(x + 3, y + 3, 3, 2);
    ctx.fillStyle = COLORS.slate; ctx.fillRect(x + w - 5, y + 5, 1, h - 7);
  } else {   // a thorn bush
    for (let r = 0; r < h; r++) {
      const inset = r < 4 ? 4 - r : 0;
      ctx.fillStyle = r < h / 2 ? COLORS.green : COLORS.teal; ctx.fillRect(x + inset, y + r, w - inset * 2, 1);
    }
    ctx.fillStyle = COLORS.white; for (const [dx, dy] of [[1, 5], [w - 2, 6], [w / 2, 0], [3, h - 4], [w - 4, h - 3]]) ctx.fillRect(x + Math.round(dx), y + dy, 1, 1);   // thorns
    ctx.fillStyle = COLORS.red; ctx.fillRect(x + 4, y + 4, 2, 2); ctx.fillRect(x + w - 6, y + h - 6, 2, 2);   // berries
  }
}

// The Mago's end: a puff of smoke growing and fading for 0.6 s, then only the hat is left on the ground.
// (x, y): the top-left corner the Mago had; t: seconds since the hit.
function drawMageDeath(x, y, t) {
  const cx = Math.round(x) + MAGE_W / 2, cy = Math.round(y) + MAGE_H / 2;
  if (t < 0.6) {
    const k = t / 0.6, r = 3 + k * 9;
    ctx.fillStyle = withAlpha(k < 0.5 ? COLORS.silver : COLORS.grey, 1 - k);
    for (let a = 0; a < 6; a++) {
      const px = cx + Math.cos(a * 1.05 + k * 2) * r * 0.6, py = cy + Math.sin(a * 1.05 + k * 2) * r * 0.5;
      ctx.beginPath(); ctx.arc(Math.round(px), Math.round(py), Math.max(1, r * 0.45), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (t > 0.25) pixels(MAGE_HAT, MAGE_PAL, cx - 4, Math.round(y) + MAGE_H - MAGE_HAT.length);
}

const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];

// A small deterministic noise in [0, 1) for scenery details that must not flicker from frame to frame.
const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };

// The countryside by day. dist scrolls the scenery; castle (0..1) is how close the castle on the horizon is.
function drawBackground(dist, castle) {
  const G = JumpGuy.GROUND, horizon = G - 30;
  // sky in bands, lighter toward the horizon, with the sun
  const bands = [COLORS.blue, COLORS.sky, COLORS.cyan];
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.round(i * horizon / 3), W, Math.ceil(horizon / 3) + 1); });
  ctx.fillStyle = COLORS.white; ctx.beginPath(); ctx.arc(52, 34, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.arc(52, 34, 9, 0, Math.PI * 2); ctx.fill();
  // clouds drifting slowly
  ctx.fillStyle = COLORS.white;
  for (let k = 0; k < 4; k++) {
    const cx = ((k * 97 - dist * 0.05) % (W + 60) + W + 60) % (W + 60) - 30, cy = 14 + (k % 2) * 16 + k * 3;
    ctx.fillRect(Math.round(cx), cy, 22, 4); ctx.fillRect(Math.round(cx) + 4, cy - 3, 12, 3); ctx.fillRect(Math.round(cx) + 3, cy + 4, 16, 2);
  }
  drawCastle(236, horizon + 6, castle);
  // two hill layers with parallax, one pixel wide columns
  for (let layer = 0; layer < 2; layer++) {
    const speed = layer ? 0.5 : 0.2, height = layer ? 22 : 34, base = G - (layer ? 0 : 10);
    const off = (dist * speed) % 160;
    for (let x = 0; x < W; x++) {
      const t = ((x + off + (layer ? 40 : 0)) % 80) / 80, hh = Math.round(Math.sin(t * Math.PI) * height);
      ctx.fillStyle = layer ? COLORS.green : COLORS.teal; ctx.fillRect(x, base - hh, 1, hh);
      if (layer && hh > 2) { ctx.fillStyle = COLORS.lime; ctx.fillRect(x, base - hh, 1, 1); }   // sunlit rim
    }
  }
}

// The castle on the horizon, base centered at (cx, base); near (0..1) makes it bigger as the journey goes on.
function drawCastle(cx, base, near) {
  const k = 1 + Math.round(near * 2);   // its size grows in whole steps so the pixels stay crisp
  const w = 22 * k, h = 12 * k, x0 = Math.round(cx - w / 2);
  ctx.fillStyle = COLORS.grey; ctx.fillRect(x0, base - h, w, h);   // the wall
  for (let x = x0; x < x0 + w; x += 4 * k) ctx.fillRect(x, base - h - 2 * k, 2 * k, 2 * k);   // battlements
  for (const tx of [x0 - 2 * k, x0 + w - 4 * k, x0 + w / 2 - 3 * k]) {   // three towers with pointed roofs
    const th = tx === x0 + w / 2 - 3 * k ? h + 10 * k : h + 6 * k, tw = 6 * k;
    ctx.fillStyle = COLORS.grey; ctx.fillRect(Math.round(tx), base - th, tw, th);
    ctx.fillStyle = COLORS.red;   // the roof narrows to a point
    for (let r = 0; r < 4 * k; r++) { const inset = Math.round((4 * k - 1 - r) * tw / (8 * k)); ctx.fillRect(Math.round(tx) + inset, base - th - 4 * k + r, Math.max(1, tw - 2 * inset), 1); }
    ctx.fillStyle = COLORS.black; ctx.fillRect(Math.round(tx + tw / 2) - Math.ceil(k / 2), base - th + 2 * k, Math.max(1, k), 2 * k);   // a window
  }
  ctx.fillStyle = COLORS.slate; ctx.fillRect(Math.round(cx) - 2 * k, base - 5 * k, 4 * k, 5 * k);   // the gate
}

// The meadow the Mago runs on: grass with tufts scrolling at the run speed.
function drawGround(dist) {
  const g = JumpGuy.GROUND;
  ctx.fillStyle = COLORS.green; ctx.fillRect(0, g, W, H - g);
  ctx.fillStyle = COLORS.lime; ctx.fillRect(0, g, W, 2);
  ctx.fillStyle = COLORS.teal;
  const off = Math.floor(dist) % 24;
  for (let x = -off; x < W; x += 24) {
    ctx.fillRect(x + 3, g + 9, 1, 2); ctx.fillRect(x + 5, g + 8, 1, 3);
    ctx.fillRect(x + 15, g + 22, 1, 2); ctx.fillRect(x + 17, g + 21, 1, 3);
    ctx.fillRect(x + 9, g + 32, 2, 1);
  }
}

// How close the castle is in Jump Guy: the level reached plus the way run in it (and, in the Endless, the metres).
function castleNearness() {
  if (scene === 'menu' || scene === 'confirm') return 0.34;
  if (mode === 'endless') return Math.min(1, sim.dist / 30000);
  const levels = JumpGuyData.levels.length, run = Math.min(1, sim.dist / sim.def.length);
  return Math.min(1, (hud.level - 1 + run) / levels);
}

function drawLevel() {
  const J = JumpGuy;
  drawBackground(sim.dist, castleNearness());
  drawGround(sim.dist);
  const fx = Math.round(sim.def.length - sim.dist);
  if (fx > -30 && fx < W + 20) {
    ctx.fillStyle = COLORS.white; ctx.fillRect(fx, J.GROUND - 56, 2, 56);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
      ctx.fillStyle = (i + j) % 2 ? COLORS.white : COLORS.black; ctx.fillRect(fx + 2 + i * 4, J.GROUND - 56 + j * 4, 4, 4);
    }
    text('FINISH', fx - 8, J.GROUND - 70, COLORS.yellow, 8);
  }
  for (const o of sim.def.obstacles) {
    const ox = Math.round(o.x - sim.dist);
    if (ox > -o.w - 4 && ox < W) drawObstacle(ox, J.GROUND - o.h, o.w, o.h, o.x);
  }
  const mx = J.PLAYER_X + (J.PLAYER_W - MAGE_W) / 2, my = sim.y - MAGE_H;
  if (scene === 'dying') drawMageDeath(mx, my, sceneTime);
  else drawMage(mx, my, sim.grounded ? 'run' : sim.vy < 0 ? 'jump' : 'fall', sim.dist / 90);
  drawParticles(0, 0);
}

// Enemies as single-pixel art, two frames each (facing right), with the colors of their letters and how fast the
// frames alternate. Clear the Room: the castle dungeon; One Tower Defense: the tower's courtyard (its Boss is otdboss).
const CREATURES = {
  grunt: {   // a skeleton
    pal: { w: COLORS.white, s: COLORS.silver, e: COLORS.black }, fps: 4,
    frames: [
      ['...wwww...', '..wwwwww..', '..wewwew..', '..wwwwww..', '...wsws...', '....ww....', '..wwwwww..', '.w.wsws.w.', '.w.wsws.w.', '....ww....', '...wwww...', '...w..w...', '...w..w...', '..ww..ww..'],
      ['...wwww...', '..wwwwww..', '..wewwew..', '..wwwwww..', '...wsws...', '....ww....', '..wwwwww..', 'w..wsws..w', 'w..wsws..w', '....ww....', '...wwww...', '...w..w...', '..w....w..', '.ww....ww.']],
  },
  runner: {   // a bat
    pal: { p: COLORS.purple, b: COLORS.black, r: COLORS.red }, fps: 10,
    frames: [
      ['pp........pp', 'ppp......ppp', '.pppbbbbppp.', '..ppbrrbpp..', '....bbbb....', '.....bb.....'],
      ['............', '....bbbb....', '..ppbrrbpp..', '.pppbbbbppp.', 'ppp......ppp', 'pp........pp']],
  },
  brute: {   // a stone golem
    pal: { g: COLORS.grey, l: COLORS.silver, d: COLORS.slate, e: COLORS.cyan }, fps: 3,
    frames: [
      ['....gggggggg....', '...gllllllllg...', '...glgggggglg...', '...gleeggeelg...', '...gggggggggg...', '.gggggddddggggg.', 'gllggggggggggllg', 'glgggggggggggglg', 'gggg.gggggg.gggg', 'ggd..gggggg..dgg', 'gd...gddddg...dg', '.....gggggg.....', '.....ggddgg.....', '....ggg..ggg....', '....ggg..ggg....', '...dddd..dddd...'],
      ['....gggggggg....', '...gllllllllg...', '...glgggggglg...', '...gleeggeelg...', '...gggggggggg...', '.gggggddddggggg.', 'gllggggggggggllg', 'glgggggggggggglg', 'gggg.gggggg.gggg', 'ggd..gggggg..dgg', 'gd...gddddg...dg', '.....gggggg.....', '.....ggddgg.....', '...ggg....ggg...', '...ggg....ggg...', '..dddd....dddd..']],
  },
  splitter: {   // a slime, splitting into little ones
    pal: { l: COLORS.lime, g: COLORS.green, w: COLORS.white, e: COLORS.black }, fps: 4,
    frames: [
      ['............', '....llll....', '..llllllll..', '.lwwllllllg.', '.lwlelllelg.', 'lllllllllllg', 'lllllllllllg', 'gllllllllggg', '.gggggggggg.'],
      ['............', '............', '...llllll...', '.llwwllllll.', 'llwlelllelgg', 'llllllllllgg', 'lllllllllllg', 'ggllllllllgg', 'gggggggggggg']],
  },
  minirunner: {   // a little slime
    pal: { l: COLORS.lime, g: COLORS.green, e: COLORS.black }, fps: 6,
    frames: [
      ['..llll..', '.llllll.', 'llelelll', 'llllllll', 'gllllllg', '.gggggg.'],
      ['........', '.llllll.', 'llelelll', 'llllllll', 'gllllllg', 'gggggggg']],
  },
  boss: {   // the dark knight
    pal: { a: COLORS.slate, k: COLORS.black, s: COLORS.silver, r: COLORS.red, p: COLORS.purple, y: COLORS.yellow }, fps: 3,
    frames: [
      ['........kkkkkk........', '.......kaaaaaak.......', '......kaaaaaaaak......', '......kakkkkkkak......', '......karrkkrrak......', '......kakkkkkkak......', '.......kaaaaaak.......', '....kkkkaaaaaakkkk....', '...kaaaaaaaaaaaaaak...', '..kaaasaaaaaaaasaaak..', '..kaaasaayyaaasaaak.s.', '.pkaaaaaayyaaaaaakps..', '.ppkaaaaaaaaaaaakpps..', '.ppkkaaaaaaaaaakkpsp..', '.ppp.kaaaaaaaak.ppp...', '.ppp.kaaaaaaaak.ppp...', '.ppp.kaaakkaaak.ppp...', '.pp..kaak..kaak..pp...', '.....kaak..kaak.......', '.....kaak..kaak.......', '....kkkkk..kkkkk......', '....kkkkk..kkkkk......'],
      ['........kkkkkk........', '.......kaaaaaak.......', '......kaaaaaaaak......', '......kakkkkkkak......', '......karrkkrrak......', '......kakkkkkkak......', '.......kaaaaaak.......', '....kkkkaaaaaakkkk....', '...kaaaaaaaaaaaaaak...', '..kaaasaaaaaaaasaaak..', '..kaaasaayyaaasaaak.s.', '.pkaaaaaayyaaaaaakps..', '.ppkaaaaaaaaaaaakpps..', '.ppkkaaaaaaaaaakkpsp..', '.ppp.kaaaaaaaak.ppp...', '.ppp.kaaaaaaaak.ppp...', '.ppp.kaaakkaaak.ppp...', '.pp..kaak..kaak..pp...', '....kaak....kaak......', '....kaak....kaak......', '...kkkkk....kkkkk.....', '...kkkkk....kkkkk.....']],
  },
  goblin: {   // a goblin with a spear
    pal: { g: COLORS.green, d: COLORS.teal, e: COLORS.red, w: COLORS.orange, s: COLORS.silver }, fps: 5,
    frames: [
      ['..........s.', 'g..gggg..ws.', 'gggggggg.w..', '.ggeggeggw..', '.gggggggw...', '..gddddw....', '.ggddddgw...', '..gddddg.w..', '...g..g.....', '..gg..gg....'],
      ['..........s.', 'g..gggg..ws.', 'gggggggg.w..', '.ggeggeggw..', '.gggggggw...', '..gddddw....', '.ggddddgw...', '..gddddg.w..', '...g..g.....', '...gg.gg....']],
  },
  wolf: {   // a grey wolf
    pal: { g: COLORS.grey, l: COLORS.silver, e: COLORS.red, k: COLORS.black }, fps: 8,
    frames: [
      ['..........g.', '.........gg.', 'g.....gggegk', '.gggggggggg.', '.glllllllgg.', '.g.g...g.g..', 'g...g.g...g.'],
      ['..........g.', '.........gg.', 'g.....gggegk', '.gggggggggg.', '.glllllllgg.', '..gg...gg...', '..g.g..g.g..']],
  },
  orc: {   // an orc in armour
    pal: { t: COLORS.teal, a: COLORS.slate, w: COLORS.white, e: COLORS.yellow, k: COLORS.black }, fps: 3,
    frames: [
      ['....tttttt....', '...tttttttt...', '...tettttet...', '...tttttttt...', '...twttttwt...', '....tttttt....', '..aaaaaaaaaa..', '.taaaaaaaaaat.', 'tt.aaaaaaaa.tt', 't..aaaaaaaa..t', '...aaakkaaa...', '...aaa..aaa...', '...ttt..ttt...', '..kkkk..kkkk..'],
      ['....tttttt....', '...tttttttt...', '...tettttet...', '...tttttttt...', '...twttttwt...', '....tttttt....', '..aaaaaaaaaa..', '.taaaaaaaaaat.', 'tt.aaaaaaaa.tt', 't..aaaaaaaa..t', '...aaakkaaa...', '..aaa....aaa..', '..ttt....ttt..', '.kkkk....kkkk.']],
  },
  shaman: {   // a goblin shaman with a skull staff
    pal: { p: COLORS.purple, g: COLORS.green, e: COLORS.yellow, w: COLORS.orange, y: COLORS.white }, fps: 4,
    frames: [
      ['....pp.....y', '...pppp...yy', '..pppppp..w.', '..geggeg..w.', '..gggggg.w..', '.pppppppw...', 'pppppppp....', '.pppppp.....', '.pppppp.....', '.pp..pp.....'],
      ['....pp.....y', '...pppp...yy', '..pppppp..w.', '..geggeg..w.', '..gggggg.w..', '.pppppppw...', 'pppppppp....', '.pppppp.....', '.pppppp.....', '..pp.pp.....']],
  },
  otdboss: {   // the goblin king
    pal: { g: COLORS.green, d: COLORS.teal, y: COLORS.yellow, e: COLORS.red, w: COLORS.white, r: COLORS.red }, fps: 3,
    frames: [
      ['...y.y.y.y...', '...yyyyyyy...', '..ggggggggg..', '.gggeggggegg.', '.ggggggggggg.', 'g.gggwgwggg.g', '..ggggggggg..', '.rrgggggggrr.', 'rrrddddddddrr', 'rrrdddyddddrr', 'rr.ddddddd.rr', 'rr.ddddddd.rr', 'r..ddd.ddd..r', '...gg...gg...', '..ggg...ggg..'],
      ['...y.y.y.y...', '...yyyyyyy...', '..ggggggggg..', '.gggeggggegg.', '.ggggggggggg.', 'g.gggwgwggg.g', '..ggggggggg..', '.rrgggggggrr.', 'rrrddddddddrr', 'rrrdddyddddrr', 'rr.ddddddd.rr', 'rr.ddddddd.rr', 'r..ddd.ddd..r', '..gg.....gg..', '.ggg.....ggg.']],
  },
};

// Draws a creature centered at (x, y). t: seconds (for its frames); flip: facing left; look: '' | 'flash' | 'slow'.
function drawCreature(id, x, y, t, flip, look) {
  const c = CREATURES[id], rows = c.frames[Math.floor(t * c.fps) % c.frames.length];
  const one = col => Object.fromEntries(Object.keys(c.pal).map(k => [k, col]));
  const pal = look === 'flash' ? one(COLORS.white) : look === 'slow' ? { ...one(COLORS.cyan), e: c.pal.e } : c.pal;
  const x0 = Math.round(x - rows[0].length / 2), y0 = Math.round(y - rows.length / 2);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pixels(rows, one(COLORS.black), x0 + dx, y0 + dy, 1, flip);   // a dark outline
  pixels(rows, pal, x0, y0, 1, flip);
}



function ring(x, y, r, color) { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2); ctx.stroke(); }

// The courtyard of the tower at sunset: paving stones in warm light, the sky and the battlements along the top.
function drawCourtyard() {
  ctx.fillStyle = COLORS.slate; ctx.fillRect(0, 0, W, H);
  for (let j = 0; j < H / 12; j++) for (let i = -1; i < W / 16 + 1; i++) {   // paving: offset rows of stones
    const x = i * 16 + (j % 2) * 8, y = j * 12;
    ctx.fillStyle = hash(i, j) < 0.15 ? COLORS.slate : COLORS.grey; ctx.fillRect(x + 1, y + 1, 15, 11);   // light stones: the outlined enemies stand out
    ctx.fillStyle = COLORS.purple; ctx.fillRect(x, y, 16, 1); ctx.fillRect(x, y, 1, 12);
    if (hash(j, i) < 0.12) { ctx.fillStyle = COLORS.green; ctx.fillRect(x + 4, y + 10, 1, 2); ctx.fillRect(x + 6, y + 9, 1, 3); ctx.fillRect(x + 8, y + 10, 1, 2); }
  }
  ctx.fillStyle = withAlpha(COLORS.orange, 0.12); ctx.fillRect(0, 0, W, H);   // the warm light of the sunset
  // the sky over the wall: purple to orange, the sun going down
  [COLORS.purple, COLORS.red, COLORS.orange].forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(0, k * 7, W, 7); });
  ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.arc(250, 21, 8, Math.PI, 0); ctx.fill();
  ctx.fillStyle = COLORS.grey; ctx.fillRect(0, 21, W, 7);   // the wall walk, with its battlements
  for (let x = 0; x < W; x += 10) ctx.fillRect(x, 17, 6, 4);
  ctx.fillStyle = COLORS.slate; ctx.fillRect(0, 27, W, 1);
}

// The Torretta, seen from the front: a stone tower with battlements on top (where the Mago stands), a window and a door.
function drawTowerBody(t) {
  const x0 = Math.round(t.x - 12), top = Math.round(t.y - 13), bottom = Math.round(t.y + 12);
  ctx.fillStyle = withAlpha(COLORS.black, 0.35); ctx.beginPath(); ctx.ellipse(t.x + 3, bottom + 1, 15, 5, 0, 0, Math.PI * 2); ctx.fill();   // its shadow
  ctx.fillStyle = COLORS.silver; ctx.fillRect(x0, top, 24, bottom - top);
  ctx.fillStyle = COLORS.grey;   // bricks
  for (let y = top + 3; y < bottom; y += 4) {
    ctx.fillRect(x0, y, 24, 1);
    for (let x = x0 + ((y - top) % 8 ? 2 : 6); x < x0 + 24; x += 8) ctx.fillRect(x, y - 3, 1, 3);
  }
  ctx.fillStyle = COLORS.grey; ctx.fillRect(x0 + 18, top, 6, bottom - top);   // the shaded side
  ctx.fillStyle = COLORS.silver; for (let x = x0 - 1; x < x0 + 24; x += 6) ctx.fillRect(x, top - 4, 4, 4);   // battlements
  ctx.fillStyle = COLORS.black; ctx.fillRect(x0 + 10, top + 6, 3, 5);   // window
  ctx.fillStyle = COLORS.red; ctx.fillRect(x0 + 8, bottom - 9, 7, 9);   // door
  ctx.fillStyle = COLORS.orange; ctx.fillRect(x0 + 9, bottom - 8, 2, 8); ctx.fillRect(x0 + 12, bottom - 8, 2, 8);
}

function drawField() {
  drawCourtyard();
  // burning ground and falling meteors (a blinking circle where it will land)
  for (const f of sim.fires) { ctx.fillStyle = withAlpha(COLORS.orange, 0.35); ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill(); }
  for (const m of sim.meteors) if (Math.floor(m.t * 10) % 2 === 0) ring(m.x, m.y, sim.stats.spells.meteor.radius, COLORS.red);
  const t = sim.tower;
  drawTowerBody(t);
  const mx = t.x - MAGE_W / 2, my = t.y - 13 - MAGE_H;   // standing on the battlements
  if (scene === 'dying') drawMageDeath(mx, my, sceneTime);
  else drawMage(mx, my, mageCastT > 0 ? 'cast' : 'idle', sceneTime, mouse.x < t.x);
  // Salute bar under the Torretta
  ctx.fillStyle = COLORS.black; ctx.fillRect(t.x - 16, t.y + t.size / 2 + 4, 32, 4);
  ctx.fillStyle = t.hp > t.maxHp * 0.3 ? COLORS.lime : COLORS.red; ctx.fillRect(t.x - 15, t.y + t.size / 2 + 5, Math.round(30 * Math.max(0, t.hp) / t.maxHp), 2);
  for (const e of sim.enemies) {   // they face the Torretta they walk to
    if (e.spawnT > 0) {
      const half = e.size / 2 + 2;
      if (Math.floor(e.spawnT * 15) % 2) { ctx.strokeStyle = COLORS.yellow; ctx.strokeRect(Math.round(e.x - half) + 0.5, Math.round(e.y - half) + 0.5, half * 2 - 1, half * 2 - 1); }
      continue;
    }
    drawCreature(e.type === 'boss' ? 'otdboss' : e.type, e.x, e.y, sceneTime + e.size * 0.13, t.x < e.x, e.flash > 0 ? 'flash' : e.slowT > 0 ? 'slow' : '');
  }
  for (const b of sim.bolts) drawMagicBolt(b.x, b.y, b.vx, b.vy);
  for (const f of sim.fireballs) { ctx.fillStyle = COLORS.orange; ctx.fillRect(Math.round(f.x - 3), Math.round(f.y - 3), 6, 6); ctx.fillStyle = COLORS.yellow; ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - 1), 2, 2); }
  for (const k of sparks) {
    if (k.ring) { ring(k.x, k.y, k.r, k.color); continue; }
    ctx.strokeStyle = k.color; ctx.beginPath(); ctx.moveTo(k.points[0].x, k.points[0].y);
    for (const q of k.points.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  drawParticles(0, 0);
  if (scene === 'play') {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(Math.round(mouse.x) - 3, Math.round(mouse.y), 7, 1); ctx.fillRect(Math.round(mouse.x), Math.round(mouse.y) - 3, 1, 7);
  }
  // spell bar: keys 1-5, the selected one highlighted, a dark cover shrinking while a spell recharges
  OneTower.SPELLS.forEach((id, i) => {
    const x = W / 2 - 37 + i * 15, y = H - 14, on = sim.spells.includes(id), sel = sim.selected === id;
    ctx.fillStyle = sel ? COLORS.yellow : COLORS.black; ctx.fillRect(x - 1, y - 1, 14, 13);
    ctx.fillStyle = on ? COLORS.blue : COLORS.slate; ctx.fillRect(x, y, 12, 11);
    const left = id === 'bolt' ? 0 : Math.max(0, sim.recharge[id]) / sim.stats.spells[id].recharge;
    if (on && left > 0) { ctx.fillStyle = withAlpha(COLORS.black, 0.6); ctx.fillRect(x, y, 12, Math.ceil(11 * left)); }
    text(String(i + 1), x + 6, y + 2, on ? COLORS.white : COLORS.grey, 8, 'center');
  });
  text(sim.selected.toUpperCase(), W / 2, H - 25, COLORS.white, 8, 'center');
}

// Dungeon floor: big stone slabs with dark joints and a few cracks.
function drawFloorTile(x, y, i, j) {
  ctx.fillStyle = COLORS.navy; ctx.fillRect(x, y, 20, 20);
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(x, y + 9, 20, 1); ctx.fillRect(x + (j % 2 ? 4 : 14), y, 1, 9); ctx.fillRect(x + (j % 2 ? 14 : 4), y + 10, 1, 10);
  if (hash(i, j) < 0.3) { ctx.fillStyle = COLORS.slate; ctx.fillRect(x + 6, y + 13, 3, 1); ctx.fillRect(x + 8, y + 14, 2, 1); }
}
// Castle wall: grey bricks lit from the top.
function drawWallTile(x, y, i, j) {
  ctx.fillStyle = COLORS.grey; ctx.fillRect(x, y, 20, 20);
  ctx.fillStyle = COLORS.slate;
  for (let r = 0; r < 4; r++) {
    ctx.fillRect(x, y + r * 5 + 4, 20, 1);
    ctx.fillRect(x + ((r + j) % 2 ? 4 : 14), y + r * 5, 1, 4);
  }
  ctx.fillStyle = COLORS.silver; ctx.fillRect(x, y, 20, 1);
}
// A door of the castle: wooden planks with iron bands while closed, a dark archway once open.
function drawDoorTile(x, y, closed) {
  if (closed) {
    ctx.fillStyle = COLORS.red; ctx.fillRect(x, y, 20, 20);
    ctx.fillStyle = COLORS.orange; for (let k = 0; k < 4; k++) ctx.fillRect(x + 1 + k * 5, y + 1, 3, 18);
    ctx.fillStyle = COLORS.black; ctx.fillRect(x, y + 5, 20, 2); ctx.fillRect(x, y + 13, 20, 2);
  } else {
    ctx.fillStyle = COLORS.black; ctx.fillRect(x, y, 20, 20);
    ctx.fillStyle = COLORS.slate; ctx.fillRect(x, y, 20, 2);
  }
}
// A torch on a wall: a wooden stick, a flickering flame and a warm glow on the floor below. seed varies the flicker.
function drawTorch(x, y, seed) {
  const f = Math.floor(sceneTime * 8 + seed) % 3;
  ctx.fillStyle = withAlpha(COLORS.yellow, 0.07); ctx.beginPath(); ctx.arc(x, y + 10, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.orange; ctx.fillRect(x - 1, y, 2, 5);
  ctx.fillStyle = COLORS.red; ctx.fillRect(x - 2, y - 3 - (f === 1 ? 1 : 0), 4, 3);
  ctx.fillStyle = COLORS.yellow; ctx.fillRect(x - 1, y - 4 - f % 2, 2, 3);
  ctx.fillStyle = COLORS.white; ctx.fillRect(x - (f === 2 ? 1 : 0), y - 2, 1, 1);
}

function drawRoom() {
  const cam = camera(), r = sim.room, T = ClearTheRoom.TILE;
  ctx.fillStyle = COLORS.black; ctx.fillRect(0, 0, W, H);
  const i0 = Math.floor(cam.x / T), i1 = Math.ceil((cam.x + W) / T), j0 = Math.floor(cam.y / T), j1 = Math.ceil((cam.y + H) / T);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x = Math.round(i * T - cam.x), y = Math.round(j * T - cam.y);
    if (r.inDoor(x + cam.x + 1, y + cam.y + 1)) drawDoorTile(x, y, r.solid[j][i]);
    else if (r.solid[j] && r.solid[j][i]) drawWallTile(x, y, i, j);
    else drawFloorTile(x, y, i, j);
  }
  // torches on the walls facing the room, each lighting a patch of floor
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    if (!(r.solid[j] && r.solid[j][i]) || r.inDoor(i * T + 1, j * T + 1) || !(r.solid[j + 1] && r.solid[j + 1][i] === false) || hash(i, j) > 0.22) continue;
    drawTorch(Math.round(i * T - cam.x) + T / 2, Math.round(j * T - cam.y) + T - 6, i + j);
  }
  // enemies (blinking outline while they spawn), facing the Mago
  const p = sim.player;
  for (const e of sim.enemies) {
    const x = e.x - cam.x, y = e.y - cam.y, half = e.size / 2 + 2;
    if (e.spawnT > 0) {
      if (Math.floor(e.spawnT * 15) % 2) { ctx.strokeStyle = COLORS.lime; ctx.strokeRect(Math.round(x - half) + 0.5, Math.round(y - half) + 0.5, half * 2 - 1, half * 2 - 1); }
      continue;
    }
    const warning = e.state === 'warning' && Math.floor(e.timer * 12) % 2;   // the Boss blinks before it charges
    drawCreature(e.type, x, y, sceneTime + e.size * 0.13, p.x < e.x, e.flash > 0 || warning ? 'flash' : '');
  }
  for (const h of sim.pickups) pixels(HEART, { r: COLORS.red }, Math.round(h.x - cam.x - 3.5), Math.round(h.y - cam.y - 3), 1);
  for (const b of sim.bullets) drawMagicBolt(b.x - cam.x, b.y - cam.y, b.vx, b.vy);
  // player (blinks while invulnerable)
  const mx = p.x - cam.x - MAGE_W / 2, my = p.y - cam.y + p.size / 2 + 2 - MAGE_H;   // feet just under the hitbox
  if (scene === 'dying') drawMageDeath(mx, my, sceneTime);
  else if (!(p.invuln > 0 && Math.floor(p.invuln * 15) % 2)) {   // blinks while invulnerable
    const moving = Math.hypot(p.x - mageTrail.x, p.y - mageTrail.y) > 0.05;
    drawMage(mx, my, mouse.down && scene === 'play' ? 'cast' : moving ? 'run' : 'idle', sceneTime * 0.8, p.dirX < 0);
  }
  mageTrail = { x: p.x, y: p.y };
  drawParticles(cam.x, cam.y);
  // crosshair at the mouse position
  if (scene === 'play') {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(Math.round(mouse.x) - 3, Math.round(mouse.y), 7, 1); ctx.fillRect(Math.round(mouse.x), Math.round(mouse.y) - 3, 1, 7);
  }
  if (sim.fade > 0) { ctx.fillStyle = withAlpha(COLORS.black, sim.fade); ctx.fillRect(0, 0, W, H); }
}

function drawLives() {
  const c = PLAY[chapterId];
  if (c.hearts) for (let i = 0; i < sim.player.maxHp; i++) hudHeart(6 + i * 10, 5, i < sim.player.hp);
  if (mode === 'endless') {
    const e = ENDLESS[chapterId];
    text('ONE LIFE', 6, c.hearts ? 16 : 6, COLORS.white, 8);
    text(e.score(sim) + e.unit, W - 6, 6, COLORS.white, 8, 'right');
    text('BEST ' + progression.record(chapterId) + e.unit, W - 6, 18, COLORS.yellow, 8, 'right');
    if (e.hud) e.hud(sim);
    return;
  }
  c.hud();
}
// A heart of the HUD, full or empty, with a dark shadow like the text so it reads on any background.
function hudHeart(x, y, full) {
  pixels(HEART, { r: COLORS.black }, x + 1, y + 1);
  pixels(HEART, { r: full ? COLORS.red : COLORS.slate }, x, y);
}
const drawLevelCount = () => text('LEVEL ' + hud.level + '/' + CHAPTERS.find(c => c.id === chapterId).levels, W - 6, 6, COLORS.white, 8, 'right');
function drawLivesAndLevel() {
  text('LIVES', 6, 6, COLORS.white, 8);
  for (let i = 0; i < Progression.LIVES; i++) hudHeart(46 + i * 10, 5, i < hud.lives);
  drawLevelCount();
}
function drawRoomHud() {
  text('LIVES ' + hud.lives, 6, 16, COLORS.white, 8);
  if (sim.boss) drawBossBar(sim.boss);
  else text('ROOM ' + (sim.roomIndex + 1) + '/' + sim.roomCount, W / 2, 6, COLORS.white, 8, 'center');
  drawLevelCount();
}
function drawFieldHud() {
  drawLivesAndLevel();
  if (sim.boss) drawBossBar(sim.boss);
  else text('WAVE ' + Math.max(1, sim.waveIndex) + '/' + sim.waveCount, W / 2, 6, COLORS.white, 8, 'center');
}
function drawRunnerMessages() {
  if (mode === 'chapter') drawProgressBar();
  if (sim.dist < 120) text('SPACE / UP / CLICK TO JUMP', W / 2, 30, COLORS.white, 8, 'center');
}
function drawRoomMessages() {
  if (sim.cleared) text('ROOM CLEARED - TAKE THE OPEN DOOR', W / 2, 160, COLORS.lime, 8, 'center');
  else if (controlsHint > 0) text('WASD MOVE   MOUSE AIM + HOLD CLICK TO SHOOT', W / 2, 160, COLORS.white, 8, 'center');
}
function drawFieldMessages() {
  if (controlsHint > 0) text(sim.spells.length > 1 ? 'KEYS 1-' + sim.spells.length + ' CHOOSE A SPELL, CLICK TO CAST' : 'AIM WITH THE MOUSE, HOLD CLICK TO CAST THE BOLT', W / 2, 30, COLORS.white, 8, 'center');
  const next = 'WAVE ' + (sim.waveIndex + 1) + (sim.waveCount < Infinity ? '/' + sim.waveCount : '');
  if (sim.enemies.length === 0 && sim.waveIndex < sim.waveCount && !sim.awaitingUpgrade) text(next, W / 2, 60, COLORS.yellow, 16, 'center');
}
function drawBossBar(b) {
  text('BOSS', W / 2, 4, COLORS.red, 8, 'center');
  ctx.fillStyle = COLORS.black; ctx.fillRect(100, 14, 120, 6);
  ctx.fillStyle = COLORS.red; ctx.fillRect(101, 15, Math.round(118 * Math.max(0, b.hp) / b.maxHp), 4);
}
function drawProgressBar() {
  const p = Math.min(1, (sim.dist + JumpGuy.PLAYER_X) / sim.def.length);
  ctx.fillStyle = COLORS.black; ctx.fillRect(90, 18, 140, 4);
  ctx.fillStyle = COLORS.yellow; ctx.fillRect(91, 19, Math.round(138 * p), 2);
}

function chapterEndText() {
  const i = CHAPTERS.findIndex(c => c.id === chapterId), next = CHAPTERS[i + 1];
  return 'CHAPTER ' + (i + 1) + ' COMPLETE' + (next ? ' - CHAPTER ' + (i + 2) + ' UNLOCKED' : '');
}

const upgradeButton = i => ({ x: 50, y: 108 + i * 20, w: 220, h: 16 });
function drawUpgradeChoice() {
  const c = upgradeChoice;
  panel(c.title, ['CHOOSE AN UPGRADE (1-' + c.offer.length + ')' + (c.note ? ', ' + c.note : '')], COLORS.lime);
  c.labels.forEach((name, i) => button(upgradeButton(i), (i + 1) + '  ' + name, COLORS.blue));
}

// A slab of castle stone: dark outline, light top edge, shaded bottom, faint bricks. fill: the stone's color.
function stone(x, y, w, h, fill) {
  ctx.fillStyle = COLORS.black; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = withAlpha(COLORS.black, 0.18);
  for (let r = y + 6; r < y + h - 2; r += 7) {
    ctx.fillRect(x + 1, r, w - 2, 1);
    for (let c = x + ((r - y) % 14 ? 9 : 20); c < x + w - 2; c += 22) ctx.fillRect(c, r - 6, 1, 6);
  }
  ctx.fillStyle = withAlpha(COLORS.white, 0.25); ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = withAlpha(COLORS.black, 0.35); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}

// A screen over the game: the game darkened behind a stone panel with a title and lines of text.
function panel(title, lines, color) {
  ctx.fillStyle = withAlpha(COLORS.black, 0.5); ctx.fillRect(0, 0, W, H);
  stone(24, 20, W - 48, H - 32, COLORS.slate);
  const big = PixelFont.width(title) * 3 <= W - 64;   // a long title is drawn smaller to fit the panel
  text(title, W / 2, big ? 34 : 38, color, big ? 20 : 16, 'center');
  lines.forEach((l, i) => text(l, W / 2, 96 + i * 14, COLORS.white, 8, 'center'));
}

function button(r, label, color) {
  stone(r.x, r.y, r.w, r.h, color || COLORS.grey);
  text(label, r.x + r.w / 2, r.y + Math.floor((r.h - 7) / 2), COLORS.white, 8, 'center');
}

// The menu: the journey (the Mago running toward the castle across the countryside) behind a column of stone cards.
function drawMenu() {
  const run = sceneTime * 40;
  drawBackground(run, 0.55); drawGround(run);
  drawMage(232, JumpGuy.GROUND - MAGE_H, 'run', run / 90);
  text('GtJ', 252, 6, COLORS.yellow, 26, 'center');
  text('A JOURNEY IN 3 CHAPTERS', 252, 30, COLORS.white, 8, 'center');
  text('CHOOSE WHAT TO PLAY', 12, 28, COLORS.white, 8);
  MENU.forEach((item, i) => {
    const r = CARD(i);
    let title, sub, unlocked;
    if (item.kind === 'endless') {
      unlocked = progression.isEndlessUnlocked(item.id);
      title = item.name;
      sub = unlocked ? 'BEST: ' + progression.record(item.id) + ENDLESS[item.id].unit : 'LOCKED - FINISH CHAPTER ' + (CHAPTERS.findIndex(c => c.id === item.id) + 1);
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
    const selected = i === menuIndex && unlocked;
    stone(r.x, r.y, r.w, r.h, !unlocked ? COLORS.slate : selected ? COLORS.blue : COLORS.grey);
    if (selected) { ctx.strokeStyle = COLORS.yellow; ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3); }
    const ix = item.indent || 0;
    text(title, r.x + 6 + ix, r.y + 2, unlocked ? COLORS.white : COLORS.silver, 8);
    text(sub, r.x + 6 + ix, r.y + 10, unlocked ? COLORS.lime : COLORS.silver, 8);
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
    panel('RESET PROGRESS?', ['ALL UNLOCKS, RECORDS AND SAVED LEVELS', 'WILL BE ERASED. SOUND SETTING IS KEPT.'], COLORS.red);
    button(BTN.yes, 'Y  YES, RESET', COLORS.red); button(BTN.no, 'N  CANCEL');
    return;
  }
  if (scene === 'menu') return;
  drawLives();
  if (scene === 'pause') {
    panel('PAUSED', [], COLORS.yellow);
    button(BTN.resume, 'P  RESUME', COLORS.blue); button(BTN.pauseSound, soundLabel()); button(BTN.quit, 'Q  QUIT TO MENU');
    return;
  }
  if (scene === 'play') PLAY[chapterId].messages();
  else if (scene === 'upgrade') drawUpgradeChoice();
  else if (scene === 'cleared' && clearedChapter && chapterId === CHAPTERS[CHAPTERS.length - 1].id) {
    panel('GtJ COMPLETE!', ['ALL THREE CHAPTERS CLEARED', 'ONE TOWER DEFENSE ENDLESS UNLOCKED', '', 'PRESS ENTER OR CLICK FOR THE MENU'], COLORS.yellow);
  } else if (scene === 'cleared') {
    panel(clearedChapter ? 'CHAPTER CLEARED!' : 'LEVEL CLEARED!', [clearedChapter ? chapterEndText() : 'GET READY FOR THE NEXT LEVEL', '', clearedChapter ? 'PRESS ENTER OR CLICK FOR THE MENU' : 'ENTER / CLICK: NEXT LEVEL   ESC: MENU'], COLORS.lime);
  } else if (scene === 'over') {
    if (mode === 'endless') {
      const r = endlessResult;
      const e = ENDLESS[chapterId];
      panel(r.newRecord ? 'NEW RECORD!' : 'GAME OVER', [e.result(r.score), r.newRecord ? 'BEST BEATEN' : 'BEST: ' + r.record + e.unit, '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], r.newRecord ? COLORS.yellow : COLORS.red);
    } else {
      panel('GAME OVER', ['NO LIVES LEFT', 'YOU RESTART FROM LEVEL 1', '', 'ENTER / CLICK: TRY AGAIN   ESC: MENU'], COLORS.red);
    }
  }
}

// The fade from black, over everything.
function drawFade() {
  if (fadeIn > 0) { ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0); ctx.fillStyle = withAlpha(COLORS.black, fadeIn / FADE); ctx.fillRect(0, 0, W, H); }
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
  drawFade();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keyboard + mouse state. Mouse position is converted to game (320x180) coordinates.
const Input = {
  keys: {},
  pressed: {},
  mouse: { x: 160, y: 90, down: false, clicked: false },

  init(canvas) {
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    addEventListener('keydown', e => {
      if (block.includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / r.width * W;
      this.mouse.y = (e.clientY - r.top) / r.height * H;
    });
    addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      this.mouse.down = true;
      this.mouse.clicked = true;
      e.preventDefault();
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    this.initTouch(canvas);
  },

  // Touch: left half = floating move stick, right half = aim + shoot at the finger.
  // Outside of gameplay a tap acts as a mouse click. Game sets `playing` / `showButtons`.
  initTouch(canvas) {
    const toGame = t => {
      const r = canvas.getBoundingClientRect();
      return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H };
    };
    const hitButton = p => this.touchButtons.find(b => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h);
    const R = 22; // stick radius in game pixels

    const start = t => {
      const p = toGame(t);
      this.touchMode = true;
      const btn = this.showButtons && hitButton(p);
      if (btn) { this.pressed[btn.key] = true; return; }
      if (!this.playing) {
        this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.clicked = true;
      } else if (this.stickId === null && p.x < W / 2) {
        this.stickId = t.identifier;
        this.stickBase = { ...p };
        this.stickKnob = { ...p };
      } else if (this.aimId === null) {
        this.aimId = t.identifier;
        this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.down = true;
      }
    };
    const move = t => {
      const p = toGame(t);
      if (t.identifier === this.stickId) {
        let dx = p.x - this.stickBase.x, dy = p.y - this.stickBase.y;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this.stickKnob = { x: this.stickBase.x + dx, y: this.stickBase.y + dy };
        const mag = Math.min(1, len / R);
        this.stick = mag < 0.2 ? { x: 0, y: 0 } : { x: dx / Math.max(len, 1e-6) * mag, y: dy / Math.max(len, 1e-6) * mag };
      } else if (t.identifier === this.aimId) {
        this.mouse.x = p.x; this.mouse.y = p.y;
      }
    };
    const end = t => {
      if (t.identifier === this.stickId) { this.stickId = null; this.stickBase = null; this.stick = { x: 0, y: 0 }; }
      if (t.identifier === this.aimId) { this.aimId = null; this.mouse.down = false; }
    };
    const handler = fn => e => {
      e.preventDefault();
      for (const t of e.changedTouches) fn(t);
    };
    const opts = { passive: false };
    addEventListener('touchstart', handler(start), opts);
    addEventListener('touchmove', handler(move), opts);
    addEventListener('touchend', handler(end), opts);
    addEventListener('touchcancel', handler(end), opts);
  },

  touchMode: false,
  playing: false,
  showButtons: false,
  stick: { x: 0, y: 0 }, stickId: null, stickBase: null, stickKnob: null,
  aimId: null,
  touchButtons: [
    { x: 274, y: 154, w: 18, h: 18, key: 'KeyM', label: 'M' },
    { x: 296, y: 154, w: 18, h: 18, key: 'KeyP', label: 'II' },
  ],

  // Called after every update step so "pressed"/"clicked" fire only once.
  endFrame() {
    this.pressed = {};
    this.mouse.clicked = false;
  },
};

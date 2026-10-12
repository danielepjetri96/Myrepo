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
  },

  // Called after every update step so "pressed"/"clicked" fire only once.
  endFrame() {
    this.pressed = {};
    this.mouse.clicked = false;
  },
};

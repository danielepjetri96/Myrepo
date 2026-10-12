// Tiny chiptune sound effects generated with WebAudio (no audio files).
const Sfx = {
  ctx: null,
  muted: false,
  noiseBuf: null,

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone(freq, dur, { type = 'square', vol = 0.08, slide = 0, delay = 0 } = {}) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.1, delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    if (!this.noiseBuf) {
      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur);
  },

  shoot()      { this.tone(700, 0.07, { vol: 0.035, slide: -450 }); },
  hit()        { this.noise(0.04, 0.05); },
  kill()       { this.noise(0.12, 0.09); this.tone(220, 0.12, { type: 'sawtooth', vol: 0.04, slide: -150 }); },
  hurt()       { this.tone(160, 0.25, { vol: 0.1, slide: -90 }); this.noise(0.15, 0.08); },
  pickup()     { this.tone(660, 0.07, { vol: 0.06 }); this.tone(990, 0.1, { vol: 0.06, delay: 0.07 }); },
  enemyShoot() { this.tone(300, 0.1, { type: 'triangle', vol: 0.06, slide: -120 }); },
  select()     { this.tone(520, 0.06, { vol: 0.05 }); },
  levelUp()    { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, { vol: 0.06, delay: i * 0.09 })); },
  gameOver()   { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.08, delay: i * 0.15 })); },
};

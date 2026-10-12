// Progress saved in localStorage: best score, furthest level, and the current run
// (snapshot taken at the start of each level so you can continue / retry).
const Save = {
  KEY: 'pixelSiege.v1',
  data: { best: 0, maxLevel: 1, run: null, muted: false },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* storage unavailable: play without saving */ }
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
  },
};

// Pure progression rules for GtJ: chapters, levels, lives, upgrades of a run, unlocks, endless records and saving.
// No canvas, no DOM: storage and chapter data are injected so it can be tested on its own.
const Progression = {
  KEY: 'gtj.v1',
  LIVES: 3,

  create({ storage, chapters }) {
    const indexOf = id => chapters.findIndex(c => c.id === id);
    const chapterById = id => chapters[indexOf(id)];
    const state = { run: null, completed: [], records: {} };

    function save() {
      try { storage.setItem(Progression.KEY, JSON.stringify({ v: 1, ...state })); } catch (e) { /* storage unavailable: play without saving */ }
    }

    // Reads the saved game, keeping only what is coherent: anything odd falls back to the initial state.
    function load() {
      let raw;
      try { raw = JSON.parse(storage.getItem(Progression.KEY)); } catch (e) { return; }
      if (!raw || typeof raw !== 'object' || raw.v !== 1) return;

      const listed = Array.isArray(raw.completed) ? raw.completed : [];
      for (const c of chapters) {
        if (!listed.includes(c.id)) break; // a chapter only counts if every earlier one is completed
        state.completed.push(c.id);
      }

      const records = raw.records && typeof raw.records === 'object' ? raw.records : {};
      for (const id of state.completed) {
        const r = records[id];
        if (Number.isFinite(r) && r > 0) state.records[id] = r;
      }

      const run = raw.run;
      const chapter = run && chapterById(run.chapter);
      if (chapter && api.isChapterUnlocked(chapter.id)
          && Number.isInteger(run.level) && run.level >= 1 && run.level <= chapter.levels
          && Number.isInteger(run.lives) && run.lives >= 1 && run.lives <= Progression.LIVES) {
        const ups = Array.isArray(run.upgrades) && run.upgrades.every(u => typeof u === 'string') ? run.upgrades : [];
        state.run = { chapter: chapter.id, level: run.level, lives: run.lives, upgrades: ups.slice() };
      }
    }

    const api = {
      get run() { return state.run && { ...state.run, upgrades: state.run.upgrades.slice() }; },

      isChapterCompleted(id) {
        return state.completed.includes(id);
      },

      isChapterUnlocked(id) {
        const i = indexOf(id);
        return i === 0 || (i > 0 && api.isChapterCompleted(chapters[i - 1].id));
      },

      // Endless is the reward for completing a chapter.
      isEndlessUnlocked(id) {
        return api.isChapterCompleted(id);
      },

      startChapter(id) {
        if (!api.isChapterUnlocked(id)) return false;
        state.run = { chapter: id, level: 1, lives: Progression.LIVES, upgrades: [] };
        save();
        return true;
      },

      // Upgrades (Potenziamenti) belong to the run: kept across levels and lost lives, lost at game over.
      addUpgrade(id) {
        if (!state.run) return false;
        state.run.upgrades.push(id);
        save();
        return true;
      },

      // Returns null when there is no active run (e.g. a chapter signalling twice).
      levelPassed() {
        const run = state.run;
        if (!run) return null;
        const chapter = chapterById(run.chapter);
        if (run.level < chapter.levels) {
          run.level++;
          save();
          return { chapterCompleted: false };
        }
        if (!api.isChapterCompleted(run.chapter)) state.completed.push(run.chapter);
        state.run = null;
        save();
        return { chapterCompleted: true };
      },

      // A lost life restarts the level; the last one restarts the whole chapter.
      lifeLost() {
        const run = state.run;
        if (!run) return null;
        let gameOver = false;
        if (--run.lives <= 0) {
          run.level = 1;
          run.lives = Progression.LIVES;
          run.upgrades = [];
          gameOver = true;
        }
        save();
        return { gameOver };
      },

      record(id) {
        return state.records[id] || 0;
      },

      // Returns true when the score is a new record.
      submitEndless(id, score) {
        if (!Number.isFinite(score) || !api.isEndlessUnlocked(id) || score <= api.record(id)) return false;
        state.records[id] = score;
        save();
        return true;
      },

      reset() {
        state.run = null;
        state.completed = [];
        state.records = {};
        try { storage.removeItem(Progression.KEY); } catch (e) {}
      },
    };

    load();
    return api;
  },
};

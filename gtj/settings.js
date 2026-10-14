// Player settings (sound on/off) remembered across reloads. Storage is injected so it can be tested on its own.
const Settings = {
  KEY: 'gtj.settings.v1',

  create({ storage }) {
    let muted = false;
    try {
      const raw = JSON.parse(storage.getItem(Settings.KEY));
      if (raw && raw.muted === true) muted = true;
    } catch (e) { /* unreadable: defaults */ }

    function save() {
      try { storage.setItem(Settings.KEY, JSON.stringify({ muted })); } catch (e) { /* play without saving */ }
    }

    return {
      get muted() { return muted; },
      toggleMuted() { muted = !muted; save(); return muted; },
    };
  },
};

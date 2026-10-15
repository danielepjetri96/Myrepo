# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A scratch folder of small browser games with no build system, package manager, linter, or tests.

## Git workflow

Commit and push to GitHub regularly as work progresses, so the state of the project and the work done is never lost.

- Commit after each meaningful unit of work (a feature, a fix, a refactor), not in big batches at the end of a session.
- Write clean, descriptive commit messages: a short imperative summary line (e.g. `Add combo multiplier to HUD`), with a body explaining the why when it isn't obvious.
- Push to the GitHub remote after committing, so the remote always reflects the latest work.
- If the folder is not yet a git repository or has no GitHub remote configured, set that up (or ask the user for the repo URL) before continuing.

- `tic-tac-toe.html` — standalone single-file game (inline `<script>`).
- `gtj/` — GtJ, three chapters unlocked in sequence; open `gtj/index.html` (game) or `gtj/tests.html` (tests). `progression.js` (pure rules), `pixelfont.js` (pixel font glyphs and measuring) and `jumpguy-data.js` (editable levels and obstacle patterns), `settings.js` (sound preference), `cleartheroom-data.js` + `cleartheroom.js` (Clear the Room data and pure simulation), `onetower-data.js` + `onetower.js` (One Tower Defense data and pure simulation), `jumpguy.js` (pure runner simulation and level builder) are tested; `palette.js` holds the Sweetie 16 colors every drawing must use; `game.js` is the canvas shell. Independent from `shooter/`.
- `shooter/` — "Pixel Siege", a retro top-down canvas shooter (vanilla JS, no dependencies besides the Press Start 2P Google Font link).

To run either, open the HTML file in a browser (`shooter/index.html` works from `file://`; no server needed).

## Shooter architecture

`index.html` loads plain `<script>` tags in a fixed order, and all modules share the global scope (no ES modules/imports). Load order matters: `audio` → `save` → `input` → `sprites` → `levels` → `entities` → `game`. Anything new must be added to `index.html` in a position after its dependencies.

- `game.js` — the `Game` singleton: a state machine (`title`, `play`, `pause`, `clear`, `over`, `victory`), plus the fixed-timestep loop (60 Hz update, render per rAF), canvas scaling, procedural background generation (`buildBackground`, seeded by `mulberry32`), HUD, menus, and upgrades. It is also the boot script (runs at the bottom of the file). Buttons for each state are rebuilt in `makeButtons()` on every `setState`; they support both mouse hit-testing and keyboard shortcuts via `key`.
- `entities.js` — constants (`W=320`, `H=180` logical resolution, `ARENA` bounds), helpers (`rand`, `pick`, `touching`, `clamp`) and classes `Player`, `Bullet`, `Enemy` (types in `ENEMY_TYPES`), `Particle`, `FloatText`, `Pickup`. Entities take the `Game` object as an argument in `update(dt, game)`; they mark themselves `dead` and `Game` filters them each frame.
- `levels.js` — `LEVELS` data (kills needed, spawn rate, enemy `mix` weights, palettes). `getLevel(n)` synthesizes harder "endless" levels past the last defined one (scaling `hpMul`/`speedMul`), reusing earlier looks.
- `sprites.js` — sprites are defined as string-row pixel art with a `PALETTE`, compiled by `makeSprite` into the `SPR` table; also `drawSprite` and the bitmap `drawText`.
- `save.js` — `Save` persists to `localStorage` (key `pixelSiege.v1`): best score, max level, muted flag, and a per-level run snapshot (`level`, `score`, `hp`, `stats`) taken in `Game.snapshot()` at the start of each level — used by Continue/Retry.
- `input.js` — `Input.keys` (held), `Input.pressed` / `mouse.clicked` (one-shot, cleared by `Input.endFrame()` after each update step), mouse coordinates already converted to logical 320x180 space.
- `audio.js` — `Sfx`, synthesized sound effects (initialized lazily on first user input).

Conventions: all drawing uses logical 320x180 coordinates; `resize()` scales the canvas (integer scale when possible, `VIEW_SCALE` includes devicePixelRatio) and `Game.draw()` sets the transform each frame. Player progression is the `Game.stats` object (seeded from `BASE_STATS`) mutated by entries in `UPGRADES`.

## Agent skills

### Issue tracker

Le issue sono GitHub Issues di danielepjetri96/Myrepo, gestite con la CLI `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Vocabolario di default: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: un `CONTEXT.md` e `docs/adr/` nella root. See `docs/agents/domain.md`.

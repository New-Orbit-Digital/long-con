# Long Con

A 1980s boiler-room short-con incremental game. Vanilla HTML, CSS and JavaScript (ES modules), no build step, no dependencies.

Unit 1 (this state of the repo): the sim core. `src/tuning.js` and `src/sim.js` are real; `index.html`, `style.css`, `src/content.js`, `src/marks.js`, `src/ui.js` and `src/main.js` are stubs filled in by later units.

## Run

Serve the folder with any static server (ES modules don't load from `file://`):

```
npx serve .        # or: python3 -m http.server
```

Then open the printed URL. Until Unit 4 lands, the page is a placeholder.

## Test

Requires Node 18+.

```
npm test           # runs: node --test
```

## Tune

Every tunable lives in `src/tuning.js` as one `TUNING` object. `sim.js` reads only from the object passed to `createRun(seed, tuning)`, so edit a value, save, and re-run the tests or reload the page. Rates are per second; the sim steps in fixed `tickSeconds` increments.

## Sim API (`src/sim.js`)

- `createRun(seed, tuning)` returns the initial state: player (`cash`, `heat`, `shills`, `intel`, `log`, `clock`) and a board of `boardSize` empty slots, which fill with cold marks on the first tick.
- `tick(state, dtSeconds)` accumulates real elapsed time and steps in `tickSeconds`.
- `cashOut(state, markId)` banks Take, marks the mark `cashed`, frees the slot, and adds `heatPerLateCashout` if the mark was `wary` or `about-to-bolt`.
- `pitch(state, markId, pitchIndex)` is a minimal activation verb so cold marks can be worked; Unit 3 owns the full verb set.
- When `heat >= heatCeiling`, `state.ended` is `true` and `state.summary` holds `{ takeBanked, cashed, bolted, seconds, seed }`.
- The RNG is mulberry32 with its state on `state.rng`, so a run replays from its seed.

## Verification

- **Date:** 2026-11-04
- **Command:** `npm test` (`node --test`), Node v22.23.4
- **Result:** PASS, 6 tests, 6 pass, 0 fail

```
ok 1 - board starts as boardSize empty slots and fills with cold marks
ok 2 - mark with threshold 60, suspicionRate 2.2, multipliers 1.0 bolts on the predicted tick (±1)
ok 3 - heat never decreases across 10,000 ticks of random actions
ok 4 - cashOut banks exactly the mark take and frees the slot
ok 5 - late cashOut (wary or above) adds heatPerLateCashout
ok 6 - same seed produces identical state after 1,000 ticks
# tests 6
# pass 6
# fail 0
```

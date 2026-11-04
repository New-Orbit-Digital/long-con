# Long Con

A 1980s boiler-room short-con incremental game. Vanilla HTML, CSS and JavaScript (ES modules), no build step, no dependencies.

Unit 1: the sim core (`src/tuning.js`, `src/sim.js`). Unit 2: marks (`src/marks.js`) and flavor text (`src/content.js`). `index.html`, `style.css`, `src/ui.js` and `src/main.js` are stubs filled in by later units.

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

## Marks API (`src/marks.js`)

- `generateMark(rng, tuning)` returns a cold mark (`id` is assigned by the sim). `rng` is a `() => [0, 1)` function; the sim passes one backed by `state.rng`. Rolls a bankroll band by `bankrollBandWeights`, a bankroll in that band, a hook from the same band, `greed`, and `threshold` (from `thresholdBurned` for burned marks). Hidden flags: `leaked` (`leakedShare`) and `burned` (`burnedShare`).
- `visibleTags(mark, intel)` returns the tags the player can see: `leaked` while `intel.hackedFinancials` is held, `burned` while `intel.suckerList` is held (held = truthy, or > 0 if a number). The sim recomputes `mark.tags` every step; Unit 3 sets the Intel.
- `refreshTell` / `updateTell` keep `mark.tell` current: a new phrase on tell-band change or every `tellRefreshSeconds`, drawn from an adjacent band with probability `tellNoise`, never the same phrase twice in a row.

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

### Unit 2

- **Date:** 2026-11-04
- **Command:** `npm test` (`node --test`), Node v22.23.4
- **Result:** PASS, 15 tests (9 new in `test/marks.test.js`, 6 from Unit 1), 15 pass, 0 fail

```
ok 1 - content meets the minimum counts
ok 2 - 1,000 marks from one seed are reproducible
ok 3 - every rolled stat falls inside its tuning range
ok 4 - visible tags show only while the matching Intel is held
ok 5 - every band can draw a phrase, from its own pool when noise is off
ok 6 - tell noise draws only from the true band or an adjacent one
ok 7 - no two consecutive refreshes on one mark repeat
ok 8 - updateTell refreshes on band change and every tellRefreshSeconds
ok 9 - sim wires the generator and refreshes tells in the tick loop
ok 10 - board starts as boardSize empty slots and fills with cold marks
ok 11 - mark with threshold 60, suspicionRate 2.2, multipliers 1.0 bolts on the predicted tick (±1)
ok 12 - heat never decreases across 10,000 ticks of random actions
ok 13 - cashOut banks exactly the mark take and frees the slot
ok 14 - late cashOut (wary or above) adds heatPerLateCashout
ok 15 - same seed produces identical state after 1,000 ticks
# tests 15
# pass 15
# fail 0
```

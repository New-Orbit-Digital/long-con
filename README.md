# Long Con

A 1980s boiler-room short-con incremental game. Vanilla HTML, CSS and JavaScript (ES modules), no build step, no dependencies.

Unit 1: the sim core (`src/tuning.js`, `src/sim.js`). Unit 2: marks (`src/marks.js`) and flavor text (`src/content.js`). Unit 3: the player verbs (`src/sim.js`). `index.html`, `style.css`, `src/ui.js` and `src/main.js` are stubs filled in by later units.

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
- Verbs are listed below. `cashOut` banks Take, marks the mark `cashed`, frees the slot, and adds `heatPerLateCashout` if the mark was `wary` or `about-to-bolt`.
- When `heat >= heatCeiling`, `state.ended` is `true` and `state.summary` holds `{ takeBanked, cashed, bolted, seconds, seed }`.
- The RNG is mulberry32 with its state on `state.rng`, so a run replays from its seed.

## Verbs API (`src/sim.js`)

**Convention.** Every verb mutates `state` in place and returns `{ state, ok, log, reason }`. On success `ok` is `true`, `log` is the line just pushed onto `state.player.log` (the ticker keeps the last 6) and `reason` is `null`. On refusal the state is left untouched, `ok` is `false`, `log` is `null` and `reason` is one of `ended`, `no-mark`, `not-cold`, `not-active`, `no-pitch`, `already-paid`, `unaffordable`, `already-assigned`, `no-idle-shill`, `no-shill`, `no-intel-type`. Sim events (bolts, Intel expiring, unpaid shills walking off, run over) also log to `state.player.log`.

- `pitch(state, markId, pitchName)`: a `cold` mark becomes `active` under that pitch's `takeMult` and `suspicionMult`. If the pitch's `matchesTag` is among the mark's visible `tags` at pitch time, `mark.tagMatched` is set and that mark's Take grows `tagMatchBonus`× faster for the rest of the con. A number in place of the name is treated as an index into `tuning.pitches` (the Unit 1 form).
- `cashOut(state, markId)`: as above; an assigned shill returns to idle.
- `payConvincer(state, markId)`: active marks only. Costs `convincerCost`; `bankroll ×= convincerBankrollMult`; `suspicion -= convincerRelief` (floor 0); `convincerPaid` records the spend. Once per mark: refused if already paid or if cash is short, with nothing charged.
- `hireShill(state)`: costs `shillPrice(state)` = `shillCost × shillCostGrowth^owned`; adds one to `player.shills`.
- `assignShill(state, markId)` / `unassignShill(state, markId)`: one shill per active mark, only while `idleShills(state) > 0`. Each tick an assigned shill drains `shillWage × dt` from cash and subtracts `shillRelief × dt` from that mark's Suspicion growth. If cash can't cover a wage, that shill unassigns (cash never goes negative). Shills also return to idle when their mark cashes out or bolts.
- `buyIntel(state, type)`: `type` is `suckerList` or `hackedFinancials`; costs `intelCost[type]` and sets `player.intel[type] = intelDuration` (seconds remaining, ticking down; buying again resets the timer at full price). Tags apply at once to marks on the board and to incoming marks, and vanish when the timer hits 0. While hacked financials is held, Heat rises `heatPerSecondLeaked` per second, and `leaked` marks carry `revealedBankroll` (the bankroll for the UI; `null` otherwise).
- Helpers: `shillPrice(state)`, `idleShills(state)`.

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

### Unit 3

- **Date:** 2026-11-04
- **Command:** `npm test` (`node --test`), Node v22.23.4
- **Result:** PASS, 22 tests (7 new in `test/verbs.test.js`, 15 from Units 1 and 2), 22 pass, 0 fail

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
ok 16 - convincer raises bankroll exactly once; a second call is refused and charges nothing
ok 17 - a shill's wage drains per tick and stops when unassigned
ok 18 - shills unassign automatically when cash cannot cover the wage
ok 19 - Intel expires at intelDuration; leaked tags show only while hacked financials is held
ok 20 - a tag-matched pitch out-earns the same pitch unmatched over 100 ticks by the bonus ratio
ok 21 - pitch takes a name or an index; bad pitches and non-cold marks are refused
ok 22 - log keeps the last 6 lines and the run-end summary still works
# tests 22
# pass 22
# fail 0
```

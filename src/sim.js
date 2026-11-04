// Long Con sim core. A state machine over one plain, serializable object.
// No DOM access. Functions mutate the state they are given. tick/createRun
// return the state; verbs return { state, ok, log, reason } (see 'verbs').
// Reads tunables only from the `tuning` object passed to createRun.

import { generateMark, visibleTags, updateTell } from './marks.js';

const LOG_SIZE = 6;
const EPS = 1e-9;

// ---- seeded RNG (mulberry32); the 32-bit state lives on state.rng ----

export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- helpers ----

export function bandFor(ratio) {
  if (ratio < 0.4) return 'calm';
  if (ratio < 0.7) return 'uneasy';
  if (ratio < 0.9) return 'wary';
  return 'about-to-bolt';
}

function log(state, text) {
  state.player.log.push(`[${state.player.clock.toFixed(2)}s] ${text}`);
  if (state.player.log.length > LOG_SIZE) state.player.log.splice(0, state.player.log.length - LOG_SIZE);
}

function addHeat(state, amount) {
  if (amount > 0) state.player.heat += amount;
  if (!state.ended && state.player.heat >= state.tuning.heatCeiling) endRun(state);
}

function endRun(state) {
  state.ended = true;
  state.summary = {
    takeBanked: state.stats.takeBanked,
    cashed: state.stats.cashed,
    bolted: state.stats.bolted,
    seconds: state.player.clock,
    seed: state.seed,
  };
  log(state, 'Heat hit the ceiling. Run over.');
}

function findMark(state, markId) {
  const slot = state.board.findIndex((m) => m && m.id === markId);
  return slot === -1 ? { slot, mark: null } : { slot, mark: state.board[slot] };
}

function freeSlot(state, slot) {
  state.board[slot] = null;
  state.refillTimers[slot] = state.tuning.refillSeconds;
}

function makeMark(state) {
  const mark = generateMark(() => nextRandom(state), state.tuning);
  mark.id = state.nextMarkId++;
  mark.tagMatched = false;
  refreshVisible(state, mark);
  return mark;
}

// ---- public API ----

export function createRun(seed, tuning) {
  return {
    seed,
    tuning,
    rng: seed >>> 0,
    accumulator: 0,
    nextMarkId: 1,
    ended: false,
    summary: null,
    stats: { takeBanked: 0, cashed: 0, bolted: 0 },
    player: {
      cash: tuning.startingCash,
      heat: 0,
      shills: 0,
      intel: {},
      log: [],
      clock: 0,
    },
    // boardSize empty slots; each fills with a cold mark when its timer runs out.
    board: new Array(tuning.boardSize).fill(null),
    refillTimers: new Array(tuning.boardSize).fill(0),
  };
}

// ---- verbs ----
// Convention: every verb mutates `state` in place and returns
// { state, ok, log, reason }. On success `ok` is true, `log` is the line pushed
// onto state.player.log (the ticker keeps the last LOG_SIZE) and `reason` is null.
// On refusal the state is left unchanged, `ok` is false, `log` is null and
// `reason` is a short machine-readable string.

function done(state, text) {
  log(state, text);
  return { state, ok: true, log: state.player.log[state.player.log.length - 1], reason: null };
}

function refuse(state, reason) {
  return { state, ok: false, log: null, reason };
}

function intelHeld(state, type) {
  const v = state.player.intel[type];
  return typeof v === 'number' && v > EPS;
}

// Recompute a mark's player-visible fields from the Intel held right now.
function refreshVisible(state, mark) {
  mark.tags = visibleTags(mark, state.player.intel);
  mark.revealedBankroll = mark.leaked && intelHeld(state, 'hackedFinancials') ? mark.bankroll : null;
}

function assignedShills(state) {
  return state.board.filter((m) => m && m.shill).length;
}

export function idleShills(state) {
  return state.player.shills - assignedShills(state);
}

export function shillPrice(state) {
  const t = state.tuning;
  return t.shillCost * Math.pow(t.shillCostGrowth, state.player.shills);
}

// pitch(state, markId, pitchName). A numeric third argument is still accepted
// as an index into tuning.pitches (the Unit 1 form). Whether the pitch's
// matchesTag is among the mark's visible tags is decided once, at pitch time.
export function pitch(state, markId, pitchName = 0) {
  if (state.ended) return refuse(state, 'ended');
  const { mark } = findMark(state, markId);
  if (!mark) return refuse(state, 'no-mark');
  if (mark.status !== 'cold') return refuse(state, 'not-cold');
  const pitches = state.tuning.pitches;
  const p = typeof pitchName === 'number' ? pitches[pitchName] : pitches.find((x) => x.name === pitchName);
  if (!p) return refuse(state, 'no-pitch');
  refreshVisible(state, mark);
  mark.status = 'active';
  mark.pitch = p.name;
  mark.tagMatched = Boolean(p.matchesTag && mark.tags.includes(p.matchesTag));
  return done(state, `Pitched ${mark.name}: ${p.name}${mark.tagMatched ? ' (on the nose)' : ''}.`);
}

export function cashOut(state, markId) {
  if (state.ended) return refuse(state, 'ended');
  const { slot, mark } = findMark(state, markId);
  if (!mark) return refuse(state, 'no-mark');
  if (mark.status !== 'active') return refuse(state, 'not-active');
  state.player.cash += mark.take;
  state.stats.takeBanked += mark.take;
  state.stats.cashed += 1;
  mark.status = 'cashed';
  mark.shill = false; // the shill goes back to idle
  const late = mark.tellBand === 'wary' || mark.tellBand === 'about-to-bolt';
  freeSlot(state, slot);
  const result = done(state, `Cashed out ${mark.name} for $${mark.take.toFixed(0)}.`);
  if (late) addHeat(state, state.tuning.heatPerLateCashout);
  return result;
}

// Once per active mark: bankroll x convincerBankrollMult, Suspicion - convincerRelief.
export function payConvincer(state, markId) {
  if (state.ended) return refuse(state, 'ended');
  const t = state.tuning;
  const { mark } = findMark(state, markId);
  if (!mark) return refuse(state, 'no-mark');
  if (mark.status !== 'active') return refuse(state, 'not-active');
  if (mark.convincerPaid > 0) return refuse(state, 'already-paid');
  if (state.player.cash < t.convincerCost) return refuse(state, 'unaffordable');
  state.player.cash -= t.convincerCost;
  mark.convincerPaid += t.convincerCost;
  mark.bankroll *= t.convincerBankrollMult;
  mark.suspicion = Math.max(0, mark.suspicion - t.convincerRelief);
  refreshVisible(state, mark);
  return done(state, `Paid a convincer on ${mark.name} ($${t.convincerCost.toFixed(0)}).`);
}

export function hireShill(state) {
  if (state.ended) return refuse(state, 'ended');
  const price = shillPrice(state);
  if (state.player.cash < price) return refuse(state, 'unaffordable');
  state.player.cash -= price;
  state.player.shills += 1;
  return done(state, `Hired a shill for $${price.toFixed(0)}.`);
}

export function assignShill(state, markId) {
  if (state.ended) return refuse(state, 'ended');
  const { mark } = findMark(state, markId);
  if (!mark) return refuse(state, 'no-mark');
  if (mark.status !== 'active') return refuse(state, 'not-active');
  if (mark.shill) return refuse(state, 'already-assigned');
  if (idleShills(state) < 1) return refuse(state, 'no-idle-shill');
  mark.shill = true;
  return done(state, `Put a shill on ${mark.name}.`);
}

export function unassignShill(state, markId) {
  if (state.ended) return refuse(state, 'ended');
  const { mark } = findMark(state, markId);
  if (!mark) return refuse(state, 'no-mark');
  if (!mark.shill) return refuse(state, 'no-shill');
  mark.shill = false;
  return done(state, `Pulled the shill off ${mark.name}.`);
}

// type: 'suckerList' | 'hackedFinancials'. Buying while held resets the timer
// to intelDuration (and charges full price again).
export function buyIntel(state, type) {
  if (state.ended) return refuse(state, 'ended');
  const t = state.tuning;
  if (!(type in t.intelCost)) return refuse(state, 'no-intel-type');
  const cost = t.intelCost[type];
  if (state.player.cash < cost) return refuse(state, 'unaffordable');
  state.player.cash -= cost;
  state.player.intel[type] = t.intelDuration;
  for (const m of state.board) if (m) refreshVisible(state, m);
  const label = type === 'suckerList' ? 'the sucker list' : 'hacked financials';
  return done(state, `Bought ${label} ($${cost.toFixed(0)}, ${t.intelDuration}s).`);
}

export function tick(state, dtSeconds) {
  if (state.ended) return state;
  const step = state.tuning.tickSeconds;
  state.accumulator += Math.max(0, dtSeconds);
  while (state.accumulator + EPS >= step && !state.ended) {
    state.accumulator -= step;
    stepOnce(state, step);
  }
  if (state.accumulator < EPS) state.accumulator = 0;
  return state;
}

function stepOnce(state, dt) {
  const t = state.tuning;
  const rand = () => nextRandom(state);
  state.player.clock += dt;

  // Intel: tick down, expire, and leak Heat while hacked financials is held.
  for (const type of Object.keys(state.player.intel)) {
    const left = state.player.intel[type];
    if (typeof left !== 'number' || left <= EPS) continue;
    if (type === 'hackedFinancials') addHeat(state, t.heatPerSecondLeaked * dt);
    if (state.ended) return;
    state.player.intel[type] = Math.max(0, left - dt);
    if (state.player.intel[type] <= EPS) {
      state.player.intel[type] = 0;
      log(state, type === 'suckerList' ? 'The sucker list went stale.' : 'The hacked financials went stale.');
    }
  }

  // Shill wages, in board order; a shill that can't be paid walks off the mark.
  for (const mark of state.board) {
    if (!mark || !mark.shill) continue;
    const wage = t.shillWage * dt;
    if (state.player.cash + EPS >= wage) {
      state.player.cash = Math.max(0, state.player.cash - wage);
    } else {
      mark.shill = false;
      log(state, `Couldn't make payroll. The shill walked off ${mark.name}.`);
    }
  }

  for (let slot = 0; slot < state.board.length; slot++) {
    const mark = state.board[slot];

    if (!mark) {
      state.refillTimers[slot] -= dt;
      if (state.refillTimers[slot] <= EPS) {
        state.refillTimers[slot] = 0;
        state.board[slot] = makeMark(state);
      }
      continue;
    }
    refreshVisible(state, mark);
    if (mark.status === 'cold') {
      updateTell(mark, rand, t, dt);
      continue;
    }
    if (mark.status !== 'active') continue;

    const p = t.pitches.find((x) => x.name === mark.pitch) || t.pitches[0];
    // Decided at pitch time (see pitch()); later Intel changes don't move it.
    const tagBonus = mark.tagMatched ? t.tagMatchBonus : 1;

    // 1. Take, capped at bankroll; tapped out doubles Suspicion growth.
    mark.take = Math.min(mark.bankroll, mark.take + t.takeRate * p.takeMult * tagBonus * mark.greed * dt);
    const tappedOut = mark.take >= mark.bankroll;

    // 2. Suspicion, with shill relief.
    let rise = t.suspicionRate * p.suspicionMult * dt;
    if (tappedOut) rise *= t.tappedOutSuspicionMult;
    if (mark.shill) rise -= t.shillRelief * dt;
    mark.suspicion = Math.max(0, mark.suspicion + rise);

    // 3. Bolt.
    if (mark.suspicion >= mark.threshold) {
      mark.status = 'bolted';
      mark.tellBand = 'about-to-bolt';
      const lost = mark.take;
      mark.take = 0;
      mark.shill = false; // the shill goes back to idle
      state.stats.bolted += 1;
      log(state, `${mark.name} bolted. Lost $${lost.toFixed(0)}.`);
      freeSlot(state, slot);
      addHeat(state, mark.leaked ? t.heatPerLeakedBolt : t.heatPerBolt);
      if (state.ended) return;
      continue;
    }

    // 4. Tell band.
    mark.tellBand = bandFor(mark.suspicion / mark.threshold);
    updateTell(mark, rand, t, dt);
  }
}

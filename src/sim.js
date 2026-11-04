// Long Con sim core. A state machine over one plain, serializable object.
// No DOM access. Functions mutate the state they are given and return it.
// Reads tunables only from the `tuning` object passed to createRun.

const LOG_SIZE = 6;
const EPS = 1e-9;

// ---- seeded RNG (mulberry32); the 32-bit state lives on state.rng ----

export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function between(state, [lo, hi]) {
  return lo + (hi - lo) * nextRandom(state);
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

// Stub mark generator. Unit 2 replaces this with marks.js + content.js.
function generateMark(state) {
  const t = state.tuning;
  const w = t.bankrollBandWeights;
  const r = nextRandom(state);
  const band = r < w.low ? 'low' : r < w.low + w.mid ? 'mid' : 'high';
  const leaked = nextRandom(state) < t.leakedShare;
  const id = state.nextMarkId++;
  return {
    id,
    name: `Mark #${id}`,
    hook: `Stub hook (${band} bankroll)`,
    tags: [],
    status: 'cold',
    take: 0,
    suspicion: 0,
    threshold: between(state, t.threshold),
    bankroll: between(state, t.bankroll[band]),
    greed: between(state, t.greed),
    tellBand: 'calm',
    convincerPaid: 0,
    shill: false,
    leaked,
    pitch: null,
  };
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

// Minimal pitch verb so tests and the UI can activate cold marks.
// Unit 3 owns the full verb set (convincer, shills, intel).
export function pitch(state, markId, pitchIndex = 0) {
  if (state.ended) return state;
  const { mark } = findMark(state, markId);
  const p = state.tuning.pitches[pitchIndex];
  if (!mark || mark.status !== 'cold' || !p) return state;
  mark.status = 'active';
  mark.pitch = p.name;
  log(state, `Pitched ${mark.name}: ${p.name}.`);
  return state;
}

export function cashOut(state, markId) {
  if (state.ended) return state;
  const { slot, mark } = findMark(state, markId);
  if (!mark || mark.status !== 'active') return state;
  state.player.cash += mark.take;
  state.stats.takeBanked += mark.take;
  state.stats.cashed += 1;
  mark.status = 'cashed';
  log(state, `Cashed out ${mark.name} for $${mark.take.toFixed(0)}.`);
  const late = mark.tellBand === 'wary' || mark.tellBand === 'about-to-bolt';
  freeSlot(state, slot);
  if (late) addHeat(state, state.tuning.heatPerLateCashout);
  return state;
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
  state.player.clock += dt;

  for (let slot = 0; slot < state.board.length; slot++) {
    const mark = state.board[slot];

    if (!mark) {
      state.refillTimers[slot] -= dt;
      if (state.refillTimers[slot] <= EPS) {
        state.refillTimers[slot] = 0;
        state.board[slot] = generateMark(state);
      }
      continue;
    }
    if (mark.status !== 'active') continue;

    const p = t.pitches.find((x) => x.name === mark.pitch) || t.pitches[0];
    const tagBonus = p.matchesTag && mark.tags.includes(p.matchesTag) ? t.tagMatchBonus : 1;

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
      state.stats.bolted += 1;
      log(state, `${mark.name} bolted. Lost $${lost.toFixed(0)}.`);
      freeSlot(state, slot);
      addHeat(state, mark.leaked ? t.heatPerLeakedBolt : t.heatPerBolt);
      if (state.ended) return;
      continue;
    }

    // 4. Tell band.
    mark.tellBand = bandFor(mark.suspicion / mark.threshold);
  }
}

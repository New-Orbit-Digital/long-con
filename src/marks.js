// Mark generation and tell selection. No DOM, no state of its own.
// `rng` is a function returning a float in [0, 1); sim.js passes one backed
// by the run's seeded RNG so marks replay from the seed.

import { FIRST_NAMES, SURNAMES, HOOKS, TELLS, TELL_BANDS } from './content.js';

function between(rng, [lo, hi]) {
  return lo + (hi - lo) * rng();
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function rollBand(rng, weights) {
  const bands = Object.keys(weights);
  const total = bands.reduce((sum, b) => sum + weights[b], 0);
  let r = rng() * total;
  for (const b of bands) {
    r -= weights[b];
    if (r < 0) return b;
  }
  return bands[bands.length - 1];
}

// Builds a cold mark. The caller (sim.js) assigns `id`.
export function generateMark(rng, tuning) {
  const bankrollBand = rollBand(rng, tuning.bankrollBandWeights);
  const bankroll = between(rng, tuning.bankroll[bankrollBand]);
  const hook = pick(rng, HOOKS[bankrollBand]);
  const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, SURNAMES)}`;
  const greed = between(rng, tuning.greed);
  const burned = rng() < tuning.burnedShare;
  const threshold = between(rng, burned ? tuning.thresholdBurned : tuning.threshold);
  const leaked = rng() < tuning.leakedShare;

  const mark = {
    id: null,
    name,
    hook,
    bankrollBand,
    tags: [],
    status: 'cold',
    take: 0,
    suspicion: 0,
    threshold,
    bankroll,
    greed,
    tellBand: 'calm',
    tell: null,
    tellPhraseBand: null,
    tellTimer: 0,
    convincerPaid: 0,
    shill: false,
    leaked, // hidden
    burned, // hidden
    pitch: null,
  };
  refreshTell(mark, rng, tuning);
  return mark;
}

// Intel is held while its entry on player.intel is truthy and, if numeric, > 0
// (Unit 3 decides the exact shape; remaining seconds or `true` both work).
function held(intel, key) {
  const v = intel ? intel[key] : undefined;
  return typeof v === 'number' ? v > 0 : Boolean(v);
}

// The tags the player can see, given the Intel they hold right now.
export function visibleTags(mark, intel) {
  const tags = [];
  if (mark.leaked && held(intel, 'hackedFinancials')) tags.push('leaked');
  if (mark.burned && held(intel, 'suckerList')) tags.push('burned');
  return tags;
}

// The band a phrase is drawn from: the true tell band, or with probability
// tellNoise an adjacent band (either neighbour, chosen evenly when both exist).
function phraseBand(rng, band, tuning) {
  const i = TELL_BANDS.indexOf(band);
  if (rng() >= tuning.tellNoise) return band;
  const neighbours = [TELL_BANDS[i - 1], TELL_BANDS[i + 1]].filter(Boolean);
  return pick(rng, neighbours);
}

// Draw a new tell phrase now. Never repeats the mark's previous phrase.
export function refreshTell(mark, rng, tuning) {
  const source = phraseBand(rng, mark.tellBand, tuning);
  const pool = TELLS[source].filter((p) => p !== mark.tell);
  mark.tell = pick(rng, pool);
  mark.tellPhraseBand = mark.tellBand; // the true band this phrase was drawn for
  mark.tellTimer = 0;
  return mark;
}

// Called every sim step: refresh on tell band change or every tellRefreshSeconds.
export function updateTell(mark, rng, tuning, dt) {
  mark.tellTimer += dt;
  if (mark.tellBand !== mark.tellPhraseBand || mark.tellTimer + 1e-9 >= tuning.tellRefreshSeconds) {
    refreshTell(mark, rng, tuning);
  }
  return mark;
}

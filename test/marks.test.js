import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import { nextRandom, createRun, tick, pitch } from '../src/sim.js';
import { generateMark, refreshTell, updateTell, visibleTags } from '../src/marks.js';
import { FIRST_NAMES, SURNAMES, HOOKS, TELLS, TELL_BANDS } from '../src/content.js';

const rngFrom = (seed) => {
  const s = { rng: seed >>> 0 };
  return () => nextRandom(s);
};

const marksFrom = (seed, n = 1000) => {
  const rng = rngFrom(seed);
  return Array.from({ length: n }, () => generateMark(rng, TUNING));
};

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

test('content meets the minimum counts', () => {
  assert.ok(FIRST_NAMES.length >= 20 && SURNAMES.length >= 20);
  for (const band of ['low', 'mid', 'high']) assert.ok(HOOKS[band].length >= 15, band);
  for (const band of TELL_BANDS) assert.ok(TELLS[band].length >= 4, band);
});

test('1,000 marks from one seed are reproducible', () => {
  assert.equal(JSON.stringify(marksFrom(2026)), JSON.stringify(marksFrom(2026)));
  assert.notEqual(JSON.stringify(marksFrom(2026)), JSON.stringify(marksFrom(2027)));
});

test('every rolled stat falls inside its tuning range', () => {
  const marks = marksFrom(31337);
  for (const m of marks) {
    assert.ok(inRange(m.bankroll, TUNING.bankroll[m.bankrollBand]), `bankroll ${m.bankroll} ${m.bankrollBand}`);
    assert.ok(HOOKS[m.bankrollBand].includes(m.hook), `hook from wrong band: ${m.hook}`);
    assert.ok(inRange(m.greed, TUNING.greed), `greed ${m.greed}`);
    const range = m.burned ? TUNING.thresholdBurned : TUNING.threshold;
    assert.ok(inRange(m.threshold, range), `threshold ${m.threshold} burned=${m.burned}`);
    assert.deepEqual(m.tags, []);
  }
  // Shares and band weights land near their targets over 1,000 marks.
  const share = (f) => marks.filter(f).length / marks.length;
  assert.ok(Math.abs(share((m) => m.leaked) - TUNING.leakedShare) < 0.05);
  assert.ok(Math.abs(share((m) => m.burned) - TUNING.burnedShare) < 0.05);
  for (const b of ['low', 'mid', 'high']) {
    assert.ok(Math.abs(share((m) => m.bankrollBand === b) - TUNING.bankrollBandWeights[b]) < 0.05, b);
  }
});

test('visible tags show only while the matching Intel is held', () => {
  const m = { leaked: true, burned: true };
  assert.deepEqual(visibleTags(m, {}), []);
  assert.deepEqual(visibleTags(m, { hackedFinancials: 30 }), ['leaked']);
  assert.deepEqual(visibleTags(m, { suckerList: true }), ['burned']);
  assert.deepEqual(visibleTags(m, { hackedFinancials: 1, suckerList: 1 }), ['leaked', 'burned']);
  assert.deepEqual(visibleTags(m, { hackedFinancials: 0, suckerList: false }), []);
  assert.deepEqual(visibleTags({ leaked: false, burned: false }, { hackedFinancials: 1, suckerList: 1 }), []);
});

test('every band can draw a phrase, from its own pool when noise is off', () => {
  const rng = rngFrom(8);
  const quiet = { ...TUNING, tellNoise: 0 };
  for (const band of TELL_BANDS) {
    const m = generateMark(rng, quiet);
    m.tellBand = band;
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      refreshTell(m, rng, quiet);
      assert.ok(TELLS[band].includes(m.tell), `${band}: ${m.tell}`);
      seen.add(m.tell);
    }
    assert.equal(seen.size, TELLS[band].length, `${band} pool fully reachable`);
  }
});

test('tell noise draws only from the true band or an adjacent one', () => {
  const rng = rngFrom(9);
  const noisy = { ...TUNING, tellNoise: 1 };
  for (const [i, band] of TELL_BANDS.entries()) {
    const allowed = [TELL_BANDS[i - 1], TELL_BANDS[i + 1]].filter(Boolean).flatMap((b) => TELLS[b]);
    const m = generateMark(rng, noisy);
    m.tellBand = band;
    for (let k = 0; k < 100; k++) {
      refreshTell(m, rng, noisy);
      assert.ok(allowed.includes(m.tell), `${band} drew ${m.tell}`);
    }
  }
});

test('no two consecutive refreshes on one mark repeat', () => {
  const rng = rngFrom(10);
  for (const noise of [0, TUNING.tellNoise, 1]) {
    const tuning = { ...TUNING, tellNoise: noise };
    const m = generateMark(rng, tuning);
    for (let i = 0; i < 2000; i++) {
      m.tellBand = TELL_BANDS[Math.floor(rng() * TELL_BANDS.length)];
      const prev = m.tell;
      refreshTell(m, rng, tuning);
      assert.notEqual(m.tell, prev, `repeat at refresh ${i} (noise ${noise})`);
    }
  }
});

test('updateTell refreshes on band change and every tellRefreshSeconds', () => {
  const rng = rngFrom(11);
  const m = generateMark(rng, TUNING);
  const dt = TUNING.tickSeconds;
  let first = m.tell;
  for (let t = dt; t < TUNING.tellRefreshSeconds - dt / 2; t += dt) {
    updateTell(m, rng, TUNING, dt);
    assert.equal(m.tell, first, 'no refresh before tellRefreshSeconds');
  }
  updateTell(m, rng, TUNING, dt);
  assert.notEqual(m.tell, first, 'refreshed at tellRefreshSeconds');
  first = m.tell;
  m.tellBand = 'wary';
  updateTell(m, rng, TUNING, dt);
  assert.notEqual(m.tell, first, 'refreshed on band change');
  assert.equal(m.tellTimer, 0);
});

test('sim wires the generator and refreshes tells in the tick loop', () => {
  const s = createRun(4, TUNING);
  tick(s, TUNING.tickSeconds);
  for (const m of s.board) {
    assert.ok(Number.isInteger(m.id) && m.hook && m.tell && typeof m.burned === 'boolean');
    assert.ok(!m.name.startsWith('Mark #'));
  }
  const m = s.board[0];
  Object.assign(m, { threshold: 90, bankroll: 1e9 });
  pitch(s, m.id, 0);
  const tells = [m.tell];
  for (let i = 0; i < (TUNING.tellRefreshSeconds * 3) / TUNING.tickSeconds; i++) {
    tick(s, TUNING.tickSeconds);
    if (m.tell !== tells[tells.length - 1]) tells.push(m.tell);
  }
  assert.ok(tells.length >= 3, `expected refreshes, saw ${tells.length - 1}`);
});

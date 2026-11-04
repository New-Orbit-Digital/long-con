import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import { createRun, tick, cashOut, pitch, nextRandom } from '../src/sim.js';

const T = TUNING.tickSeconds;

// Fill the board (slots refill on the first tick) and return the run.
function filledRun(seed, tuning = TUNING) {
  const s = createRun(seed, tuning);
  tick(s, T);
  return s;
}

test('board starts as boardSize empty slots and fills with cold marks', () => {
  const s = createRun(1, TUNING);
  assert.equal(s.board.length, TUNING.boardSize);
  assert.ok(s.board.every((m) => m === null));
  tick(s, T);
  assert.ok(s.board.every((m) => m && m.status === 'cold'));
  for (const m of s.board) {
    assert.ok(m.threshold >= TUNING.threshold[0] && m.threshold <= TUNING.threshold[1]);
    assert.ok(m.greed >= TUNING.greed[0] && m.greed <= TUNING.greed[1]);
    assert.ok(m.bankroll >= TUNING.bankroll.low[0] && m.bankroll <= TUNING.bankroll.high[1]);
  }
});

test('mark with threshold 60, suspicionRate 2.2, multipliers 1.0 bolts on the predicted tick (±1)', () => {
  const s = filledRun(42);
  const mark = s.board[0];
  Object.assign(mark, { threshold: 60, bankroll: 1e9, greed: 1, leaked: false, shill: false });
  pitch(s, mark.id, 0); // 'Sure thing': takeMult 1.0, suspicionMult 1.0
  const predicted = Math.ceil(60 / (TUNING.suspicionRate * T)); // 110 ticks
  let ticks = 0;
  while (mark.status === 'active' && ticks < predicted + 10) {
    tick(s, T);
    ticks++;
  }
  assert.equal(mark.status, 'bolted');
  assert.ok(Math.abs(ticks - predicted) <= 1, `bolted at tick ${ticks}, predicted ${predicted}`);
  assert.equal(s.player.heat, TUNING.heatPerBolt);
  assert.equal(mark.take, 0);
});

test('heat never decreases across 10,000 ticks of random actions', () => {
  let s = filledRun(7);
  const actor = { rng: 12345 }; // separate RNG for the test's actions
  let prevHeat = s.player.heat;
  let runs = 1;
  for (let i = 0; i < 10000; i++) {
    const r = nextRandom(actor);
    const marks = s.board.filter(Boolean);
    if (marks.length) {
      const m = marks[Math.floor(nextRandom(actor) * marks.length)];
      if (r < 0.1) pitch(s, m.id, Math.floor(nextRandom(actor) * TUNING.pitches.length));
      else if (r < 0.13) cashOut(s, m.id);
    }
    tick(s, T * (0.5 + nextRandom(actor) * 2)); // uneven frame times
    assert.ok(s.player.heat >= prevHeat, `heat fell from ${prevHeat} to ${s.player.heat} at tick ${i}`);
    prevHeat = s.player.heat;
    if (s.ended) {
      assert.ok(s.player.heat >= TUNING.heatCeiling);
      assert.ok(s.summary && typeof s.summary.takeBanked === 'number');
      s = filledRun(7 + runs++);
      prevHeat = s.player.heat;
    }
  }
});

test('cashOut banks exactly the mark take and frees the slot', () => {
  const s = filledRun(99);
  const mark = s.board[1];
  Object.assign(mark, { threshold: 90, bankroll: 1e9 });
  pitch(s, mark.id, 0);
  for (let i = 0; i < 20; i++) tick(s, T);
  assert.equal(mark.status, 'active');
  assert.equal(mark.tellBand, 'calm');
  const take = mark.take;
  const cashBefore = s.player.cash;
  const heatBefore = s.player.heat;
  assert.ok(take > 0);
  cashOut(s, mark.id);
  assert.equal(s.player.cash, cashBefore + take);
  assert.equal(mark.status, 'cashed');
  assert.equal(s.board[1], null);
  assert.equal(s.player.heat, heatBefore); // calm cash-out adds no heat
  // The freed slot refills with a cold mark after refillSeconds.
  for (let i = 0; i < TUNING.refillSeconds / T; i++) tick(s, T);
  assert.ok(s.board[1] && s.board[1].status === 'cold' && s.board[1].id !== mark.id);
});

test('late cashOut (wary or above) adds heatPerLateCashout', () => {
  const s = filledRun(5);
  const mark = s.board[0];
  Object.assign(mark, { threshold: 60, bankroll: 1e9 });
  pitch(s, mark.id, 0);
  while (mark.tellBand !== 'wary') tick(s, T);
  cashOut(s, mark.id);
  assert.equal(s.player.heat, TUNING.heatPerLateCashout);
});

test('same seed produces identical state after 1,000 ticks', () => {
  const run = (seed) => {
    const s = filledRun(seed);
    for (let i = 0; i < 1000; i++) {
      const cold = s.board.find((m) => m && m.status === 'cold');
      if (cold && i % 7 === 0) pitch(s, cold.id, i % TUNING.pitches.length);
      const active = s.board.find((m) => m && m.status === 'active' && m.tellBand === 'uneasy');
      if (active) cashOut(s, active.id);
      tick(s, T);
    }
    return JSON.stringify(s);
  };
  assert.equal(run(2026), run(2026));
  assert.notEqual(run(2026), run(2027));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import {
  createRun, tick, pitch, cashOut, payConvincer, hireShill, assignShill, unassignShill,
  buyIntel, shillPrice, idleShills,
} from '../src/sim.js';

const T = TUNING.tickSeconds;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Board filled, every mark made safe and predictable for exact arithmetic.
function filledRun(seed, tuning = TUNING) {
  const s = createRun(seed, tuning);
  tick(s, T);
  for (const m of s.board) Object.assign(m, { threshold: 1e9, bankroll: 1e9, greed: 1, leaked: false, burned: false });
  return s;
}

test('convincer raises bankroll exactly once; a second call is refused and charges nothing', () => {
  const s = filledRun(1);
  const m = s.board[0];
  pitch(s, m.id, 'Sure thing');
  m.bankroll = 1000;
  m.suspicion = 10;
  const cash0 = s.player.cash;
  const r1 = payConvincer(s, m.id);
  assert.equal(r1.ok, true);
  assert.ok(r1.log.includes('convincer'));
  assert.equal(s.player.cash, cash0 - TUNING.convincerCost);
  assert.ok(close(m.bankroll, 1000 * TUNING.convincerBankrollMult));
  assert.equal(m.suspicion, 0); // 10 - 15, floored at 0
  assert.equal(m.convincerPaid, TUNING.convincerCost);

  const snapshot = JSON.stringify(s);
  const r2 = payConvincer(s, m.id);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'already-paid');
  assert.equal(JSON.stringify(s), snapshot, 'refusal leaves state unchanged');

  // Unaffordable is refused too, on a fresh mark.
  const m2 = s.board[1];
  pitch(s, m2.id, 'Sure thing');
  s.player.cash = TUNING.convincerCost - 1;
  const before = m2.bankroll;
  const r3 = payConvincer(s, m2.id);
  assert.equal(r3.reason, 'unaffordable');
  assert.equal(m2.bankroll, before);
  assert.equal(s.player.cash, TUNING.convincerCost - 1);
});

test("a shill's wage drains per tick and stops when unassigned", () => {
  const s = filledRun(2);
  s.player.cash = 10000;
  const m = s.board[0];
  pitch(s, m.id, 'Sure thing');
  const price0 = shillPrice(s);
  assert.equal(price0, TUNING.shillCost);
  assert.equal(hireShill(s).ok, true);
  assert.equal(s.player.cash, 10000 - TUNING.shillCost);
  assert.ok(close(shillPrice(s), TUNING.shillCost * TUNING.shillCostGrowth));
  assert.equal(assignShill(s, m.id).ok, true);
  assert.equal(idleShills(s), 0);
  assert.equal(assignShill(s, s.board[1].id).reason, 'not-active');

  // Shill relief: Suspicion grows at (suspicionRate - shillRelief) per second.
  const cash1 = s.player.cash;
  for (let i = 0; i < 40; i++) tick(s, T);
  assert.ok(close(s.player.cash, cash1 - TUNING.shillWage * T * 40));
  assert.ok(close(m.suspicion, (TUNING.suspicionRate - TUNING.shillRelief) * T * 40));

  assert.equal(unassignShill(s, m.id).ok, true);
  assert.equal(idleShills(s), 1);
  const cash2 = s.player.cash;
  for (let i = 0; i < 40; i++) tick(s, T);
  assert.equal(s.player.cash, cash2, 'no wage once unassigned');
});

test('shills unassign automatically when cash cannot cover the wage', () => {
  const s = filledRun(3);
  s.player.cash = TUNING.shillCost;
  const m = s.board[0];
  pitch(s, m.id, 'Sure thing');
  hireShill(s);
  assignShill(s, m.id);
  s.player.cash = TUNING.shillWage * T * 3; // three ticks of wages
  for (let i = 0; i < 3; i++) tick(s, T);
  assert.equal(m.shill, true);
  assert.ok(close(s.player.cash, 0));
  tick(s, T);
  assert.equal(m.shill, false);
  assert.ok(s.player.cash >= 0);
  assert.ok(s.player.log.at(-1).includes('walked off'));
});

test('Intel expires at intelDuration; leaked tags show only while hacked financials is held', () => {
  const s = filledRun(4);
  s.player.cash = 10000;
  const m = s.board[0];
  m.leaked = true;
  tick(s, T);
  assert.deepEqual(m.tags, []);
  assert.equal(m.revealedBankroll, null);

  const heat0 = s.player.heat;
  const r = buyIntel(s, 'hackedFinancials');
  assert.equal(r.ok, true);
  assert.equal(s.player.cash, 10000 - TUNING.intelCost.hackedFinancials);
  assert.deepEqual(m.tags, ['leaked']); // visible immediately
  assert.equal(m.revealedBankroll, m.bankroll);
  assert.deepEqual(s.board[1].tags, []); // unleaked marks stay untagged

  const ticks = Math.round(TUNING.intelDuration / T);
  for (let i = 0; i < ticks - 1; i++) tick(s, T);
  assert.ok(s.player.intel.hackedFinancials > 0, 'still held one tick before expiry');
  assert.deepEqual(m.tags, ['leaked']);
  tick(s, T);
  assert.equal(s.player.intel.hackedFinancials, 0, 'expired at intelDuration');
  assert.ok(close(s.player.heat - heat0, TUNING.heatPerSecondLeaked * TUNING.intelDuration));
  assert.ok(s.player.log.some((l) => l.includes('went stale')));
  tick(s, T);
  assert.deepEqual(m.tags, []);
  assert.equal(m.revealedBankroll, null);
  const heat1 = s.player.heat;
  for (let i = 0; i < 20; i++) tick(s, T);
  assert.equal(s.player.heat, heat1, 'no leak Heat after expiry');

  // Sucker list: tags burned marks, adds no Heat, and is refused when unaffordable.
  s.board[1].burned = true;
  buyIntel(s, 'suckerList');
  assert.deepEqual(s.board[1].tags, ['burned']);
  for (let i = 0; i < 20; i++) tick(s, T);
  assert.equal(s.player.heat, heat1);
  s.player.cash = 0;
  assert.equal(buyIntel(s, 'suckerList').reason, 'unaffordable');
  assert.equal(buyIntel(s, 'nope').reason, 'no-intel-type');
});

test('a tag-matched pitch out-earns the same pitch unmatched over 100 ticks by the bonus ratio', () => {
  const s = filledRun(5);
  s.player.cash = 10000;
  const [matched, unmatched] = s.board;
  matched.leaked = true;
  buyIntel(s, 'hackedFinancials');
  assert.deepEqual(matched.tags, ['leaked']);
  assert.deepEqual(unmatched.tags, []);
  pitch(s, matched.id, 'Inside info');
  pitch(s, unmatched.id, 'Inside info');
  assert.equal(matched.tagMatched, true);
  assert.equal(unmatched.tagMatched, false);
  for (let i = 0; i < 100; i++) tick(s, T);
  assert.ok(unmatched.take > 0);
  assert.ok(close(matched.take / unmatched.take, TUNING.tagMatchBonus, 1e-9));
});

test('pitch takes a name or an index; bad pitches and non-cold marks are refused', () => {
  const s = filledRun(6);
  const [a, b] = s.board;
  const r = pitch(s, a.id, 'Hot tip');
  assert.equal(r.ok, true);
  assert.equal(a.pitch, 'Hot tip');
  assert.equal(s.player.log.at(-1), r.log);
  assert.equal(pitch(s, a.id, 'Hot tip').reason, 'not-cold');
  assert.equal(pitch(s, b.id, 'No such pitch').reason, 'no-pitch');
  assert.equal(pitch(s, b.id, 2).ok, true);
  assert.equal(b.pitch, TUNING.pitches[2].name);
  assert.equal(cashOut(s, b.id).ok, true);
});

test('log keeps the last 6 lines and the run-end summary still works', () => {
  const s = filledRun(7);
  s.player.cash = 1e6;
  for (let i = 0; i < 10; i++) hireShill(s);
  assert.equal(s.player.log.length, 6);
  s.player.heat = TUNING.heatCeiling - 0.01;
  buyIntel(s, 'hackedFinancials');
  for (let i = 0; i < 10 && !s.ended; i++) tick(s, T);
  assert.equal(s.ended, true);
  assert.deepEqual(Object.keys(s.summary), ['takeBanked', 'cashed', 'bolted', 'seconds', 'seed']);
  assert.equal(hireShill(s).reason, 'ended');
});

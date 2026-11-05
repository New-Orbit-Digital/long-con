import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import { runStrategy, summarize, main, parseArgs, median, DEFAULTS } from '../scripts/playtest.js';

// Full default sweep, computed once and shared.
const lines = [];
const results = main([], (l) => lines.push(l));
const byName = Object.fromEntries(results.map((r) => [r.name, r]));

test('the playtest table prints a row per strategy', () => {
  const out = lines.join('\n');
  assert.match(out, /strategy\s+median Take\s+mean Take\s+median secs\s+median bolts\s+ended by Heat/);
  for (const name of ['uneasy', 'wary', 'never']) assert.match(out, new RegExp(`^${name}\\s+\\$`, 'm'));
  for (const r of results) assert.equal(r.rows.length, DEFAULTS.seeds);
});

test('never ends every run by Heat', () => {
  const s = byName.never.summary;
  assert.equal(s.heatShare, 1);
  assert.ok(byName.never.rows.every((r) => r.endedByHeat && r.heat >= TUNING.heatCeiling && r.seconds < DEFAULTS.seconds));
});

// Acceptance check from issue #5. With the default tuning it FAILS: every
// wary cash-out costs heatPerLateCashout (4), so 25 cash-outs hit the Heat
// ceiling around 200s. Per the issue, tuning was not changed; the numbers
// below are from `node scripts/playtest.js` on 2026-11-04.
test('wary out-earns uneasy on median Take', {
  todo: 'FAILS with default tuning: wary median Take $7,710 (ends by Heat 100%, median 211.4s) vs uneasy $28,832 (0%, 900s)',
}, () => {
  assert.ok(byName.wary.summary.medianTake > byName.uneasy.summary.medianTake,
    `wary ${byName.wary.summary.medianTake} vs uneasy ${byName.uneasy.summary.medianTake}`);
});

test('runStrategy is deterministic per seed and summarize computes medians', () => {
  assert.deepEqual(runStrategy('wary', 7, 120, TUNING), runStrategy('wary', 7, 120, TUNING));
  const rows = [
    { strategy: 'x', take: 10, seconds: 900, bolts: 1, endedByHeat: false },
    { strategy: 'x', take: 30, seconds: 100, bolts: 3, endedByHeat: true },
    { strategy: 'x', take: 20, seconds: 200, bolts: 2, endedByHeat: true },
    { strategy: 'x', take: 100, seconds: 50, bolts: 9, endedByHeat: true },
  ];
  const s = summarize(rows);
  assert.equal(s.medianTake, 25);
  assert.equal(s.meanTake, 40);
  assert.equal(s.medianSeconds, 150);
  assert.equal(s.medianBolts, 2.5);
  assert.equal(s.heatShare, 0.75);
  assert.equal(median([3, 1, 2]), 2);
  assert.throws(() => runStrategy('nope', 1));
});

test('flags: --strategy, --verbose, --seconds, --seeds', () => {
  const o = parseArgs(['--strategy', 'never', '--verbose', '--seconds', '60', '--seeds', '3']);
  assert.deepEqual(o, { strategies: ['never'], verbose: true, seconds: 60, seeds: 3 });
  const out = [];
  const r = main(['--strategy', 'uneasy', '--seeds', '2', '--seconds', '30', '--verbose'], (l) => out.push(l));
  assert.equal(r.length, 1);
  assert.equal(r[0].rows.length, 2);
  assert.ok(r[0].rows.every((row) => row.seconds <= 30));
  assert.match(out.join('\n'), /^uneasy\s+1\s+\$/m); // per-seed row
  assert.throws(() => parseArgs(['--strategy', 'bogus']));
  assert.throws(() => parseArgs(['--seeds', '0']));
  assert.throws(() => parseArgs(['--frobnicate']));
});

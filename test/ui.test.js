import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUNING } from '../src/tuning.js';
import { tick, pitch, buyIntel, payConvincer, hireShill, assignShill, cashOut } from '../src/sim.js';
import { renderToString, money } from '../src/ui.js';
import { seedFromSearch, openingRun } from '../src/main.js';
import { buildBundle } from '../scripts/bundle.js';

const T = TUNING.tickSeconds;
// Case-insensitive: these never appear in any form. Case-sensitive: the raw
// lowercase flags; the visible chips are the distinct labels LEAKED / BURNED.
const HIDDEN_WORDS = ['threshold', 'suspicion', 'greed', 'bankroll'];
const RAW_FLAGS = ['leaked', 'burned'];

// Ways a hidden number could be printed. Full-precision forms only for the
// small stats (a rounded "70" would collide with ordinary text like "$700").
function numberForms(n, { asMoney = false } = {}) {
  const forms = [String(n), n.toFixed(2)];
  if (asMoney) forms.push(money(n));
  return forms;
}

// True if `token` appears in html as a whole number (not inside a longer one).
function hasNumber(html, token) {
  const re = new RegExp(`(^|[^0-9.,])${token.replace(/[$.,]/g, (c) => '\\' + c)}(?![0-9]|[.,][0-9])`);
  return re.test(html);
}

function assertNoHidden(html, state, { allowBankrollOf = new Set() } = {}) {
  const lower = html.toLowerCase();
  for (const w of HIDDEN_WORDS) assert.ok(!lower.includes(w), `rendered HTML contains "${w}"`);
  for (const w of RAW_FLAGS) assert.ok(!html.includes(w), `rendered HTML contains raw flag "${w}"`);
  const chips = (html.match(/<span class="chip">(LEAKED|BURNED)<\/span>/g) || []).length;
  if (!state.player.intel.hackedFinancials && !state.player.intel.suckerList) assert.equal(chips, 0, 'tag chips need Intel');
  assert.ok(!/class="[^"]*suspicion/i.test(html), 'no Suspicion bar');
  for (const m of state.board) {
    if (!m) continue;
    for (const v of numberForms(m.threshold)) assert.ok(!hasNumber(html, v), `threshold ${v} of ${m.name} leaked`);
    for (const v of numberForms(m.greed)) assert.ok(!hasNumber(html, v), `greed ${v} of ${m.name} leaked`);
    if (m.suspicion > 0) for (const v of numberForms(m.suspicion)) assert.ok(!hasNumber(html, v), `suspicion ${v} of ${m.name} leaked`);
    if (!allowBankrollOf.has(m.id)) {
      assert.equal(m.revealedBankroll, null);
      // A tapped-out mark's Take equals its bankroll; the Take is meant to show.
      if (m.take < m.bankroll - 0.5) {
        for (const v of numberForms(m.bankroll, { asMoney: true })) assert.ok(!hasNumber(html, v), `bankroll ${v} of ${m.name} rendered without hacked financials`);
      }
    }
  }
}

// Play a run with every verb, rendering after each tick, until it ends or n ticks pass.
function playAndRender(seed, ticks, onRender) {
  const s = openingRun(seed);
  s.player.cash = 5000;
  let first = true;
  for (let i = 0; i < ticks && !s.ended; i++) {
    for (const m of s.board) if (m && m.status === 'cold') pitch(s, m.id, TUNING.pitches[i % 3].name);
    if (first) { hireShill(s); assignShill(s, s.board[0].id); payConvincer(s, s.board[1].id); first = false; }
    if (i % 40 === 39) { const m = s.board.find((x) => x && x.status === 'active'); if (m) cashOut(s, m.id); }
    tick(s, T);
    onRender(renderToString(s), s);
  }
  return s;
}

test('rendered run never shows hidden stats when no Intel is held', () => {
  const s = playAndRender(7, 600, (html, st) => assertNoHidden(html, st));
  assert.ok(s.stats.bolted + s.stats.cashed > 0, 'the run actually did something');
});

test('the LEAKED chip and revealed bankroll appear only while hacked financials is held', () => {
  // Find a seed with a leaked mark on the opening board.
  let s, leakedMark;
  for (let seed = 1; seed < 500 && !leakedMark; seed++) {
    s = openingRun(seed);
    leakedMark = s.board.find((m) => m.leaked);
  }
  assert.ok(leakedMark, 'found a leaked mark');
  s.player.cash = 5000;

  let html = renderToString(s);
  assert.ok(!html.includes('<span class="chip">LEAKED</span>'), 'no LEAKED chip without Intel');
  assertNoHidden(html, s);

  assert.equal(buyIntel(s, 'hackedFinancials').ok, true);
  html = renderToString(s);
  assert.ok(html.includes('<span class="chip">LEAKED</span>'), 'LEAKED chip shows with hacked financials');
  assert.ok(html.includes(`/ ${money(leakedMark.bankroll)}`), 'Take bar shows the revealed cap');
  assert.ok(html.includes('bar capped'));
  assert.ok(!html.includes('leaked'), 'the raw lowercase flag never renders');
  for (const m of s.board) {
    if (m.leaked) continue;
    for (const v of numberForms(m.bankroll, { asMoney: true })) assert.ok(!hasNumber(html, v), 'non-leaked bankroll stays hidden');
  }

  // Let it expire: the chip and the cap go away again.
  tick(s, TUNING.intelDuration + T);
  html = renderToString(s);
  assert.ok(!html.includes('<span class="chip">LEAKED</span>'));
  assertNoHidden(html, s);
});

test('?seed=42 produces the same opening board twice', () => {
  const seed = seedFromSearch('?seed=42');
  assert.equal(seed, 42);
  const board = (st) => st.board.map((m) => `${m.name} | ${m.hook}`);
  const a = openingRun(seed);
  const b = openingRun(seedFromSearch('?seed=42'));
  assert.deepEqual(board(a), board(b));
  assert.equal(renderToString(a), renderToString(b));
  for (const line of board(a)) {
    const [name, hook] = line.split(' | ');
    assert.ok(renderToString(a).includes(name));
    assert.ok(renderToString(a).includes(hook.replace(/'/g, '&#39;')));
  }
  assert.notDeepEqual(board(openingRun(43)), board(a), 'a different seed deals a different board');
  assert.equal(seedFromSearch(''), null);
  assert.equal(seedFromSearch('?seed=abc'), seedFromSearch('?seed=abc'), 'string seeds hash stably');
});

test('verb buttons follow status and affordability', () => {
  const s = openingRun(42);
  let html = renderToString(s);
  for (const p of TUNING.pitches) {
    assert.equal(html.split(`data-arg="${p.name}"`).length - 1, TUNING.boardSize, `one ${p.name} button per cold card`);
  }
  assert.ok(!html.includes('data-verb="cashOut"'));

  const m = s.board[0];
  pitch(s, m.id, 'Sure thing');
  s.player.cash = TUNING.convincerCost - 1;
  html = renderToString(s);
  assert.ok(html.includes(`data-verb="cashOut" data-id="${m.id}"`));
  assert.match(html, new RegExp(`data-verb="convincer" data-id="${m.id}" disabled`), 'convincer greyed when unaffordable');
  assert.match(html, new RegExp(`data-verb="shill" data-id="${m.id}" disabled`), 'shill greyed with no idle shill');

  s.player.cash = 5000;
  hireShill(s);
  payConvincer(s, m.id);
  html = renderToString(s);
  assert.match(html, /Convincer paid/);
  assert.match(html, new RegExp(`data-verb="convincer" data-id="${m.id}" disabled`), 'convincer greyed once paid');
  assert.ok(!new RegExp(`data-verb="shill" data-id="${m.id}" disabled`).test(html), 'shill enabled with an idle shill');
  assignShill(s, m.id);
  html = renderToString(s);
  assert.match(html, /Pull shill/);
  assert.ok(!new RegExp(`data-verb="shill" data-id="${m.id}" disabled`).test(html), 'assigned shill can be pulled');
});

test('ticker shows the last 6 lines and the game-over overlay shows the summary', () => {
  const s = openingRun(42);
  s.player.cash = 50000;
  for (let i = 0; i < 9; i++) hireShill(s);
  let html = renderToString(s);
  assert.equal((html.match(/<li>/g) || []).length, 6);
  assert.match(html, /id="overlay" hidden/);

  s.player.heat = TUNING.heatCeiling - 0.001;
  buyIntel(s, 'hackedFinancials');
  tick(s, 1);
  assert.equal(s.ended, true);
  html = renderToString(s);
  assert.ok(!/id="overlay" hidden/.test(html));
  assert.match(html, /Run it back/);
  assert.ok(html.includes(`<td>Seed</td><td>42</td>`));
  assert.ok(html.includes(money(s.summary.takeBanked)));
});

test('long-con.bundle.js (file:// fallback) is up to date with src/', () => {
  const onDisk = readFileSync(new URL('../long-con.bundle.js', import.meta.url), 'utf8');
  assert.equal(onDisk, buildBundle(), 'run `npm run bundle` and commit the result');
});

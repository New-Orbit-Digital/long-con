// Playtest harness: scripted strategies run headlessly against the sim.
// Each strategy pitches every cold mark with "Sure thing" the moment it
// appears and buys nothing else (no convincers, shills or Intel). They differ
// only in when they cash out:
//   uneasy  cash out the moment a mark's tell band reaches uneasy (or worse)
//   wary    cash out the moment it reaches wary (or worse)
//   never   never cash out
// Usage: node scripts/playtest.js [--strategy <name>] [--verbose]
//                                 [--seconds N] [--seeds N]
//        import { runStrategy, summarize, ... } from './playtest.js'
import { fileURLToPath } from 'node:url';
import { TUNING } from '../src/tuning.js';
import { createRun, tick, pitch, cashOut } from '../src/sim.js';

const BAND_ORDER = ['calm', 'uneasy', 'wary', 'about-to-bolt'];

// Strategy name -> the tell band at which it cashes out (null = never).
export const STRATEGIES = { uneasy: 'uneasy', wary: 'wary', never: null };

export const DEFAULTS = { seconds: 900, seeds: 50 };

function atOrPast(band, target) {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(target);
}

// One seeded run of one strategy. Steps the sim at tuning.tickSeconds until
// `seconds` of sim time have passed or the run ends (Heat hit the ceiling).
// Returns { strategy, seed, take, seconds, bolts, cashed, heat, endedByHeat }.
export function runStrategy(name, seed, seconds = DEFAULTS.seconds, tuning = TUNING) {
  if (!(name in STRATEGIES)) throw new Error(`unknown strategy "${name}" (try: ${Object.keys(STRATEGIES).join(', ')})`);
  const cashAt = STRATEGIES[name];
  const step = tuning.tickSeconds;
  const steps = Math.round(seconds / step);
  const s = createRun(seed, tuning);
  for (let i = 0; i < steps && !s.ended; i++) {
    tick(s, step);
    if (s.ended) break;
    for (const m of s.board) {
      if (!m || s.ended) continue;
      if (m.status === 'cold') pitch(s, m.id, 'Sure thing');
      else if (m.status === 'active' && cashAt && atOrPast(m.tellBand, cashAt)) cashOut(s, m.id);
    }
  }
  return {
    strategy: name,
    seed,
    take: s.stats.takeBanked,
    seconds: s.player.clock,
    bolts: s.stats.bolted,
    cashed: s.stats.cashed,
    heat: s.player.heat,
    endedByHeat: s.ended,
  };
}

export function median(values) {
  if (!values.length) return NaN;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Rows from runStrategy (one strategy) -> the table row for it.
export function summarize(rows) {
  const takes = rows.map((r) => r.take);
  return {
    strategy: rows.length ? rows[0].strategy : null,
    runs: rows.length,
    medianTake: median(takes),
    meanTake: takes.reduce((a, b) => a + b, 0) / (rows.length || 1),
    medianSeconds: median(rows.map((r) => r.seconds)),
    medianBolts: median(rows.map((r) => r.bolts)),
    heatShare: rows.filter((r) => r.endedByHeat).length / (rows.length || 1),
  };
}

// Run seeds 1..seeds for each named strategy.
export function runAll({ strategies = Object.keys(STRATEGIES), seconds = DEFAULTS.seconds, seeds = DEFAULTS.seeds, tuning = TUNING } = {}) {
  return strategies.map((name) => {
    const rows = [];
    for (let seed = 1; seed <= seeds; seed++) rows.push(runStrategy(name, seed, seconds, tuning));
    return { name, rows, summary: summarize(rows) };
  });
}

function table(header, body) {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function formatSummary(summaries) {
  return table(
    ['strategy', 'median Take', 'mean Take', 'median secs', 'median bolts', 'ended by Heat'],
    summaries.map((s) => [s.strategy, usd(s.medianTake), usd(s.meanTake), num(s.medianSeconds), num(s.medianBolts), `${Math.round(s.heatShare * 100)}%`]),
  );
}

export function formatRows(rows) {
  return table(
    ['strategy', 'seed', 'Take', 'secs', 'bolts', 'cashed', 'heat', 'ended by Heat'],
    rows.map((r) => [r.strategy, String(r.seed), usd(r.take), num(r.seconds), String(r.bolts), String(r.cashed), num(r.heat), r.endedByHeat ? 'yes' : 'no']),
  );
}

export function parseArgs(argv) {
  const opts = { strategies: Object.keys(STRATEGIES), seconds: DEFAULTS.seconds, seeds: DEFAULTS.seeds, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--verbose') opts.verbose = true;
    else if (a === '--strategy') {
      const name = val();
      if (!(name in STRATEGIES)) throw new Error(`unknown strategy "${name}" (try: ${Object.keys(STRATEGIES).join(', ')})`);
      opts.strategies = [name];
    } else if (a === '--seconds' || a === '--seeds') {
      const n = Number(val());
      if (!(n > 0) || (a === '--seeds' && !Number.isInteger(n))) throw new Error(`${a} needs a positive ${a === '--seeds' ? 'integer' : 'number'}`);
      opts[a.slice(2)] = n;
    } else throw new Error(`unknown flag "${a}"`);
  }
  return opts;
}

export function main(argv = process.argv.slice(2), out = console.log) {
  const opts = parseArgs(argv);
  const results = runAll(opts);
  out(`Long Con playtest: seeds 1..${opts.seeds}, ${opts.seconds}s of sim time, tick ${TUNING.tickSeconds}s, "Sure thing" only, nothing bought.`);
  if (opts.verbose) {
    out('');
    out(formatRows(results.flatMap((r) => r.rows)));
  }
  out('');
  out(formatSummary(results.map((r) => r.summary)));
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(`playtest: ${err.message}`);
    process.exit(1);
  }
}

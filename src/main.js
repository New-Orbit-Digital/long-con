// Boots a run from a seed and drives the sim from requestAnimationFrame.
// The pure helpers (seedFromSearch, openingRun) are exported for tests; the
// browser loop only starts when there is a document.
import { TUNING } from './tuning.js';
import { createRun, tick, pitch, cashOut, payConvincer, hireShill, assignShill, unassignShill, buyIntel } from './sim.js';
import { createDomRenderer, bindVerbs } from './ui.js';

const MAX_DT = 0.5; // seconds; a background tab resumes with one small step, not a huge one

export function randomSeed() {
  return Math.floor(Math.random() * 1e9);
}

// '?seed=42' -> 42. A non-numeric seed is hashed so any string replays.
// Returns null when there is no seed in the query string.
export function seedFromSearch(search) {
  const raw = new URLSearchParams(search || '').get('seed');
  if (raw == null || raw.trim() === '') return null;
  if (/^\d+$/.test(raw.trim())) return Number(raw.trim()) >>> 0;
  let h = 2166136261;
  for (const ch of raw) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// A run with its opening board dealt (the first tick fills every slot).
export function openingRun(seed, tuning = TUNING) {
  const state = createRun(seed, tuning);
  tick(state, tuning.tickSeconds);
  return state;
}

export function boot(root, win) {
  let seed = seedFromSearch(win.location.search);
  if (seed == null) {
    seed = randomSeed();
    try { win.history.replaceState(null, '', `?seed=${seed}`); } catch (e) { /* file:// may refuse; the seed still shows in the header */ }
  }
  const state = openingRun(seed);
  const view = createDomRenderer(root);
  const now = () => win.performance.now();

  const act = (fn) => (id, arg) => { fn(id, arg); view.render(state, now()); };
  bindVerbs(root, {
    pitch: act((id, name) => pitch(state, id, name)),
    cashOut: act((id) => cashOut(state, id)),
    convincer: act((id) => payConvincer(state, id)),
    shill: act((id) => {
      const mark = state.board.find((m) => m && m.id === id);
      if (mark && mark.shill) unassignShill(state, id); else assignShill(state, id);
    }),
    intel: act((_, type) => buyIntel(state, type)),
    hire: act(() => hireShill(state)),
    restart: () => { win.location.search = `?seed=${randomSeed()}`; },
  });

  let last = null;
  function frame(t) {
    const dt = last == null ? 0 : Math.min(MAX_DT, Math.max(0, (t - last) / 1000));
    last = t;
    tick(state, dt);
    view.render(state, t);
    win.requestAnimationFrame(frame);
  }
  view.render(state, now());
  win.requestAnimationFrame(frame);
  return state;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__longConBooted) {
  window.__longConBooted = true;
  const start = () => { window.longCon = boot(document.getElementById('app'), window); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

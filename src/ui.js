// Renders a run to HTML. No sim logic here, and no hidden stats: every value
// the page shows goes through viewModel(), which copies only player-visible
// fields off the state. renderToString(state) is pure (tests use it); the DOM
// renderer reuses the same region strings and only swaps the ones that changed.

import { idleShills, shillPrice } from './sim.js';

const GHOST_MS = 600; // a bolted card flashes red and drops over this long
const SOFT_TAKE_SCALE = 2000; // uncapped Take bar: take / (take + scale), never full
const TAG_LABELS = { leaked: 'LEAKED', burned: 'BURNED' };
const INTEL = [
  { type: 'suckerList', label: 'Sucker list', blurb: 'shows BURNED marks' },
  { type: 'hackedFinancials', label: 'Hacked financials', blurb: 'shows LEAKED marks and how deep they go; draws Heat' },
];

// ---- formatting ----

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function clockText(seconds) {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const pct = (x) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;

// ---- view model: the whitelist of what the player may see ----

function markView(state, mark, ghost) {
  const t = state.tuning;
  const idle = idleShills(state);
  const cap = typeof mark.revealedBankroll === 'number' ? mark.revealedBankroll : null;
  return {
    kind: 'mark',
    ghost: Boolean(ghost),
    id: mark.id,
    name: mark.name,
    hook: mark.hook,
    tags: (mark.tags || []).map((tag) => TAG_LABELS[tag] || tag.toUpperCase()),
    status: mark.status,
    pitch: mark.pitch,
    take: mark.take,
    cap,
    tell: mark.tell,
    shillOn: Boolean(mark.shill),
    convincerPaid: mark.convincerPaid > 0,
    canConvince: mark.convincerPaid <= 0 && state.player.cash >= t.convincerCost,
    canShill: Boolean(mark.shill) || idle > 0,
  };
}

export function viewModel(state, opts = {}) {
  const t = state.tuning;
  const p = state.player;
  const ghosts = opts.ghosts || {};
  return {
    seed: state.seed,
    cash: typeof opts.displayCash === 'number' ? opts.displayCash : p.cash,
    countingUp: typeof opts.displayCash === 'number' && opts.displayCash < p.cash,
    heat: p.heat,
    heatCeiling: t.heatCeiling,
    clock: p.clock,
    shills: p.shills,
    idle: idleShills(state),
    convincerCost: t.convincerCost,
    pitches: t.pitches.map((x) => ({ name: x.name, plays: x.matchesTag ? TAG_LABELS[x.matchesTag] : null })),
    slots: state.board.map((mark, i) => {
      if (ghosts[i]) return markView(state, ghosts[i], true);
      if (mark) return markView(state, mark, false);
      return { kind: 'empty', refillIn: state.refillTimers[i] };
    }),
    intel: INTEL.map((x) => {
      const left = typeof p.intel[x.type] === 'number' ? p.intel[x.type] : 0;
      const price = t.intelCost[x.type];
      return { ...x, price, left, canBuy: !state.ended && p.cash >= price };
    }),
    shillPrice: shillPrice(state),
    canHire: !state.ended && p.cash >= shillPrice(state),
    log: p.log.slice(-6),
    over: state.ended && state.summary
      ? { ...state.summary }
      : null,
  };
}

// ---- region renderers (strings) ----

function btn(verb, label, { id, arg, disabled, title, cls } = {}) {
  const attrs = [`data-verb="${verb}"`];
  if (id != null) attrs.push(`data-id="${esc(id)}"`);
  if (arg != null) attrs.push(`data-arg="${esc(arg)}"`);
  if (title) attrs.push(`title="${esc(title)}"`);
  if (disabled) attrs.push('disabled');
  return `<button class="btn${cls ? ' ' + cls : ''}" ${attrs.join(' ')}>${esc(label)}</button>`;
}

export function renderHeader(vm) {
  const heatRatio = vm.heat / vm.heatCeiling;
  const hot = heatRatio >= 0.75 ? ' hot' : '';
  return `<div class="brand">LONG CON <span class="dim">// seed ${esc(vm.seed)}</span></div>
<div class="stat"><span class="label">CASH</span> <span class="cash${vm.countingUp ? ' counting' : ''}">${money(vm.cash)}</span></div>
<div class="stat heat${hot}"><span class="label">HEAT</span> <span class="bar"><span class="fill" style="width:${pct(heatRatio)}"></span></span> <span class="num">${vm.heat.toFixed(1)}/${vm.heatCeiling}</span></div>
<div class="stat"><span class="label">CLOCK</span> ${clockText(vm.clock)}</div>
<div class="stat"><span class="label">SHILLS</span> ${vm.shills} <span class="dim">(${vm.idle} idle)</span></div>`;
}

export function renderSlot(vm, slot) {
  if (slot.kind === 'empty') {
    return `<div class="card empty"><div class="ringing">LINE RINGING&hellip;</div><div class="dim">next mark in ${Math.ceil(Math.max(0, slot.refillIn))}s</div></div>`;
  }
  const chips = slot.tags.map((tag) => `<span class="chip">${esc(tag)}</span>`).join('');
  const statusText = slot.ghost ? 'BOLTED'
    : slot.status === 'active' ? `ON THE HOOK: ${esc(slot.pitch).toUpperCase()}` : 'COLD';
  const extras = [];
  if (!slot.ghost && slot.status === 'active') {
    if (slot.shillOn) extras.push('<span class="chip soft">SHILL ON</span>');
    if (slot.convincerPaid) extras.push('<span class="chip soft">CONVINCED</span>');
  }
  const capped = slot.cap != null;
  const fill = capped ? slot.take / slot.cap : slot.take / (slot.take + SOFT_TAKE_SCALE);
  const takeLine = capped ? `${money(slot.take)} <span class="dim">/ ${money(slot.cap)}</span>` : money(slot.take);

  let verbs = '';
  if (slot.ghost) {
    verbs = '<div class="verbs"><span class="dim">Line went dead.</span></div>';
  } else if (slot.status === 'cold') {
    verbs = `<div class="verbs">${vm.pitches.map((p) => btn('pitch', p.name, { id: slot.id, arg: p.name, title: p.plays ? `Plays to ${p.plays} marks` : null })).join('')}</div>`;
  } else if (slot.status === 'active') {
    verbs = `<div class="verbs">${[
      btn('cashOut', 'Cash out', { id: slot.id, cls: 'primary' }),
      btn('convincer', slot.convincerPaid ? 'Convincer paid' : `Convincer ${money(vm.convincerCost)}`, { id: slot.id, disabled: !slot.canConvince }),
      btn('shill', slot.shillOn ? 'Pull shill' : 'Put shill on', { id: slot.id, disabled: !slot.canShill }),
    ].join('')}</div>`;
  }

  return `<div class="card ${slot.ghost ? 'bolting' : esc(slot.status)}">
<div class="name">${esc(slot.name)} ${chips}</div>
<div class="hook">${esc(slot.hook)}</div>
<div class="status">${statusText} ${extras.join('')}</div>
<div class="take"><span class="label">TAKE</span> ${takeLine}<span class="bar${capped ? ' capped' : ' uncapped'}"><span class="fill" style="width:${pct(fill)}"></span></span></div>
<div class="tell"><em>&ldquo;${esc(slot.tell || '')}&rdquo;</em></div>
${verbs}
</div>`;
}

export function renderOffice(vm) {
  const intel = vm.intel.map((x) => {
    const active = x.left > 0;
    const label = `${active ? 'Renew' : 'Buy'} ${x.label} ${money(x.price)}`;
    const note = active ? `<span class="live">${Math.ceil(x.left)}s left</span>` : `<span class="dim">${esc(x.blurb)}</span>`;
    return `<div class="row">${btn('intel', label, { arg: x.type, disabled: !x.canBuy })} ${note}</div>`;
  }).join('');
  const hire = `<div class="row">${btn('hire', `Hire shill ${money(vm.shillPrice)}`, { disabled: !vm.canHire })} <span class="dim">calms a mark; draws a wage while on one</span></div>`;
  return `<h2>THE OFFICE</h2>${intel}${hire}`;
}

export function renderTicker(vm) {
  const lines = vm.log.map((l) => `<li>${esc(l)}</li>`).join('');
  return `<h2>TICKER</h2><ol class="log">${lines || '<li class="dim">Phones are quiet.</li>'}</ol>`;
}

export function renderOverlay(vm) {
  if (!vm.over) return '';
  const o = vm.over;
  return `<div class="panel">
<h2>THE HEAT CAME DOWN</h2>
<table>
<tr><td>Take banked</td><td>${money(o.takeBanked)}</td></tr>
<tr><td>Marks cashed</td><td>${o.cashed}</td></tr>
<tr><td>Marks bolted</td><td>${o.bolted}</td></tr>
<tr><td>Seconds survived</td><td>${o.seconds.toFixed(1)}</td></tr>
<tr><td>Seed</td><td>${esc(o.seed)}</td></tr>
</table>
${btn('restart', 'Run it back', { cls: 'primary' })}
</div>`;
}

export function renderRegions(state, opts = {}) {
  const vm = viewModel(state, opts);
  return {
    header: renderHeader(vm),
    slots: vm.slots.map((s) => renderSlot(vm, s)),
    office: renderOffice(vm),
    ticker: renderTicker(vm),
    overlay: renderOverlay(vm),
  };
}

// The whole screen as one HTML string. Pure; the DOM renderer uses the same regions.
export function renderToString(state, opts = {}) {
  const r = renderRegions(state, opts);
  return `<header id="header">${r.header}</header>
<section id="board">${r.slots.map((s, i) => `<div class="slot" data-slot="${i}">${s}</div>`).join('')}</section>
<section id="office">${r.office}</section>
<section id="ticker">${r.ticker}</section>
<div id="overlay"${r.overlay ? '' : ' hidden'}>${r.overlay}</div>`;
}

// ---- DOM renderer ----

// Builds the screen inside `root` and returns { render(state, nowMs) }.
// Keeps two bits of presentation state: the shown cash (counts up toward real
// cash) and ghosts of bolted marks (held on their slot for GHOST_MS).
export function createDomRenderer(root) {
  let built = false;
  let els = null;
  const last = { header: null, slots: [], office: null, ticker: null, overlay: null };
  let prevBoard = [];
  const ghosts = {}; // slot -> { mark, until }
  let shownCash = null;
  let lastNow = null;

  function build(state) {
    root.innerHTML = renderToString(state);
    els = {
      header: root.querySelector('#header'),
      slots: [...root.querySelectorAll('#board .slot')],
      office: root.querySelector('#office'),
      ticker: root.querySelector('#ticker'),
      overlay: root.querySelector('#overlay'),
    };
    built = true;
  }

  function swap(el, key, html, i) {
    const prev = i == null ? last[key] : last[key][i];
    if (prev === html) return;
    el.innerHTML = html;
    if (i == null) last[key] = html; else last[key][i] = html;
  }

  return {
    render(state, nowMs) {
      if (!built) build(state);
      const dt = lastNow == null ? 0 : Math.max(0, (nowMs - lastNow) / 1000);
      lastNow = nowMs;

      // A mark that left its slot with status 'bolted' becomes a ghost.
      state.board.forEach((mark, i) => {
        const prev = prevBoard[i];
        if (prev && prev !== mark && prev.status === 'bolted') ghosts[i] = { mark: prev, until: nowMs + GHOST_MS };
        if (ghosts[i] && (nowMs >= ghosts[i].until || mark)) delete ghosts[i];
      });
      prevBoard = state.board.slice();

      // Cash counts up on gains, snaps down on spends.
      const cash = state.player.cash;
      if (shownCash == null || cash <= shownCash) shownCash = cash;
      else shownCash = Math.min(cash, shownCash + Math.max((cash - shownCash) * Math.min(1, dt * 5), 60 * dt));

      const ghostMarks = {};
      for (const k of Object.keys(ghosts)) ghostMarks[k] = ghosts[k].mark;
      const r = renderRegions(state, { ghosts: ghostMarks, displayCash: shownCash });
      swap(els.header, 'header', r.header);
      r.slots.forEach((html, i) => swap(els.slots[i], 'slots', html, i));
      swap(els.office, 'office', r.office);
      swap(els.ticker, 'ticker', r.ticker);
      swap(els.overlay, 'overlay', r.overlay);
      els.overlay.hidden = !r.overlay;
    },
  };
}

// One delegated listener for every verb button. `handlers` maps a verb name to
// (id, arg) => void. Fires on pointerdown so a click isn't lost when a card
// re-renders between press and release; keyboard activation still works via click.
export function bindVerbs(root, handlers) {
  function fire(e) {
    const b = e.target.closest && e.target.closest('button[data-verb]');
    if (!b || b.disabled || !root.contains(b)) return;
    const h = handlers[b.dataset.verb];
    if (!h) return;
    e.preventDefault();
    const id = b.dataset.id != null ? Number(b.dataset.id) : null;
    h(id, b.dataset.arg != null ? b.dataset.arg : null);
  }
  root.addEventListener('pointerdown', (e) => { if (e.button === 0) fire(e); });
  root.addEventListener('click', (e) => { if (e.detail === 0) fire(e); });
}

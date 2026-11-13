import { CHAINS, CHAIN, ITEMS } from './data/index.js';
import { TIERS, density, tierOf } from './core/nutrition.js';
import { isAvailable, isBreakfastTime, BREAKFAST } from './core/availability.js';
import { decodeMeal } from './core/share.js';
import { buildMeal } from './core/matcher.js';
import { tdee } from './core/tdee.js';
import { userData, local } from './store.js';
import {
  state, t, setLang, SORTS, SKINS, hashChain, getItem, nameOf, catName, fmtInt, fmtDate, ALL_ITEMS, isAll, norm,
} from './state.js';
import { $, esc, ICON, card, row, toast, catEmoji } from './ui/parts.js';
import { padSheets, padActions, padForms, padPanel, padCount, addToPad } from './ui/pad.js';
import { collectionSheets, collectionActions, collectionForms, editorInput, editorQty } from './ui/collections.js';
import { browseSheets } from './ui/sheets.js';
import { moreSheet } from './ui/more.js';
import { reportSheet, submitReport, reportReset, reportInput, reportActions } from './ui/report.js';
import { startTour, maybeStartTour } from './ui/tour.js';
import { initSync, signIn, signOut, syncNow } from './sync.js';
import { initPwa, pwa } from './pwa.js';

// ---------- browsing ----------
// Add-ons and near-zero-calorie items say little about protein density, so they go last.
const sinks = (it) => (!tierOf(it) || it.cat === 'extras' ? 1 : 0);
const SORT_FN = {
  kcal: (a, b) => a.kcal - b.kcal,
  protein: (a, b) => b.p - a.p,
  density: (a, b) => sinks(a) - sinks(b) || density(b) - density(a) || b.p - a.p,
  fat: (a, b) => a.f - b.f,
  carbs: (a, b) => a.c - b.c,
  sugar: (a, b) => a.sug - b.sug,
  salt: (a, b) => a.salt - b.salt,
  az: (a, b) => nameOf(a).localeCompare(nameOf(b), state.lang),
};

const chainItems = () => (isAll() ? ALL_ITEMS : CHAIN[state.chain].items);

function visibleItems() {
  const q = norm(state.q.trim());
  let list = chainItems();
  if (state.cat !== 'all') list = list.filter((it) => it.cat === state.cat);
  if (q) list = list.filter((it) => norm(it.pt + ' ' + (it.en || '') + (isAll() ? ' ' + CHAIN[it.chain].name : '')).includes(q));
  if (state.tiers.size) list = list.filter((it) => state.tiers.has(tierOf(it)));
  return [...list].sort(SORT_FN[state.sort]);
}

function categories() {
  const counts = new Map();
  for (const it of chainItems()) counts.set(it.cat, (counts.get(it.cat) || 0) + 1);
  return [...counts.entries()];
}

function selectChain(id) {
  state.chain = CHAIN[id] ? id : 'all';
  state.cat = 'all';
  state.matchResult = null;
  state.ddOpen = false;
  // "/" is the all-restaurants home; a chain gets a shareable hash (#kfc).
  history.replaceState(null, '', location.pathname + location.search + (isAll() ? '' : '#' + state.chain));
}

// ---------- chrome ----------
function applySkin() {
  document.documentElement.dataset.skin = state.skin;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#120d0b');
}

function renderChrome() {
  document.documentElement.lang = state.lang === 'pt' ? 'pt-PT' : 'en';
  const c = isAll() ? null : CHAIN[state.chain];
  document.title = c ? `${c.name} · Macro Meals` : 'Macro Meals';
  document.documentElement.style.setProperty('--chain', c ? c.color : '#d62300');
  $('#heroTag').textContent = (c ? `${c.name} · ${t('itemsOnMenu', { n: c.items.length })}` : `${t('allRestaurants')} · ${t('itemsOnMenu', { n: ALL_ITEMS.length })}`).toUpperCase();
  $('#heroSub').textContent = t('tagline');
  for (const b of $('#langSwitch').children) {
    b.classList.toggle('on', b.dataset.lang === state.lang);
    b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  }
  $('#langSwitch').setAttribute('aria-label', t('language'));
  const n = padCount();
  const favN = userData.favKeys().length;
  $('#btnMealTop').innerHTML = `${ICON.bag}<span>${t('nav_meal')}</span>${n ? `<em>${n}</em>` : ''}`;
  $('#btnFavsTop').innerHTML = `${ICON.heart}<span>${t('nav_favs')}</span>${favN ? `<em>${favN}</em>` : ''}`;
  $('#btnMoreTop').innerHTML = `${ICON.more}<span>${t('nav_more')}</span>`;
  const active = state.sheet || 'browse';
  $('#bottomNav').innerHTML = [
    ['browse', ICON.menu, t('nav_browse')],
    ['meal', ICON.bag, t('nav_meal'), n],
    ['favs', ICON.heart, t('nav_favs'), favN],
    ['more', ICON.more, t('nav_more')],
  ].map(([id, ic, label, k]) => `<button type="button" data-open="${id}" class="${active === id ? 'on' : ''}">${ic}<span>${label}</span>${k ? `<em>${k}</em>` : ''}</button>`).join('');
  $('#footer').innerHTML = `<p>${esc(t('footerMade'))} ${esc(t('aboutUnofficial'))}</p>
    <p><button type="button" class="link" data-open="about">${esc(t('tool_about'))}</button> · <button type="button" class="link" data-open="report">${esc(t('reportTitle'))}</button></p>`;
}

function chainDropdown() {
  const options = [{ id: 'all', name: t('allRestaurants'), color: 'var(--text)', n: ALL_ITEMS.length },
    ...CHAINS.map((c) => ({ id: c.id, name: c.name, color: c.color, n: c.items.length }))];
  const cur = options.find((o) => o.id === state.chain);
  return `<div class="dd ${state.ddOpen ? 'open' : ''}">
    <button type="button" class="dd-btn" data-act="ddToggle" aria-haspopup="listbox" aria-expanded="${state.ddOpen}" aria-label="${esc(t('restaurant'))}: ${esc(cur.name)}">
      <i style="background:${cur.color}"></i><span>${esc(cur.name)}</span><small>${cur.n}</small>${ICON.down}</button>
    <div class="dd-list" role="listbox" aria-label="${esc(t('restaurant'))}" ${state.ddOpen ? '' : 'hidden'}>
      ${options.map((o) => `<button type="button" role="option" aria-selected="${o.id === state.chain}" class="${o.id === state.chain ? 'on' : ''}" data-chain="${o.id}">
        <i style="background:${o.color}"></i><span>${esc(o.name)}</span><small>${o.n}</small></button>`).join('')}
    </div>
  </div>`;
}

function renderSidebar() {
  const cats = categories();
  $('#sidebar').innerHTML = `
    <div class="side-search">
      <label class="search">${ICON.search}<input id="q" type="search" value="${esc(state.q)}" placeholder="${esc(isAll() ? t('searchAll') : t('search'))}" aria-label="${esc(t('search'))}"></label>
    </div>
    <div class="side-label">${esc(t('restaurant'))} <span>${t('menus', { n: CHAINS.length })}</span></div>
    ${chainDropdown()}
    <div class="side-label">${esc(t('categories'))}</div>
    <div class="cats">
      <button type="button" class="cat-btn ${state.cat === 'all' ? 'on' : ''}" data-cat="all"><span>${esc(t('all'))}</span><small>${chainItems().length}</small></button>
      ${cats.map(([k, n]) => `<button type="button" class="cat-btn ${state.cat === k ? 'on' : ''}" data-cat="${k}"><span>${catEmoji(k)} ${esc(catName(k))}</span><small>${n}</small></button>`).join('')}
    </div>`;
}

function breakfastNotice() {
  const show = state.chain === 'mcdonalds' || (state.cat === 'breakfast' && isAll());
  if (!show) return '';
  const on = isBreakfastTime(state.now);
  return `<p class="notice ${on ? 'on' : ''}" role="status">${ICON.clock}<span>${esc(t('breakfastNote', { start: BREAKFAST.start, end: BREAKFAST.end }))} <b>${esc(on ? t('breakfastNow') : t('breakfastLater'))}</b></span></p>`;
}

function renderMain() {
  const list = visibleItems();
  const qFocused = document.activeElement?.id === 'q';
  const c = isAll() ? null : CHAIN[state.chain];
  $('#main').innerHTML = `
    <div class="actions">
      <button type="button" class="action action-yellow" data-open="matcher">
        <span class="action-ic">${ICON.target}</span>
        <span class="action-txt"><b>${esc(t('matcherTitle'))}</b><small>${esc(t('matcherSub'))}</small></span>
        <span class="action-go">${ICON.chev}</span>
      </button>
      <button type="button" class="action action-cream" data-open="compare">
        <span class="action-ic">${ICON.scale}</span>
        <span class="action-txt"><b>${esc(t('compareTitle'))}${state.compare.length ? ` (${state.compare.length})` : ''}</b><small>${esc(t('compareSub'))}</small></span>
        <span class="action-go">${ICON.chev}</span>
      </button>
    </div>
    ${breakfastNotice()}
    <div class="toolbar">
      <div class="sorts" role="group" aria-label="${esc(t('sortBy'))}">
        <span class="sort-label">${esc(t('sortBy'))}</span>
        ${SORTS.map((s) => `<button type="button" class="chip ${state.sort === s ? 'on' : ''}" data-sort="${s}" aria-pressed="${state.sort === s}">${esc(t('sort_' + s))}</button>`).join('')}
      </div>
      <div class="tiers" role="group" aria-label="${esc(t('tiers'))}">
        <span class="sort-label">${esc(t('tiers'))}</span>
        ${TIERS.map((x) => `<button type="button" class="tier-chip stamp-${x.t} ${state.tiers.has(x.t) ? 'on' : ''}" data-tier="${x.t}" aria-pressed="${state.tiers.has(x.t)}" title="${esc(t('tier_' + x.t))}">${x.t}</button>`).join('')}
        <button type="button" class="info" data-open="tiers" aria-label="${esc(t('tiers'))}">i</button>
      </div>
      <div class="count-row">
        <span class="count">${t('matches', { n: list.length })}</span>
        <div class="view-toggle" role="group">
          <button type="button" data-view="grid" class="${state.view === 'grid' ? 'on' : ''}" aria-label="${esc(t('gridView'))}" aria-pressed="${state.view === 'grid'}">${ICON.grid}</button>
          <button type="button" data-view="list" class="${state.view === 'list' ? 'on' : ''}" aria-label="${esc(t('listView'))}" aria-pressed="${state.view === 'list'}">${ICON.list}</button>
        </div>
      </div>
    </div>
    ${list.length
      ? `<div class="${state.view === 'grid' ? 'grid' : 'rows'}">${list.map((it) => (state.view === 'grid' ? card(it, { showChain: isAll() }) : row(it, { showChain: isAll() }))).join('')}</div>`
      : `<div class="empty"><p>${esc(t('noMatches'))}</p><button type="button" class="btn" data-clear-filters>${esc(t('clearFilters'))}</button></div>`}
    <div class="legend">
      <span><i class="dot mp"></i>${esc(t('protein'))}</span><span><i class="dot mf"></i>${esc(t('fat'))}</span><span><i class="dot mc"></i>${esc(t('carbs'))}</span>
      <p>${esc(t('legend'))}</p>
      <p class="src">${c
        ? `${esc(t('figuresFrom', { src: c.sourceName[state.lang], date: fmtDate(c.checked) }))} <a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(t('viewSource'))}</a>`
        : `${esc(t('figuresAll'))} <button type="button" class="link" data-open="about">${esc(t('tool_about'))}</button>`}</p>
    </div>`;
  if (qFocused) {
    const q = $('#q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}

const wide = matchMedia('(min-width: 1280px)');
function renderPadPanel() {
  const el = $('#padPanel');
  if (!wide.matches) { el.innerHTML = ''; return; }
  el.innerHTML = padPanel();
}

function render() {
  applySkin();
  renderChrome();
  renderSidebar();
  renderMain();
  renderPadPanel();
  if (state.sheet) renderSheet();
}

// ---------- sheets ----------
function openSheet(name, arg = null) {
  if (name === 'browse') { closeSheet(); return; }
  if (name === 'meal' && wide.matches && !state.sheet) { $('#padPanel')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (name === 'report') reportReset();
  if (name !== 'editor') state.editor = null;
  state.sheet = name;
  state.sheetArg = arg;
  renderSheet(true);
  const bd = $('#sheetBackdrop');
  bd.hidden = false;
  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.classList.add('locked');
  renderChrome();
}

function closeSheet() {
  state.sheet = null;
  state.editor = null;
  state.customEdit = null;
  const bd = $('#sheetBackdrop');
  bd.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!state.sheet) bd.hidden = true; }, 200);
  renderChrome();
}

const SHEETS = {
  ...padSheets,
  ...collectionSheets,
  ...browseSheets,
  more: moreSheet,
  report: reportSheet,
};

// Re-render the open sheet, keeping scroll position and the focused field.
function renderSheet(fresh = false) {
  const fn = SHEETS[state.sheet];
  if (!fn) return;
  const el = $('#sheet');
  const body = el.querySelector('.sheet-body');
  const scroll = fresh ? 0 : body?.scrollTop || 0;
  const active = !fresh && el.contains(document.activeElement) ? document.activeElement : null;
  const focusSel = active?.id ? '#' + active.id : active?.name ? `[name="${active.name}"]` : null;
  const caret = active && 'selectionStart' in active ? active.selectionStart : null;
  el.className = 'sheet sheet-' + state.sheet;
  el.innerHTML = fn(state.sheetArg);
  el.setAttribute('aria-label', el.querySelector('h2')?.textContent || '');
  const nb = el.querySelector('.sheet-body');
  if (nb) nb.scrollTop = scroll;
  if (focusSel) {
    const f = el.querySelector(focusSel);
    if (f) { f.focus(); if (caret != null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch { /* not a text field */ } }
  }
  if (state.sheet === 'tdee') updateTdee();
  el.querySelector('.more-nav .on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const refresh = () => { renderChrome(); renderPadPanel(); if (state.sheet) renderSheet(); };
const ctx = { openSheet, closeSheet, render, refresh };

// ---------- matcher ----------
function runMatcher(form, reshuffle = false) {
  const fd = new FormData(form);
  const prefs = { chain: fd.get('chain'), kcal: +fd.get('kcal') || 700, protein: +fd.get('protein') || 0, max: +fd.get('max') || 3, desserts: !!fd.get('desserts'), drinks: !!fd.get('drinks') };
  local.set('matcher', prefs);
  state.matchResult = buildMeal((CHAIN[prefs.chain] || CHAINS[0]).items, prefs, state.now, Math.random, reshuffle);
}

// ---------- TDEE ----------
function updateTdee() {
  const form = $('#tdeeForm');
  if (!form) return null;
  const fd = new FormData(form);
  const p = { sex: fd.get('sex'), age: +fd.get('age'), h: +fd.get('h'), w: +fd.get('w'), act: +fd.get('act'), goal: fd.get('goal') };
  local.set('tdee', p);
  const r = tdee(p);
  $('#tdeeResult').innerHTML = `<b>${esc(t('tdeeResult', { m: fmtInt(r.maintenance) }))}</b><span>${esc(t('tdeeTarget', { k: fmtInt(r.kcal), p: r.protein }))}</span>`;
  return { kcal: r.kcal, protein: r.protein };
}

// ---------- actions (data-act) and forms (data-form) ----------
const ACTIONS = {
  ...padActions,
  ...collectionActions,
  ...reportActions,
  ddToggle() { state.ddOpen = !state.ddOpen; renderSidebar(); if (state.ddOpen) $('.dd-list [aria-selected="true"]')?.focus(); },
  clearTarget() { userData.setPref('target', null); openSheet('meal'); },
  clearCompare() { state.compare = []; local.set('compare', state.compare); renderMain(); },
  shuffle() { runMatcher($('#matcherForm'), true); },
  addCombo() {
    for (const it of state.matchResult.combo) addToPad(it.key);
    toast(t('added'));
    openSheet('meal');
  },
  moreTab(tab) { state.moreTab = tab; },
  skin(s) {
    if (!SKINS.includes(s)) return;
    state.skin = s;
    userData.setPref('skin', s);
    applySkin();
  },
  signIn() { signIn(); },
  allowDrive() { signIn(true); },
  // Retry after an error; if the sign-in has lapsed this switches to "Reconnect".
  syncRetry() { syncNow(); },
  signOut() { if (confirm(t('confirmSignOut'))) signOut(); },
  syncNow() { syncNow(); },
  async install() { await pwa.prompt(); },
  tour() { startTour(ctx); },
};

const FORMS = {
  ...padForms,
  ...collectionForms,
  target(form) {
    const fd = new FormData(form);
    const kcal = +fd.get('kcal'), protein = +fd.get('protein');
    if (!(kcal >= 800 && kcal <= 6000 && protein >= 0 && protein <= 400)) { form.reportValidity(); return; }
    userData.setPref('target', { kcal, protein });
    openSheet('meal');
  },
  tdee() {
    userData.setPref('target', updateTdee());
    openSheet('meal');
  },
  matcher(form) {
    runMatcher(form);
    renderSheet();
    $('#sheet .match, #sheet .empty-note')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  report(form) { submitReport(form, () => renderSheet()); },
};

// ---------- events ----------
document.addEventListener('click', (e) => {
  if (state.ddOpen && !e.target.closest('.dd')) { state.ddOpen = false; renderSidebar(); }
  const el = e.target.closest('button, [data-key], a');
  if (!el) {
    if (e.target === $('#sheetBackdrop')) closeSheet();
    return;
  }
  const d = el.dataset;
  if (d.act && ACTIONS[d.act]) {
    e.stopPropagation();
    Promise.resolve(ACTIONS[d.act](d.arg, ctx, el)).then(refresh);
    return;
  }
  if (d.lang) { setLang(d.lang); userData.setPref('lang', d.lang); render(); return; }
  if (d.chain) { selectChain(d.chain); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (d.cat) { state.cat = d.cat; render(); return; }
  if (d.sort) { state.sort = d.sort; userData.setPref('sort', d.sort); renderMain(); return; }
  if (d.view) { state.view = d.view; userData.setPref('view', d.view); renderMain(); return; }
  if (d.tier) {
    // A grade badge inside a sheet just opens its item; in the list it filters to that grade.
    if ('fromStamp' in d && el.closest('#sheet')) { openSheet('item', el.closest('[data-key]').dataset.key); return; }
    e.stopPropagation();
    const adding = !state.tiers.has(d.tier);
    adding ? state.tiers.add(d.tier) : state.tiers.delete(d.tier);
    renderMain();
    if (state.sheet === 'tiers') renderSheet();
    if ('fromStamp' in d) {
      toast(adding ? t('tierFiltered', { t: d.tier }) : t('tierUnfiltered'));
      $('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  if ('clearFilters' in d) { state.q = ''; state.cat = 'all'; state.tiers.clear(); render(); return; }
  if (d.fav) { e.stopPropagation(); userData.toggleFav(d.fav); return; }
  if (d.add) {
    e.stopPropagation();
    const it = getItem(d.add);
    addToPad(d.add);
    toast(isAvailable(it, state.now) ? t('added') + ' · ' + nameOf(it) : t('addedBreakfast', { start: BREAKFAST.start, end: BREAKFAST.end }));
    if ('thenClose' in d) closeSheet();
    return;
  }
  if (d.qty) { addToPad(d.qty, +d.d); return; }
  if (d.edQty) { editorQty(d.edQty, +d.d); renderSheet(); return; }
  if (d.compare) {
    const i = state.compare.indexOf(d.compare);
    if (i >= 0) state.compare.splice(i, 1);
    else if (state.compare.length >= 4) { toast(t('compareFull')); return; }
    else state.compare.push(d.compare);
    local.set('compare', state.compare);
    renderMain(); renderSheet();
    return;
  }
  if ('close' in d) { closeSheet(); return; }
  if (d.open) { openSheet(d.open, d.arg ? { item: d.arg } : null); return; }
  if (d.key && el.matches('.card, .row')) { openSheet('item', d.key); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.ddOpen) { state.ddOpen = false; renderSidebar(); $('.dd-btn')?.focus(); return; }
    if (state.sheet) closeSheet();
  }
  if (state.ddOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const opts = [...document.querySelectorAll('.dd-list button')];
    const i = opts.indexOf(document.activeElement);
    opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length]?.focus();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card, .row')) { e.preventDefault(); openSheet('item', e.target.dataset.key); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { state.q = e.target.value; renderMain(); return; }
  if (e.target.id === 'kjIn') { $('#kcalIn').value = Math.round(+e.target.value / 4.184); return; }
  if (e.target.id === 'kcalIn') { $('#kjIn').value = Math.round(+e.target.value * 4.184); return; }
  if (reportInput(e)) return;
  if (editorInput(e)) return;
  if (e.target.closest('#tdeeForm')) updateTdee();
});
document.addEventListener('change', (e) => { if (reportInput(e)) return; if (e.target.closest('#tdeeForm')) updateTdee(); });
document.addEventListener('focusin', (e) => { if (e.target.matches('[data-select-all]')) e.target.select(); });

document.addEventListener('submit', (e) => {
  const name = e.target.dataset.form;
  if (!name || !FORMS[name]) return;
  e.preventDefault();
  FORMS[name](e.target, ctx);
});

window.addEventListener('hashchange', () => {
  const id = hashChain();
  if (id !== state.chain) { selectChain(id); render(); }
});
wide.addEventListener('change', renderPadPanel);

// Any change to saved user data (local or from sync) refreshes what shows it.
let favSig = userData.favKeys().join();
function onDataChanged() {
  const sig = userData.favKeys().join();
  if (sig !== favSig) { favSig = sig; renderMain(); }
  refresh();
}
userData.onChange(onDataChanged);

// Breakfast availability follows the clock; re-render when the window opens or closes.
setInterval(() => {
  const before = isBreakfastTime(state.now);
  state.now = new Date();
  if (before !== isBreakfastTime(state.now)) render();
}, 30000);

// ---------- start ----------
function readSharedMeal() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('meal');
  if (!raw) return;
  params.delete('meal');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  state.incoming = decodeMeal(raw, (k) => ITEMS.has(k));
  if (state.incoming) openSheet('incoming');
  else toast(t('badLink'));
}

initSync({
  onStatus: () => { if (state.sheet === 'more') renderSheet(); },
  onData: () => {
    setLang(userData.pref('lang', state.lang));
    state.skin = SKINS.includes(userData.pref('skin')) ? userData.pref('skin') : state.skin;
    favSig = userData.favKeys().join();
    render();
  },
});
initPwa(() => { if (state.sheet === 'more') renderSheet(); });

render();
readSharedMeal();
maybeStartTour(ctx, () => !!state.sheet);

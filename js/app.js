import { CHAINS, CHAIN, ITEMS } from './data/index.js';
import { TIERS, NON_FOOD, density, tierOf, totals } from './core/nutrition.js';
import { isAvailable, isBreakfastTime, BREAKFAST } from './core/availability.js';
import { decodeMeal } from './core/share.js';
import { userData, local } from './store.js';
import {
  state, t, setLang, SORTS, SKINS, hashChain, target, getItem, chainOf,
  nameOf, catName, fmt, fmtInt, fmtDate, padEntries,
} from './state.js';
import { $, esc, ICON, visual, macroBar, tierStamp, badges, card, row, sheetHead, toast, catEmoji } from './ui/parts.js';
import { padSheets, padActions, padForms, padPanel, padCount, addToPad } from './ui/pad.js';
import { collectionSheets, collectionActions, collectionForms, editorInput, editorQty } from './ui/collections.js';
import { moreSheet } from './ui/more.js';
import { reportSheet, submitReport, reportReset } from './ui/report.js';
import { initSync, signIn, signOut, syncNow } from './sync.js';
import { initPwa, pwa } from './pwa.js';

// ---------- browsing ----------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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

const ALL_ITEMS = CHAINS.flatMap((c) => c.items);
const isAll = () => state.chain === 'all';
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
  more: moreSheet,
  report: reportSheet,

  item(key) {
    const it = getItem(key);
    if (!it) return `${sheetHead(t('notFound'))}`;
    const c = chainOf(it);
    const tr = tierOf(it);
    const d = density(it);
    const fav = userData.isFav(key);
    const inCmp = state.compare.includes(key);
    let leaves = '';
    const tg = target();
    if (tg) {
      const tt = totals(padEntries());
      const left = tg.kcal - tt.kcal - it.kcal;
      leaves = left >= 0
        ? `<p class="leaves">${esc(t('leaves', { kcal: fmtInt(left), p: fmtInt(Math.max(0, tg.protein - tt.p - it.p)) }))}</p>`
        : `<p class="leaves over">${esc(t('over', { kcal: fmtInt(-left) }))}</p>`;
    }
    const rows = [
      [t('energy'), `${fmtInt(it.kcal)} kcal · ${fmtInt(it.kcal * 4.184)} kJ`],
      [t('protein'), fmt(it.p) + ' g'],
      [t('carbs'), fmt(it.c) + ' g'],
      ['↳ ' + t('sugars'), it.sug == null ? '–' : fmt(it.sug) + ' g'],
      [t('fat'), fmt(it.f) + ' g'],
      ['↳ ' + t('saturates'), it.sat == null ? '–' : fmt(it.sat) + ' g'],
      [t('salt'), it.salt == null ? '–' : fmt(it.salt) + ' g'],
      [t('density'), fmt(d) + ' ' + t('perKcal')],
    ];
    if (it.portion) rows.push([t('portion'), it.portion]);
    const off = !isAvailable(it, state.now);
    return `<div class="detail" style="--cc:${c.color}">
      <div class="detail-media">
        <button type="button" class="icon-round" data-close aria-label="${esc(t('close'))}">${ICON.close}</button>
        ${visual(it, 'emoji-xl')}
        <div class="detail-title"><h2>${esc(nameOf(it))}</h2><p>${esc(c.name)} · ${esc(catName(it.cat))}</p></div>
      </div>
      <div class="detail-body">
        ${it.breakfastOnly ? `<p class="notice ${off ? '' : 'on'}">${ICON.clock}<span>${esc(t('breakfastNote', { start: BREAKFAST.start, end: BREAKFAST.end }))} <b>${esc(off ? t('breakfastLater') : t('breakfastNow'))}</b></span></p>` : ''}
        <div class="big-stats">
          <div><b>${fmtInt(it.kcal)}</b><span>kcal</span></div>
          <div><b>${fmt(it.p)}g</b><span>${esc(t('protein'))}</span></div>
          <div>${tr ? `<span class="stamp stamp-${tr} stamp-lg">${tr}</span><span>${esc(t('tier_' + tr))}</span>` : '<b>–</b><span>&nbsp;</span>'}</div>
        </div>
        ${macroBar(it)}
        <p class="blurb">${esc(tr ? t('detailBlurb', { cat: catName(it.cat).toLowerCase(), chain: c.name, tier: tr, label: t('tier_' + tr).toLowerCase(), d: fmt(d) }) : t('detailNoTier'))}</p>
        <div class="badges">${badges(it)}</div>
        ${leaves}
        <table class="nut">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        ${it.custom ? `<p class="src">${esc(t('customSource'))}</p>` : `<p class="src">${esc(t('figuresFrom', { src: c.sourceName[state.lang], date: fmtDate(c.checked) }))} <a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(t('viewSource'))}</a></p>
        <p class="src"><button type="button" class="link" data-open="report" data-arg="${esc(key)}">${esc(t('reportItem'))}</button></p>`}
      </div>
      <div class="sheet-foot">
        ${it.custom ? '' : `<button type="button" class="btn ghost ${fav ? 'on' : ''}" data-fav="${key}">${ICON.heart}<span>${esc(fav ? t('unfavourite') : t('favourite'))}</span></button>
        <button type="button" class="btn ghost ${inCmp ? 'on' : ''}" data-compare="${key}">${ICON.scale}<span>${esc(inCmp ? t('inCompare') : t('addToCompare'))}</span></button>`}
        <button type="button" class="btn primary" data-add="${key}" data-then-close>${ICON.plus}<span>${esc(t('addToMeal'))}</span></button>
      </div>
    </div>`;
  },

  target() {
    const tg = target() || { kcal: 2000, protein: 120 };
    return `${sheetHead(t('dailyTarget'))}
      <form class="sheet-body form" data-form="target">
        <label>${esc(t('targetKcal'))}<input name="kcal" type="number" inputmode="numeric" min="800" max="6000" step="10" value="${tg.kcal}" required></label>
        <label>${esc(t('targetProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="400" step="1" value="${tg.protein}" required></label>
        <p class="muted">${esc(t('notSure'))} <button type="button" class="link" data-open="tdee">${esc(t('workItOut'))}</button></p>
        <div class="form-actions">
          ${target() ? `<button type="button" class="btn ghost" data-act="clearTarget">${esc(t('reset'))}</button>` : ''}
          <button type="submit" class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
  },

  favs() {
    const list = userData.favKeys().map(getItem).filter(Boolean);
    return `${sheetHead(t('favsTitle'))}
      <div class="sheet-body">${list.length ? `<div class="rows">${list.map((it) => row(it, { showChain: true })).join('')}</div>` : `<p class="empty-note">${esc(t('favsEmpty'))}</p>`}</div>`;
  },

  tiers() {
    return `${sheetHead(t('tiers'))}
      <div class="sheet-body">
        <p class="muted">${esc(t('tierHelp'))}</p>
        <div class="tier-list">${TIERS.map((x, i) => `<button type="button" class="tier-row ${state.tiers.has(x.t) ? 'on' : ''}" data-tier="${x.t}" aria-pressed="${state.tiers.has(x.t)}">
          <span class="stamp stamp-${x.t}">${x.t}</span><span><b>${esc(t('tier_' + x.t))}</b><small>${x.min ? fmt(x.min) + 'g+/100kcal' : esc(t('tierUnder', { n: fmt(TIERS[i - 1].min) }))}</small></span></button>`).join('')}</div>
      </div>`;
  },

  rank() {
    const list = ALL_ITEMS.filter((it) => it.kcal >= 150 && !NON_FOOD.has(it.cat) && it.cat !== 'desserts')
      .sort((a, b) => density(b) - density(a)).slice(0, 30);
    return `${sheetHead(t('rankTitle'), t('rankNote'))}<div class="sheet-body"><ol class="rank">${list.map((it) => `<li>${row(it, { showChain: true })}</li>`).join('')}</ol></div>`;
  },

  low() {
    const mains = new Set(['burgers', 'chicken', 'wraps', 'veggie', 'glutenfree', 'pizza', 'tacos', 'burritos', 'quesadillas', 'sandwiches', 'salads', 'pasta', 'toasts', 'kids']);
    const list = ALL_ITEMS.filter((it) => mains.has(it.cat) && it.kcal <= 400 && it.kcal >= 150).sort((a, b) => b.p - a.p).slice(0, 30);
    return `${sheetHead(t('lowTitle'), t('lowNote'))}<div class="sheet-body"><div class="rows">${list.map((it) => row(it, { showChain: true })).join('')}</div></div>`;
  },

  kj() {
    return `${sheetHead(t('kjTitle'), t('kjNote'))}
      <div class="sheet-body form">
        <label>kJ<input id="kjIn" type="number" inputmode="decimal" min="0" value="2000"></label>
        <label>kcal<input id="kcalIn" type="number" inputmode="decimal" min="0" value="478"></label>
      </div>`;
  },

  tdee() {
    const p = local.get('tdee', { sex: 'm', age: 30, h: 175, w: 75, act: 2, goal: 'keep' });
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
    return `${sheetHead(t('tdeeTitle'))}
      <form class="sheet-body form" data-form="tdee" id="tdeeForm">
        <label>${esc(t('sex'))}<select name="sex">${opt('m', p.sex, t('male'))}${opt('f', p.sex, t('female'))}</select></label>
        <div class="form-row">
          <label>${esc(t('age'))}<input name="age" type="number" inputmode="numeric" min="14" max="100" value="${p.age}"></label>
          <label>${esc(t('height'))}<input name="h" type="number" inputmode="numeric" min="120" max="230" value="${p.h}"></label>
          <label>${esc(t('weight'))}<input name="w" type="number" inputmode="decimal" min="35" max="250" value="${p.w}"></label>
        </div>
        <label>${esc(t('activity'))}<select name="act">${[1, 2, 3, 4, 5].map((i) => opt(i, p.act, t('act_' + i))).join('')}</select></label>
        <label>${esc(t('goal'))}<select name="goal">${opt('cut', p.goal, t('goal_cut'))}${opt('keep', p.goal, t('goal_keep'))}${opt('bulk', p.goal, t('goal_bulk'))}</select></label>
        <div class="result" id="tdeeResult"></div>
        <div class="form-actions"><button type="submit" class="btn primary">${esc(t('useAsTarget'))}</button></div>
      </form>`;
  },

  about() {
    return `${sheetHead(t('aboutTitle'))}
      <div class="sheet-body prose">
        <p>${esc(t('aboutBody'))}</p>
        <h3>${esc(t('aboutChains'))}</h3>
        <ul class="sources">${CHAINS.map((c) => `<li><i style="background:${c.color}"></i><span><b>${esc(c.name)}</b> · ${c.items.length} ${esc(t('items'))} · ${esc(t('checked', { date: fmtDate(c.checked) }))}<br><a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(c.sourceName[state.lang])}</a></span></li>`).join('')}</ul>
        <p class="muted">${esc(t('breakfastNote', { start: BREAKFAST.start, end: BREAKFAST.end }))}</p>
        <p class="muted">${esc(t('aboutUnofficial'))}</p>
      </div>`;
  },

  compare() {
    const list = state.compare.map(getItem).filter(Boolean);
    if (!list.length) return `${sheetHead(t('compareTitle'))}<div class="sheet-body"><p class="empty-note">${esc(t('compareEmpty'))}</p></div>`;
    const metrics = [
      ['kcal', t('calories'), 'min', ''], ['p', t('protein'), 'max', 'g'], ['density', t('density'), 'max', ''],
      ['c', t('carbs'), 'min', 'g'], ['sug', t('sugars'), 'min', 'g'], ['f', t('fat'), 'min', 'g'], ['sat', t('saturates'), 'min', 'g'], ['salt', t('salt'), 'min', 'g'],
    ];
    const val = (it, k) => (k === 'density' ? density(it) : it[k]);
    return `${sheetHead(t('compareTitle'), t('compareSub'))}
      <div class="sheet-body">
        <div class="cmp" style="--n:${list.length}">
          <div class="cmp-row cmp-head"><span></span>${list.map((it) => `<span class="cmp-item" style="--cc:${chainOf(it).color}"><button type="button" class="x" data-compare="${it.key}" aria-label="${esc(t('removeFromMeal'))}">${ICON.close}</button>${tierStamp(it, 'stamp-sm')}<b>${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)}</small></span>`).join('')}</div>
          ${metrics.map(([k, label, dir, unit]) => {
            const vals = list.map((it) => val(it, k));
            const best = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
            return `<div class="cmp-row"><span class="cmp-label">${esc(label)}</span>${vals.map((v) => `<span class="${list.length > 1 && v === best ? 'best' : ''}">${k === 'kcal' ? fmtInt(v) : fmt(v)}${unit}</span>`).join('')}</div>`;
          }).join('')}
        </div>
      </div>
      <div class="sheet-foot"><button type="button" class="btn ghost" data-act="clearCompare">${esc(t('clear'))}</button></div>`;
  },

  matcher() {
    const tg = target();
    const tt = totals(padEntries());
    const prefs = local.get('matcher', { kcal: tg ? Math.max(400, Math.round((tg.kcal - tt.kcal) / 2 / 50) * 50) : 700, protein: 40, max: 3, desserts: false, drinks: false });
    const chainId = isAll() ? (prefs.chain && CHAIN[prefs.chain] ? prefs.chain : CHAINS[0].id) : state.chain;
    const res = state.matchResult;
    return `${sheetHead(t('matcherTitle'), t('matcherIntro', { chain: CHAIN[chainId].name }))}
      <form class="sheet-body form" data-form="matcher" id="matcherForm">
        ${isAll() ? `<label>${esc(t('restaurant'))}<select name="chain">${CHAINS.map((c) => `<option value="${c.id}" ${c.id === chainId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : `<input type="hidden" name="chain" value="${chainId}">`}
        <div class="form-row">
          <label>${esc(t('targetKcalShort'))}<input name="kcal" type="number" inputmode="numeric" min="150" max="3000" step="10" value="${prefs.kcal}"></label>
          <label>${esc(t('minProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="250" value="${prefs.protein}"></label>
        </div>
        <fieldset class="seg"><legend>${esc(t('maxItems'))}</legend>${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="max" value="${n}" ${prefs.max === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</fieldset>
        <label class="check"><input type="checkbox" name="desserts" ${prefs.desserts ? 'checked' : ''}><span>${esc(t('allowDesserts'))}</span></label>
        <label class="check"><input type="checkbox" name="drinks" ${prefs.drinks ? 'checked' : ''}><span>${esc(t('allowDrinks'))}</span></label>
        ${chainId === 'mcdonalds' && !isBreakfastTime(state.now) ? `<p class="muted">${esc(t('matcherNoBreakfast'))}</p>` : ''}
        <div class="form-actions">
          ${res && res.combo ? `<button type="button" class="btn ghost" data-act="shuffle">${ICON.shuffle}<span>${esc(t('shuffle'))}</span></button>` : ''}
          <button type="submit" class="btn primary">${esc(t('buildMeal'))}</button>
        </div>
        ${res ? (res.combo ? `
          <div class="match">
            <div class="rows">${res.combo.map((it) => row(it)).join('')}</div>
            <div class="mt-row"><b>${esc(t('total'))}</b><b>${fmtInt(res.tot.kcal)} kcal · ${t('P')} ${fmt(res.tot.p)}g · ${t('F')} ${fmt(res.tot.f)}g · ${t('C')} ${fmt(res.tot.c)}g</b></div>
            <button type="button" class="btn primary wide" data-act="addCombo">${ICON.plus}<span>${esc(t('addAllToMeal'))}</span></button>
          </div>` : `<p class="empty-note">${esc(t('noCombo'))}</p>`) : ''}
      </form>`;
  },
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
  const pool = (CHAIN[prefs.chain] || CHAINS[0]).items.filter((it) => it.kcal >= 30 && it.cat !== 'sauces' && it.cat !== 'hotdrinks' && it.cat !== 'extras'
    && isAvailable(it, state.now) && (prefs.drinks || it.cat !== 'colddrinks') && (prefs.desserts || it.cat !== 'desserts'));
  const cap = prefs.kcal * 1.04;
  const score = (tot, n) => {
    const kcalMiss = Math.abs(prefs.kcal - tot.kcal) / prefs.kcal;
    const pMiss = Math.max(0, prefs.protein - tot.p) / Math.max(prefs.protein, 1);
    return kcalMiss * 100 + pMiss * 220 - tot.p * 0.05 + n * 0.5;
  };
  // beam search over combinations (an item may repeat, e.g. two burgers)
  let beam = [{ idx: [], tot: { kcal: 0, p: 0, c: 0, f: 0 } }];
  const finals = [];
  for (let depth = 0; depth < prefs.max; depth++) {
    const next = [];
    for (const b of beam) {
      const start = b.idx.length ? b.idx[b.idx.length - 1] : 0;
      for (let i = start; i < pool.length; i++) {
        const it = pool[i];
        const tot = { kcal: b.tot.kcal + it.kcal, p: b.tot.p + it.p, c: b.tot.c + it.c, f: b.tot.f + it.f };
        if (tot.kcal > cap) continue;
        next.push({ idx: [...b.idx, i], tot });
      }
    }
    next.sort((a, b) => score(a.tot, a.idx.length) - score(b.tot, b.idx.length));
    beam = next.slice(0, 400);
    finals.push(...beam.slice(0, 60));
  }
  const ranked = finals.filter((f) => f.tot.kcal >= prefs.kcal * 0.85 && f.tot.p >= prefs.protein * 0.95)
    .sort((a, b) => score(a.tot, a.idx.length) - score(b.tot, b.idx.length));
  const uniq = [];
  const seen = new Set();
  for (const r of ranked) { const k = r.idx.join(','); if (!seen.has(k)) { seen.add(k); uniq.push(r); } if (uniq.length >= 12) break; }
  if (!uniq.length) { state.matchResult = { combo: null }; return; }
  const pick = reshuffle ? uniq[Math.floor(Math.random() * uniq.length)] : uniq[0];
  const combo = pick.idx.map((i) => pool[i]);
  state.matchResult = { combo, tot: totals(combo.map((it) => ({ it, qty: 1 }))) };
}

// ---------- TDEE ----------
function updateTdee() {
  const form = $('#tdeeForm');
  if (!form) return null;
  const fd = new FormData(form);
  const p = { sex: fd.get('sex'), age: +fd.get('age'), h: +fd.get('h'), w: +fd.get('w'), act: +fd.get('act'), goal: fd.get('goal') };
  local.set('tdee', p);
  const bmr = 10 * p.w + 6.25 * p.h - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const m = bmr * [1.2, 1.375, 1.55, 1.725, 1.9][p.act - 1];
  const k = Math.round((m * { cut: 0.8, keep: 1, bulk: 1.1 }[p.goal]) / 10) * 10;
  const prot = Math.round(p.w * (p.goal === 'keep' ? 1.6 : 2));
  $('#tdeeResult').innerHTML = `<b>${esc(t('tdeeResult', { m: fmtInt(m) }))}</b><span>${esc(t('tdeeTarget', { k: fmtInt(k), p: prot }))}</span>`;
  return { kcal: k, protein: prot };
}

// ---------- actions (data-act) and forms (data-form) ----------
const ACTIONS = {
  ...padActions,
  ...collectionActions,
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
  signOut() { if (confirm(t('confirmSignOut'))) signOut(); },
  syncNow() { syncNow(); },
  async install() { await pwa.prompt(); },
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
    Promise.resolve(ACTIONS[d.act](d.arg, ctx, el)).then(() => {
      if (['skin', 'moreTab', 'howtoLang', 'edAdd', 'edRemove', 'customEdit', 'customCancel', 'shuffle'].includes(d.act)) refresh();
    });
    return;
  }
  if (d.lang) { setLang(d.lang); userData.setPref('lang', d.lang); render(); return; }
  if (d.chain) { selectChain(d.chain); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (d.cat) { state.cat = d.cat; render(); return; }
  if (d.sort) { state.sort = d.sort; userData.setPref('sort', d.sort); renderMain(); return; }
  if (d.view) { state.view = d.view; userData.setPref('view', d.view); renderMain(); return; }
  if (d.tier) { state.tiers.has(d.tier) ? state.tiers.delete(d.tier) : state.tiers.add(d.tier); renderMain(); if (state.sheet === 'tiers') renderSheet(); return; }
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
  if (editorInput(e)) return;
  if (e.target.closest('#tdeeForm')) updateTdee();
});
document.addEventListener('change', (e) => { if (e.target.closest('#tdeeForm')) updateTdee(); });
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
    setLang(supportedLang(userData.pref('lang', state.lang)));
    state.skin = SKINS.includes(userData.pref('skin')) ? userData.pref('skin') : state.skin;
    favSig = '';
    onDataChanged();
    render();
  },
});
initPwa(() => { if (state.sheet === 'more') renderSheet(); });
function supportedLang(l) { return l === 'en' ? 'en' : 'pt'; }

render();
readSharedMeal();

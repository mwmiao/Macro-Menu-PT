import { CHAINS, CHAIN, ITEMS } from './data/index.js';
import { makeT } from './i18n.js';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, fallback) { try { const v = localStorage.getItem('mmpt.' + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('mmpt.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const TIERS = [
  { t: 'S', min: 8 }, { t: 'A', min: 6 }, { t: 'B', min: 4.5 }, { t: 'C', min: 3 }, { t: 'D', min: 1.5 }, { t: 'F', min: 0 },
];
const CAT_EMOJI = {
  burgers: '🍔', chicken: '🍗', wraps: '🌯', veggie: '🥦', glutenfree: '🌾', breakfast: '🥐', sides: '🍟', salads: '🥗',
  soups: '🍲', desserts: '🍦', hotdrinks: '☕', colddrinks: '🥤', sauces: '🫙', kids: '🧒', pizza: '🍕', pasta: '🍝',
  tacos: '🌮', burritos: '🌯', quesadillas: '🫓', nachos: '🧀', sandwiches: '🥪', bakery: '🥖', toasts: '🍞', extras: '➕',
};
const NON_FOOD = new Set(['sauces', 'hotdrinks', 'colddrinks', 'extras']);
const SORTS = ['kcal', 'protein', 'density', 'fat', 'carbs', 'sugar', 'salt', 'az'];

const density = (it) => (it.kcal > 0 ? (it.p * 100) / it.kcal : 0);
const tierOf = (it) => (it.kcal < 40 ? null : TIERS.find((x) => density(it) >= x.min).t);

const ICON = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="5" rx="2"/><rect x="4" y="14" width="16" height="5" rx="2"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16a8 8 0 0 0-16 0zM3 14h18M5 17h14l-1 2H6z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 12l4-4M12 12V7M12 12l-4 3"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/></svg>',
  scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M13 9.5c1-2 2-2.5 4-2.5h3M17 4l3 3-3 3M17 14l3 3-3 3"/></svg>',
};

// ---------- state ----------
const params = new URLSearchParams(location.search);
const initialLang = params.get('lang') || store.get('lang') || ((navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en');
const state = {
  lang: initialLang === 'en' ? 'en' : 'pt',
  chain: CHAIN[location.hash.slice(1)] ? location.hash.slice(1) : store.get('chain', 'mcdonalds'),
  cat: 'all',
  q: '',
  sort: store.get('sort', 'density'),
  tiers: new Set(),
  view: store.get('view', 'grid'),
  favs: new Set(store.get('favs', []).filter((k) => ITEMS.has(k))),
  meal: store.get('meal', []).filter((m) => ITEMS.has(m.key)),
  compare: store.get('compare', []).filter((k) => ITEMS.has(k)),
  target: store.get('target', null),
  sheet: null,
};
if (!CHAIN[state.chain]) state.chain = 'mcdonalds';
let t = makeT(state.lang);

const nf = () => new Intl.NumberFormat(state.lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 });
const fmt = (n) => (n == null ? '–' : nf().format(Math.round(n * 10) / 10));
const fmtInt = (n) => new Intl.NumberFormat(state.lang === 'pt' ? 'pt-PT' : 'en-GB').format(Math.round(n));
const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(state.lang === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const nameOf = (it) => (state.lang === 'en' && it.en ? it.en : it.pt);
const catName = (c) => t('cat_' + c);
const chain = () => CHAIN[state.chain];

function save() {
  store.set('lang', state.lang);
  store.set('chain', state.chain);
  store.set('sort', state.sort);
  store.set('view', state.view);
  store.set('favs', [...state.favs]);
  store.set('meal', state.meal);
  store.set('compare', state.compare);
  store.set('target', state.target);
}

// ---------- filtering ----------
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

function visibleItems() {
  const q = norm(state.q.trim());
  let list = chain().items;
  if (state.cat !== 'all') list = list.filter((it) => it.cat === state.cat);
  if (q) list = list.filter((it) => norm(it.pt + ' ' + (it.en || '')).includes(q));
  if (state.tiers.size) list = list.filter((it) => state.tiers.has(tierOf(it)));
  return [...list].sort(SORT_FN[state.sort]);
}

function categoriesOf(c) {
  const counts = new Map();
  for (const it of c.items) counts.set(it.cat, (counts.get(it.cat) || 0) + 1);
  return [...counts.entries()];
}

// ---------- pieces ----------
function macroBar(it) {
  const pk = it.p * 4, fk = it.f * 9, ck = it.c * 4, tot = pk + fk + ck || 1;
  return `<div class="mbar" aria-hidden="true"><i class="mp" style="width:${(pk / tot) * 100}%"></i><i class="mf" style="width:${(fk / tot) * 100}%"></i><i class="mc" style="width:${(ck / tot) * 100}%"></i></div>`;
}
function tierStamp(it, cls = '') {
  const tr = tierOf(it);
  return tr ? `<span class="stamp stamp-${tr} ${cls}" title="${esc(t('tierTier', { t: tr }) + ' · ' + t('tier_' + tr))}">${tr}</span>` : '';
}
function macroChips(it) {
  return `<div class="mchips"><span><i class="dot mp"></i>${t('P')} ${fmt(it.p)}g</span><span><i class="dot mf"></i>${t('F')} ${fmt(it.f)}g</span><span><i class="dot mc"></i>${t('C')} ${fmt(it.c)}g</span></div>`;
}
function badges(it) {
  const b = [];
  if (it.p >= 25) b.push(`<span class="badge badge-p">${t('proteinBadge', { n: 25 })}</span>`);
  if (it.kcal <= 350 && !NON_FOOD.has(it.cat) && it.cat !== 'desserts' && it.kcal >= 100) b.push(`<span class="badge badge-l">${t('lowCal')}</span>`);
  return b.join('');
}
function card(it, opts = {}) {
  const c = CHAIN[it.chain];
  const fav = state.favs.has(it.key);
  const showChain = opts.showChain ? `<span class="card-chain"><i style="background:${c.color}"></i>${esc(c.name)}</span>` : '';
  return `<article class="card" data-key="${it.key}" style="--cc:${c.color}" tabindex="0" role="button" aria-label="${esc(nameOf(it))}, ${it.kcal} kcal">
    <div class="card-top">
      <button class="fav ${fav ? 'on' : ''}" data-fav="${it.key}" type="button" aria-label="${esc(fav ? t('unfavourite') : t('favourite'))}" aria-pressed="${fav}">${ICON.heart}</button>
      <span class="kcal"><b>${fmtInt(it.kcal)}</b> kcal</span>
      <span class="emoji" aria-hidden="true">${CAT_EMOJI[it.cat] || '🍽️'}</span>
      ${tierStamp(it)}
      <button class="add" data-add="${it.key}" type="button" aria-label="${esc(t('addToMeal'))}">${ICON.plus}</button>
    </div>
    <div class="card-body">
      ${showChain}
      <h3>${esc(nameOf(it))}</h3>
      ${macroBar(it)}
      <div class="badges">${badges(it)}</div>
      ${macroChips(it)}
    </div>
  </article>`;
}
function row(it, opts = {}) {
  const c = CHAIN[it.chain];
  const fav = state.favs.has(it.key);
  return `<article class="row" data-key="${it.key}" style="--cc:${c.color}" tabindex="0" role="button" aria-label="${esc(nameOf(it))}, ${it.kcal} kcal">
    ${tierStamp(it, 'stamp-sm')}
    <div class="row-main">
      <h3>${esc(nameOf(it))}${opts.showChain ? ` <span class="row-chain">· ${esc(c.name)}</span>` : ''}</h3>
      ${macroBar(it)}
      ${macroChips(it)}
    </div>
    <span class="kcal"><b>${fmtInt(it.kcal)}</b> kcal</span>
    <button class="fav ${fav ? 'on' : ''}" data-fav="${it.key}" type="button" aria-label="${esc(fav ? t('unfavourite') : t('favourite'))}" aria-pressed="${fav}">${ICON.heart}</button>
    <button class="add" data-add="${it.key}" type="button" aria-label="${esc(t('addToMeal'))}">${ICON.plus}</button>
  </article>`;
}

// ---------- render: chrome ----------
function renderChrome() {
  document.documentElement.lang = state.lang === 'pt' ? 'pt-PT' : 'en';
  const c = chain();
  document.title = `${c.name} · Macro Menu PT`;
  document.documentElement.style.setProperty('--chain', c.color);
  $('#heroTag').textContent = `${c.name.toUpperCase()} · ${t('itemsOnMenu', { n: c.items.length }).toUpperCase()}`;
  $('#heroSub').textContent = t('tagline');
  for (const b of $('#langSwitch').children) {
    b.classList.toggle('on', b.dataset.lang === state.lang);
    b.setAttribute('aria-pressed', b.dataset.lang === state.lang);
  }
  $('#langSwitch').setAttribute('aria-label', t('language'));
  const mealCount = state.meal.reduce((s, m) => s + m.qty, 0);
  $('#btnMealTop').innerHTML = `${ICON.bag}<span>${t('nav_meal')}</span>${mealCount ? `<em>${mealCount}</em>` : ''}`;
  $('#btnFavsTop').innerHTML = `${ICON.heart}<span>${t('nav_favs')}</span>${state.favs.size ? `<em>${state.favs.size}</em>` : ''}`;
  $('#btnMoreTop').innerHTML = `${ICON.more}<span>${t('nav_more')}</span>`;
  const active = state.sheet || 'browse';
  $('#bottomNav').innerHTML = [
    ['browse', ICON.menu, t('nav_browse')],
    ['meal', ICON.bag, t('nav_meal'), mealCount],
    ['favs', ICON.heart, t('nav_favs'), state.favs.size],
    ['more', ICON.more, t('nav_more')],
  ].map(([id, ic, label, n]) => `<button type="button" data-open="${id}" class="${active === id ? 'on' : ''}">${ic}<span>${label}</span>${n ? `<em>${n}</em>` : ''}</button>`).join('');
  $('#footer').innerHTML = `<p>${esc(t('footerMade'))} ${esc(t('aboutUnofficial'))}</p><p><button type="button" class="link" data-open="about">${esc(t('tool_about'))}</button></p>`;
}

function renderSidebar() {
  const c = chain();
  const cats = categoriesOf(c);
  $('#sidebar').innerHTML = `
    <div class="side-search">
      <label class="search">${ICON.search}<input id="q" type="search" value="${esc(state.q)}" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"></label>
    </div>
    <div class="side-label">${esc(t('restaurant'))} <span>${t('menus', { n: CHAINS.length })}</span></div>
    <div class="chains" role="tablist">
      ${CHAINS.map((ch) => `<button type="button" role="tab" class="chain-btn ${ch.id === state.chain ? 'on' : ''}" data-chain="${ch.id}" aria-selected="${ch.id === state.chain}" style="--cc:${ch.color}"><i></i><span>${esc(ch.name)}</span><small>${ch.items.length}</small></button>`).join('')}
    </div>
    <div class="side-label">${esc(t('categories'))}</div>
    <div class="cats">
      <button type="button" class="cat-btn ${state.cat === 'all' ? 'on' : ''}" data-cat="all"><span>${esc(t('all'))}</span><small>${c.items.length}</small></button>
      ${cats.map(([k, n]) => `<button type="button" class="cat-btn ${state.cat === k ? 'on' : ''}" data-cat="${k}"><span>${CAT_EMOJI[k] || ''} ${esc(catName(k))}</span><small>${n}</small></button>`).join('')}
    </div>`;
}

function renderMain() {
  const list = visibleItems();
  const c = chain();
  const main = $('#main');
  const qFocused = document.activeElement && document.activeElement.id === 'q';
  main.innerHTML = `
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
      ? `<div class="${state.view === 'grid' ? 'grid' : 'rows'}">${list.map((it) => (state.view === 'grid' ? card(it) : row(it))).join('')}</div>`
      : `<div class="empty"><p>${esc(t('noMatches'))}</p><button type="button" class="btn" data-clear-filters>${esc(t('clearFilters'))}</button></div>`}
    <div class="legend">
      <span><i class="dot mp"></i>${esc(t('protein'))}</span><span><i class="dot mf"></i>${esc(t('fat'))}</span><span><i class="dot mc"></i>${esc(t('carbs'))}</span>
      <p>${esc(t('legend'))}</p>
      <p class="src">${esc(t('figuresFrom', { src: c.sourceName[state.lang], date: fmtDate(c.checked) }))} <a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(t('viewSource'))}</a></p>
    </div>`;
  if (qFocused) {
    const q = $('#q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}

function render() {
  t = makeT(state.lang);
  renderChrome();
  renderSidebar();
  renderMain();
  if (state.sheet) renderSheet();
}

// ---------- meal maths ----------
function totals(entries) {
  const s = { kcal: 0, p: 0, c: 0, f: 0, sug: 0, sat: 0, salt: 0 };
  for (const { it, qty } of entries) for (const k in s) s[k] += (it[k] || 0) * qty;
  return s;
}
const mealEntries = () => state.meal.map((m) => ({ it: ITEMS.get(m.key), qty: m.qty }));
function addToMeal(key, qty = 1) {
  const m = state.meal.find((x) => x.key === key);
  if (m) m.qty += qty; else state.meal.push({ key, qty });
  state.meal = state.meal.filter((x) => x.qty > 0);
  save();
}

// ---------- sheets ----------
function openSheet(name, arg) {
  if (name === 'browse') { closeSheet(); return; }
  state.sheet = name;
  state.sheetArg = arg;
  renderSheet();
  const bd = $('#sheetBackdrop');
  bd.hidden = false;
  requestAnimationFrame(() => bd.classList.add('open'));
  document.body.classList.add('locked');
  renderChrome();
}
function closeSheet() {
  state.sheet = null;
  const bd = $('#sheetBackdrop');
  bd.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!state.sheet) bd.hidden = true; }, 200);
  renderChrome();
}
function sheetHead(title, sub = '') {
  return `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button type="button" class="icon-round" data-close aria-label="${esc(t('close'))}">${ICON.close}</button></div>`;
}

const SHEETS = {
  item(key) {
    const it = ITEMS.get(key);
    const c = CHAIN[it.chain];
    const tr = tierOf(it);
    const d = density(it);
    const fav = state.favs.has(key);
    const inCmp = state.compare.includes(key);
    let leaves = '';
    if (state.target) {
      const tt = totals(mealEntries());
      const left = state.target.kcal - tt.kcal - it.kcal;
      leaves = left >= 0
        ? `<p class="leaves">${esc(t('leaves', { kcal: fmtInt(left), p: fmtInt(Math.max(0, state.target.protein - tt.p - it.p)) }))}</p>`
        : `<p class="leaves over">${esc(t('over', { kcal: fmtInt(-left) }))}</p>`;
    }
    const rows = [
      [t('energy'), `${fmtInt(it.kcal)} kcal · ${fmtInt(it.kcal * 4.184)} kJ`],
      [t('protein'), fmt(it.p) + ' g'],
      [t('carbs'), fmt(it.c) + ' g'],
      ['↳ ' + t('sugars'), fmt(it.sug) + ' g'],
      [t('fat'), fmt(it.f) + ' g'],
      ['↳ ' + t('saturates'), fmt(it.sat) + ' g'],
      [t('salt'), fmt(it.salt) + ' g'],
      [t('density'), fmt(d) + ' ' + t('perKcal')],
    ];
    if (it.portion) rows.push([t('portion'), it.portion]);
    return `<div class="detail" style="--cc:${c.color}">
      <div class="detail-media">
        <button type="button" class="icon-round" data-close aria-label="${esc(t('close'))}">${ICON.close}</button>
        <span class="emoji-xl" aria-hidden="true">${CAT_EMOJI[it.cat] || '🍽️'}</span>
        <div class="detail-title"><h2>${esc(nameOf(it))}</h2><p>${esc(c.name)} · ${esc(catName(it.cat))}</p></div>
      </div>
      <div class="detail-body">
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
        <p class="src">${esc(t('figuresFrom', { src: c.sourceName[state.lang], date: fmtDate(c.checked) }))} <a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(t('viewSource'))}</a></p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost ${fav ? 'on' : ''}" data-fav="${key}">${ICON.heart}<span>${esc(fav ? t('unfavourite') : t('favourite'))}</span></button>
        <button type="button" class="btn ghost ${inCmp ? 'on' : ''}" data-compare="${key}">${ICON.scale}<span>${esc(inCmp ? t('inCompare') : t('addToCompare'))}</span></button>
        <button type="button" class="btn primary" data-add="${key}" data-then-close>${ICON.plus}<span>${esc(t('addToMeal'))}</span></button>
      </div>
    </div>`;
  },

  meal() {
    const entries = mealEntries();
    const tt = totals(entries);
    const tg = state.target;
    const bar = (val, max) => `<div class="prog"><i style="width:${Math.min(100, (val / max) * 100)}%" class="${val > max ? 'over' : ''}"></i></div>`;
    return `${sheetHead(t('yourMeal'))}
      <div class="sheet-body">
        <section class="target-box">
          <div class="target-head"><b>${esc(t('dailyTarget'))}</b><button type="button" class="link" data-open="target">${esc(tg ? t('editTarget') : t('setTarget'))}</button></div>
          ${tg ? `
            <div class="target-line"><span>${fmtInt(tt.kcal)} / ${fmtInt(tg.kcal)} kcal</span><span>${esc(t('remaining'))}: ${fmtInt(tg.kcal - tt.kcal)}</span></div>${bar(tt.kcal, tg.kcal)}
            <div class="target-line"><span>${fmt(tt.p)} / ${fmtInt(tg.protein)} g ${esc(t('protein').toLowerCase())}</span><span>${esc(t('remaining'))}: ${fmtInt(Math.max(0, tg.protein - tt.p))} g</span></div>${bar(tt.p, tg.protein)}`
          : `<p class="muted">${esc(t('notSure'))} <button type="button" class="link" data-open="tdee">${esc(t('workItOut'))}</button></p>`}
        </section>
        ${entries.length ? `
          <ul class="meal-list">
            ${entries.map(({ it, qty }) => `<li>
              <span class="ml-name"><b>${esc(nameOf(it))}</b><small>${esc(CHAIN[it.chain].name)} · ${fmtInt(it.kcal)} kcal · ${t('P')} ${fmt(it.p)}g</small></span>
              <span class="qty"><button type="button" data-qty="${it.key}" data-d="-1" aria-label="−">${ICON.minus}</button><b>${qty}</b><button type="button" data-qty="${it.key}" data-d="1" aria-label="+">${ICON.plus}</button></span>
            </li>`).join('')}
          </ul>
          <div class="meal-total">
            <div class="mt-row"><b>${esc(t('total'))}</b><b>${fmtInt(tt.kcal)} kcal</b></div>
            ${macroBar(tt)}
            <div class="mt-grid">
              <span>${esc(t('protein'))}<b>${fmt(tt.p)} g</b></span><span>${esc(t('carbs'))}<b>${fmt(tt.c)} g</b></span><span>${esc(t('fat'))}<b>${fmt(tt.f)} g</b></span>
              <span>${esc(t('sugars'))}<b>${fmt(tt.sug)} g</b></span><span>${esc(t('saturates'))}<b>${fmt(tt.sat)} g</b></span><span>${esc(t('salt'))}<b>${fmt(tt.salt)} g</b></span>
            </div>
          </div>` : `<p class="empty-note">${esc(t('mealEmpty'))}</p>`}
      </div>
      ${entries.length ? `<div class="sheet-foot"><button type="button" class="btn ghost" data-clear-meal>${esc(t('clearMeal'))}</button><button type="button" class="btn primary" data-copy-meal>${esc(t('copyMeal'))}</button></div>` : ''}`;
  },

  target() {
    const tg = state.target || { kcal: 2000, protein: 120 };
    return `${sheetHead(t('dailyTarget'))}
      <form class="sheet-body form" id="targetForm">
        <label>${esc(t('targetKcal'))}<input name="kcal" type="number" inputmode="numeric" min="800" max="6000" step="10" value="${tg.kcal}" required></label>
        <label>${esc(t('targetProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="400" step="1" value="${tg.protein}" required></label>
        <p class="muted">${esc(t('notSure'))} <button type="button" class="link" data-open="tdee">${esc(t('workItOut'))}</button></p>
        <div class="form-actions">
          ${state.target ? `<button type="button" class="btn ghost" data-clear-target>${esc(t('reset'))}</button>` : ''}
          <button type="submit" class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
  },

  favs() {
    const list = [...state.favs].map((k) => ITEMS.get(k)).filter(Boolean);
    return `${sheetHead(t('favsTitle'))}
      <div class="sheet-body">${list.length ? `<div class="rows">${list.map((it) => row(it, { showChain: true })).join('')}</div>` : `<p class="empty-note">${esc(t('favsEmpty'))}</p>`}</div>`;
  },

  more() {
    const tools = [['rank', '🏆'], ['low', '🥗'], ['tdee', '🧮'], ['kj', '🔁'], ['about', '📄']];
    return `${sheetHead(t('moreTitle'))}
      <div class="sheet-body tools">${tools.map(([k, e]) => `<button type="button" class="tool" data-open="${k}"><span class="tool-ic">${e}</span><span><b>${esc(t('tool_' + k))}</b><small>${esc(t('tool_' + k + '_sub'))}</small></span>${ICON.chev}</button>`).join('')}</div>`;
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
    const all = CHAINS.flatMap((c) => c.items).filter((it) => it.kcal >= 150 && !NON_FOOD.has(it.cat) && it.cat !== 'desserts');
    const list = all.sort((a, b) => density(b) - density(a)).slice(0, 30);
    return `${sheetHead(t('rankTitle'), t('rankNote'))}<div class="sheet-body"><ol class="rank">${list.map((it) => `<li>${row(it, { showChain: true })}</li>`).join('')}</ol></div>`;
  },

  low() {
    const mains = new Set(['burgers', 'chicken', 'wraps', 'veggie', 'glutenfree', 'pizza', 'tacos', 'burritos', 'quesadillas', 'sandwiches', 'salads', 'pasta', 'toasts', 'kids']);
    const list = CHAINS.flatMap((c) => c.items).filter((it) => mains.has(it.cat) && it.kcal <= 400 && it.kcal >= 150).sort((a, b) => b.p - a.p).slice(0, 30);
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
    const p = store.get('tdee', { sex: 'm', age: 30, h: 175, w: 75, act: 2, goal: 'keep' });
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
    return `${sheetHead(t('tdeeTitle'))}
      <form class="sheet-body form" id="tdeeForm">
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
        <p class="muted">${esc(t('aboutUnofficial'))}</p>
      </div>`;
  },

  compare() {
    const list = state.compare.map((k) => ITEMS.get(k));
    if (!list.length) return `${sheetHead(t('compareTitle'))}<div class="sheet-body"><p class="empty-note">${esc(t('compareEmpty'))}</p></div>`;
    const metrics = [
      ['kcal', t('calories'), 'min', ''], ['p', t('protein'), 'max', 'g'], ['density', t('density'), 'max', ''],
      ['c', t('carbs'), 'min', 'g'], ['sug', t('sugars'), 'min', 'g'], ['f', t('fat'), 'min', 'g'], ['sat', t('saturates'), 'min', 'g'], ['salt', t('salt'), 'min', 'g'],
    ];
    const val = (it, k) => (k === 'density' ? density(it) : it[k]);
    return `${sheetHead(t('compareTitle'), t('compareSub'))}
      <div class="sheet-body">
        <div class="cmp" style="--n:${list.length}">
          <div class="cmp-row cmp-head"><span></span>${list.map((it) => `<span class="cmp-item" style="--cc:${CHAIN[it.chain].color}"><button type="button" class="x" data-compare="${it.key}" aria-label="${esc(t('removeFromMeal'))}">${ICON.close}</button>${tierStamp(it, 'stamp-sm')}<b>${esc(nameOf(it))}</b><small>${esc(CHAIN[it.chain].name)}</small></span>`).join('')}</div>
          ${metrics.map(([k, label, dir, unit]) => {
            const vals = list.map((it) => val(it, k));
            const best = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
            return `<div class="cmp-row"><span class="cmp-label">${esc(label)}</span>${vals.map((v) => `<span class="${list.length > 1 && v === best ? 'best' : ''}">${k === 'kcal' ? fmtInt(v) : fmt(v)}${unit}</span>`).join('')}</div>`;
          }).join('')}
        </div>
      </div>
      <div class="sheet-foot"><button type="button" class="btn ghost" data-clear-compare>${esc(t('clear'))}</button></div>`;
  },

  matcher() {
    const tg = state.target;
    const tt = totals(mealEntries());
    const prefs = store.get('matcher', { kcal: tg ? Math.max(400, Math.round((tg.kcal - tt.kcal) / 2 / 50) * 50) : 700, protein: 40, max: 3, desserts: false, drinks: false });
    const res = state.matchResult;
    return `${sheetHead(t('matcherTitle'), t('matcherIntro', { chain: chain().name }))}
      <form class="sheet-body form" id="matcherForm">
        <div class="form-row">
          <label>${esc(t('targetKcalShort'))}<input name="kcal" type="number" inputmode="numeric" min="150" max="3000" step="10" value="${prefs.kcal}"></label>
          <label>${esc(t('minProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="250" value="${prefs.protein}"></label>
        </div>
        <fieldset class="seg"><legend>${esc(t('maxItems'))}</legend>${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="max" value="${n}" ${prefs.max === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</fieldset>
        <label class="check"><input type="checkbox" name="desserts" ${prefs.desserts ? 'checked' : ''}><span>${esc(t('allowDesserts'))}</span></label>
        <label class="check"><input type="checkbox" name="drinks" ${prefs.drinks ? 'checked' : ''}><span>${esc(t('allowDrinks'))}</span></label>
        <div class="form-actions">
          ${res && res.combo ? `<button type="button" class="btn ghost" data-shuffle>${ICON.shuffle}<span>${esc(t('shuffle'))}</span></button>` : ''}
          <button type="submit" class="btn primary">${esc(t('buildMeal'))}</button>
        </div>
        ${res ? (res.combo ? `
          <div class="match">
            <div class="rows">${res.combo.map((it) => row(it)).join('')}</div>
            <div class="mt-row"><b>${esc(t('total'))}</b><b>${fmtInt(res.tot.kcal)} kcal · ${t('P')} ${fmt(res.tot.p)}g · ${t('F')} ${fmt(res.tot.f)}g · ${t('C')} ${fmt(res.tot.c)}g</b></div>
            <button type="button" class="btn primary wide" data-add-combo>${ICON.plus}<span>${esc(t('addAllToMeal'))}</span></button>
          </div>` : `<p class="empty-note">${esc(t('noCombo'))}</p>`) : ''}
      </form>`;
  },
};

function renderSheet() {
  const fn = SHEETS[state.sheet];
  if (!fn) return;
  const el = $('#sheet');
  const scroll = el.querySelector('.sheet-body')?.scrollTop || 0;
  el.className = 'sheet sheet-' + state.sheet;
  el.innerHTML = fn(state.sheetArg);
  el.setAttribute('aria-label', el.querySelector('h2')?.textContent || '');
  const body = el.querySelector('.sheet-body');
  if (body) body.scrollTop = scroll;
  if (state.sheet === 'tdee') updateTdee();
}

// ---------- matcher ----------
function runMatcher(form, reshuffle = false) {
  const fd = new FormData(form);
  const prefs = { kcal: +fd.get('kcal') || 700, protein: +fd.get('protein') || 0, max: +fd.get('max') || 3, desserts: !!fd.get('desserts'), drinks: !!fd.get('drinks') };
  store.set('matcher', prefs);
  const pool = chain().items.filter((it) => it.kcal >= 30 && it.cat !== 'sauces' && it.cat !== 'hotdrinks' && it.cat !== 'extras'
    && (prefs.drinks || it.cat !== 'colddrinks') && (prefs.desserts || it.cat !== 'desserts'));
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
  const ok = finals.filter((f) => f.tot.kcal >= prefs.kcal * 0.85 && f.tot.p >= prefs.protein * 0.95);
  const ranked = (ok.length ? ok : []).sort((a, b) => score(a.tot, a.idx.length) - score(b.tot, b.idx.length));
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
  store.set('tdee', p);
  const bmr = 10 * p.w + 6.25 * p.h - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const m = bmr * [1.2, 1.375, 1.55, 1.725, 1.9][p.act - 1];
  const k = Math.round((m * { cut: 0.8, keep: 1, bulk: 1.1 }[p.goal]) / 10) * 10;
  const prot = Math.round(p.w * (p.goal === 'keep' ? 1.6 : 2));
  $('#tdeeResult').innerHTML = `<b>${esc(t('tdeeResult', { m: fmtInt(m) }))}</b><span>${esc(t('tdeeTarget', { k: fmtInt(k), p: prot }))}</span>`;
  return { kcal: k, protein: prot };
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-key], a');
  if (!el) {
    if (e.target === $('#sheetBackdrop')) closeSheet();
    return;
  }
  const d = el.dataset;
  if (d.lang) { state.lang = d.lang; save(); render(); return; }
  if (d.chain) { state.chain = d.chain; state.cat = 'all'; state.matchResult = null; history.replaceState(null, '', '#' + d.chain); save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (d.cat) { state.cat = d.cat; render(); return; }
  if (d.sort) { state.sort = d.sort; save(); renderMain(); return; }
  if (d.view) { state.view = d.view; save(); renderMain(); return; }
  if (d.tier) { state.tiers.has(d.tier) ? state.tiers.delete(d.tier) : state.tiers.add(d.tier); renderMain(); if (state.sheet === 'tiers') renderSheet(); return; }
  if ('clearFilters' in d) { state.q = ''; state.cat = 'all'; state.tiers.clear(); render(); return; }
  if (d.fav) {
    e.stopPropagation();
    state.favs.has(d.fav) ? state.favs.delete(d.fav) : state.favs.add(d.fav);
    save(); renderChrome(); renderMain(); if (state.sheet) renderSheet();
    return;
  }
  if (d.add) {
    e.stopPropagation();
    addToMeal(d.add);
    toast(t('added') + ' · ' + nameOf(ITEMS.get(d.add)));
    renderChrome();
    if ('thenClose' in d) closeSheet(); else if (state.sheet) renderSheet();
    return;
  }
  if (d.qty) { addToMeal(d.qty, +d.d); renderChrome(); renderSheet(); return; }
  if (d.compare) {
    const i = state.compare.indexOf(d.compare);
    if (i >= 0) state.compare.splice(i, 1);
    else if (state.compare.length >= 4) { toast(t('compareFull')); return; }
    else state.compare.push(d.compare);
    save(); renderMain(); renderSheet();
    return;
  }
  if ('clearCompare' in d) { state.compare = []; save(); renderMain(); renderSheet(); return; }
  if ('clearMeal' in d) { state.meal = []; save(); renderChrome(); renderSheet(); return; }
  if ('clearTarget' in d) { state.target = null; save(); openSheet('meal'); return; }
  if ('copyMeal' in d) {
    const entries = mealEntries();
    const tt = totals(entries);
    const txt = entries.map(({ it, qty }) => `${qty}× ${nameOf(it)} (${CHAIN[it.chain].name}) — ${it.kcal * qty} kcal`).join('\n')
      + `\n${t('total')}: ${fmtInt(tt.kcal)} kcal · ${t('protein')} ${fmt(tt.p)}g · ${t('carbs')} ${fmt(tt.c)}g · ${t('fat')} ${fmt(tt.f)}g\n— Macro Menu PT`;
    navigator.clipboard?.writeText(txt).then(() => toast(t('copied')), () => {});
    return;
  }
  if ('shuffle' in d) { runMatcher($('#matcherForm'), true); renderSheet(); return; }
  if ('addCombo' in d) {
    for (const it of state.matchResult.combo) addToMeal(it.key);
    toast(t('added'));
    openSheet('meal');
    return;
  }
  if ('close' in d) { closeSheet(); return; }
  if (d.open) { openSheet(d.open); return; }
  if (d.key && el.matches('.card, .row')) { openSheet('item', d.key); return; }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheet) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card, .row')) { e.preventDefault(); openSheet('item', e.target.dataset.key); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { state.q = e.target.value; renderMain(); return; }
  if (e.target.id === 'kjIn') { $('#kcalIn').value = Math.round(+e.target.value / 4.184); return; }
  if (e.target.id === 'kcalIn') { $('#kjIn').value = Math.round(+e.target.value * 4.184); return; }
  if (e.target.closest('#tdeeForm')) updateTdee();
});
document.addEventListener('change', (e) => { if (e.target.closest('#tdeeForm')) updateTdee(); });

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'targetForm') {
    const fd = new FormData(e.target);
    state.target = { kcal: +fd.get('kcal'), protein: +fd.get('protein') };
    save(); openSheet('meal');
  } else if (e.target.id === 'tdeeForm') {
    state.target = updateTdee();
    save(); openSheet('meal');
  } else if (e.target.id === 'matcherForm') {
    runMatcher(e.target);
    renderSheet();
    $('#sheet .match, #sheet .empty-note')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (CHAIN[id] && id !== state.chain) { state.chain = id; state.cat = 'all'; state.matchResult = null; save(); render(); }
});

if (location.hash.slice(1) !== state.chain) history.replaceState(null, '', '#' + state.chain);
render();

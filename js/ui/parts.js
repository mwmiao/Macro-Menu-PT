// Small HTML building blocks shared by every view.
import IMAGES from '../data/images.js';
import { tierOf, NON_FOOD } from '../core/nutrition.js';
import { isAvailable, BREAKFAST } from '../core/availability.js';
import { state, t, fmt, fmtInt, nameOf, chainOf } from '../state.js';
import { userData } from '../store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON = {
  heart: svg('<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
  list: svg('<rect x="4" y="5" width="16" height="5" rx="2"/><rect x="4" y="14" width="16" height="5" rx="2"/>'),
  bag: svg('<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  menu: svg('<path d="M4 11h16a8 8 0 0 0-16 0zM3 14h18M5 17h14l-1 2H6z"/>'),
  more: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 12l4-4M12 12V7M12 12l-4 3"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>'),
  scale: svg('<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  shuffle: svg('<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M13 9.5c1-2 2-2.5 4-2.5h3M17 4l3 3-3 3M17 14l3 3-3 3"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  share: svg('<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  save: svg('<path d="M6 4h9l3 3v13H6z"/><path d="M9 4v5h6M9 20v-6h6v6"/>'),
  star: svg('<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.5 9z"/>'),
  user: svg('<circle cx="12" cy="9" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  palette: svg('<path d="M12 4a8 8 0 1 0 0 16c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 14 15 14h2a3 3 0 0 0 3-3c0-4-3.6-7-8-7z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="15" cy="8.5" r="1"/>'),
  bolt: svg('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
  tools: svg('<path d="M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3z"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  help: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5"/>'),
  home: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M12 8v6M9 11h6"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>'),
  layers: svg('<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>'),
};

const CAT_EMOJI = {
  burgers: '🍔', chicken: '🍗', wraps: '🌯', veggie: '🥦', glutenfree: '🌾', breakfast: '🥐', sides: '🍟', salads: '🥗',
  soups: '🍲', desserts: '🍦', hotdrinks: '☕', colddrinks: '🥤', sauces: '🫙', kids: '🧒', pizza: '🍕', pasta: '🍝',
  tacos: '🌮', burritos: '🌯', quesadillas: '🫓', nachos: '🧀', sandwiches: '🥪', bakery: '🥖', toasts: '🍞', extras: '➕',
  custom: '⭐',
};
export const catEmoji = (cat) => CAT_EMOJI[cat] || '🍽️';

// Product photo, or a drawn placeholder (category emoji on a soft disc) when the chain publishes none.
export function visual(it, cls) {
  const src = IMAGES[it.key];
  if (src) return `<img class="${cls}-img" src="${src}" alt="" loading="lazy" decoding="async">`;
  return `<span class="${cls} ph" aria-hidden="true" title="${esc(t('noPhoto'))}"><span>${catEmoji(it.cat)}</span></span>`;
}

export function macroBar(it) {
  const pk = it.p * 4, fk = it.f * 9, ck = it.c * 4, tot = pk + fk + ck || 1;
  return `<div class="mbar" aria-hidden="true"><i class="mp" style="width:${(pk / tot) * 100}%"></i><i class="mf" style="width:${(fk / tot) * 100}%"></i><i class="mc" style="width:${(ck / tot) * 100}%"></i></div>`;
}

export function tierStamp(it, cls = '') {
  const tr = tierOf(it);
  return tr ? `<span class="stamp stamp-${tr} ${cls}" title="${esc(t('tierTier', { t: tr }) + ' · ' + t('tier_' + tr))}">${tr}</span>` : '';
}

export function macroChips(it) {
  return `<div class="mchips"><span><i class="dot mp"></i>${t('P')} ${fmt(it.p)}g</span><span><i class="dot mf"></i>${t('F')} ${fmt(it.f)}g</span><span><i class="dot mc"></i>${t('C')} ${fmt(it.c)}g</span></div>`;
}

export function badges(it) {
  const b = [];
  if (it.breakfastOnly) b.push(`<span class="badge badge-b">${ICON.clock}${BREAKFAST.start}–${BREAKFAST.end}</span>`);
  if (it.p >= 25) b.push(`<span class="badge badge-p">${t('proteinBadge', { n: 25 })}</span>`);
  if (it.kcal <= 350 && !NON_FOOD.has(it.cat) && it.cat !== 'desserts' && it.kcal >= 100) b.push(`<span class="badge badge-l">${t('lowCal')}</span>`);
  return b.join('');
}

const offClass = (it) => (isAvailable(it, state.now) ? '' : ' off');

function favButton(it) {
  if (it.custom) return '';
  const fav = userData.isFav(it.key);
  return `<button class="fav ${fav ? 'on' : ''}" data-fav="${it.key}" type="button" aria-label="${esc(fav ? t('unfavourite') : t('favourite'))}" aria-pressed="${fav}">${ICON.heart}</button>`;
}

export function card(it, opts = {}) {
  const c = chainOf(it);
  const showChain = opts.showChain ? `<span class="card-chain"><i style="background:${c.color}"></i>${esc(c.name)}</span>` : '';
  return `<article class="card${offClass(it)}" data-key="${it.key}" style="--cc:${c.color}" tabindex="0" role="button" aria-label="${esc(nameOf(it))}, ${it.kcal} kcal">
    <div class="card-top">
      ${favButton(it)}
      <span class="kcal"><b>${fmtInt(it.kcal)}</b> kcal</span>
      ${visual(it, 'emoji')}
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

export function row(it, opts = {}) {
  const c = chainOf(it);
  return `<article class="row${offClass(it)}" data-key="${it.key}" style="--cc:${c.color}" tabindex="0" role="button" aria-label="${esc(nameOf(it))}, ${it.kcal} kcal">
    <span class="row-thumb">${visual(it, 'row-emoji')}${tierStamp(it, 'stamp-sm')}</span>
    <div class="row-main">
      <h3>${esc(nameOf(it))}${opts.showChain ? ` <span class="row-chain">· ${esc(c.name)}</span>` : ''}</h3>
      ${macroBar(it)}
      ${macroChips(it)}
    </div>
    <span class="kcal"><b>${fmtInt(it.kcal)}</b> kcal</span>
    ${favButton(it)}
    <button class="add" data-add="${it.key}" type="button" aria-label="${esc(t('addToMeal'))}">${ICON.plus}</button>
  </article>`;
}

export function sheetHead(title, sub = '', kicker = '') {
  return `<div class="sheet-head"><div>${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ''}<h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button type="button" class="icon-round" data-close aria-label="${esc(t('close'))}">${ICON.close}</button></div>`;
}

export function stepper(attr, key, qty) {
  return `<span class="qty"><button type="button" ${attr}="${esc(key)}" data-d="-1" aria-label="${esc(t('less'))}">${ICON.minus}</button><b>${qty}</b><button type="button" ${attr}="${esc(key)}" data-d="1" aria-label="${esc(t('more'))}">${ICON.plus}</button></span>`;
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    toast(t('copyFailed'));
  }
}

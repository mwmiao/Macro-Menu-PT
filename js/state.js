// Shared UI state and the lookups/formatters every view uses.
import { CHAIN, ITEMS } from './data/index.js';
import { makeT } from './i18n.js';
import { userData, local } from './store.js';

export const SORTS = ['kcal', 'protein', 'density', 'fat', 'carbs', 'sugar', 'salt', 'az'];
export const SKINS = ['dark', 'light', 'azulejo', 'locker', 'nata'];

function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  const v = fromUrl || userData.pref('lang', null) || ((navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en');
  return v === 'en' ? 'en' : 'pt';
}

const hashChain = () => (CHAIN[location.hash.slice(1)] ? location.hash.slice(1) : 'all');
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export const state = {
  lang: initialLang(),
  chain: hashChain(), // 'all' or a chain id; only ever set from the URL hash or the dropdown
  cat: 'all',
  q: '',
  sort: pick(userData.pref('sort'), SORTS, 'density'),
  view: pick(userData.pref('view'), ['grid', 'list'], 'grid'),
  skin: pick(userData.pref('skin'), SKINS, 'dark'),
  tiers: new Set(),
  compare: local.get('compare', []).filter((k) => ITEMS.has(k)),
  sheet: null,
  sheetArg: null,
  moreTab: 'quick',
  ddOpen: false,
  now: new Date(),
};
export { hashChain };

export let t = makeT(state.lang);
export function setLang(lang) {
  state.lang = lang;
  t = makeT(lang);
}

export function target() {
  const v = userData.pref('target', null);
  return v && v.kcal > 0 && v.protein >= 0 ? v : null;
}

// Restaurant items plus the user's custom items (keys "custom:<id>").
export function getItem(key) {
  if (ITEMS.has(key)) return ITEMS.get(key);
  if (!key?.startsWith('custom:')) return null;
  const c = userData.find('custom', key.slice(7));
  return c ? customToItem(c) : null;
}
export const customToItem = (c) => ({
  key: 'custom:' + c.id, chain: 'custom', pt: c.name, en: null, cat: 'custom',
  kcal: c.kcal, p: c.p, c: c.c, f: c.f, sug: null, sat: null, salt: null, custom: true,
});

export function chainOf(it) {
  return CHAIN[it.chain] || { id: 'custom', name: t('myItems'), color: '#8a7a6c' };
}

const locale = () => (state.lang === 'pt' ? 'pt-PT' : 'en-GB');
export const nameOf = (it) => (state.lang === 'en' && it.en ? it.en : it.pt);
export const catName = (c) => t('cat_' + c);
export const fmt = (n) => (n == null ? '–' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10));
export const fmtInt = (n) => new Intl.NumberFormat(locale()).format(Math.round(n));
export const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (ms) => new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Pad entries resolved to items; entries whose item no longer exists are skipped.
export const padEntries = (items = userData.pad()) => items.map((m) => ({ it: getItem(m.key), qty: m.qty })).filter((e) => e.it);

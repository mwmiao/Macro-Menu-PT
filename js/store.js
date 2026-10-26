// Local persistence. Synced user data lives under one key (`mm.data`, model in core/merge.js);
// device-only conveniences (compare list, matcher/TDEE inputs, sync session) keep their own keys.
import { emptyData, sanitize, live } from './core/merge.js';

const DATA_KEY = 'mm.data';

export const local = {
  get(k, fallback) { try { const v = localStorage.getItem('mmpt.' + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('mmpt.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// First run after the upgrade: build the synced model from the old separate keys. Migrated
// records get t=1 so anything already synced from another device wins over them. Old keys are left
// in place.
function migrate() {
  const d = emptyData();
  for (const key of local.get('favs', [])) d.favs[key] = { on: true, t: 1 };
  const meal = local.get('meal', []);
  if (meal.length) d.pad = { items: meal, t: 1 };
  for (const k of ['lang', 'target', 'sort', 'view']) {
    const v = local.get(k, null);
    if (v != null) d.prefs[k] = { v, t: 1 };
  }
  return sanitize(d);
}

function load() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch { /* fall through */ }
  return migrate();
}

let data = load();
const listeners = new Set();

function commit() {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  for (const fn of listeners) fn(data);
}

export const userData = {
  get: () => data,
  // Replace everything (after a sync merge). Doesn't notify, so it can't trigger another upload.
  replace(next) {
    data = sanitize(next);
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  pref(k, fallback) { return k in data.prefs ? data.prefs[k].v : fallback; },
  setPref(k, v) { data.prefs[k] = { v, t: Date.now() }; commit(); },

  isFav: (key) => !!data.favs[key]?.on,
  favKeys: () => Object.entries(data.favs).filter(([, r]) => r.on).sort((a, b) => b[1].t - a[1].t).map(([k]) => k),
  toggleFav(key) { data.favs[key] = { on: !data.favs[key]?.on, t: Date.now() }; commit(); },

  pad: () => data.pad.items,
  setPad(items) { data.pad = { items: items.filter((m) => m.qty > 0), t: Date.now() }; commit(); },

  // collections: 'saved' | 'presets' | 'custom'
  list: (coll) => live(data[coll]),
  find: (coll, id) => (data[coll][id] && !data[coll][id].del ? data[coll][id] : null),
  upsert(coll, rec) {
    const now = Date.now();
    data[coll][rec.id] = { ...data[coll][rec.id], ...rec, created: data[coll][rec.id]?.created ?? now, t: now };
    if (coll === 'custom') delete data[coll][rec.id].created;
    commit();
  },
  remove(coll, id) { data[coll][id] = { id, del: true, t: Date.now() }; commit(); },
};

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

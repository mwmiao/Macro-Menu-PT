// User data model and how two copies of it are merged (local device vs. Google Drive).
//
// Every record carries `t` (ms timestamp of its last change). Merging keeps, per record, the copy
// with the newer `t`. Deletions are kept as tombstones (`del: true`) so a deletion on one device
// isn't undone by an older copy on another.
//
// {
//   v: 2,
//   favs:    { [itemKey]: { on: bool, t } },
//   pad:     { items: [{ key, qty }], t },
//   saved:   { [id]: { id, name, items, created, t, del? } },
//   presets: { [id]: { id, name, items, created, t, del? } },
//   custom:  { [id]: { id, name, kcal, p, c, f, t, del? } },
//   prefs:   { [name]: { v, t } },
// }
export const SYNCED_PREFS = ['lang', 'skin', 'target', 'sort', 'view'];

export function emptyData() {
  return { v: 2, favs: {}, pad: { items: [], t: 0 }, saved: {}, presets: {}, custom: {}, prefs: {} };
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const ts = (r) => (Number.isFinite(r?.t) ? r.t : 0);

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b)) {
    if (!out[id] || ts(rec) > ts(out[id])) out[id] = rec;
  }
  return out;
}

export function mergeData(local, remote) {
  return {
    v: 2,
    favs: mergeMap(local.favs, remote.favs),
    pad: ts(remote.pad) > ts(local.pad) ? remote.pad : local.pad,
    saved: mergeMap(local.saved, remote.saved),
    presets: mergeMap(local.presets, remote.presets),
    custom: mergeMap(local.custom, remote.custom),
    prefs: mergeMap(local.prefs, remote.prefs),
  };
}

const cleanItems = (items) => (Array.isArray(items) ? items : [])
  .filter((m) => m && typeof m.key === 'string' && Number.isInteger(m.qty) && m.qty > 0 && m.qty < 100)
  .map((m) => ({ key: m.key, qty: m.qty }))
  .slice(0, 100);

const cleanText = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const cleanNum = (n, max) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max ? n : null);

function cleanMap(map, cleanRecord) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [id, rec] of Object.entries(map)) {
    if (!isObj(rec) || !Number.isFinite(rec.t)) continue;
    if (rec.del) { out[id] = { id, del: true, t: rec.t }; continue; }
    const c = cleanRecord(rec, id);
    if (c) out[id] = { ...c, t: rec.t };
  }
  return out;
}

const cleanMeal = (r, id) => {
  const name = cleanText(r.name, 60);
  return name ? { id, name, items: cleanItems(r.items), created: Number.isFinite(r.created) ? r.created : r.t } : null;
};

const cleanCustomItem = (r, id) => {
  const name = cleanText(r.name, 60);
  const kcal = cleanNum(r.kcal, 5000), p = cleanNum(r.p, 500), c = cleanNum(r.c, 1000), f = cleanNum(r.f, 500);
  return name && kcal != null && p != null && c != null && f != null ? { id, name, kcal, p, c, f } : null;
};

// Validates data read from storage or Drive; anything malformed is dropped, never thrown.
export function sanitize(raw) {
  const d = emptyData();
  if (!isObj(raw)) return d;
  if (isObj(raw.favs)) {
    for (const [k, r] of Object.entries(raw.favs)) {
      if (isObj(r) && typeof r.on === 'boolean' && Number.isFinite(r.t)) d.favs[k] = { on: r.on, t: r.t };
    }
  }
  if (isObj(raw.pad) && Number.isFinite(raw.pad.t)) d.pad = { items: cleanItems(raw.pad.items), t: raw.pad.t };
  d.saved = cleanMap(raw.saved, cleanMeal);
  d.presets = cleanMap(raw.presets, cleanMeal);
  d.custom = cleanMap(raw.custom, cleanCustomItem);
  if (isObj(raw.prefs)) {
    for (const k of SYNCED_PREFS) {
      const r = raw.prefs[k];
      if (isObj(r) && Number.isFinite(r.t) && 'v' in r) d.prefs[k] = { v: r.v, t: r.t };
    }
  }
  return d;
}

// Live (non-deleted) records of a map, newest first.
export const live = (map) => Object.values(map).filter((r) => !r.del).sort((a, b) => b.t - a.t);

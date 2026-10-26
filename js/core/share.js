// Meal links: the whole meal travels in the URL (?meal=…) as base64url JSON, so opening the
// link recreates it without a server. Custom items are embedded because they only exist locally.
const MAX_ITEMS = 50;
const MAX_QTY = 99;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

export function cleanCustom(c) {
  if (!c || typeof c !== 'object') return null;
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '';
  const kcal = num(c.kcal, 5000);
  const p = num(c.p, 500), carbs = num(c.c, 1000), f = num(c.f, 500);
  if (!name || !c.id || kcal == null || p == null || carbs == null || f == null) return null;
  return { id: String(c.id).slice(0, 40), name, kcal, p, c: carbs, f };
}

// meal: { name?, items: [{ key, qty }], custom?: [{ id, name, kcal, p, c, f }] }
export function encodeMeal(meal) {
  const payload = {
    v: 1,
    n: meal.name || undefined,
    i: meal.items.slice(0, MAX_ITEMS).map((m) => [m.key, m.qty]),
    c: meal.custom?.length ? meal.custom.map((c) => [c.id, c.name, c.kcal, c.p, c.c, c.f]) : undefined,
  };
  return toBase64Url(JSON.stringify(payload));
}

// Returns a validated meal, or null when the link is malformed. `isKnownKey` decides which
// restaurant item keys exist; embedded custom items are always allowed.
export function decodeMeal(str, isKnownKey) {
  let raw;
  try { raw = JSON.parse(fromBase64Url(String(str))); } catch { return null; }
  if (!raw || raw.v !== 1 || !Array.isArray(raw.i)) return null;
  const custom = (Array.isArray(raw.c) ? raw.c : [])
    .map(([id, name, kcal, p, c, f]) => cleanCustom({ id, name, kcal, p, c, f }))
    .filter(Boolean);
  const customKeys = new Set(custom.map((c) => 'custom:' + c.id));
  const items = [];
  for (const entry of raw.i.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(entry)) continue;
    const [key, qty] = entry;
    if (typeof key !== 'string' || !(isKnownKey(key) || customKeys.has(key))) continue;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) continue;
    items.push({ key, qty });
  }
  if (!items.length) return null;
  const name = typeof raw.n === 'string' ? raw.n.trim().slice(0, 60) : '';
  return { name, items, custom: custom.filter((c) => items.some((m) => m.key === 'custom:' + c.id)) };
}

export function shareUrl(base, meal) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('meal', encodeMeal(meal));
  return url.toString();
}

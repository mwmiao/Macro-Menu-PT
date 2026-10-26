import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBreakfastTime, isAvailable } from '../js/core/availability.js';
import { encodeMeal, decodeMeal, shareUrl } from '../js/core/share.js';
import { orderScript, orderNumber, macroSplit, barcodeWidths } from '../js/core/order.js';
import { emptyData, mergeData, sanitize, live } from '../js/core/merge.js';

const at = (h, m) => new Date(2026, 9, 26, h, m);

test('breakfast window is 08:00 inclusive to 11:00 exclusive, local time', () => {
  assert.equal(isBreakfastTime(at(7, 59)), false);
  assert.equal(isBreakfastTime(at(8, 0)), true);
  assert.equal(isBreakfastTime(at(10, 59)), true);
  assert.equal(isBreakfastTime(at(11, 0)), false);
  assert.equal(isAvailable({ breakfastOnly: true }, at(12, 0)), false);
  assert.equal(isAvailable({ breakfastOnly: true }, at(9, 30)), true);
  assert.equal(isAvailable({}, at(23, 0)), true);
});

const known = (k) => k.startsWith('mcdonalds:');

test('meal links round-trip, including names with accents and custom items', () => {
  const meal = {
    name: 'Almoço rápido',
    items: [{ key: 'mcdonalds:big-mac', qty: 2 }, { key: 'custom:abc', qty: 1 }],
    custom: [{ id: 'abc', name: 'Iogurte', kcal: 120, p: 10, c: 12, f: 3 }],
  };
  const back = decodeMeal(encodeMeal(meal), known);
  assert.deepEqual(back, meal);
  const url = new URL(shareUrl('https://macro-meals.nuka-drifter.com/#kfc', meal));
  assert.equal(url.hash, '');
  assert.deepEqual(decodeMeal(url.searchParams.get('meal'), known), meal);
});

test('malformed or hostile meal links are rejected or cleaned', () => {
  assert.equal(decodeMeal('not-base64!!', known), null);
  assert.equal(decodeMeal(encodeMeal({ items: [{ key: 'unknown:x', qty: 1 }] }), known), null);
  const cleaned = decodeMeal(encodeMeal({ items: [{ key: 'mcdonalds:a', qty: 1 }, { key: 'mcdonalds:b', qty: 500 }, { key: 'mcdonalds:c', qty: 1.5 }] }), known);
  assert.deepEqual(cleaned.items, [{ key: 'mcdonalds:a', qty: 1 }]);
});

test('order script reads naturally in both languages and groups by restaurant', () => {
  const one = [{ chain: "McDonald's", lines: [{ name: 'Big Mac®', qty: 1 }, { name: 'Coca-Cola', qty: 2 }] }];
  assert.equal(orderScript(one, 'en'), "Hi, can I please get a Big Mac®, and 2 Coca-Cola.\nThat's it, thanks!");
  assert.equal(orderScript(one, 'pt'), 'Olá, queria por favor 1 Big Mac® e 2 Coca-Cola.\nÉ tudo, obrigado!');
  const two = [...one, { chain: 'KFC', lines: [{ name: 'Tender', qty: 3 }] }];
  assert.match(orderScript(two, 'en'), /^McDonald's:\n.*\n.*\n\nKFC:\nHi, can I please get 3 Tender\./s);
});

test('receipt helpers are deterministic', () => {
  const items = [{ key: 'kfc:tower-original', qty: 1 }];
  assert.equal(orderNumber(items), orderNumber(items));
  assert.match(orderNumber(items), /^\d{4}$/);
  assert.deepEqual(barcodeWidths(1234), barcodeWidths(1234));
  assert.deepEqual(macroSplit({ p: 25, f: 0, c: 25 }), { p: 50, f: 0, c: 50 });
  assert.deepEqual(macroSplit({ p: 0, f: 0, c: 0 }), { p: 0, f: 0, c: 0 });
});

test('merge keeps the newest copy of each record and respects deletions', () => {
  const a = emptyData();
  const b = emptyData();
  a.saved.x = { id: 'x', name: 'Old', items: [], created: 1, t: 10 };
  b.saved.x = { id: 'x', name: 'New', items: [], created: 1, t: 20 };
  a.saved.y = { id: 'y', name: 'Kept', items: [], created: 1, t: 5 };
  b.presets.z = { id: 'z', del: true, t: 30 };
  a.presets.z = { id: 'z', name: 'Deleted elsewhere', items: [], created: 1, t: 25 };
  a.pad = { items: [{ key: 'k', qty: 1 }], t: 50 };
  b.pad = { items: [], t: 40 };
  a.favs.k = { on: true, t: 1 };
  b.favs.k = { on: false, t: 2 };
  b.prefs.skin = { v: 'light', t: 9 };
  const m = mergeData(a, b);
  assert.equal(m.saved.x.name, 'New');
  assert.equal(m.saved.y.name, 'Kept');
  assert.equal(m.presets.z.del, true);
  assert.equal(m.pad.items.length, 1);
  assert.equal(m.favs.k.on, false);
  assert.equal(m.prefs.skin.v, 'light');
  assert.deepEqual(live(m.presets), []);
  assert.deepEqual(mergeData(m, m), m);
});

test('sanitize drops malformed records instead of throwing', () => {
  const d = sanitize({
    favs: { a: { on: true, t: 1 }, b: { on: 'yes', t: 1 } },
    pad: { items: [{ key: 'k', qty: 2 }, { key: 'bad', qty: -1 }], t: 3 },
    saved: { s: { name: '  Lunch ', items: [], t: 4 }, broken: { name: '', t: 4 }, gone: { del: true, t: 5 } },
    custom: { c: { name: 'Shake', kcal: 200, p: 30, c: 10, f: 3, t: 6 }, bad: { name: 'X', kcal: -5, p: 1, c: 1, f: 1, t: 6 } },
    prefs: { skin: { v: 'locker', t: 7 }, unknown: { v: 1, t: 7 } },
  });
  assert.deepEqual(Object.keys(d.favs), ['a']);
  assert.deepEqual(d.pad.items, [{ key: 'k', qty: 2 }]);
  assert.equal(d.saved.s.name, 'Lunch');
  assert.equal(d.saved.broken, undefined);
  assert.equal(d.saved.gone.del, true);
  assert.deepEqual(Object.keys(d.custom), ['c']);
  assert.deepEqual(Object.keys(d.prefs), ['skin']);
  assert.deepEqual(sanitize(null), emptyData());
  assert.deepEqual(sanitize('garbage'), emptyData());
});

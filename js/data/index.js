import mcdonalds from './mcdonalds.js';
import kfc from './kfc.js';
import pizzahut from './pizzahut.js';
import tacobell from './tacobell.js';
import pans from './pans.js';
import burgerking from './burgerking.js';

const FIELDS = ['pt', 'en', 'cat', 'kcal', 'p', 'c', 'sug', 'f', 'sat', 'salt', 'portion'];

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const CHAINS = [mcdonalds, burgerking, kfc, pizzahut, tacobell, pans].map((chain) => {
  const seen = new Set();
  const items = chain.items.map((row) => {
    const it = Object.fromEntries(FIELDS.map((f, i) => [f, row[i] ?? null]));
    let key = chain.id + ':' + slug(it.pt);
    while (seen.has(key)) key += '-2';
    seen.add(key);
    it.key = key;
    it.chain = chain.id;
    return it;
  });
  return { ...chain, items };
});

export const ITEMS = new Map(CHAINS.flatMap((c) => c.items.map((it) => [it.key, it])));
export const CHAIN = Object.fromEntries(CHAINS.map((c) => [c.id, c]));

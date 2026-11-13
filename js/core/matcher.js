// Meal Matcher: finds a combination of one chain's items near a calorie target with enough protein.
import { totals } from './nutrition.js';
import { isAvailable } from './availability.js';

const BEAM = 400; // partial combinations kept per step
const KEEP = 60; // best of each step kept as candidates
const CHOICES = 12; // distinct finished combinations a shuffle picks from

// prefs: { kcal, protein, max, desserts, drinks }. `rng` is injectable for tests.
// Returns { combo, tot } or { combo: null } when nothing fits.
export function buildMeal(items, prefs, now, rng = Math.random, reshuffle = false) {
  const pool = items.filter((it) => it.kcal >= 30 && it.cat !== 'sauces' && it.cat !== 'hotdrinks' && it.cat !== 'extras'
    && isAvailable(it, now) && (prefs.drinks || it.cat !== 'colddrinks') && (prefs.desserts || it.cat !== 'desserts'));
  const cap = prefs.kcal * 1.04;
  const score = (tot, n) => {
    const kcalMiss = Math.abs(prefs.kcal - tot.kcal) / prefs.kcal;
    const pMiss = Math.max(0, prefs.protein - tot.p) / Math.max(prefs.protein, 1);
    return kcalMiss * 100 + pMiss * 220 - tot.p * 0.05 + n * 0.5;
  };
  const byScore = (a, b) => score(a.tot, a.idx.length) - score(b.tot, b.idx.length);
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
    next.sort(byScore);
    beam = next.slice(0, BEAM);
    finals.push(...beam.slice(0, KEEP));
  }
  const ranked = finals.filter((f) => f.tot.kcal >= prefs.kcal * 0.85 && f.tot.p >= prefs.protein * 0.95).sort(byScore);
  const uniq = [];
  const seen = new Set();
  for (const r of ranked) {
    const k = r.idx.join(',');
    if (!seen.has(k)) { seen.add(k); uniq.push(r); }
    if (uniq.length >= CHOICES) break;
  }
  if (!uniq.length) return { combo: null };
  const pick = reshuffle ? uniq[Math.floor(rng() * uniq.length)] : uniq[0];
  const combo = pick.idx.map((i) => pool[i]);
  return { combo, tot: totals(combo.map((it) => ({ it, qty: 1 }))) };
}

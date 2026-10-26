// Protein-density tiers and meal totals.
export const TIERS = [
  { t: 'S', min: 8 }, { t: 'A', min: 6 }, { t: 'B', min: 4.5 }, { t: 'C', min: 3 }, { t: 'D', min: 1.5 }, { t: 'F', min: 0 },
];
export const NON_FOOD = new Set(['sauces', 'hotdrinks', 'colddrinks', 'extras']);

export const density = (it) => (it.kcal > 0 ? (it.p * 100) / it.kcal : 0);
export const tierOf = (it) => (it.kcal < 40 ? null : TIERS.find((x) => density(it) >= x.min).t);

// entries: [{ it, qty }] → summed nutrients. Unknown values (null) count as 0.
export function totals(entries) {
  const s = { kcal: 0, p: 0, c: 0, f: 0, sug: 0, sat: 0, salt: 0 };
  for (const { it, qty } of entries) for (const k in s) s[k] += (it[k] || 0) * qty;
  return s;
}

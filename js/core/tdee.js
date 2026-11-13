// Daily energy needs (Mifflin–St Jeor) and a suggested calorie/protein target.
const ACTIVITY = [1.2, 1.375, 1.55, 1.725, 1.9]; // act 1..5
const GOAL = { cut: 0.8, keep: 1, bulk: 1.1 };

// p: { sex: 'm'|'f', age, h (cm), w (kg), act: 1..5, goal: 'cut'|'keep'|'bulk' }
// → { maintenance (kcal/day), kcal (target, to nearest 10), protein (g) }
export function tdee(p) {
  const bmr = 10 * p.w + 6.25 * p.h - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const maintenance = bmr * ACTIVITY[p.act - 1];
  return {
    maintenance,
    kcal: Math.round((maintenance * GOAL[p.goal]) / 10) * 10,
    protein: Math.round(p.w * (p.goal === 'keep' ? 1.6 : 2)),
  };
}

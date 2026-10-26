// Project check (there's no build step): syntax of every JS file, translation coverage,
// image index integrity and data sanity. Run with `npm run check`; exits non-zero on problems.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const problems = [];

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const jsFiles = [...walk(join(root, 'js')), join(root, 'sw.js'), ...walk(join(root, 'tools')), ...walk(join(root, 'tests'))]
  .filter((f) => /\.(m?js)$/.test(f));

for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { problems.push(`syntax: ${relative(root, f)}\n${e.stderr}`); }
}

const { STRINGS } = await import(pathToFileURL(join(root, 'js/i18n.js')));
const en = Object.keys(STRINGS.en), pt = Object.keys(STRINGS.pt);
for (const k of en) if (!pt.includes(k)) problems.push(`i18n: "${k}" missing in pt`);
for (const k of pt) if (!en.includes(k)) problems.push(`i18n: "${k}" missing in en`);

// Literal keys passed to t('…'). Dynamic keys (t('cat_' + c)) are covered by the data check below.
const used = new Set();
for (const f of jsFiles.filter((f) => f.includes(`${join('js', '')}`))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z_]+)'\s*[,)]/g)) used.add(m[1]);
}
for (const k of used) if (!(k in STRINGS.en)) problems.push(`i18n: t('${k}') is used but not defined`);

const { CHAINS } = await import(pathToFileURL(join(root, 'js/data/index.js')));
for (const c of CHAINS) {
  for (const it of c.items) {
    if (!STRINGS.en['cat_' + it.cat]) problems.push(`data: ${it.key} has unknown category "${it.cat}"`);
    for (const k of ['kcal', 'p', 'c', 'f']) if (!(typeof it[k] === 'number' && it[k] >= 0)) problems.push(`data: ${it.key} has invalid ${k}`);
  }
  for (const name of c.breakfastOnly || []) if (!c.items.some((it) => it.pt === name)) problems.push(`data: breakfastOnly "${name}" not on ${c.id} menu`);
}

const { default: IMAGES } = await import(pathToFileURL(join(root, 'js/data/images.js')));
const keys = new Set(CHAINS.flatMap((c) => c.items.map((it) => it.key)));
for (const [k, p] of Object.entries(IMAGES)) {
  if (!keys.has(k)) problems.push(`images: index has unknown item ${k}`);
  if (!existsSync(join(root, p))) problems.push(`images: missing file ${p}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${jsFiles.length} files, ${en.length} strings × 2 languages, ${keys.size} items, ${Object.keys(IMAGES).length} photos`);

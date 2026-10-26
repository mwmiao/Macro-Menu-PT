// Downloads the official product photos listed in tools/image-sources/<chain>.json,
// converts each to a 480px WebP with ffmpeg, and writes js/data/images.js (item key -> path).
//
//   npm run images                 # all chains
//   node tools/fetch-images.mjs kfc pans   # only these chains
//
// Source files map an item's Portuguese name (as in js/data/<chain>.js) to an image URL.
// Optional "_base" is prefixed and "_query" appended to every URL.
//
// Resilience: each URL is fetched once per run (items sharing a photo share the download), with a
// 20 s timeout and up to 3 attempts with backoff. Files already on disk are never downloaded again
// (that's also how McDonald's photos, which mcdonalds.pt won't serve to scripts, are kept).
// Every run writes tools/image-report.json: failures with their error, and the items that still
// have no photo, so the next pass knows what to look for.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { CHAINS } = await import(pathToFileURL(join(root, 'js/data/index.js')));
const srcDir = join(root, 'tools/image-sources');
const only = process.argv.slice(2);
const indexPath = join(root, 'js/data/images.js');
const reportPath = join(root, 'tools/image-report.json');

const UA = 'Mozilla/5.0 (compatible; MacroMealsImageFetcher/1.0; +https://macro-meals.nuka-drifter.com/)';
const TIMEOUT = 20000;
const ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const index = existsSync(indexPath)
  ? JSON.parse(readFileSync(indexPath, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, ''))
  : {};
const failures = [];
const downloads = new Map(); // url -> Promise<string|null> (file path), so shared photos download once

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(TIMEOUT) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastError = `HTTP ${res.status}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // won't change on retry
    } catch (e) {
      lastError = e.name === 'TimeoutError' ? `timeout after ${TIMEOUT / 1000}s` : e.message;
    }
    if (attempt < ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw new Error(lastError);
}

function download(url, out) {
  if (existsSync(out)) return Promise.resolve(out);
  if (!downloads.has(url)) {
    downloads.set(url, (async () => {
      const tmp = out.replace(/\.webp$/, '.tmp');
      try {
        writeFileSync(tmp, await fetchWithRetry(url));
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', "scale='min(480,iw)':-2",
          '-c:v', 'libwebp', '-quality', '78', '-pix_fmt', 'yuva420p', out]);
        return out;
      } finally { rmSync(tmp, { force: true }); }
    })());
  }
  return downloads.get(url);
}

const missing = {};
for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
  const chainId = file.replace(/\.json$/, '');
  if (only.length && !only.includes(chainId)) continue;
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) { console.warn(`! no chain "${chainId}"`); continue; }
  const src = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
  const base = src._base || '';
  const query = src._query || '';
  const outDir = join(root, 'images', chainId);
  mkdirSync(outDir, { recursive: true });

  const found = new Set();
  let ok = 0;
  const jobs = [];
  for (const [name, ref] of Object.entries(src)) {
    if (name.startsWith('_')) continue;
    const item = chain.items.find((it) => it.pt === name);
    if (!item) { failures.push({ chain: chainId, name, error: 'no menu item with this name' }); continue; }
    const absolute = /^https?:/.test(ref);
    const url = absolute ? ref : base + ref + query;
    const id = createHash('sha1').update(url).digest('hex').slice(0, 12);
    const out = join(outDir, id + '.webp');
    jobs.push(download(url, out).then(() => {
      index[item.key] = `images/${chainId}/${id}.webp`;
      found.add(item.key);
      ok++;
    }, (e) => {
      failures.push({ chain: chainId, name, url, error: e.message });
      if (index[item.key] && existsSync(join(root, index[item.key]))) found.add(item.key); // keep an older photo
      else delete index[item.key];
    }));
  }
  await Promise.all(jobs);
  // Drop index entries for items no longer mapped (renamed or removed).
  for (const k of Object.keys(index)) if (k.startsWith(chainId + ':') && !found.has(k)) delete index[k];
  missing[chainId] = chain.items.filter((it) => !index[it.key]).map((it) => it.pt);
  console.log(`${chainId}: ${ok} items with photos (of ${chain.items.length}), ${missing[chainId].length} without`);
}

const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(indexPath, '// Generated by tools/fetch-images.mjs. Item key -> official product photo.\nexport default ' + JSON.stringify(sorted, null, 1) + ';\n');
const previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { missing: {} };
writeFileSync(reportPath, JSON.stringify({
  generated: new Date().toISOString(),
  failures,
  missing: { ...previous.missing, ...missing },
}, null, 2) + '\n');
console.log(`wrote ${Object.keys(sorted).length} entries to js/data/images.js`);
if (failures.length) console.warn(`${failures.length} failure(s) — see tools/image-report.json`);

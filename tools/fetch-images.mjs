// Step 1 of the photo pipeline: downloads the product photos listed in tools/image-sources/<chain>.json
// into tools/image-originals/<chain>/<sha1(url)[0:12]>.webp (up to 800 px, untouched otherwise) and
// records them in tools/image-manifest.json. Step 2, tools/process-images.py, turns approved
// originals into the photos the site serves and writes js/data/images.js.
//
//   npm run images                 # fetch all chains, then process
//   node tools/fetch-images.mjs kfc pans   # only fetch these chains
//
// Source files map an item's Portuguese name (as in js/data/<chain>.js) to an image URL, or to
// { "url", "region", "match": "equivalent" } for the same product from another country's official
// site. Optional "_base" is prefixed and "_query" appended to relative URLs.
//
// Resilience: each URL is fetched once per run (items sharing a photo share the download), with a
// 20 s timeout and up to 3 attempts with backoff. Files already on disk are never downloaded again
// (that's also how McDonald's photos, which mcdonalds.pt won't serve to scripts, are kept).
// Failures are written to tools/image-report.json.
//
// New manifest entries start as status "pending": they are not shown on the site until someone
// has looked at them and set "approved" or "rejected" (see process-images.py for the policy).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { CHAINS } = await import(pathToFileURL(join(root, 'js/data/index.js')));
const srcDir = join(root, 'tools/image-sources');
const origDir = join(root, 'tools/image-originals');
const manifestPath = join(root, 'tools/image-manifest.json');
const reportPath = join(root, 'tools/image-report.json');
const only = process.argv.slice(2);

const UA = 'Mozilla/5.0 (compatible; MacroMealsImageFetcher/1.0; +https://macro-meals.nuka-drifter.com/)';
const TIMEOUT = 20000;
const ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const failures = [];
const downloads = new Map(); // url -> Promise<string> (file path), so shared photos download once

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
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', "scale='min(800,iw)':-2",
          '-c:v', 'libwebp', '-quality', '90', '-pix_fmt', 'yuva420p', out]);
        return out;
      } finally { rmSync(tmp, { force: true }); }
    })());
  }
  return downloads.get(url);
}

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
  const chainId = file.replace(/\.json$/, '');
  if (only.length && !only.includes(chainId)) continue;
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) { console.warn(`! no chain "${chainId}"`); continue; }
  const src = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
  const base = src._base || '';
  const query = src._query || '';
  mkdirSync(join(origDir, chainId), { recursive: true });

  const items = {}; // manifest id -> item keys, rebuilt for this chain
  let ok = 0;
  const jobs = [];
  for (const [name, ref] of Object.entries(src)) {
    if (name.startsWith('_')) continue;
    const item = chain.items.find((it) => it.pt === name);
    if (!item) { failures.push({ chain: chainId, name, error: 'no menu item with this name' }); continue; }
    const { url: path, region = 'pt', match = 'exact' } = typeof ref === 'string' ? { url: ref } : ref;
    const url = /^https?:/.test(path) ? path : base + path + query;
    const id = `${chainId}/${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
    jobs.push(download(url, join(origDir, id + '.webp')).then(() => {
      manifest[id] ??= { source: url, region, match, items: [], status: 'pending' };
      (items[id] ??= []).push(item.key);
      ok++;
    }, (e) => {
      failures.push({ chain: chainId, name, url, error: e.message });
      // Keep the photo this item already had, if any.
      const old = Object.keys(manifest).find((k) => manifest[k].items.includes(item.key) && existsSync(join(origDir, k + '.webp')));
      if (old) (items[old] ??= []).push(item.key);
    }));
  }
  await Promise.all(jobs);
  // Items move with their mapping; entries no longer used keep their history with no items.
  for (const [id, e] of Object.entries(manifest)) if (id.startsWith(chainId + '/')) e.items = (items[id] || []).sort();
  console.log(`${chainId}: ${ok} items mapped to a photo (of ${chain.items.length})`);
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
writeFileSync(reportPath, JSON.stringify({ generated: new Date().toISOString(), failures }, null, 2) + '\n');
if (failures.length) console.warn(`${failures.length} failure(s) — see tools/image-report.json`);

// Checks a built site directory (the contents of the Docker image's web root):
// every page/script reference and every relative ES-module import resolves to a file, and all
// code URLs carry the same release id (?v=<id>), so no stale module can be mixed in.
//
//   node tools/check-build.mjs <dir> <release-id>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [dir, version] = process.argv.slice(2);
if (!dir || !version) { console.error('usage: check-build.mjs <dir> <release-id>'); process.exit(2); }
const problems = [];

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

const html = readFileSync(join(dir, 'index.html'), 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
  const [path, query] = url.split('?');
  if (!existsSync(join(dir, path))) problems.push(`index.html → missing ${path}`);
  if (query !== `v=${version}`) problems.push(`index.html → ${url} is not versioned with v=${version}`);
}

let imports = 0;
for (const file of walk(join(dir, 'js')).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(file, 'utf8');
  for (const [, spec] of src.matchAll(/\bfrom\s+'([^']+)'/g)) {
    if (!spec.startsWith('.')) continue;
    imports++;
    const [path, query] = spec.split('?');
    const target = join(dirname(file), path);
    if (!existsSync(target)) problems.push(`${relative(dir, file)} imports missing ${spec}`);
    if (query !== `v=${version}`) problems.push(`${relative(dir, file)} imports ${spec} without v=${version}`);
  }
}

const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
if (!sw.includes(`mm-${version}`)) problems.push('sw.js cache name was not stamped with the release id');
if (!readFileSync(join(dir, 'js/config.js'), 'utf8').includes(`build: '${version}'`)) problems.push('config.js build id was not stamped');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`build ok: ${imports} versioned imports, release ${version}`);

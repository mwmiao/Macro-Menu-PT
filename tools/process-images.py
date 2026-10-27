"""Step 2 of the photo pipeline (step 1 is tools/fetch-images.mjs).

Policy: a served photo must already be a clean product shot from the chain's own website (this
country's, or the same product on another country's official site): only the product, on a real
transparent background, with no headlines, badges, slogans, people or decoration. Photos are never
edited to get there: no erasing, cut-outs or reconstruction. An unsuitable photo is replaced by
a better source, or the item keeps the drawn placeholder and is listed for review.

For every manifest entry with status "approved" (or "fallback", see below) this script only:
  1. checks the original really has a transparent background (its border must be transparent;
     skipped for "fallback");
  2. trims the transparent margin, adds even padding (4 %), longest side at most 480 px;
  3. saves it as WebP with alpha, named by a hash of its content (images/<chain>/<hash>.webp), so a
     changed photo always gets a new URL and no cache can keep the old one.

Then it writes js/data/images.js (item key -> photo), deletes served photos nothing uses any more,
and writes tools/image-review.md: rejected photos, photos not reviewed yet, and items with no photo.

Manifest entries (tools/image-manifest.json, keyed "<chain>/<id>"; originals in tools/image-originals):
  source   URL the original was downloaded from
  region   site it came from, e.g. "pt", "us", "es"
  match    "exact" (this product, Portuguese site) or "equivalent" (the same product, checked by eye,
           from another official site; it never changes the item's name, nutrition or portion)
  items    item keys using it (kept up to date by fetch-images.mjs)
  status   "pending" | "approved" | "fallback" | "rejected";  issue: what is wrong with it
           "fallback" = an unsuitable official photo (headline, badge, background…) that is shown
           anyway until a clean one is found; it is served as is and stays on the review list.
Results are cached: an entry is only reprocessed when its original changes.

  python tools/process-images.py          (needs: pip install pillow numpy)
"""
import hashlib
import io
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'tools', 'image-manifest.json')
ORIGINALS = os.path.join(ROOT, 'tools', 'image-originals')
OUT = os.path.join(ROOT, 'images')
INDEX = os.path.join(ROOT, 'js', 'data', 'images.js')
REVIEW = os.path.join(ROOT, 'tools', 'image-review.md')
VERSION = '2'  # bump to reprocess everything after changing finish()
MAX_SIDE = 480
PAD = 0.04


def transparent_background(img):
    a = np.array(img.getchannel('A'))
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return (border < 16).mean() > 0.95


def finish(img):
    bbox = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(bbox)
    pad = round(PAD * max(img.size))
    canvas = Image.new('RGBA', (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    canvas.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    buf = io.BytesIO()
    canvas.save(buf, 'WEBP', quality=82, method=6)
    return buf.getvalue()


def item_names():
    js = ("import { ITEMS } from './js/data/index.js';"
          "console.log(JSON.stringify(Object.fromEntries([...ITEMS].map(([k, it]) => [k, it.pt]))));")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, encoding='utf8', check=True)
    return json.loads(out.stdout)


def main():
    with open(MANIFEST, encoding='utf8') as f:
        manifest = json.load(f)
    index, used, done, errors = {}, set(), 0, []
    for mid, e in manifest.items():
        if e['status'] not in ('approved', 'fallback') or not e['items']:
            continue
        with open(os.path.join(ORIGINALS, mid + '.webp'), 'rb') as f:
            raw = f.read()
        stamp = hashlib.sha1(raw + VERSION.encode()).hexdigest()[:12]
        if not (e.get('stamp') == stamp and e.get('output') and os.path.exists(os.path.join(ROOT, e['output']))):
            img = Image.open(io.BytesIO(raw)).convert('RGBA')
            if e['status'] == 'approved' and not transparent_background(img):
                errors.append(f'{mid}: approved but has no transparent background (not served)')
                continue
            data = finish(img)
            rel = f'images/{mid.split("/")[0]}/{hashlib.sha1(data).hexdigest()[:12]}.webp'
            os.makedirs(os.path.dirname(os.path.join(ROOT, rel)), exist_ok=True)
            with open(os.path.join(ROOT, rel), 'wb') as f:
                f.write(data)
            e['output'], e['stamp'] = rel, stamp
            done += 1
        used.add(e['output'])
        for k in e['items']:
            index[k] = e['output']

    for chain in os.listdir(OUT):
        for name in os.listdir(os.path.join(OUT, chain)):
            if f'images/{chain}/{name}' not in used:
                os.remove(os.path.join(OUT, chain, name))

    with open(MANIFEST, 'w', encoding='utf8', newline='\n') as f:
        f.write(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')
    with open(INDEX, 'w', encoding='utf8', newline='\n') as f:
        f.write('// Generated by tools/process-images.py from tools/image-manifest.json. Item key -> product photo.\n'
                'export default ' + json.dumps(dict(sorted(index.items())), indent=1, ensure_ascii=False) + ';\n')

    names = item_names()
    lines = ['# Product photos to review', '',
             'Generated by `tools/process-images.py`. "Shown for now" photos are served until a clean one is found;',
             'the other items show the drawn placeholder.', '']
    for title, status in (('Shown for now (unsuitable official photo, needs a clean source)', 'fallback'),
                          ('Rejected (not shown, needs a clean source)', 'rejected'),
                          ('Not reviewed yet', 'pending')):
        rows = [(mid, e) for mid, e in manifest.items() if e['status'] == status and e['items']]
        lines += [f'## {title}: {len(rows)}', '']
        lines += [f'- `{mid}` {", ".join(names.get(k, k) for k in e["items"])}'
                  + (f' — {e["issue"]}' if e.get('issue') else '') for mid, e in rows]
        lines.append('')
    covered = {k for e in manifest.values() if e['status'] in ('fallback', 'rejected', 'pending') for k in e['items']}
    missing = [k for k in names if k not in index and k not in covered]
    lines += [f'## No photo source yet: {len(missing)}', '']
    for chain in dict.fromkeys(k.split(':')[0] for k in missing):
        lines.append(f'- **{chain}**: ' + ', '.join(names[k] for k in missing if k.startswith(chain + ':')))
    with open(REVIEW, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')

    print(f'{done} processed, {len(used)} photos for {len(index)} items; review list: tools/image-review.md')
    if errors:
        print('errors:\n  ' + '\n  '.join(errors), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

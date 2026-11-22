"""Background removal for the chain's own photos on a plain background, to be reviewed before use.

Policy (owner decision 2026-11-22): product photos are not edited, with ONE exception: the chain's own photo
on a plain background may have that background removed with this script, and the result is used only if it
passed review on dark, light and checkerboard backgrounds (no halo, nothing of the product lost). Approved
entries are recorded in tools/image-manifest.json as edited: "cutout"; the untouched original stays in
tools/image-originals/ and is never modified. No retouching, reconstruction or painting out text/badges.

  python tools/cutout.py            make candidates in tools/image-cutouts/<chain>/<id>.webp (RGBA, lossless)
  python tools/cutout.py --sheet    draw review sheets (24 tiles each) into downloads/cutout-sheets/
                                    (each tile: checkerboard | dark #1c1613 | light #f3ede2)
  (needs: pillow numpy; no scipy)

Selection: manifest entries with status "fallback", items, whose issue matches white|table|background|cropped
and does not match headline|badge|slogan|scene|lifestyle|people|hand|graphic|logo. Entries already reviewed
(cutout approved/rejected) are left alone.

Method: background colour = median of the 1 px border ring (skipped as "busy background" when <90% of the ring
is within BG_RING of it). bgmask = RGB distance <= BG_DIST, 4-connected; background = components touching the
border, so enclosed white parts (cream, cups, lids) stay. Kept: the largest foreground component plus any
>= 5% of it. Skipped as "product cut by frame" (foreground box touches 2+ image sides) or "implausible area"
(<3% or >80%). Soft edge: fg pixels within 2 px of background get alpha = clip((dist-LO)/(HI-LO), 0, 1); the
outermost foreground ring is capped at 0.5 (1 px erosion); alpha is blurred (sigma 0.6) in a 3 px edge band
only; colours of partly transparent pixels are decontaminated: C = (I - (1-alpha)*bg) / alpha.

v2 (python tools/cutout.py --v2, run once): only for entries rejected in review for a floor shadow / light fringe
(reason matches shadow|fringe|halo|patch and not eaten|badge|gap|text). After the border flood fill it also
removes pixels that are neutral (max-min RGB <= 14) and lighter than mid grey (mean RGB >= 128) and connected to
the removed background through such pixels. Everything else is as above; results go back to review ("cutout_pass": 2).

Parameters (defaults used for every entry; one global adjustment allowed): see the constants below.
"""
import json
import os
from collections import deque
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'tools', 'image-manifest.json')
ORIGINALS = os.path.join(ROOT, 'tools', 'image-originals')
CUTOUTS = os.path.join(ROOT, 'tools', 'image-cutouts')
SHEETS = os.path.join(ROOT, 'downloads', 'cutout-sheets')

BG_DIST = 28      # RGB distance to the background colour that counts as background
BG_RING = 40      # border pixels must be within this of the background colour...
RING_SHARE = 0.90  # ...for at least this share, else "busy background"
LO, HI = 12, 48   # soft-edge ramp
INCLUDE = re.compile(r'white|table|background|cropped', re.I)
V2_CHROMA = 14   # v2 only: max-min of RGB at most this = neutral (grey/white)
V2_LIGHT = 128   # v2 only: mean RGB at least this = lighter than mid grey
V2_REASON = re.compile(r'shadow|fringe|halo|patch', re.I)
V2_NOT = re.compile(r'eaten|badge|gap|text', re.I)
EXCLUDE = re.compile(r'headline|badge|slogan|scene|lifestyle|people|hand|graphic|logo', re.I)


def selected(manifest):
    return [mid for mid, e in manifest.items()
            if e['status'] == 'fallback' and e['items']
            and INCLUDE.search(e.get('issue', '')) and not EXCLUDE.search(e.get('issue', ''))]


def flood(mask, seeds):
    """4-connected flood fill of True pixels of mask starting from the True pixels of seeds."""
    h, w = mask.shape
    flat, seen = mask.ravel(), np.zeros(h * w, bool)
    q = deque(int(i) for i in np.flatnonzero(seeds.ravel() & flat))
    for i in q:
        seen[i] = True
    while q:
        i = q.popleft()
        y, x = divmod(i, w)
        for j, ok in ((i - w, y > 0), (i + w, y < h - 1), (i - 1, x > 0), (i + 1, x < w - 1)):
            if ok and flat[j] and not seen[j]:
                seen[j] = True
                q.append(j)
    return seen.reshape(h, w)


def components(mask):
    """Areas of the 4-connected components of mask, and their label image (0 = none)."""
    lab = np.zeros(mask.shape, np.int32)
    rest, areas = mask.copy(), []
    while rest.any():
        ys, xs = np.nonzero(rest)
        seed = np.zeros(mask.shape, bool)
        seed[ys[0], xs[0]] = True
        comp = flood(rest, seed)
        areas.append(int(comp.sum()))
        lab[comp] = len(areas)
        rest &= ~comp
    return areas, lab


def dilate(m, n=1):
    for _ in range(n):
        d = m.copy()
        d[1:] |= m[:-1]
        d[:-1] |= m[1:]
        d[:, 1:] |= m[:, :-1]
        d[:, :-1] |= m[:, 1:]
        m = d
    return m


def erode(m, n=1):
    return ~dilate(~m, n)


def blur(a, sigma=0.6):
    k = np.exp(-np.arange(-2, 3) ** 2 / (2 * sigma ** 2))
    k /= k.sum()
    for axis in (0, 1):
        p = np.pad(a, [(2, 2) if i == axis else (0, 0) for i in range(2)], mode='edge')
        n = a.shape[axis]
        a = sum(k[t] * (p[t:t + n] if axis == 0 else p[:, t:t + n]) for t in range(5))
    return a


def cutout(img, v2=False):
    """Returns (RGBA image, None) or (None, skip reason)."""
    rgb = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w = rgb.shape[:2]
    ring = np.concatenate([rgb[0], rgb[-1], rgb[1:-1, 0], rgb[1:-1, -1]])
    bg = np.median(ring, axis=0)
    if (np.linalg.norm(ring - bg, axis=1) <= BG_RING).mean() < RING_SHARE:
        return None, 'busy background'
    dist = np.linalg.norm(rgb - bg, axis=2)
    bgmask = dist <= BG_DIST
    border = np.zeros((h, w), bool)
    border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    fg = ~flood(bgmask, border)
    if v2:  # also absorb neutral light floor shadows / fringes connected to the removed background
        light_neutral = (rgb.max(axis=2) - rgb.min(axis=2) <= V2_CHROMA) & (rgb.mean(axis=2) >= V2_LIGHT)
        fg = ~flood(light_neutral | ~fg, ~fg)
    areas, flab = components(fg)
    if not areas:
        return None, 'implausible area'
    keep = [i + 1 for i, a in enumerate(areas) if a >= 0.05 * max(areas)]
    fg = np.isin(flab, keep)
    frac = fg.mean()
    if frac < 0.03 or frac > 0.80:
        return None, 'implausible area'
    ys, xs = np.where(fg)
    sides = (ys.min() == 0) + (ys.max() == h - 1) + (xs.min() == 0) + (xs.max() == w - 1)
    if sides >= 2:
        return None, 'product cut by frame'

    alpha = fg.astype(np.float32)
    outside = ~fg
    near = fg & dilate(outside, 2)
    alpha[near] = np.clip((dist[near] - LO) / (HI - LO), 0, 1)
    ring1 = fg & ~erode(fg, 1)
    alpha[ring1] = np.minimum(alpha[ring1], 0.5)
    band = dilate(outside, 3) & dilate(fg, 3)
    alpha = np.where(band, blur(alpha), alpha)
    alpha[outside & ~dilate(fg, 1)] = 0

    a3 = alpha[..., None]
    safe = np.maximum(a3, 1e-3)
    col = np.where((a3 > 0) & (a3 < 1), (rgb - (1 - a3) * bg) / safe, rgb)
    col = np.clip(col, 0, 255)
    out = np.dstack([col, alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), None


def run(v2=False):
    with open(MANIFEST, encoding='utf8') as f:
        manifest = json.load(f)
    todo = selected(manifest)
    if v2:
        todo = [m for m in todo if manifest[m].get('cutout') == 'rejected' and manifest[m].get('cutout_pass') != 2
                and V2_REASON.search(manifest[m].get('cutout_reason', '')) and not V2_NOT.search(manifest[m].get('cutout_reason', ''))]
    per = {}
    for mid in todo:
        c = per.setdefault(mid.split('/')[0], [0, 0])
        c[0] += 1
        c[1] += len(manifest[mid]['items'])
    print('selected:', ', '.join(f'{c} {v[0]} entries/{v[1]} items' for c, v in per.items()),
          f'= {len(todo)} entries')
    stats = {}
    for mid in todo:
        e = manifest[mid]
        if e.get('cutout') in ('approved', 'rejected') and not v2:
            continue
        chain = mid.split('/')[0]
        img = Image.open(os.path.join(ORIGINALS, mid + '.webp'))
        res, reason = cutout(img, v2)
        old = (e.get('cutout'), e.get('cutout_reason'))
        for k in ('cutout', 'cutout_reason'):
            e.pop(k, None)
        s = stats.setdefault(chain, {'produced': 0})
        if res is None:
            e['cutout'], e['cutout_reason'] = ('skipped', reason) if not v2 else old
            s[reason] = s.get(reason, 0) + 1
            continue
        dest = os.path.join(CUTOUTS, mid + '.webp')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        res.save(dest, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        e['cutout'] = 'pending'
        if v2:
            e['cutout_pass'] = 2
        s['produced'] += 1
    with open(MANIFEST, 'w', encoding='utf8', newline='\n') as f:
        f.write(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')
    for chain, s in stats.items():
        skipped = {k: v for k, v in s.items() if k != 'produced'}
        print(f'{chain}: produced {s["produced"]}, skipped {sum(skipped.values())} {skipped}')


def item_names():
    js = ("import { ITEMS } from './js/data/index.js';"
          "console.log(JSON.stringify(Object.fromEntries([...ITEMS].map(([k, it]) => [k, it.pt]))));")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, encoding='utf8', check=True)
    return json.loads(out.stdout)


def checker(size, s=10):
    img = Image.new('RGB', (size, size), (235, 235, 235))
    d = ImageDraw.Draw(img)
    for y in range(0, size, s):
        for x in range((y // s) % 2 * s, size, 2 * s):
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=(200, 200, 200))
    return img


def sheets():
    with open(MANIFEST, encoding='utf8') as f:
        manifest = json.load(f)
    names = item_names()
    rows = [mid for mid, e in manifest.items() if e.get('cutout') == 'pending']
    T, PER, COLS, LABEL = 160, 24, 3, 34
    os.makedirs(SHEETS, exist_ok=True)
    for f in os.listdir(SHEETS):
        os.remove(os.path.join(SHEETS, f))
    for page in range(0, len(rows), PER):
        chunk = rows[page:page + PER]
        nrows = (len(chunk) + COLS - 1) // COLS
        sheet = Image.new('RGB', (COLS * (3 * T + 8), nrows * (T + LABEL)), (255, 255, 255))
        d = ImageDraw.Draw(sheet)
        for i, mid in enumerate(chunk):
            cut = Image.open(os.path.join(CUTOUTS, mid + '.webp')).convert('RGBA')
            cut.thumbnail((T - 8, T - 8), Image.LANCZOS)
            x0, y0 = (i % COLS) * (3 * T + 8), (i // COLS) * (T + LABEL)
            for j, base in enumerate((checker(T), Image.new('RGB', (T, T), (28, 22, 19)), Image.new('RGB', (T, T), (243, 237, 226)))):
                tile = base.convert('RGBA')
                tile.alpha_composite(cut, ((T - cut.width) // 2, (T - cut.height) // 2))
                sheet.paste(tile.convert('RGB'), (x0 + j * T, y0))
            items = ', '.join(names.get(k, k) for k in manifest[mid]['items'])
            d.text((x0 + 2, y0 + T + 2), f'{mid}', fill=(0, 0, 0))
            d.text((x0 + 2, y0 + T + 14), items[:75], fill=(0, 0, 0))
        out = os.path.join(SHEETS, f'sheet-{page // PER + 1:02d}.png')
        sheet.save(out)
        print(out)
    print(f'{len(rows)} pending cut-outs, {(len(rows) + PER - 1) // PER} sheets')


if __name__ == '__main__':
    sheets() if '--sheet' in sys.argv else run('--v2' in sys.argv)

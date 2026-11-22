"""Local generative completion/repair of the remaining unsuitable official photos (plan 008).

Policy (owner decision 2026-11-22): where a chain's own photo is cropped by the photo frame, covered by
a hand, or has a badge/text over the product, a local generative inpainting model may complete or repair
ONLY the missing or covered area. The visible original pixels are pasted back unchanged; at most 40 % of
the product's pixels may be generated (gen_fraction); every result is reviewed against the original and
anything doubtful stays as it is. The item itself must not change (no other ingredients, size or quantity).
The original always stays in tools/image-originals/. Approved entries get "edited": "gen" plus "gen_model",
"gen_seed", "gen_prompt", "gen_fraction" in tools/image-manifest.json; the cut-out lives in
tools/image-gen/<chain>/<id>.webp.

Model: diffusers/stable-diffusion-xl-1.0-inpainting-0.1 (SDXL inpainting, fp16, diffusers, CUDA) and
rembg birefnet-general for the cut-out. Run with the virtual environment's Python (git-ignored; models
cached in tools/.ai-models):

  python -m venv tools/.venv-ai
  tools/.venv-ai/Scripts/python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
  tools/.venv-ai/Scripts/python.exe -m pip install diffusers transformers accelerate safetensors "rembg[cpu]" pillow numpy scipy
  tools/.venv-ai/Scripts/python.exe tools/gen_edit.py select                  (targets, by chain and failure type)
  tools/.venv-ai/Scripts/python.exe tools/gen_edit.py run <mid>... [--all]    (jobs from tools/image-gen/jobs.json)
  tools/.venv-ai/Scripts/python.exe tools/gen_edit.py --sheet [mid...]        (contact sheets in downloads/gen-sheets)
  tools/.venv-ai/Scripts/python.exe tools/gen_edit.py finalize <mid> <seed>   (use that seed's cut-out)

A job in tools/image-gen/jobs.json (written by hand after looking at the original; read coordinates from
`ai_edit.py grid <mid>`):
  { "<chain>/<id>": { "mode": "outpaint" | "repair", "name": "English item name", "prompt": optional,
    "pad": [l, t, r, b]  (outpaint: pixels added around the original),
    "boxes": [[x0, y0, x1, y1], ...] and/or "polygons": [[[x, y], ...], ...]  (repair: pixels to rebuild),
    "seeds": [1, 2, 3, 4], "chosen": null } }
Per-seed outcomes (usable, gen_fraction, reason) go to tools/image-gen/results.json; raw cut-outs to
tools/image-gen/raw/<chain>/<id>.s<seed>.webp.

Plan 011 (owner decision 2026-11-22: "use AI to remove any background and objects or hands unrelated to the
food or drink"): run every command with `--set 011` (jobs-011.json / results-011.json, raw cut-outs and
sheets under downloads/, which is git-ignored). In that set at most 55 % of the product's pixels may be
generated and the product must be at least 200 px wide. A job may also have
  "keep": [[[x, y], ...], ...]  polygons (original pixel coordinates, may extend into the pad) around ONLY the
      product; everything outside them is turned white before generation (neighbouring slices, plates, trays,
      boards, tables, hands, other dishes) and the cut-out is limited to them. Draw them a little generous (about
      2 px): the cut-out follows the real edge inside them. In outpaint mode only the part of the pad inside
      "keep" is generated; "boxes"/"polygons" mark pixels inside the product to rebuild (e.g. under a hand).
  "trim": optional width in px; within that distance of a keep polygon's edge, grey/white/pink background
      slivers (low saturation, not yellow) are removed from the cut-out.
  "erode": optional px; shave that much off the cut-out's edge (removes the old background's fringe).
  "negative": optional negative prompt (default NEGATIVE).
`preview <mid>...` draws the keep (green) and rebuild (red) areas on the original, 2x, with a 25 px grid.
Never invent brand names, logos or label text; never change what the food is.
"""
import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.ai-models')
os.environ['HF_HOME'] = os.path.join(CACHE, 'hf')
os.environ['U2NET_HOME'] = os.path.join(CACHE, 'u2net')
os.environ['TORCH_HOME'] = os.path.join(CACHE, 'torch')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import numpy as np
from PIL import Image, ImageDraw

import ai_edit  # reuse load/save/keep_regions/open_original (not modified)

GEN = os.path.join(ROOT, 'tools', 'image-gen')
JOBS = os.path.join(GEN, 'jobs.json')
RESULTS = os.path.join(GEN, 'results.json')
RAW = os.path.join(GEN, 'raw')
SHEETS = os.path.join(ROOT, 'downloads', 'gen-sheets')
COMPS = os.path.join(ROOT, 'downloads', 'gen-comp')
MODEL = 'diffusers/stable-diffusion-xl-1.0-inpainting-0.1'
SUFFIX = ', professional food photography, isolated on a plain white background, studio lighting, sharp'
NEGATIVE = 'text, logo, watermark, hands, fingers, plate, table, tray, extra objects, blurry, deformed'
MAX_GEN_FRACTION = 0.40
MIN_WIDTH = 0  # plan 011 sets 200 (see use_set)
WORK = 1024
OVERLAP = 12


def use_set(name):
    """Plan 011: separate job/result files, git-ignored raw output, 55 % cap, 200 px minimum width."""
    global JOBS, RESULTS, RAW, SHEETS, COMPS, MAX_GEN_FRACTION, MIN_WIDTH
    if name != '011':
        sys.exit('unknown set: ' + name)
    JOBS = os.path.join(GEN, 'jobs-011.json')
    RESULTS = os.environ.get('GEN_RESULTS') or os.path.join(GEN, 'results-011.json')  # GEN_RESULTS: parallel runs write separate files
    RAW = os.path.join(ROOT, 'downloads', 'gen-raw-011')
    COMPS = os.path.join(ROOT, 'downloads', 'gen-comp-011')
    SHEETS = os.path.join(ROOT, 'downloads', 'gen-sheets-011')
    MAX_GEN_FRACTION = 0.55
    MIN_WIDTH = 200


def read_json(p, default):
    if not os.path.exists(p):
        return default
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def write_json(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(json.dumps(d, indent=1, ensure_ascii=False) + '\n')


def item_names():
    js = ("import { ITEMS } from './js/data/index.js';"
          "console.log(JSON.stringify(Object.fromEntries([...ITEMS].map(([k, it]) => [k, [it.pt, it.en]]))));")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, encoding='utf8', check=True)
    return json.loads(out.stdout)


def failure_type(chain, e):
    r = e.get('ai_reason') or ''
    if re.search(r'FRAME|SIDES|OVER85|frame|sides|cropped|covers over', r):
        return 'crop'
    if chain == 'tacobell' and re.search(r'hand|hole', r, re.I):
        return 'hand'
    if chain == 'burgerking':
        return 'badge-over-product'
    return 'other'


def targets(m):
    out = {}
    for k, e in m.items():
        if e.get('status') != 'fallback' or not e.get('items'):
            continue
        if e.get('ai') not in (None, 'rejected', 'skipped') or e.get('cutout') == 'approved' or e.get('edited'):
            continue
        out[k] = e
    return out


def cmd_select(m):
    t = targets(m)
    names = item_names()
    tab = collections.Counter()
    items = collections.Counter()
    for k, e in sorted(t.items()):
        chain = k.split('/')[0]
        ft = failure_type(chain, e)
        tab[(chain, ft)] += 1
        items[chain] += len(e['items'])
        nm = ' | '.join('%s / %s' % tuple(names.get(i, [i, ''])) for i in e['items'])
        print('%-28s %-18s %s  [%s]' % (k, ft, nm, (e.get('ai_reason') or '')[:70]))
    print()
    print('target entries:', len(t), 'items:', sum(items.values()))
    for chain in sorted({c for c, _ in tab}):
        print(' %-11s %s  items=%d' % (chain, ' '.join('%s=%d' % (ft, n) for (c, ft), n in sorted(tab.items()) if c == chain), items[chain]))


# ---------------------------------------------------------------- generation

def rgb_on_white(img):
    bg = Image.new('RGB', img.size, (255, 255, 255))
    bg.paste(img, mask=img.getchannel('A'))
    return bg


def keep_bool(job, size, pad=(0, 0)):
    """Bool array (canvas size) of the "keep" polygons (original coordinates + pad offset)."""
    k = Image.new('L', size, 0)
    d = ImageDraw.Draw(k)
    for poly in job['keep']:
        d.polygon([(x + pad[0], y + pad[1]) for x, y in poly], fill=255)
    return np.array(k) > 0


def build_canvas_keep(mid, job):
    """Plan 011: only the product (inside the keep polygons) stays; everything else is white."""
    from scipy import ndimage
    img = rgb_on_white(ai_edit.open_original(mid))
    w, h = img.size
    l, t, r, b = job.get('pad', [0, 0, 0, 0])
    W, H = w + l + r, h + t + b
    kb = keep_bool(job, (W, H), (l, t))
    arr = np.full((H, W, 3), 255, np.uint8)
    arr[t:t + h, l:l + w] = np.array(img)
    arr[~kb] = 255
    near = ndimage.binary_dilation(kb, iterations=6)
    mask = np.zeros((H, W), bool)
    if job['mode'] == 'outpaint':
        newarea = np.ones((H, W), bool)
        newarea[t:t + h, l:l + w] = False
        mask |= newarea & near
        inner = np.zeros((H, W), bool)
        inner[t:t + h, l:l + w] = True
        band = inner & (ndimage.distance_transform_edt(inner) <= OVERLAP)
        side = np.zeros((H, W), bool)
        if l:
            side[:, :l + OVERLAP] = True
        if t:
            side[:t + OVERLAP, :] = True
        if r:
            side[:, l + w - OVERLAP:] = True
        if b:
            side[t + h - OVERLAP:, :] = True
        mask |= band & side & near
    if job.get('boxes') or job.get('polygons'):
        m2 = Image.new('L', (W, H), 0)
        d2 = ImageDraw.Draw(m2)
        for x0, y0, x1, y1 in job.get('boxes', []):
            d2.rectangle([x0 + l, y0 + t, x1 + l, y1 + t], fill=255)
        for poly in job.get('polygons', []):
            d2.polygon([(x + l, y + t) for x, y in poly], fill=255)
        mask |= ndimage.binary_dilation(np.array(m2) > 0, iterations=4) & near
    return Image.fromarray(arr), mask, (l, t, l + w, t + h)


def build_canvas(mid, job):
    """Return (canvas RGB, hard mask bool array, original rect (x0, y0, x1, y1) inside the canvas)."""
    if job.get('keep'):
        return build_canvas_keep(mid, job)
    img = rgb_on_white(ai_edit.open_original(mid))
    w, h = img.size
    if job['mode'] == 'outpaint':
        l, t, r, b = job['pad']
        arr = np.pad(np.array(img), ((t, b), (l, r), (0, 0)), mode='edge')
        canvas = Image.fromarray(arr)
        mask = np.ones((h + t + b, w + l + r), bool)
        mask[t:t + h, l:l + w] = False
        from scipy import ndimage
        inner = np.zeros_like(mask)
        inner[t:t + h, l:l + w] = True
        band = inner & (ndimage.distance_transform_edt(inner) <= OVERLAP)
        # the overlap band only matters on the sides that were extended
        side = np.zeros_like(mask)
        if l:
            side[:, :l + OVERLAP] = True
        if t:
            side[:t + OVERLAP, :] = True
        if r:
            side[:, l + w - OVERLAP:] = True
        if b:
            side[t + h - OVERLAP:, :] = True
        mask |= band & side
        if job.get('boxes') or job.get('polygons'):  # outpaint + repair (e.g. a badge on the background)
            m2 = Image.new('L', mask.shape[::-1], 0)
            d2 = ImageDraw.Draw(m2)
            for x0, y0, x1, y1 in job.get('boxes', []):
                d2.rectangle([x0 + l, y0 + t, x1 + l, y1 + t], fill=255)
            for poly in job.get('polygons', []):
                d2.polygon([(x + l, y + t) for x, y in poly], fill=255)
            mask |= ndimage.binary_dilation(np.array(m2) > 0, iterations=4)
        return canvas, mask, (l, t, l + w, t + h)
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    for x0, y0, x1, y1 in job.get('boxes', []):
        d.rectangle([x0, y0, x1, y1], fill=255)
    for poly in job.get('polygons', []):
        d.polygon([tuple(p) for p in poly], fill=255)
    from scipy import ndimage
    mask = ndimage.binary_dilation(np.array(m) > 0, iterations=4)
    return img, mask, (0, 0, w, h)


def feather_weight(mask):
    """1 inside the mask, fading to 0 over OVERLAP px toward its edge; exactly 0 outside the mask."""
    from scipy import ndimage
    d = ndimage.distance_transform_edt(np.pad(mask, 1, constant_values=True))[1:-1, 1:-1]
    # canvas borders are not a mask edge: measure distance only to unmasked pixels
    return np.clip(d / OVERLAP, 0, 1) * mask


def load_pipe():
    import torch
    from diffusers import StableDiffusionXLInpaintPipeline
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(MODEL, torch_dtype=torch.float16, variant='fp16')
    pipe.to('cuda')
    pipe.set_progress_bar_config(disable=True)
    return pipe


def generate(pipe, canvas, mask, prompt, seed, negative=None):
    import torch
    w, h = canvas.size
    s = WORK / max(w, h)
    nw, nh = max(8, round(w * s / 8) * 8), max(8, round(h * s / 8) * 8)
    img = canvas.resize((nw, nh), Image.LANCZOS)
    mk = Image.fromarray((mask * 255).astype(np.uint8)).resize((nw, nh), Image.NEAREST)
    g = torch.Generator('cuda').manual_seed(int(seed))
    out = pipe(prompt=prompt, negative_prompt=negative or NEGATIVE, image=img, mask_image=mk, height=nh, width=nw,
               num_inference_steps=30, guidance_scale=7.0, strength=0.99, generator=g).images[0]
    return out.resize((w, h), Image.LANCZOS)


def paste_back(canvas, gen, mask):
    wt = feather_weight(mask)[..., None]
    a = np.array(canvas).astype(np.float32)
    b = np.array(gen).astype(np.float32)
    out = a * (1 - wt) + b * wt
    out = np.where(mask[..., None], out, a)  # outside the mask: the original, bit for bit
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def border_ok(alpha):
    border = np.concatenate([alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
    return (border < 16).mean() > 0.95


def run_job(pipe, session, mid, job, results):
    canvas, mask, rect = build_canvas(mid, job)
    prompt = job.get('prompt') or (job['name'] + SUFFIX)
    os.makedirs(os.path.join(RAW, mid.split('/')[0]), exist_ok=True)
    os.makedirs(os.path.join(COMPS, mid.split('/')[0]), exist_ok=True)
    res = results.setdefault(mid, {})
    for seed in (job.get('seeds', [1, 2, 3, 4]) if mask.any() else [1]):
        gen = generate(pipe, canvas, mask, prompt, seed, job.get('negative')) if mask.any() else canvas  # nothing to rebuild: pure cut-out
        comp = paste_back(canvas, gen, mask)
        comp.save(os.path.join(COMPS, '%s.s%d.png' % (mid, seed)))
        out = ai_edit.cut(comp.convert('RGBA'), session)
        if job.get('keep'):  # the cut-out may not leave the product polygons (plus the 3 px edge)
            from scipy import ndimage
            lim = ndimage.binary_dilation(keep_bool(job, canvas.size, rect[:2]), iterations=3)
            out.putalpha(Image.fromarray(np.where(lim, np.array(out.getchannel('A')), 0).astype(np.uint8)))
            if job.get('trim'):  # drop grey/white/pink background slivers within `trim` px of the polygon edge
                kbool = keep_bool(job, canvas.size, rect[:2])
                band = ndimage.distance_transform_edt(kbool) <= job['trim']
                px = np.array(comp).astype(int)
                mx, mn = px.max(2), px.min(2)
                gap = ((mx - mn) < 0.22 * mx) & (mx > 130) & (px[..., 2] >= px[..., 1] - 6)
                al = np.array(out.getchannel('A'))
                al = np.where(band & gap, 0, al)
                al = np.where(ndimage.binary_opening(al > 16, iterations=2), al, 0)
                out.putalpha(Image.fromarray(al.astype(np.uint8)))
            if job.get('erode'):  # shave the anti-aliased edge that still holds the old background colour
                al = np.array(out.getchannel('A')).astype(np.float32)
                core = ndimage.binary_erosion(al > 16, iterations=int(job['erode']))
                al = ndimage.gaussian_filter(np.where(core, al, 0), 0.6)
                out.putalpha(Image.fromarray(np.clip(al + 0.5, 0, 255).astype(np.uint8)))
            out.putalpha(Image.fromarray(ai_edit.keep_regions(np.array(out.getchannel('A')))))
        a = np.array(out.getchannel('A'))
        solid = a > 128
        tot = int(solid.sum())
        r = {'usable': False, 'gen_fraction': None, 'reason': ''}
        if tot < 0.03 * a.size:
            r['reason'] = 'cut-out covers under 3 % of the image'
        elif not border_ok(a):
            r['reason'] = 'product touches the frame (border not 95 % transparent)'
        else:
            r['gen_fraction'] = round(float((solid & mask).sum()) / tot, 3)
            ys, xs = np.where(solid)
            r['size'] = [int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
            if r['gen_fraction'] > MAX_GEN_FRACTION:
                r['reason'] = 'gen_fraction %.2f > %.2f' % (r['gen_fraction'], MAX_GEN_FRACTION)
            elif r['size'][0] < MIN_WIDTH:
                r['reason'] = 'product only %d px wide (minimum %d)' % (r['size'][0], MIN_WIDTH)
            else:
                r['usable'] = True
        if r['usable'] or r['gen_fraction'] is not None:
            out.save(os.path.join(RAW, '%s.s%d.webp' % (mid, seed)), 'WEBP', lossless=True, quality=100, method=6)
        res[str(seed)] = r
        print('%-26s seed %-3s usable=%-5s gen=%s %s' % (mid, seed, r['usable'], r['gen_fraction'], r['reason']), flush=True)
        write_json(RESULTS, results)


def cmd_run(args):
    jobs = read_json(JOBS, {})
    ids = sorted(jobs) if args.all else args.ids
    ids = [i for i in ids if i in jobs and not jobs[i].get('skip')]
    results = read_json(RESULTS, {})
    from rembg import new_session
    session = new_session('birefnet-general')
    pipe = load_pipe()
    for mid in ids:
        run_job(pipe, session, mid, jobs[mid], results)


# ---------------------------------------------------------------- sheets

def checker_free(img, bg):
    t = Image.new('RGB', img.size, bg)
    t.paste(img, mask=img.getchannel('A'))
    return t


def panel(im, size, label=None, fill=(128, 128, 128)):
    """A tile of size x (0.75 size): the image fitted inside it, with a label."""
    tw, th = size, int(size * 0.75)
    im = im.copy()
    im.thumbnail((tw, th), Image.LANCZOS)
    c = Image.new('RGB', (tw, th), fill)
    c.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
    if label:
        ImageDraw.Draw(c).text((3, 2), label, fill=(255, 0, 255))
    return c


def cmd_sheet(m, ids, size=480, per=2):
    """Per entry two rows of three tiles: ORIGINAL (mask outlined red) | seed 1 | seed 2 / seed 3 | seed 4 | best on light.
    Every tile is cropped to the same box (the products of all seeds), so they can be compared."""
    jobs = read_json(JOBS, {})
    results = read_json(RESULTS, {})
    names = item_names()
    ids = ids or sorted(k for k in jobs if k in results)
    os.makedirs(SHEETS, exist_ok=True)
    for f in os.listdir(SHEETS):
        if f.startswith('sheet-') and f.endswith('.png'):
            os.remove(os.path.join(SHEETS, f))
    tw, th = size, int(size * 0.75)
    H = 2 * th + 18
    for n in range(0, len(ids), per):
        chunk = ids[n:n + per]
        sheet = Image.new('RGB', (3 * tw, H * len(chunk)), (60, 60, 60))
        d = ImageDraw.Draw(sheet)
        for r, mid in enumerate(chunk):
            job = jobs[mid]
            y0 = r * H
            res = results.get(mid, {})
            orig = rgb_on_white(ai_edit.open_original(mid))
            canvas, mask, rect = build_canvas(mid, job)
            show = Image.new('RGB', canvas.size, (128, 128, 128))
            show.paste(orig, rect[:2])
            dr = ImageDraw.Draw(show)
            ox, oy = rect[:2]
            for poly in job.get('keep', []):
                dr.polygon([(x + ox, y + oy) for x, y in poly], outline=(0, 255, 0))
            for x0, y0b, x1, y1 in job.get('boxes', []):
                dr.rectangle([x0 + ox, y0b + oy, x1 + ox, y1 + oy], outline=(255, 0, 0), width=2)
            for poly in job.get('polygons', []):
                dr.polygon([(x + ox, y + oy) for x, y in poly], outline=(255, 0, 0))
            seeds = job.get('seeds', [1, 2, 3, 4])
            ims = {}
            box = None
            for seed in seeds:
                p = os.path.join(RAW, '%s.s%d.webp' % (mid, seed))
                if os.path.exists(p):
                    ims[seed] = Image.open(p).convert('RGBA')
                    bb = ims[seed].getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
                    if bb:
                        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
            if box is None:
                box = (0, 0) + canvas.size
            mg = int(0.06 * max(box[2] - box[0], box[3] - box[1]))
            box = (max(0, box[0] - mg), max(0, box[1] - mg), min(canvas.size[0], box[2] + mg), min(canvas.size[1], box[3] + mg))
            tiles = [panel(show.crop(box), size, 'ORIGINAL (%s, red = rebuilt, green = kept)' % job['mode'])]
            best = None
            for seed in seeds:
                rr = res.get(str(seed), {})
                lab = 'seed %s: %s' % (seed, ('gen %.2f' % rr['gen_fraction']) if rr.get('usable') else 'UNUSABLE ' + (rr.get('reason') or ''))
                if seed in ims:
                    tiles.append(panel(checker_free(ims[seed].crop(box), (0x1c, 0x16, 0x13)), size, lab))
                    if rr.get('usable') and (best is None or rr['gen_fraction'] < best[1]):
                        best = (ims[seed], rr['gen_fraction'])
                else:
                    tiles.append(panel(Image.new('RGB', (8, 8), (40, 40, 40)), size, lab, fill=(40, 40, 40)))
            if job.get('chosen') and job['chosen'] in ims:
                best = (ims[job['chosen']], 0)
            tiles.append(panel(checker_free(best[0].crop(box), (0xf3, 0xed, 0xe2)), size, 'lowest gen_fraction, on light') if best
                         else panel(Image.new('RGB', (8, 8), (40, 40, 40)), size, 'none usable', fill=(40, 40, 40)))
            order = [0, 1, 2, 3, 4, 5]
            for j, t in enumerate(tiles):
                sheet.paste(t, ((j % 3) * tw, y0 + 18 + (j // 3) * th))
            nm = ' | '.join(names.get(i, [i, ''])[0] for i in m[mid]['items'])
            d.text((3, y0 + 3), ('%s | %s | %s' % (mid, job.get('name', ''), nm))[:200], fill=(255, 255, 255))
        p = os.path.join(SHEETS, 'sheet-%02d.png' % (n // per + 1))
        sheet.save(p)
        print(p, len(chunk))


def cmd_preview(ids):
    """Original at 2x with the job's keep (green) and rebuild (red) areas and a 25 px grid (padding shown)."""
    jobs = read_json(JOBS, {})
    out = os.path.join(ROOT, 'downloads', 'gen-preview-011')
    os.makedirs(out, exist_ok=True)
    for mid in ids:
        job = jobs.get(mid, {})
        img = rgb_on_white(ai_edit.open_original(mid))
        l, t, r, b = job.get('pad', [0, 0, 0, 0])
        w, h = img.size
        z = 2
        im = Image.new('RGB', ((w + l + r) * z, (h + t + b) * z), (190, 190, 190))
        im.paste(img.resize((w * z, h * z), Image.LANCZOS), (l * z, t * z))
        d = ImageDraw.Draw(im)
        for x in range(-l - l % 25, w + r + 1, 25):
            if x >= -l:
                d.line([((x + l) * z, 0), ((x + l) * z, im.height)], fill=(255, 0, 255) if x % 100 == 0 else (0, 190, 255), width=1)
                if x % 50 == 0:
                    d.text(((x + l) * z + 2, 2), str(x), fill=(255, 0, 255))
        for y in range(-t - t % 25, h + b + 1, 25):
            if y >= -t:
                d.line([(0, (y + t) * z), (im.width, (y + t) * z)], fill=(255, 0, 255) if y % 100 == 0 else (0, 190, 255), width=1)
                if y % 50 == 0:
                    d.text((2, (y + t) * z + 2), str(y), fill=(255, 0, 255))
        for poly in job.get('keep', []):
            d.polygon([((x + l) * z, (y + t) * z) for x, y in poly], outline=(0, 255, 0))
        for poly in job.get('polygons', []):
            d.polygon([((x + l) * z, (y + t) * z) for x, y in poly], outline=(255, 0, 0))
        for x0, y0, x1, y1 in job.get('boxes', []):
            d.rectangle([(x0 + l) * z, (y0 + t) * z, (x1 + l) * z, (y1 + t) * z], outline=(255, 0, 0))
        p = os.path.join(out, mid.replace('/', '-') + '.png')
        im.save(p)
        print(p, im.size)


def cmd_finalize(mid, seed):
    jobs = read_json(JOBS, {})
    src = os.path.join(RAW, '%s.s%s.webp' % (mid, seed))
    if mid not in jobs or not os.path.exists(src):
        sys.exit('no such job/seed result: %s seed %s' % (mid, seed))
    dest = os.path.join(GEN, mid + '.webp')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(src, dest)
    jobs[mid]['chosen'] = int(seed)
    write_json(JOBS, jobs)
    print('finalized', mid, seed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', nargs='?')  # select | run | finalize (with --sheet it is the first id)
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--set', dest='set_name', help='"011": plan 011 files and limits (see header)')
    ap.add_argument('--out', help='sheet folder (default downloads/gen-sheets)')
    ap.add_argument('--size', type=int, default=480)
    ap.add_argument('--per', type=int, default=2)
    args = ap.parse_args()
    m = ai_edit.load()
    if args.set_name:
        use_set(args.set_name)
    if args.out:
        global SHEETS
        SHEETS = os.path.abspath(args.out)
    if args.sheet:
        cmd_sheet(m, ([args.cmd] if args.cmd else []) + args.ids, args.size, args.per)
    elif args.cmd == 'select':
        cmd_select(m)
    elif args.cmd == 'run':
        cmd_run(args)
    elif args.cmd == 'preview':
        cmd_preview(args.ids)
    elif args.cmd == 'finalize':
        cmd_finalize(args.ids[0], args.ids[1])
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()

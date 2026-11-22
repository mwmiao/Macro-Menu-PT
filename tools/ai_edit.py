"""Local AI clean-up of the remaining unsuitable official photos (plan 007).

Policy (owner decision 2026-11-22): a local AI model may (a) cut the product out of the chain's own
photo (segmentation) and (b) erase headlines/badges/logos that lie on EMPTY background next to the
product (inpainting). Only a result that passed review against the original, on dark, light and
checkerboard backgrounds, is used. Generating, rebuilding or changing the food itself is not allowed.
The original always stays in tools/image-originals/. Approved entries get "edited": "ai"
(plus "ai_inpaint": true when text was erased); results live in tools/image-ai/<chain>/<id>.webp.

Models: rembg (default model birefnet-general, ONNX) for the cut-out, LaMa (simple-lama-inpainting)
for text removal. Run with the virtual environment's Python (git-ignored, models cached in
tools/.ai-models):

  python -m venv tools/.venv-ai
  tools/.venv-ai/Scripts/python.exe -m pip install "rembg[cpu]" pillow numpy simple-lama-inpainting
  tools/.venv-ai/Scripts/python.exe tools/ai_edit.py select
  tools/.venv-ai/Scripts/python.exe tools/ai_edit.py cutout [--group A|B|other|all]  (default A) [--model NAME] [--ids a,b]
  tools/.venv-ai/Scripts/python.exe tools/ai_edit.py grid <chain/id>      (pixel grid to read box coordinates)
  tools/.venv-ai/Scripts/python.exe tools/ai_edit.py inpaint [--ids a,b]  (boxes from tools/image-ai/masks.json)
  tools/.venv-ai/Scripts/python.exe tools/ai_edit.py --sheet             (review sheets in downloads/ai-sheets)

Manifest fields written here: ai ("pending" | "approved" | "rejected" | "skipped"), ai_reason,
ai_inpaint. Review (setting approved/rejected) is done by hand after looking at the sheets.
"""
import argparse
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('U2NET_HOME', os.path.join(ROOT, 'tools', '.ai-models'))
os.environ.setdefault('TORCH_HOME', os.path.join(ROOT, 'tools', '.ai-models', 'torch'))

import numpy as np
from PIL import Image, ImageDraw

MANIFEST = os.path.join(ROOT, 'tools', 'image-manifest.json')
ORIGINALS = os.path.join(ROOT, 'tools', 'image-originals')
AI = os.path.join(ROOT, 'tools', 'image-ai')
MASKS = os.path.join(AI, 'masks.json')
DL = os.path.join(ROOT, 'downloads')
A_RE = re.compile(r'white|table|background|cropped|lifestyle|scene|hand', re.I)
B_RE = re.compile(r'headline|badge|slogan|logo|graphic|NOVO|APC', re.I)


def load():
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def save(m):
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write(json.dumps(m, indent=1) + '\n')


def group_of(e):
    issue = e.get('issue') or ''
    if B_RE.search(issue):
        return 'B'
    if A_RE.search(issue):
        return 'A'
    return 'other'


def candidates(m):
    return {k: e for k, e in m.items() if e.get('status') == 'fallback' and e.get('items')}


def names(e):
    return ', '.join(i.split(':', 1)[-1] for i in e['items'])


def open_original(mid):
    return Image.open(os.path.join(ORIGINALS, mid + '.webp')).convert('RGBA')


def keep_regions(alpha, thr=16):
    """Keep the largest opaque region plus regions >= 5 % of its area (scipy lives in the venv)."""
    from scipy import ndimage
    lab, n = ndimage.label(alpha > thr)
    if n == 0:
        return alpha
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    big = sizes.max()
    keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.05 * big]
    return np.where(np.isin(lab, keep), alpha, 0).astype(np.uint8)


def check_result(alpha):
    """Return a reason to skip the result, or None."""
    h, w = alpha.shape
    solid = alpha > 128
    cover = solid.mean()
    if cover < 0.03:
        return 'result covers under 3 % of the image'
    if cover > 0.85:
        return 'result covers over 85 % of the image (nothing was cut away)'
    sides = sum(bool((s > 0).mean() > 0.005) for s in (solid[0], solid[-1], solid[:, 0], solid[:, -1]))
    if sides >= 2:
        return 'product touches the frame on %d sides (cropped by the photo)' % sides
    border = np.concatenate([alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
    if (border < 16).mean() <= 0.95:
        return 'product touches the frame (border not 95 % transparent)'
    return None


def cut(img, session):
    from rembg import remove
    out = remove(img, session=session, alpha_matting=False, post_process_mask=True).convert('RGBA')
    a = keep_regions(np.array(out.getchannel('A')))
    out.putalpha(Image.fromarray(a))
    return out


def run_cutout(m, ids, model, from_image=None):
    from rembg import new_session
    session = new_session(model)
    for mid in ids:
        e = m[mid]
        img = from_image(mid) if from_image else open_original(mid)
        out = cut(img, session)
        reason = check_result(np.array(out.getchannel('A')))
        if reason:
            e['ai'] = 'skipped'
            e['ai_reason'] = reason
            print('skip   ', mid, reason)
        else:
            dest = os.path.join(AI, mid + '.webp')
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            out.save(dest, 'WEBP', lossless=True, quality=100, method=6)
            e['ai'] = 'pending'
            e.pop('ai_reason', None)
            print('result ', mid)
        save(m)


def pick_ids(m, args, groups):
    cands = candidates(m)
    ids = [k for k, e in cands.items() if group_of(e) in groups]
    if args.ids:
        want = set(args.ids.split(','))
        ids = [k for k in cands if k in want]
    else:
        ids = [k for k in ids if m[k].get('ai') is None]
    return sorted(ids)


def cmd_select(m):
    c = candidates(m)
    tab = collections.Counter((k.split('/')[0], group_of(e)) for k, e in c.items())
    print('candidates:', len(c))
    for chain in sorted({k[0] for k in tab}):
        print(' %-11s A=%-3d B=%-3d other=%d' % (chain, tab[(chain, 'A')], tab[(chain, 'B')], tab[(chain, 'other')]))
    g = collections.Counter(group_of(e) for e in c.values())
    print('total A=%d B=%d other=%d' % (g['A'], g['B'], g['other']))


def cmd_grid(mid):
    img = open_original(mid).convert('RGB')
    d = ImageDraw.Draw(img)
    w, h = img.size
    for x in range(0, w, 50):
        d.line([(x, 0), (x, h)], fill=(255, 0, 255) if x % 100 == 0 else (0, 200, 255), width=1)
        if x % 100 == 0:
            d.text((x + 2, 2), str(x), fill=(255, 0, 255))
    for y in range(0, h, 50):
        d.line([(0, y), (w, y)], fill=(255, 0, 255) if y % 100 == 0 else (0, 200, 255), width=1)
        if y % 100 == 0:
            d.text((2, y + 2), str(y), fill=(255, 0, 255))
    os.makedirs(os.path.join(DL, 'ai-grid'), exist_ok=True)
    p = os.path.join(DL, 'ai-grid', mid.replace('/', '-') + '.png')
    img.save(p)
    print(p, img.size)


def already_transparent(img):
    a = np.array(img.getchannel('A'))
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return (border < 16).mean() > 0.95


def save_result(m, mid, out):
    """Common end of every method: drop stray specks, sanity-check the shape, write it, mark pending."""
    e = m[mid]
    out = out.copy()
    out.putalpha(Image.fromarray(keep_regions(np.array(out.getchannel('A')))))
    reason = check_result(np.array(out.getchannel('A')))
    if reason:
        e['ai'] = 'skipped'
        e['ai_reason'] = reason
        print('skip   ', mid, reason)
    else:
        dest = os.path.join(AI, mid + '.webp')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        out.save(dest, 'WEBP', lossless=True, quality=100, method=6)
        e['ai'] = 'pending'
        e.pop('ai_reason', None)
        print('result ', mid)
    e['ai_inpaint'] = True
    save(m)


def cmd_inpaint(m, args):
    with open(MASKS, encoding='utf-8') as f:
        boxes = json.load(f)
    ids = sorted(k for k in boxes if k in m and (not args.ids or k in args.ids.split(',')))
    ids = [k for k in ids if args.ids or m[k].get('ai') in (None, 'pending')]
    lama = None
    scratch = os.path.join(DL, 'ai-inpaint')
    os.makedirs(scratch, exist_ok=True)
    cleaned = {}
    for mid in ids:
        img = open_original(mid)
        if already_transparent(img):
            # The photo already has a real transparent background: re-segmenting it with a model only
            # roughens its edge, so the text/badge pixels are erased (alpha 0) and nothing else is touched.
            out = img.copy()
            a = np.array(out.getchannel('A'))
            for x0, y0, x1, y1 in boxes[mid]:
                a[max(0, y0 - 6):y1 + 7, max(0, x0 - 6):x1 + 7] = 0
            out.putalpha(Image.fromarray(a))
            save_result(m, mid, out)
            continue
        if lama is None:
            from simple_lama_inpainting import SimpleLama
            import torch
            _load = torch.jit.load  # the library loads a CUDA-saved model without map_location (fails on CPU torch)
            torch.jit.load = lambda p, *a, **k: _load(p, map_location='cpu')
            lama = SimpleLama(device=torch.device('cpu'))
        rgb = img.convert('RGB')
        mask = Image.new('L', rgb.size, 0)
        d = ImageDraw.Draw(mask)
        for x0, y0, x1, y1 in boxes[mid]:
            d.rectangle([x0 - 6, y0 - 6, x1 + 6, y1 + 6], fill=255)
        res = lama(rgb, mask).convert('RGB')
        res = res.crop((0, 0) + rgb.size)  # LaMa may pad to a multiple of 8
        res = Image.composite(res, rgb, mask)  # original pixels everywhere outside the mask
        res.save(os.path.join(scratch, mid.replace('/', '-') + '.png'))
        cleaned[mid] = res.convert('RGBA')
    todo = [k for k in ids if k in cleaned]
    for mid in todo:
        m[mid]['ai_inpaint'] = True
    if todo:
        run_cutout(m, todo, args.model, from_image=lambda mid: cleaned[mid])


def font_tile(img, bg):
    t = Image.new('RGB', img.size, bg)
    t.paste(img, mask=img.getchannel('A'))
    return t


def checker(img):
    w, h = img.size
    t = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(t)
    for y in range(0, h, 10):
        for x in range(0, w, 10):
            c = (255, 255, 255) if (x // 10 + y // 10) % 2 == 0 else (200, 200, 200)
            d.rectangle([x, y, x + 9, y + 9], fill=c)
    t.paste(img, mask=img.getchannel('A'))
    return t


def panel(im, size=200):
    im = im.copy()
    im.thumbnail((size, size))
    c = Image.new('RGB', (size, size), (128, 128, 128))
    c.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return c


def cmd_sheet(m):
    pend = sorted(k for k, e in m.items() if e.get('ai') == 'pending')
    out = os.path.join(DL, 'ai-sheets')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    per, cols = 12, 2
    for n in range(0, len(pend), per):
        chunk = pend[n:n + per]
        rows = (len(chunk) + cols - 1) // cols
        TW, TH = 800 + 8, 200 + 22
        sheet = Image.new('RGB', (cols * TW, rows * TH), (60, 60, 60))
        d = ImageDraw.Draw(sheet)
        for i, mid in enumerate(chunk):
            x0, y0 = (i % cols) * TW, (i // cols) * TH
            e = m[mid]
            orig = open_original(mid)
            res = Image.open(os.path.join(AI, mid + '.webp')).convert('RGBA')
            ps = [panel(orig.convert('RGB')), panel(checker(res)), panel(font_tile(res, (0x1c, 0x16, 0x13))),
                  panel(font_tile(res, (0xf3, 0xed, 0xe2)))]
            for j, p in enumerate(ps):
                sheet.paste(p, (x0 + j * 200, y0 + 22))
            d.text((x0 + 2, y0 + 2), ('%s%s | %s' % (mid, ' [inpaint]' if e.get('ai_inpaint') else '', names(e)))[:130],
                   fill=(255, 255, 255))
        p = os.path.join(out, 'sheet-%02d.png' % (n // per + 1))
        sheet.save(p)
        print(p, len(chunk))
    print('pending:', len(pend))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', nargs='?', choices=['select', 'cutout', 'grid', 'inpaint'])
    ap.add_argument('arg', nargs='?')
    ap.add_argument('--group', default='A', choices=['A', 'B', 'other', 'all'])
    ap.add_argument('--model', default='birefnet-general')
    ap.add_argument('--ids')
    ap.add_argument('--sheet', action='store_true')
    args = ap.parse_args()
    m = load()
    if args.sheet:
        cmd_sheet(m)
    elif args.cmd == 'select':
        cmd_select(m)
    elif args.cmd == 'cutout':
        ids = pick_ids(m, args, {'A', 'B', 'other'} if args.group == 'all' else {args.group})
        print(len(ids), 'entries')
        run_cutout(m, ids, args.model)
    elif args.cmd == 'grid':
        cmd_grid(args.arg)
    elif args.cmd == 'inpaint':
        cmd_inpaint(m, args)
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()

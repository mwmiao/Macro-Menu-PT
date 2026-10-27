"""Contact sheet for checking product photos by eye (a valid file with alpha can still be wrong).

  python tools/image-sheet.py <chain> [out-dir]     (default out-dir: downloads/image-sheets)

One tile per manifest entry of the chain, on a checkerboard so real transparency is visible:
approved and fallback entries show the served photo; fallback, pending and rejected ones also get a
coloured label. Under each tile: its number, manifest id and the first item using it.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T, C, LABEL = 180, 7, 30
COLOURS = {'approved': (40, 140, 60), 'fallback': (150, 60, 170), 'pending': (200, 140, 0), 'rejected': (200, 30, 30)}


def checker(w, h, s=12):
    img = Image.new('RGB', (w, h), (235, 235, 235))
    d = ImageDraw.Draw(img)
    for y in range(0, h, s):
        for x in range((y // s) % 2 * s, w, 2 * s):
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=(200, 200, 200))
    return img


def main():
    chain = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'downloads', 'image-sheets')
    with open(os.path.join(ROOT, 'tools', 'image-manifest.json'), encoding='utf8') as f:
        entries = [(k, e) for k, e in json.load(f).items() if k.startswith(chain + '/') and e['items']]
    rows = (len(entries) + C - 1) // C
    sheet = Image.new('RGB', (C * T, rows * (T + LABEL)), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, (mid, e) in enumerate(entries):
        x, y = (i % C) * T, (i // C) * (T + LABEL)
        shown = e['status'] in ('approved', 'fallback') and e.get('output')
        img = Image.open(os.path.join(ROOT, e['output']) if shown else os.path.join(ROOT, 'tools', 'image-originals', mid + '.webp')).convert('RGBA')
        img.thumbnail((T - 8, T - 8))
        tile = checker(T - 2, T - 2)
        tile.paste(img, ((T - 2 - img.width) // 2, (T - 2 - img.height) // 2), img)
        sheet.paste(tile, (x + 1, y + 1))
        colour = COLOURS[e['status']]
        if e['status'] != 'approved':
            d.rectangle([x + 1, y + 1, x + T - 2, y + 15], fill=colour)
            d.text((x + 4, y + 3), e['status'].upper(), fill=(255, 255, 255))
        d.text((x + 3, y + T + 2), f'{i}: {e["items"][0].split(":", 1)[1][:24]}', fill=colour)
        d.text((x + 3, y + T + 15), mid.split('/')[1] + (f' +{len(e["items"]) - 1}' if len(e['items']) > 1 else ''), fill=(110, 110, 110))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f'{chain}.png')
    sheet.save(path)
    print(path)


if __name__ == '__main__':
    main()

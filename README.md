# Macro Meals

Calories, protein and macros for fast-food menus in Portugal, in European Portuguese and English. A Portuguese take on [macromenu.com.au](https://macromenu.com.au/).

- Browse all restaurants together (the home page) or pick one from the dropdown; search, filter by category and sort by calories, protein, protein density, fat, carbs, sugar or salt
- Protein-density tiers (S–F, grams of protein per 100 kcal) on every item, with the chains' own product photos
- Order pad with a daily calorie and protein target, a receipt card, a "How to order" script (PT/EN) and shareable meal links
- Saved meals, meal presets and your own custom items
- Auto Meal Matcher, compare up to 4 items, favourites, a cross-chain protein ranking, kJ ↔ kcal and maintenance-calorie calculators
- McDonald's breakfast items are greyed out outside 08:00–11:00
- Skins (dark, light, Azulejo, Locker, Pastel de nata), installable as an app (works offline), optional Google Drive sync, and "Report a problem"
- Works on phones (bottom navigation, bottom sheets) and desktops (sidebar, plus an always-open order pad on wide screens)

Everything runs in the browser. There's no build step and no backend: data is kept in the browser and, if you sign in, in a private app folder in your own Google Drive.

Project details (architecture, data/sync model, routing, decisions) are in [claude.md](claude.md).

## Chains and sources

| Chain | Source | Table date |
| --- | --- | --- |
| McDonald's | [mcdonalds.pt nutrition table](https://www.mcdonalds.pt/produtos/informacao-nutricional-alergenios) | 15 Oct 2026 |
| Burger King | [burgerking.pt nutrition sheet](https://www.burgerking.pt/pt/nutricionais) | 28 Sep 2026 |
| KFC | [vivabem.pt (Ibersol)](https://vivabem.pt/marcas/kfc) | 12 Oct 2026 |
| Pizza Hut | [vivabem.pt (Ibersol)](https://vivabem.pt/marcas/pizza_hut) | 22 Oct 2026 |
| Taco Bell | [vivabem.pt (Ibersol)](https://vivabem.pt/marcas/taco_bell) | 2 Sep 2026 |
| Pans & Company | [vivabem.pt (Ibersol)](https://vivabem.pt/marcas/pans_company) | 22 Sep 2026 |

Rows whose macros didn't add up to their calories in the source table were left out.

## Adding or updating a chain

Each chain is one file in `js/data/`. Rows are:

```js
[namePT, nameEN /* or null when it's the same */, category, kcal, protein, carbs, sugars, fat, saturates, salt, portion?]
```

Categories are the `cat_*` keys in `js/i18n.js`. Register a new chain in `js/data/index.js`.

## Product photos

Photos must already be clean product shots from the chain's own sites: only the product, on a real transparent background, with no headlines, badges, slogans, people or decoration. They are never edited (no erasing, cut-outs or reconstruction). An unsuitable Portuguese photo is replaced by the same product from another country's official site (recorded as an `equivalent` match, which never changes the item's name, nutrition or portion); if there is none, the item keeps the drawn placeholder and is listed in `tools/image-review.md`.

Pipeline: `tools/image-sources/<chain>.json` maps each item's Portuguese name to an image URL (or `{url, region, match}`). `node tools/fetch-images.mjs [chain…]` downloads new originals (needs `ffmpeg`) into `tools/image-originals/<chain>/<sha1(url)[0:12]>.webp` and records them in `tools/image-manifest.json` (source, region, match, items, status `pending`/`approved`/`rejected`, issue). After checking a photo by eye (`python tools/image-sheet.py <chain>` draws a contact sheet on a checkerboard), set its status. `python tools/process-images.py` (needs `pillow numpy`) then trims the transparent margin of approved photos, saves them to `images/<chain>/` named by a hash of their content (so a changed photo always gets a new URL), regenerates `js/data/images.js` and writes the review list. Originals stay in `tools/`, which is not copied into the Docker image.

mcdonalds.pt refuses scripted downloads, so McDonald's photos are fetched in a browser on the site's product pages (www.mcdonalds.pt/#produtos), converted to WebP there and saved as `tools/image-originals/mcdonalds/<id>.webp`, where `<id>` is the first 12 hex characters of the SHA-1 of the image URL. The fetch script then indexes them without downloading.

## Run locally

```bash
python -m http.server 5173
```

Then open http://127.0.0.1:5173. Before committing:

```bash
npm test
```

```bash
npm run check
```

Google sync needs an OAuth Client ID in `js/config.js`; the steps are in claude.md.

## Docker

Every push to `main` builds a multi-arch image (amd64 + arm64) and pushes it to Docker Hub as `eazyeight/macro-menu-pt:latest` (plus a tag per commit). The workflow uses the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets.

```bash
docker compose up -d
```

The site is then on port 1390. The container serves static files with nginx on port 80 and has a `/healthz` endpoint.

---

Macro Meals is an independent project and isn't affiliated with any restaurant listed. Figures are a guide; recipes and portions vary, and allergens aren't covered.

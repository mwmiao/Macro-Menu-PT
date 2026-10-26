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

Photos are the chains' own product images, saved in `images/<chain>/` as 480px WebP. `tools/image-sources/<chain>.json` maps each item's Portuguese name to the image URL on the chain's site; `node tools/fetch-images.mjs [chain…]` downloads anything new (needs `ffmpeg`) and regenerates `js/data/images.js`. Every run also writes `tools/image-report.json` with failures and the items still without a photo; those show a drawn placeholder.

mcdonalds.pt refuses scripted downloads, so McDonald's photos are fetched in a browser on the site's product pages (www.mcdonalds.pt/#produtos), converted to WebP there and saved as `images/mcdonalds/<id>.webp`, where `<id>` is the first 12 hex characters of the SHA-1 of the image URL. The fetch script then indexes them without downloading.

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

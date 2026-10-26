# Macro Menu PT

Calories, protein and macros for fast-food menus in Portugal, in European Portuguese and English. A Portuguese take on [macromenu.com.au](https://macromenu.com.au/).

- Browse each chain's menu by category, search, and sort by calories, protein, protein density, fat, carbs, sugar or salt
- Protein-density tiers (S–F, grams of protein per 100 kcal) on every item
- Meal builder with a daily calorie and protein target
- Auto Meal Matcher: builds a meal from the current chain that hits a calorie target and a protein minimum
- Compare up to 4 items, including across chains
- Favourites, a cross-chain protein ranking, a kJ ↔ kcal converter and a maintenance-calorie calculator
- Works on phones (bottom navigation, bottom sheets) and desktops (sidebar layout)

Everything runs in the browser. There's no build step and no backend; favourites, the meal and targets are kept in the browser's local storage.

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

## Run locally

```bash
python -m http.server 5173
```

Then open http://127.0.0.1:5173.

## Docker

Every push to `main` builds a multi-arch image (amd64 + arm64) and pushes it to Docker Hub as `eazyeight/macro-menu-pt:latest` (plus a tag per commit). The workflow uses the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets.

```bash
docker compose up -d
```

The site is then on port 1390. The container serves static files with nginx on port 80 and has a `/healthz` endpoint.

---

Macro Menu PT is an independent project and isn't affiliated with any restaurant listed. Figures are a guide; recipes and portions vary, and allergens aren't covered.

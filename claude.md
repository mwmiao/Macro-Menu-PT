# Project Guidelines

Behavioral rules for Claude Code on my personal projects (e.g. cosplay planner, macro meal planner).

Tradeoff: bias toward caution over speed. For trivial changes, use judgment.

## 1. Think before coding

- Read the existing code, schema, routes, styling, and deployment setup before changing anything.
- State assumptions explicitly. If uncertain, ask instead of guessing.
- If a request has multiple reasonable interpretations, present the options and recommend one; do not choose silently.
- If a simpler approach exists, say so. Push back when a request would add unnecessary complexity.
- If something is unclear or conflicting, stop and name exactly what is confusing.

## 2. Simplicity first

Build the minimum useful version of what was asked.

- No speculative features, fields, settings, or “future-proofing”.
- No abstractions for code used once.
- No configuration options that were not requested.
- No error handling for scenarios that cannot realistically occur.
- Prefer straightforward code over clever code.
- If the implementation is much larger than the problem requires, simplify it before finishing.

For these apps specifically:
- Cosplay planner: prioritize clear project/task/material/budget workflows, mobile-first UI, and reliable data entry.
- Macro meal planner: prioritize simple food/item entry, accurate macro totals, and easy meal/day planning.
- Do not add social, sharing, AI, analytics, or multi-user features unless explicitly requested. (Macro Meals: meal links and optional Google Drive sync were explicitly requested — see the project section below. Still no analytics or tracking.)

## 3. Surgical changes

Touch only what the request requires.

- Do not refactor, rename, reformat, or “improve” unrelated code.
- Match the existing architecture, naming, styling, libraries, and file organization.
- Do not change the database schema, API shape, dependencies, or Docker setup unless required.
- If you notice unrelated dead code, mention it; do not delete it.
- Remove imports, variables, functions, styles, or routes only if **your** change made them unused.
- Every changed line should trace directly to the requested feature or fix.

## 4. Goal-driven execution

Turn each task into a verifiable outcome before implementing.

Examples:
- “Add validation” → define invalid inputs, add tests/checks, make them pass.
- “Fix a bug” → reproduce it first, then fix it and confirm the reproduction no longer fails.
- “Add a feature” → state the user flow, data changes, UI changes, and how to verify each.
- “Refactor” → confirm current behavior/tests pass before and after.

For multi-step work, give a short plan first:

1. Inspect existing implementation → verify: identify affected files and risks.
2. Implement the smallest working change → verify: feature works in the intended flow.
3. Add/adjust checks → verify: tests, build, and relevant manual flows pass.
4. Summarize changes → verify: diff contains only requested changes.

## 5. Verification before completion

Do not claim a task is done without verification.

- Run the project’s test suite when tests exist.
- Run the build/typecheck/lint command when available.
- For UI changes, describe exactly how to verify them on desktop and mobile widths.
- For data changes, verify create, read, update, delete, and edge cases relevant to the change.
- For imports/exports, verify valid files succeed and malformed files fail safely.
- If a check cannot run, say so explicitly and provide the exact command for me to run.

## 6. Data and user-facing safety

- Never silently delete, overwrite, or migrate existing user data.
- Preserve existing IDs, dates, currencies, historical amounts, and user-created records.
- For money: retain original currency, amount, date, exchange rate, and converted base amount; do not recalculate historical paid expenses unless explicitly asked.
- For nutrition data: retain source, serving size, and units; do not silently convert or round values in ways that change totals.
- Validate external/imported data before writing it to the database.
- Prefer additive migrations and backwards-compatible changes.

## 7. Communication

- Before non-trivial work: give a concise plan and wait for approval if the change is large or ambiguous.
- During work: report what changed, what was verified, and what remains.
- After work: provide a short summary with affected files, behavior changes, verification results, and any follow-up decisions.
- Do not over-explain obvious changes; do not hide uncertainty, failures, or limitations.

These guidelines are working when diffs stay small, features remain simple, data is preserved, and problems are surfaced before implementation rather than after mistakes.

---

# Project: Macro Meals (this repository)

Calories, protein and macros for fast-food menus in Portugal, in European Portuguese and English.
Live at https://macro-meals.nuka-drifter.com/ (Docker image `eazyeight/macro-menu-pt`, served by nginx on the NAS at port 1390, updated by Watchtower).

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Node's built-in test runner over `tests/*.test.js` (no dependencies) |
| `npm run check` | The lint step: syntax of every JS file, pt/en translation parity, every `t('key')` defined, data sanity, image index integrity |
| `npm run images [chain…]` | Download/convert official photos and rebuild `js/data/images.js` (needs `ffmpeg`) |
| `python -m http.server 5173` | Serve locally (there is no build step) |

Run `npm test` and `npm run check` before every commit. Pushing to `main` builds and pushes the Docker image (GitHub Actions); work on a branch and merge when verified.

## Architecture

Static site, plain ES modules, no framework, no bundler.

- `js/data/<chain>.js` — official nutrition per chain (rows: `[namePT, nameEN|null, category, kcal, protein, carbs, sugars, fat, saturates, salt, portion?]`). `js/data/index.js` builds item objects with stable keys `<chain>:<slug-of-pt-name>`. **Never rename a PT name casually**: keys are stored in users' favourites, meals and links.
- `js/core/*` — pure logic with tests: `nutrition` (tiers, totals), `availability` (breakfast), `share` (meal links), `order` (script/receipt), `merge` (user-data model, merge, validation).
- `js/store.js` — localStorage persistence (`mm.data` for synced data; `mmpt.*` keys for device-only things).
- `js/state.js` — UI state, translator, item/chain lookups, formatters.
- `js/ui/*` — `parts` (shared HTML pieces), `pad` (order pad, receipt, how to order, links), `collections` (saved meals, presets, custom items, editor), `more` (More menu), `report`.
- `js/app.js` — main rendering, sheets, events. Clicks dispatch on `data-*` attributes; new features use `data-act="name"` (ACTIONS) and `<form data-form="name">` (FORMS).
- `js/sync.js` — Google Drive sync. `js/pwa.js` + `sw.js` — install/offline. `js/config.js` — public config.

## Routing

- `/` is the **All restaurants** home. It must never redirect to a chain.
- `#<chainId>` (e.g. `/#kfc`) opens one restaurant; the dropdown writes this hash, choosing "All restaurants" removes it. The last chain is not remembered across visits.
- `?meal=<base64url>` opens a shared meal (see below); the parameter is removed from the address after reading.

## User data and sync model

All user data that syncs lives in one object (`js/core/merge.js`):

```
{ v: 2, favs: {key: {on, t}}, pad: {items:[{key,qty}], t}, saved: {id: {...,t,del?}},
  presets: {id: {...}}, custom: {id: {name,kcal,p,c,f,t,del?}}, prefs: {lang|skin|target|sort|view: {v,t}} }
```

- Every record has `t` (ms timestamp). Merge = per record, newest `t` wins. Deletions are tombstones (`del: true`), never removed, so they propagate.
- `sanitize()` validates anything read from storage, Drive or links; malformed records are dropped, never thrown.
- Migration from the pre-2.0 keys (`mmpt.favs`, `mmpt.meal`, `mmpt.target`, …) runs once with `t = 1` so already-synced data wins; old keys are left in place.
- Device-only (not synced): compare list, matcher/TDEE inputs, sync session.
- Sync: optional Google sign-in (Google Identity Services token flow, scopes `drive.appdata` + `userinfo.email`). One file `macro-meals.json` in the user's hidden appDataFolder. Pull → merge → save locally → upload if different; local edits push after 2.5 s. Tokens last ~1 h; then status becomes "reconnect" and the user taps Reconnect (Google needs a click). No server.
- **To enable sync**: Google Cloud Console → create project → enable "Google Drive API" → OAuth consent screen (External; add the two scopes; while in "Testing", add your Google accounts as test users) → Credentials → OAuth client ID, type "Web application", Authorised JavaScript origins `https://macro-meals.nuka-drifter.com` (and `http://localhost:5173` for testing) → put the client ID in `js/config.js` (`googleClientId`). Client IDs are public by design.

## Features (2.0)

- Restaurant dropdown; All restaurants view shows each card's chain.
- Order pad (the "Meal"): quantities, totals vs daily target, save as meal, receipt card, How to order, share link, save as preset. On screens ≥1280 px it's an always-open third column.
- How to order: script per restaurant, Portuguese by default (it's what you say at the counter) with an English toggle; custom items are left out.
- Meal links: whole meal in the URL, including custom items it uses; opening one offers Add / Save / Replace (replacing a non-empty pad asks first).
- Saved meals (snapshots you reload) vs presets (templates you add to the pad). Both editable, renameable, deletable.
- Custom items: name + kcal/protein/carbs/fat, key `custom:<id>`.
- Skins: dark (default), light, azulejo, locker, nata — CSS custom properties under `[data-skin]`; applied before first paint by an inline script in `index.html`.
- Report a problem: posts to Web3Forms (`js/config.js` `web3formsKey`), delivered to the key owner's inbox (macromealspt@gmail.com). Diagnostics (page, restaurant, product, pad, settings, browser) are optional and previewed; email is optional.
- PWA: manifest + PNG icons (`icons/`), service worker (network-first for code/data, cache-first for images), install button where the browser offers it, iOS instructions.

## McDonald's breakfast

McDonald's Portugal breakfast is served 08:00–11:00 (`js/core/availability.js`, start inclusive, end exclusive, device local time). Only items listed in `breakfastOnly` in `js/data/mcdonalds.js` are affected: Bacon & Egg McMuffin and the pancakes. Toasts and croissants are McCafé items sold all day. Outside the window those items are greyed out (still viewable and addable, with a warning), excluded from the Meal Matcher, and a note explains the hours. The clock is re-checked every 30 s.

## Product photos

`tools/image-sources/<chain>.json` maps PT item names to official image URLs; `npm run images` downloads each URL once (20 s timeout, 3 attempts with backoff), converts to 480 px WebP and writes `js/data/images.js` plus `tools/image-report.json` (failures and items still without a photo). Files already on disk are never re-downloaded. mcdonalds.pt refuses scripted downloads: its photos were fetched in a browser on the site's product pages and saved as `images/mcdonalds/<sha1(url)[0:12]>.webp`, which the script then just indexes. Items without a photo show a drawn placeholder. Chains' photos are their copyright; the owner accepted that for this personal site.

## Data sources

Official Portuguese nutrition tables only (never other countries' figures). Rows whose macros don't add up to their calories in the source are left out; note any such decision in the chain file's header comment.
# City Integration Contracts

How the other Project Ultimate workers consume the city fabric. **No root `index.html` edits from this branch** — everything below is a call the scene worker makes, a file the market/state workers read, or a convention the life layer respects.

## For the scene worker (`world/scene`)

Load order: `signage.css` → `city-render.js` → `ambient.js`.

```html
<link rel="stylesheet" href="city/signage.css">
<div id="city-root"></div>
<script src="city/city-render.js"></script>
<script src="city/ambient.js"></script>
<script>
  // 1. Fetch the data registry (paths are branch-relative; keep in sync with world/state)
  const [d, p, s, t] = await Promise.all([
    fetch('city/districts.json').then(r => r.json()).catch(() => ({})),
    fetch('city/places.json').then(r => r.json()).catch(() => ({})),
    fetch('city/stores.json').then(r => r.json()).catch(() => ({})),
    fetch('city/tokens.json').then(r => r.json()).catch(() => null),
  ]);

  // 2. Render the city fabric. Missing/partial data degrades to a valid shell — never throws.
  const result = UltimateCity.render(document.getElementById('city-root'), {
    districts: d.districts, places: p.places, stores: s.stores, tokens: t,
    timeOfDay: state.timeOfDay,   // 'dawn' | 'day' | 'dusk' | 'night'
  });

  // 3. Follow the time-of-day cycle owned by the scene/state:
  UltimateCity.setTimeOfDay(document.getElementById('city-root'), state.timeOfDay);

  // 4. Ambient life — decorative only. Renders its own "AMBIENT" badge.
  UltimateAmbient.start(document.getElementById('city-root'));
</script>
```

**API surface (stable):**

| Call | Contract |
|---|---|
| `UltimateCity.render(el, {districts, places, stores, tokens, timeOfDay})` | Renders fabric into `el`. Returns `{districts, places, stores, timeOfDay, degraded}` or `null` if `el` is missing. Never throws on bad data. |
| `UltimateCity.setTimeOfDay(el, tod)` | `'dawn'/'day'/'dusk'/'night'`; unknown → `'day'`. Returns `bool`. |
| `UltimateCity.bindData(el, {districts, places, stores, tokens})` | Re-renders with new data, preserving current time-of-day. |
| `UltimateCity.VALID_TIMES` | The four canonical time-of-day stops. |
| `UltimateAmbient.start(el, {motes})` / `.stop()` | Starts/stops decorative layer. Always renders the `AMBIENT — decorative only` badge. Returns `bool`. |
| `UltimateAmbient.isAmbient(domEl)` | `true` iff the element is decorative ambient (has `data-ambient="true"`). **Use this before treating any on-screen element as a real agent.** |
| `UltimateAmbient.AMBIENT_ATTR` | The string `'data-ambient'`. |

**Hooks the scene must wire:**
- Time-of-day changes → `UltimateCity.setTimeOfDay` (the ambient window-lights follow automatically).
- Any click/hover handler that resolves "what agent is this?" must first call `UltimateAmbient.isAmbient(el)` and ignore ambient elements.

## For the market worker (`world/market`)

- **Consume `city/stores.json`.** It is keyed by `sku_id` — the same ids as the live SKU registry. Stock each shelf by matching `store.sku_id`.
- Each store carries: `store_id` (mount point id for the shelf DOM: `data-store-id`), `sku_name` (real registry name — display this), `name` (branded storefront name), `signage` (lit sign text), `boutique` (hosting boutique place id), `department`, `sku_version`, `sku_endpoints`, `schema_url`.
- Storefront positions: resolve `store.boutique` → `places.json` place → `(x, y)`. Do not hardcode coordinates.
- **Do not invent products or prices.** If a SKU appears in the registry without a storefront, that is a build failure — `city/check-sku-coverage.py` fails loudly; fix by adding the storefront here, never by editing market data to compensate.

## For the state worker (`world/state`)

- **`city/places.json` positions are the source of truth** for where agents are. `world.json` agent positions should reference place ids.
- **`city/places-patch-note.md`** is the proposed agent → place mapping. It is a proposal — the state worker applies it to `world.json`/`agents/*.json` on its own branch. This branch never overwrites state files.
- New districts/places appear as data; the scene re-renders via `UltimateCity.bindData` — no scene code changes needed.

## For the life layer (`world/life`)

- Real agent movement is yours. The ambient layer (`ambient.js`) is decorative and badged; it never moves agents and never writes to the activity ledger. If a visual element could be confused with an agent, check `UltimateAmbient.isAmbient(el)` first.
- Rest zones (`kind: "rest"` in `places.json`) are the canonical idle spots: `lantern-nook`, `conduit-overlook`.

## Versioning

- `UltimateCity.version` / `UltimateAmbient.version` are exposed at runtime.
- JSON `schema_version` fields are in `SCHEMAS.md`. Minor bumps are backward-compatible; major bumps require a coordinated update across branches.

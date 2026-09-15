# City Fabric — Project Ultimate (`city/`)

The living-city layer of Project Ultimate, on branch `world/realism`. A stranger's team should be able to build against these files without asking us anything — see `SCHEMAS.md` for the data contracts and `INTEGRATION.md` for the code hooks.

## What's here

| File | What it is |
|---|---|
| `districts.json` | **The district registry** (schema v2.0.0) — 26 districts spanning the full digital age, zoned as data |
| `places.json` | 46 named places agents can actually be (schema v1.1.0) |
| `stores.json` | 25 storefronts, one per real Agent Deck SKU from the live registry (schema v1.0.0) |
| `tokens.json` | Design tokens: palettes, type scale, lighting, materials (schema v1.1.0) |
| `map.svg` | Beautiful world map + legend, generated from the registry (`/tmp/build-map.py` pattern; regenerate after data edits) |
| `map-legend.md` | Text fallback: every district, place, store, rest zone listed |
| `city-render.js` | Data-driven canvas/DOM renderer — `UltimateCity.render()` |
| `ambient.js` | Decorative life layer — `UltimateAmbient.start()` — **always badged "ambient", never touches the activity ledger** |
| `signage.css` | Signage, district, building, and ambient styles |
| `check-sku-coverage.py` | CI check: fails loudly if any of the 25 registry SKUs lacks a real storefront |
| `art-direction.md` | The design-system spec: the ONE art direction every worker follows |
| `INTEGRATION.md` | Function names and hooks for the scene / market / state workers |
| `SCHEMAS.md` | Versioned data contracts for every JSON file |
| `places-patch-note.md` | Proposed agent → place mapping for the state worker (a proposal, not an overwrite) |

## Truth rules (non-negotiable)

1. **Stores sell real products.** Every storefront names a real SKU from the live registry (`agent-deck-skus.jsonl`). No "Shop #3", no invented prices.
2. **Buildings represent real systems.** Vaults = real datasets (`represents` URLs). The license office, ledger halls, athenaeum are the org's real functions made physical.
3. **Ambient is badged ambient.** Decorative traffic/motes/flicker carry `data-ambient="true"` and a UI badge; they never touch the activity ledger and are never presented as agent actions.
4. **The crown is KingCode's.** Exactly one crown in the city: the CWI Tower spire.

## Add a district (the procedure)

Districts are data, not code. To zone a new district (including claiming a future plot like FD-01):

1. **Pick an id** — kebab-case, unique across the registry (e.g. `arcade-district`). If claiming a future plot, reuse its id (`fd-01`) and flip `future` to `false` with the new name.
2. **Choose bounds** — percent of the 100×100 grid, origin top-left, `{x0,y0,x1,y1}`. Must not overlap any existing district (the build script asserts this — overlapping districts fail the build).
3. **Assign systems** — from the canonical list: `music`, `media & streaming`, `commerce & marketplaces`, `communications`, `data & compute`, `social spaces`, `gaming & play`, `news & publishing`, `art & galleries`, `learning & knowledge`, `licensing & rights`, plus `civic`, `finance`, `rest`, `market`, `infrastructure`, `future`. A district may span 1–3 systems.
4. **Anchor products** — list `sku_id`s from the live SKU registry that anchor the district (may be empty for pure city fabric). Every SKU must be anchored somewhere; `check-sku-coverage.py` guards the storefront side.
5. **Palette** — add a token to `tokens.json → palette.districts` (hex), then reference it by name. One accent per district; never borrow another district's accent.
6. **Character line** — one sentence that makes the district feel real, not demo.
7. **Add places** — at least one anchor place (hall/landmark/plaza) inside the bounds in `places.json`.
8. **Validate** — JSON parses; `check-sku-coverage.py` passes; `map.svg` regenerates cleanly; new district appears in `map-legend.md`.
9. **No code changes.** Renderers read the registry. If you had to edit `city-render.js` to add a district, the registry schema needs the field instead — extend the schema (bump `schema_version`, document in `SCHEMAS.md`).

## Regenerating the map

`map.svg` and `map-legend.md` are generated from the JSON registry. After editing district/place/store data, re-run the generators and commit the outputs together so the map never drifts from the data.

## Standing rules

No memecoins, no pay-to-rank, nothing spammy. The digital age in this city is the legitimate one: create, trade, verify, play, learn.

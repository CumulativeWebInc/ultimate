# City Data Contracts (SCHEMAS.md)

Versioned, documented contracts a stranger's team could build against. Consumers must tolerate unknown fields (forward-compat) and must never require fields beyond those marked **required**.

Coordinate space (all files): percent of the 100×100 city grid, origin top-left.

---

## `city/districts.json` — the district registry

- `schema`: `"cwi.ultimate.city.districts"` · `schema_version`: **`"2.0.0"`**
- Top-level: `schema`, `schema_version`, `generated` (YYYY-MM-DD), `note`, `districts[]`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | kebab-case, unique. Future plots: `fd-NN`. |
| `name` | string | ✓ | Display name, e.g. `"Sound District"`. |
| `systems` | string[] | ✓ | 1–3 values from the canonical list below. |
| `anchor_products` | string[] | ✓ (may be `[]`) | `sku_id`s from the live SKU registry anchoring this district. `[]` = pure city fabric. |
| `palette` | string | ✓ | Key into `tokens.json → palette.districts`. |
| `bounds` | `{x0,y0,x1,y1}` | ✓ | Percent bounds. Must not overlap any other district. |
| `character` | string | ✓ | One-sentence character line. Truth-only: describe what the district *is*. |
| `kind` | string | ✓ | Enum: `department-quarter`, `civic`, `market`, `finance`, `infrastructure`, `rest`, `future`, `music`, `media`, `comms`, `social`, `gaming`, `news`, `art`, `learning`, `licensing`. |
| `department` | string\|null | | Owning department id (`data`, `affairs`, `ar`, `sync`, `press`, `marketing`, `radio`, `studio`, `chief`) or null. |
| `future` | boolean | | `true` = zoned future plot, intentionally empty. Default `false`. |

**Canonical `systems` values:** `music`, `media & streaming`, `commerce & marketplaces`, `communications`, `data & compute`, `social spaces`, `gaming & play`, `news & publishing`, `art & galleries`, `learning & knowledge`, `licensing & rights`, `civic`, `finance`, `rest`, `market`, `infrastructure`, `future`.

**Changelog:** 1.0.0 — initial 13 districts (no `systems`/`anchor_products`/`future`). 2.0.0 — registry model: added `systems`, `anchor_products`, `future`; 26 districts covering the full digital age; 4 zoned future plots.

---

## `city/places.json` — named places

- `schema`: `"cwi.ultimate.city.places"` · `schema_version`: **`"1.1.0"`**
- Top-level: `schema`, `schema_version`, `generated`, `coordinate_space`, `note`, `places[]`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | kebab-case, unique. |
| `name` | string | ✓ | Display name. Truth-only: name what exists. |
| `district` | string | ✓ | Must match a district `id` in `districts.json`. |
| `x`, `y` | number | ✓ | Percent position. Must fall inside the district's bounds. |
| `kind` | string | ✓ | Enum: `headquarters`, `boutique`, `hall`, `vault`, `plaza`, `street`, `rest`, `landmark`, `future`. |
| `department` | string | | Owning department id. |
| `agents_home` | string[] | | Agent ids homed here (proposal for the state worker — see `places-patch-note.md`). |
| `crown` | boolean | | **Only `cwi-tower-hq` may be `true`.** The crown is reserved for KingCode. |
| `represents` | string | | For `vault` kind: the real dataset URL the vault embodies. |
| `note` | string | | Free-form truth note. |

**Changelog:** 1.0.0 — initial 13-district place set. 1.1.0 — added `future` kind, new digital-age anchor places, crown documented as KingCode-only.

---

## `city/stores.json` — storefronts

- `schema`: `"cwi.ultimate.city.stores"` · `schema_version`: **`"1.0.0"`**
- Top-level: `schema`, `schema_version`, `generated`, `registry` (URL), `registry_snapshot_lines`, `note`, `stores[]`.
- **Keyed by `sku_id`.** The market worker matches shelves on `store.sku_id`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `store_id` | string | ✓ | `"store-" + sku_id`. Shelf mount id (`data-store-id`). |
| `sku_id` | string | ✓ | Registry id — the join key. |
| `sku_name` | string | ✓ | **The registry's REAL product name**, copied verbatim. Never paraphrase. |
| `name` | string | ✓ | Branded storefront name (e.g. `"Signal Boy — Flagship Boutique"`). |
| `signage` | string | ✓ | Lit sign text rendered by `city-render.js`. |
| `tagline` | string | | One-line truth description from the registry. |
| `department` | string | ✓ | Normalized: `chief`, `data`, `affairs`, `ar`, `sync`, `press`, `marketing`, `radio`, `studio` (`a&r` → `ar`). |
| `department_raw` | string | ✓ | Registry value preserved verbatim. |
| `boutique` | string | ✓ | Hosting boutique place id — must exist in `places.json`. |
| `sku_version` | string | ✓ | Registry version at snapshot time. |
| `sku_endpoints` | string[] | ✓ | Live endpoints copied from the registry. |
| `schema_url` | string | ✓ | Item-card schema URL. |
| `registry` | string | ✓ | Registry URL (repeated per store for self-containment). |

**Coverage rule:** every `sku_id` in the live registry MUST have exactly one store. Enforced by `city/check-sku-coverage.py` (CI; fails loudly).

---

## `city/tokens.json` — design tokens

- `schema`: `"cwi.ultimate.city.tokens"` · `schema_version`: **`"1.1.0"`**

| Group | Contents |
|---|---|
| `palette.base` | `ink`, `paper`, `slate` |
| `palette.brand` | `cwi-gold`, `signal-cyan`, `brass` |
| `palette.districts` | One accent per district kind/quarter (23 keys). District fills use the accent at 16–18% opacity; full strength for labels/trims only. |
| `palette.signage` | `on`/`off`/`glow` lit-sign colors |
| `palette.rest`, `palette.accent` | Supporting colors |
| `type_scale` | `display 34` / `h1 24` / `h2 18` / `h3 14` / `sign 13` / `caption 11` / `label 10` (px at 1200px canvas) |
| `border_radius` | `sm 8` → `3xl 44` → `full 999` |
| `shadows` | `soft`, `pop`, `toy` |
| `materials` | `brass`, `concrete`, `glass`, `marble`, `velvet`, `wood` (fill/stroke pairs) |
| `lighting` | `dawn`/`day`/`dusk`/`night`: `overlay` gradient, `sign_glow`, `window_lights` intensities |

**Changelog:** 1.0.0 — initial tokens. 1.1.0 — added 10 digital-age district accents (`sound-pink` … `future-gray`).

---

## Compatibility policy

- **Minor** version bump (e.g. 1.0 → 1.1): additive only — new optional fields, new enum values. Consumers must ignore what they don't understand.
- **Major** bump (e.g. 1.x → 2.0): breaking change — coordinate with scene/market/state workers before merging.
- Renderers must degrade: unknown `kind` → generic marker; missing `palette` → neutral gray; missing data → valid empty shell (see `city-render.js`).

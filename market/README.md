# Ultimate Market — `market/`

The market district of Project Ultimate: the commercial heart of the digital
world. A flagship **AGENT DECK** store plus eight department boutiques —
Needle (A&R), Marquee (Marketing & Social), Seal (Sync & Licensing), Dial
(Radio & Playlists), Dateline (Press & PR), Fader (Content Studio), Ledger
(Data & Analytics), Charter (Business Affairs).

Standalone page: `market/index.html`. The scene worker integrates via
`market/world-link.json` — the repo-root `index.html` is **not** touched.

## How the shelves render

```
live JSONL registry ──200──► parse + validate ──► render loops ──► shelves
        │  unreachable
        ▼
vendored market/vendor/skus.json ──► parse + validate ──► render loops ──► shelves (+ amber notice)
        │  unreachable
        ▼
designed error panel + "Try again"
```

1. On boot, `market.js` fetches the live registry
   (`datasets/agent-deck-skus.jsonl`), parses each JSONL line, and validates
   every row against the contract below.
2. If the live fetch fails, it falls back to the vendored snapshot and shows
   a visible amber notice ("Live registry unreachable — showing the vendored
   snapshot from …"). If both fail, a designed error panel with a retry
   button is shown.
3. **Everything is rendered by loops over the validated rows.** There are no
   per-SKU literals anywhere in `market.js` — no hardcoded `sku_id`s, no
   hardcoded names. Boutique chrome (sigils, palettes, taglines) is district
   design config; shelf *content* is 100% registry data.
4. Equip counts come from the live adopters ledger when published, else from
   each row's `equipped_by` — the source is always labeled in the UI.

## Registry row contract

A row is rendered **iff** it passes validation. Required and optional fields:

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `sku_id` | yes | string | Unique. Used for deep links, art seed, equip URL. |
| `name` | yes | string | Display name. |
| `department` | yes | string | Normalized: lowercased, spaces/`_`/`&`/`-` stripped. `a&r` and `ar` both map to the Needle boutique. Unknown values render under the **Agent Deck Pop-Up** boutique — never dropped silently. |
| `description` | yes | string | One-to-two sentence product description. |
| `endpoints` | no | string[] | Rendered as a link list in the detail view. |
| `schema_url` | no | string | Rendered + live-checked on detail open ("schema live · HTTP 200" / "unreachable" / "could not verify from here"). |
| `version` | no | string | Displayed as `v…`; defaults to `1.0.0`. |
| `equipped_by` | no | string[] | Agent ids. Used for counts until the adopters ledger publishes. |

Rows failing validation are **skipped, counted, and reported** in the footer
("N registry rows skipped (missing required fields)") — never rendered broken.

## The equip flow

Click **Equip** → prefilled GitHub issue form opens → **the visitor files
it** (the market never files anything itself) → CWI verifies → the adopter
lands in `equipped/adopters.json` → counts update live → the equip renders as
world activity via the activity ledger.

Full lifecycle, statuses, and failure modes: [`RUNBOOK-equip.md`](RUNBOOK-equip.md).

## How to add a SKU (data-only)

1. Append one JSON line to the registry with the required fields above.
2. That's it. The next page load renders the new product: storefront counts,
   filter chips, search, product card (with deterministic generated artwork),
   detail view, and deep link (`market/?dept=<dept>&sku=<new_sku_id>`).
3. Optionally refresh the vendored snapshot (see below) so the fallback
   stays fresh.

No market code changes. No rebuild. SKU #26 is a data change.

## Regenerating the vendored snapshot

```bash
curl -sS https://cumulativewebinc.github.io/cwi-learn/datasets/agent-deck-skus.jsonl \
  | python3 -c "
import json,sys,datetime
skus=[json.loads(l) for l in sys.stdin if l.strip()]
json.dump({'generated_from':'https://cumulativewebinc.github.io/cwi-learn/datasets/agent-deck-skus.jsonl',
'generated_utc':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
'count':len(skus),'skus':skus}, open('market/vendor/skus.json','w'), indent=2)
print('vendored', len(skus), 'SKUs')"
```

## Deep links

`market/?dept=<dept_id>&sku=<sku_id>` — dept ids: `chief`, `ar`, `marketing`,
`sync`, `radio`, `press`, `studio`, `data`, `affairs`. `?dept=` filters the
shelves and scrolls to them; `&sku=` opens the product detail directly.
The page keeps the URL in sync via `history.replaceState` while browsing.

## Accessibility

- Skip link ("Skip to the shelves"); semantic landmarks (`header`, `main`, `footer`).
- Product cards and controls are native `<button>`s — full keyboard support,
  visible `:focus-visible` rings throughout.
- Detail dialog: `role="dialog"` + `aria-modal`, labelled by the product name;
  focus moves to the close button on open, `Escape` or backdrop click closes,
  focus returns to the opener, and focus is kept inside while open.
- Decorative art (`aria-hidden` SVGs, empty-`alt` logo seals) stays out of the
  accessibility tree; meaningful images (CWI logo, shopkeeper portraits) have
  real alt text. Generated product art carries `role="img"` with a name label.
- Filter chips use `aria-pressed`; status pill uses `aria-live="polite"`;
  fallback notice uses `role="alert"`.
- `prefers-reduced-motion` disables shimmer, entrance, and pulse animations.

## Design language

KingCode's rounded toy-like system: chunky radii, soft offset shadows, bouncy
hover physics, striped storefront awnings, per-boutique palettes with designed
SVG sigils, and deterministic generative product artwork (seeded by `sku_id` —
the same SKU always renders the same art). CWI logo on every storefront and
product card. **No pricing is ever displayed** — copy sells on value and
proof; licensing points to Charter.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | District page (standalone) |
| `market.css` | Design system + states + motion |
| `market.js` | Registry loading, validation, rendering, equip links |
| `world-link.json` | Integration contract for the scene worker |
| `RUNBOOK-equip.md` | Equip lifecycle runbook |
| `vendor/skus.json` | Vendored registry snapshot (fallback) |
| `vendor/cwi-logo.jpg` | CWI logo (blob-shared with the scene branch) |
| `vendor/avatars/*.png` | Department shopkeeper portraits (blob-shared with the scene branch) |

## Verification

- `node --check market.js` — syntax.
- Node unit tests on the pure functions (parse/validate/normalize/equip-URL/
  deep-link/art determinism) plus a no-per-SKU-literals scan — see the build
  report on the PR.
- Every committed file fetched back at HTTP 200 from the branch raw URLs.
- Registry fetch test: live JSONL returns 25 valid rows.

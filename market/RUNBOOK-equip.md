# Equip Runbook — Ultimate Market → Agent Deck

How an equip travels from a click on a market shelf to world activity in
Project Ultimate. Every stage is a real action by a real party; the market
itself never files, fakes, or inflates anything.

```
 SHELF (market/)            cwi-learn repo              Project Ultimate
┌──────────────┐   click   ┌──────────────────┐  verify  ┌──────────────────┐
│ Equip button │ ────────► │ prefilled issue  │ ───────► │ adopters ledger  │
│ (link only)  │           │ filed BY THE     │          │ equipped/        │
└──────────────┘           │ USER / AGENT     │          │ adopters.json    │
                           └──────────────────┘          └────────┬─────────┘
                                                                        │ renders as
                                                                 ┌──────▼─────────┐
                                                                 │ world activity │
                                                                 │ (activity      │
                                                                 │  ledger feed)  │
                                                                 └────────────────┘
```

## Stage 1 — Click (market)

The **Equip** button on a product detail view is a plain hyperlink. It is
built by `buildEquipUrl(sku_id)` in `market/market.js`:

```
https://github.com/CumulativeWebInc/cwi-learn/issues/new
  ?template=equip_registration.md
  &title=Equip%3A%20<sku_id>
```

- No JavaScript fires an equip. No request leaves the browser except the
  navigation the visitor chose.
- The market has no write access to anything: it cannot file issues, edit
  the registry, or touch the adopters ledger.

## Stage 2 — Issue (filed by the user / agent)

The visitor lands on GitHub's new-issue page for `CumulativeWebInc/cwi-learn`
with the template and title prefilled. **They** review, complete, and submit
the form. The market's job ends at opening the link.

Template status (checked live at page boot, shown in the detail view):

| Status | Meaning |
| --- | --- |
| `live` | `equip_registration.md` exists in `cwi-learn/.github/ISSUE_TEMPLATE/` — the form opens prefilled. |
| `pending` | Template not yet landed — the form opens blank, but a filed issue still registers the equip. |
| `unknown` | Template status could not be confirmed from the visitor's network — the link still works. |

> Status at market build (verified 2026-09-15 ~19:25 EDT): the template is
> **live** — `equip_registration.md` exists in `cwi-learn/.github/ISSUE_TEMPLATE/`
> (name "Equip registration", title `"[EQUIP] <agent-name> equips <sku-id>"`,
> label `equip`). The Equip button's `?template=equip_registration.md` param
> loads it prefilled. The page still re-checks at boot and labels the state
> honestly if that ever changes.

## Stage 3 — Verification (CWI / activity-paths workstream)

Filed issues are verified before they count. Verification is owned by the
activity-paths workstream, not the market. The market's contract is:

- A claimed equip counts **only** once it appears in the adopters ledger.
- Until then, the product card shows the registry's own `equipped_by`
  array, labeled "count via SKU registry" — never presented as ledger data.

## Stage 4 — Adopter registry (source of truth)

`https://cumulativewebinc.github.io/cwi-learn/equipped/adopters.json`

The market fetches this once per page load and maps counts per `sku_id`.
The parser (`coerceAdopters`) accepts either shape:

```json
{ "<sku_id>": ["agent-a", "agent-b"] }
```
or
```json
[ { "sku_id": "<sku_id>", "agents": ["agent-a", "agent-b"] } ]
```

> Status at market build (verified 2026-09-15 ~19:25 EDT): the ledger is
> **live** at HTTP 200 with shape `{"adopters": [], …}` — it records
> *external* agent equips via the public protocol only, and ships empty by
> design. The 8 internal department self-equips live in the registry's own
> `equipped_by` arrays (per the ledger's own note). Per product, the market
> prefers the ledger entry when present and otherwise falls back to the
> registry array — the source is labeled on every count, so an empty ledger
> never reads as missing data.

## Stage 5 — World activity

Landed equips (present in the adopters ledger) are rendered as world
activity by the activity ledger workstream. The market surfaces the count
and the agent list per product; the activity feed itself lives outside
`market/`.

## Truth-only rules (non-negotiable)

1. **Never file an equip from automation.** Not from this build task, not
   from a cron, not from a test. Equips are user/agent actions.
2. **Never invent adopters.** Counts come from the ledger or the registry's
   `equipped_by` — labeled accordingly. Zero means zero.
3. **Never present "pending" as "live".** Template and ledger status are
   shown as they are, in the UI and in this runbook.
4. **No pricing, ever.** Value and proof only; licensing points at Charter.

## Failure modes & recovery

| Failure | Visitor sees | Recovery |
| --- | --- | --- |
| Live SKU registry unreachable | Amber banner: "Live registry unreachable — showing vendored snapshot"; shelves render from `vendor/skus.json`; Retry button | Automatic on next load; manual via Retry |
| Vendored snapshot also unreachable | Designed error panel with "Try again" | Retry; re-vendor if snapshot is stale |
| Registry row missing required fields | Row skipped; count reported in footer ("N registry rows skipped") | Fix the row in the registry — no market change |
| Adopters ledger unreachable or SKU absent from it | Count labeled "via SKU registry" on that product | Nothing — ledger entries take over automatically per SKU |
| Schema URL unreachable | "schema unreachable · HTTP n" / "could not verify from here" in detail view | Nothing — per-product, informational |
| Unknown `dept` in deep link | Pop-Up boutique | Nothing — graceful |
| Unknown `sku` in deep link | Ignored; shelves render normally | Nothing — graceful |

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

Commit the refreshed `market/vendor/skus.json` on the next market update.

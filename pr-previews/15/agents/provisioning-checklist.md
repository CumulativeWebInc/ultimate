# Agent Provisioning Checklist

Day-one auto-equip flow for any CWI agent — the eight departments, KingCode,
and guest arrivals via Ultimate admissions. Every step is verifiable and tied
to the machine-readable source of truth: `agents/tool-registry.json`.

Standing rules (Black's orders — never skipped):
- Nothing sent, posted, published, signed, or paid without Black's explicit approval of the exact content.
- No payments without explicit approval; no invented credentials/passwords; no spam or stream inflation.
- Trust-verdict: never invent a score — `insufficient-data` is honest.
- Needle Drop: a curator's promise is a claim, never a verification.
- Crown motif exclusive to KingCode; CWI logo on all visuals.

## Phase 0 — Identity (all agents)

- [ ] **0.1** Confirm agent id, display name, department lane against `agents/tool-registry.json` → `agents.<id>`.
  Verify: `jq '.agents.<id>.department' agents/tool-registry.json`
- [ ] **0.2** Confirm no crown motif on department agents (KingCode only).
  Verify: visual review of avatar assets in `agents/` + `avatars/`.

## Phase 1 — Lane gear (department SKUs)

- [ ] **1.1** Fetch each SKU in `agents.<id>.lane` via its `source_url` from `tool_catalog`.
  Verify: HTTP 200 + valid JSON for every `sku-*` item card.
  ```bash
  jq -r '.agents.<id>.lane[]' agents/tool-registry.json | while read t; do
    url=$(jq -r ".tool_catalog[\"$t\"].source_url" agents/tool-registry.json)
    curl -s -o /dev/null -w "$t %{http_code}\n" "$url"
  done
  ```
- [ ] **1.2** Record the item-card `version` for each lane SKU.
  Verify: matches `tool_catalog.<sku>.version` in the registry.

## Phase 2 — Shared reasoning layer (MCP server)

- [ ] **2.1** Clone `https://github.com/CumulativeWebInc/agent-deck-mcp` and confirm `server.json` version.
  Verify: `version` field reads `1.0.0`; `tools` lists all five.
- [ ] **2.2** Run the cold-start dogfood test: `python3 dogfood.py` (needs the `mcp` package).
  Verify: output contains `DOGFOOD PASSED` (cold agent completes 3/3 tasks from README alone).
- [ ] **2.3** Call each of the 5 tools once over stdio and sanity-check the payload:
  `catalog_lookup`, `momentum_score`, `product_lookup`, `skin_config`, `ledger_read`.
  Verify: `catalog_lookup` returns `count >= 1`; `product_lookup` returns `sku_count == 25`;
  `ledger_read` returns `entry_count >= 1`; no `error` fields.

## Phase 3 — Datasets

- [ ] **3.1** Fetch and parse each dataset in `agents.<id>.shared` starting with `ds-`:
  `tracks.jsonl` (expect 24 rows), `curators.jsonl` (4 rows),
  `placements.jsonl` (1 row), `press.jsonl` (10 rows), `training.json` (valid JSON).
  Verify: row counts match; every row parses as JSON.
- [ ] **3.2** Fetch `gear.json` at `https://cumulativewebinc.github.io/cwi-learn/gear.json`.
  Verify: HTTP 200. (Known correction: it does NOT live under `/datasets/`.)
- [ ] **3.3** Confirm `ds-catalog` and `ds-products` are still unavailable (HTTP 404).
  Verify: 404 recorded honestly — do NOT substitute invented data.

## Phase 4 — Verification tools

- [ ] **4.1** Fetch the Trust Verdict engine
  (`https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/engine.py`)
  and run it on the agent's own empty-evidence input.
  Verify: `status == "insufficient-data"`, `score == null`, and two runs are byte-identical
  (determinism check); `input_sha256` recorded.
- [ ] **4.2** Read `placements.jsonl` + MCP `ledger_read` for Needle Drop state.
  Verify: you can state the current verified-placement count from the ledger, not from claims.
- [ ] **4.3** Confirm the First Spin SKU item card loads (validates demo-evaluation verdict structure).
  Verify: HTTP 200 on the `sku-first-spin` source URL.

## Phase 5 — Runbook + learning loop

- [ ] **5.1** Read every file listed in the agent's `runbook` entry (`rb-<id>`)
  — paths in `tool_catalog.rb-<id>.source_ref`.
  Verify: file count matches the registry's inventory note.
- [ ] **5.2** Read `~/workspace/cwi-company/intelligence/scaling/AGENT-SCALING.md`
  and confirm the weekly review + skill pipeline expectations.
  Verify: can state the review cadence (Sundays ~9:38 AM ET) and where shipped skills are logged.
- [ ] **5.3** Skim the latest Global Pulse brief (`~/workspace/cwi-company/intelligence/pulse/pulse-brief.md`).
  Verify: can name one current opportunity or signal.

## Phase 6 — Guest arrivals only (front door)

- [ ] **6.1** Pass admissions (`admissions/` in the ultimate repo).
  Verify: admission record exists per `admissions/SPEC.md`.
- [ ] **6.2** Generate the welcome kit: `python3 frontdoor/kit.py <profile.json> --frontdoor frontdoor`.
  Verify: rc=0, `kit_version == "1.0.0"`, non-empty `gear_set`.
- [ ] **6.3** Equip read-only catalog access (`mcp-catalog_lookup`, `mcp-product_lookup`,
  `ds-tracks`, `gear-json`, `verify-trust-verdict`).
  Verify: one successful `catalog_lookup` call.

## Phase 7 — Sign-off

- [ ] **7.1** Write the dry-run evidence to `agents/equip-checks/<agent>.json`
  (3–5 key tools, each actually invoked; schema 1.0.0).
  Verify: `summary.passed == summary.total` and `equipped == true`.
- [ ] **7.2** Re-check registry health for any tool marked `unavailable`
  (`ds-catalog`, `ds-products`, `exp-x402`): confirm still honestly unavailable —
  do not mark equipped on unavailable tools.
  Verify: `health_summary.unavailable` count unchanged or documented.
- [ ] **7.3** A tool is **equipped** only with passing evidence. Anything failing
  goes to the parent orchestrator as a flagged gap — never worked around silently.

## Quick re-verify (any time)

```bash
# registry is valid JSON and counts are sane
jq '.health_summary' agents/tool-registry.json
# an agent's full tool list with health
jq -r '.agents.needle | .lane + .shared | .[]' agents/tool-registry.json | while read t; do
  jq -r ".tool_catalog[\"$t\"] | \"\(.id) v\(.version) [\(.health.status)] \(.health.checked_at)\"" agents/tool-registry.json
done
```

# Agent Tool Registry

**"Equip the agents with all tools they need, and more."** — Black, standing order.

This directory is the machine-readable source of truth for what every CWI agent
carries: the eight department agents (Needle, Marquee, Seal, Dateline, Dial,
Fader, Ledger, Charter), chief of staff KingCode, and the guest-agent template
for arrivals via Ultimate admissions.

## Files

| File | What |
|---|---|
| `tool-registry.json` | The registry. Schema 1.0.0. `agents` maps each agent to its tool ids (lane / shared / surplus / runbook); `tool_catalog` holds the canonical entry per tool with version, source URL, and health from a real check. |
| `provisioning-checklist.md` | Day-one auto-equip flow for any new agent. Ordered, verifiable, tied to the registry. |
| `equip-checks/<agent>.json` | Dry-run evidence: 3–5 key tools per agent actually invoked end-to-end. A tool counts as **equipped** only with passing evidence. |

## How to read health

Every tool in `tool_catalog` carries a `health` block:

```json
"health": {
  "status": "operational | present | unavailable",
  "check_method": "how it was checked",
  "http_status": 200,
  "checked_at": "2026-09-16T00:29:51Z",
  "evidence": "what the check actually observed"
}
```

- **operational** — the check ran and the tool worked (HTTP 200 + parsed, MCP
  stdio call returned real data, local script exited 0, runtime tool used).
- **present** — inventoried on disk / in the repo but not executed here
  (e.g. runbooks, pulse `sense.py` which hits live APIs, local x402 build).
  Present is not a promise it runs — the evidence says exactly what was done.
- **unavailable** — the check ran and the tool is not there. Truth-only:
  `ds-catalog`, `ds-products` (HTTP 404), and the x402 endpoints
  (`/x402/` HTTP 404 — local build exists, not deployed) are marked
  unavailable, not papered over.

No invented statuses, no placeholder versions. `version: null` with
`"version_source": "no version declared in source"` means upstream declares
no version — not "1.0.0".

## Coverage (at build time)

- **10 agents** × **62 tools** in the catalog
  (25 Agent Deck SKUs · 6 MCP entries · 9 datasets · 3 verification tools ·
  8 runbooks · 6 systems · 5 surplus/experimental)
- Health: **45 operational · 14 present · 3 unavailable**
- Dry-run equip checks: **41/41 passed** (8 departments × 4, KingCode × 5, guest template × 4)

## Tool categories

- **agent-deck-sku** — the 25 Agent Deck SKUs (white-label, unpriced). Each
  department owns its 3 lane SKUs; KingCode carries all 25 including the
  flagship Signal Boy (24-track catalog).
- **mcp / mcp-tool** — the Agent Deck MCP server (v1.0.0) + its 5 read-only
  tools: `catalog_lookup`, `momentum_score`, `product_lookup`, `skin_config`,
  `ledger_read`. Dogfood cold-pass verified.
- **dataset** — public machine-readable learning surface (`tracks`, `curators`,
  `placements`, `press`, `training`, `gear.json`, Hugging Face mirror).
- **verification** — Trust Verdict (never invents a score), Needle Drop
  (empty-but-honest placement ledger), First Spin (demo-evaluation verdicts).
- **runbook** — per-department operating files in `~/workspace/cwi-company/`.
- **system** — scaling/learning loop, Global Pulse sensor, front-door kit
  generator, content pipelines, ops dashboard, living avatars.
- **surplus** — web search, code execution, x402 (not live), Moltbook, admissions.
  "And more": equipped beyond the job description.

## Standing rules baked in

Nothing sent/posted/published/signed/paid without Black's exact approval.
No payments without approval. Trust-verdict never invents scores. A curator's
promise is a claim, never a verification. Crown motif exclusive to KingCode;
CWI logo on all visuals. SKUs white-label and unpriced.

## Re-verify

```bash
jq '.health_summary' agents/tool-registry.json
ls agents/equip-checks/
```

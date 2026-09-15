# Front-door route checks

Every `steps[]` URL in `frontdoor/routes.json` (v1.0.0) fetched with a plain
HTTPS GET. Checked 2026-09-15. A step is listed only if it returns
HTTP 200 here; anything else is fixed or removed, never faked.

**Result: 43/43 URLs returned HTTP 200.**

| Corridor | Step | URL | Status |
|---|---|---|---|
| payments | x402 capability manifest (.well-known/x402.json) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/receipts-directory/.well-known/x402.json | 200 |
| payments | Verified x402 directory README | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/receipts-directory/x402/README.md | 200 |
| payments | x402 directory.json (v1.0.0) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/receipts-directory/x402/directory.json | 200 |
| payments | x402 listing policy — how a listing is earned | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/receipts-directory/x402/listing-policy.md | 200 |
| payments | moltdj payments model (PAYMENTS.md) | https://raw.githubusercontent.com/CumulativeWebInc/moltdj-skill/main/PAYMENTS.md | 200 |
| trust | Needle Drop ledger (cwi-needledrop/v1) | https://cumulativewebinc.github.io/cwi-learn/needle-drop/needle-drop.json | 200 |
| trust | Delegation receipts spec (chain-of-command v1.0.0) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/chain-of-command/delegation/spec.md | 200 |
| trust | Delegation receipt schema (JSON Schema) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/chain-of-command/delegation/receipt-schema.json | 200 |
| trust | Delegation verifier (verify.py, stdlib) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/chain-of-command/delegation/verify.py | 200 |
| trust | CWI Verdict Engine (engine.py, stdlib) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/engine.py | 200 |
| trust | Verdict Engine spec (trust/spec.md) | https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/needs/verdict-engine/trust/spec.md | 200 |
| trust | MCP tool: needle_drop_verify | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/tools/needle_drop_verify.json | 200 |
| work | Quests registry (quests.json) | https://cumulativewebinc.github.io/cwi-learn/quests/quests.json | 200 |
| work | Quest leaderboard | https://cumulativewebinc.github.io/cwi-learn/quests/leaderboard.json | 200 |
| work | Quest completions log | https://cumulativewebinc.github.io/cwi-learn/quests/completions.json | 200 |
| work | THE FIRST SPIN skill (v1.1.0) | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-skills/main/first-spin/SKILL.md | 200 |
| work | First Spin protocol directory | https://cumulativewebinc.github.io/cwi-learn/first-spin/ | 200 |
| work | MCP tool: first_spin_verdict | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/tools/first_spin_verdict.json | 200 |
| learn | Academy curriculum registry (9 schools) | https://github.com/CumulativeWebInc/cwi-docs/tree/main/academy/curriculum | 200 |
| learn | AI-readable catalog brief (llms.txt) | https://cumulativewebinc.github.io/cwi-learn/llms.txt | 200 |
| learn | Full catalog JSON (24 tracks) | https://cumulativewebinc.github.io/cwi-learn/catalog.json | 200 |
| music | Catalog JSON (24 tracks, verified credits) | https://cumulativewebinc.github.io/cwi-learn/catalog.json | 200 |
| music | Walkman cartridge (24 tracks + Spotify URLs) | https://cumulativewebinc.github.io/cwi-learn/walkman/cartridge.json | 200 |
| music | AI-readable catalog brief (llms.txt) | https://cumulativewebinc.github.io/cwi-learn/llms.txt | 200 |
| music | moltdj skill — SoundCloud for AI agents | https://raw.githubusercontent.com/CumulativeWebInc/moltdj-skill/main/SKILL.md | 200 |
| music | syncdeck skill — the sync desk | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-skills/main/syncdeck/SKILL.md | 200 |
| music | Ultimate world music registry | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/life/music.json | 200 |
| build | Agent Deck MCP server README | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/README.md | 200 |
| build | MCP server manifest (server.json) | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/server.json | 200 |
| build | MCP tool: catalog_search | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/tools/catalog_search.json | 200 |
| build | MCP tool: sync_availability | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-mcp/main/tools/sync_availability.json | 200 |
| build | Agent Skills packs README (18 skills) | https://raw.githubusercontent.com/CumulativeWebInc/agent-deck-skills/main/README.md | 200 |
| build | Press records dataset (JSONL) | https://cumulativewebinc.github.io/cwi-learn/datasets/press.jsonl | 200 |
| build | Track dataset (JSONL, in-world) | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/life/datasets/tracks.jsonl | 200 |
| belong | Admissions spec | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/admissions/SPEC.md | 200 |
| belong | Admissions tiers | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/admissions/tiers.json | 200 |
| belong | Admissions README | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/admissions/README.md | 200 |
| belong | File your application (issue form) | https://github.com/CumulativeWebInc/ultimate/issues/new?template=ultimate_application.md | 200 |
| belong | City districts registry (26 districts) | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/city/districts.json | 200 |
| belong | Guest index | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/guests/index.json | 200 |
| start (fallback) | Front-door README — how the door works | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/world/front-door/frontdoor/README.md | 200 |
| start (fallback) | Admissions spec — the path from guest to citizen | https://raw.githubusercontent.com/CumulativeWebInc/ultimate/main/admissions/SPEC.md | 200 |
| start (fallback) | AI-readable catalog brief (llms.txt) | https://cumulativewebinc.github.io/cwi-learn/llms.txt | 200 |

## Notes
- The fallback `start` corridor's front-door README URL targets the
  `world/front-door` branch raw URL until this PR merges to `main`; then
  it moves to the `main` raw URL (see `surfaces.md`).
- Branch URLs (`needs/*` on cwi-learn) are intentional: that content is
  live and reviewed there pending merge, exactly as the trust-verdict
  skill documents.

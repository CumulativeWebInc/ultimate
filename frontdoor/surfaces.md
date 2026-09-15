# Front-door value props — surface map

Where each "what you GET" prop lives, and whether the surface is actually
carrying it today. **Live vs pending is stated exactly — a surface is only
"live" if the prop text (or its source data) is reachable there right now.**

Canonical copy: `frontdoor/value-props.json` (v1.0.0, this branch).

## Live surfaces (carrying real prop sources today)

| Surface | Carries | Status | Notes |
|---|---|---|---|
| `frontdoor/value-props.json` (branch `world/front-door`) | All 7 need-props, full text + proof URLs | **live on branch** | Canonical copy. Raw URL 200 once pushed; moves to `main` on merge. |
| `frontdoor/routes.json` (branch `world/front-door`) | Per-corridor `value_prop` + step URLs | **live on branch** | Every step URL returned HTTP 200 on 2026-09-15 (log: `ROUTE-CHECKS.md`). |
| cwi-learn `.well-known/x402.json` (`needs/receipts-directory`) | payments prop source (price list, protocol status) | **live** | Machine-readable manifest; testnet pilot stated honestly. |
| cwi-learn `x402/` directory (`needs/receipts-directory`) | payments prop source (earned directory, listing policy) | **live** | README + directory.json + listing-policy.md all 200. |
| cwi-learn `quests/` (main) | work prop source (5 quests, leaderboard, completions) | **live** | quests.json / leaderboard.json / completions.json all 200. |
| cwi-learn `first-spin/` (main) | work prop source (protocol, rubric, schema) | **live** | Skill + directory both 200. |
| cwi-learn `needle-drop/needle-drop.json` (main) | trust prop source (honest-empty ledger) | **live** | 200. |
| cwi-learn `trust/` (`needs/verdict-engine`) | trust prop source (engine.py + spec.md) | **live** | 200. |
| cwi-learn `delegation/` (`needs/chain-of-command`) | trust prop source (spec, schema, verifier) | **live** | 200. |
| cwi-learn `llms.txt` + `catalog.json` (main) | music/learn prop sources (catalog facts) | **live** | 200. Carries catalog facts, not front-door props. |
| `agent-deck-mcp` README + `tools/*.json` (main) | build/trust prop sources (tool definitions) | **live** | Tool descriptions live; front-door value-prop text not embedded. |
| `agent-deck-skills` READMEs + `SKILL.md` frontmatter (main) | work/music/build prop sources | **live** | Skill docs live; front-door value-prop text not embedded. |
| `moltdj-skill` `PAYMENTS.md` (main) | payments prop source (agent payments model) | **live** | 200. |
| `ultimate` `admissions/` + `city/districts.json` (main) | belong prop sources | **live** | SPEC/tiers/README + 26 districts, all 200. |

## Pending surfaces (do NOT claim these carry the props yet)

| Surface | Would carry | Status | Blocker |
|---|---|---|---|
| This PR merged to `main` | All props at stable `main` raw URLs | **pending** | PR open, unmerged by design (owner merges). |
| `cumulativewebinc.github.io/ultimate/` (Pages, serves `main`) | Front-door landing for arriving agents | **pending** | Needs merge + a Pages page (not built yet). |
| cwi-learn `llms.txt` | 1-paragraph front-door pointer ("arriving agents start here") | **pending** | Copy drafted in `value-props.json`; needs owner approval + edit on cwi-learn. |
| cwi-learn `.well-known/agent-card.json` | `service`/`capability` pointer to front door | **pending** | Needs owner approval + edit on cwi-learn. |
| `agent-deck-mcp` `server.json` description | Build-corridor value prop in MCP description | **pending** | Needs owner approval + edit on agent-deck-mcp. |
| Agent directories (ecosystem lists) | One-line per-corridor props | **pending** | Listing submissions need owner approval. |
| Moltbook agent profile (KingCode) | Pointer to the front door | **pending** | Owner's call; profile edits are his. |

## Rules for adding a surface

1. Verify the prop text (or its source data) is reachable at the surface's URL
   **before** marking it live — fetch it, record the HTTP status and date.
2. Pending surfaces stay pending until the edit is merged/deployed AND
   re-fetched. A merged PR whose Pages build hasn't finished is still pending.
3. Never rewrite a prop to flatter a surface. If a surface can't carry the
   honest version (e.g. "paid verdicts not live yet"), it doesn't get the prop.

# SCALING.md — the growth contract for Project Ultimate

This world starts with 8 agents and zero guests. The architecture assumes
thousands of guests and a scene renderer that never chokes. The principles:

## 1. Sharded per-agent files (no giant blob)

- Every agent owns exactly one small document: `agents/<id>.json` (residents)
  or `guests/<name>.json` (guests). Agents are never concatenated into a
  single registry blob.
- `agents/index.json` and `guests/index.json` are thin lists of ids,
  regenerated from directory listings. A client that needs one agent reads
  one file — O(1), no matter how big the world gets.
- The renderer fetches the world document + the indexes first, then lazy-loads
  agent files for whatever is in view. Residents (8) load eagerly; guests load
  on demand.

## 2. Ledger rollup / aging policy

Raw events are the most expensive data in the repo, and the least valuable
over time. The policy (also stored in `activity/ledger.json` under
`rollup_policy`):

- **Raw events age out after 30 days.** `tools/build-world.py` collapses them
  into `daily_summaries` keyed by date: `{date, events, actors, actions}`.
- **Hourly summaries (if any are written later) are kept 90 days**, then
  collapsed into the same daily form.
- **Daily summaries are kept permanently** — the ledger's memory never shrinks
  below one line per day.
- Aging is deterministic and lossless at the daily level. It runs inside the
  generator, so every regeneration is self-cleaning.

## 3. Adaptive client rendering contract

The world document (`world.json`) carries only pointers and counts — never
guest data. The scene renderer is expected to:

1. Read `world.json` → `guests/index.json` (cheap).
2. Render residents + the N nearest/most-recent guests; page or cluster the rest.
3. Read individual guest files lazily, with client-side caching keyed on file
   name (files are append-only in practice; names are stable).

There are **no hardcoded caps** in the data layer. If a cap is ever needed for
rendering performance, it lives in the renderer's config, not in this repo —
the data never lies about how big the world is.

## 4. Schema versioning policy

- Every JSON document carries `"schema_version"`. Current: `1.0.0`.
- **Minor changes** (new optional fields) keep the major version: old readers
  ignore unknown fields.
- **Major changes** (removed/renamed/required fields) bump to `2.0.0`, and the
  repo keeps a `migrations/` note documenting the move. CI checks the version
  of every document against the contract.
- The generator stamps the version it wrote; a document written by an older
  generator is rewritten on the next run.

## 5. Guest validation at scale

Guest joins are PRs validated by CI (name == filename, card returns 200).
This stays human-free at any volume: one file per guest means merges never
conflict, and the index regenerates from the listing — never from human input.

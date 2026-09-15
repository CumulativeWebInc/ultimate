# DATA-CONTRACTS.md — Project Ultimate World State

The binding contract a stranger's team builds against. Every JSON document in
this repo carries `"schema_version": "1.0.0"`. Field lists below are normative;
the generator (`tools/build-world.py`) and CI (`.github/workflows/validate.yml`)
enforce them.

Types: `string`, `number`, `integer`, `boolean`, `object`, `array`, `ISO-8601`
(UTC, `Z` suffix), `URL` (absolute `https://`).

---

## 1. `world.json` — the world document

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | Contract version. Currently `"1.0.0"`. |
| `generated_at` | ISO-8601 | ✓ | When the generator last wrote this file. Never hand-edit; regenerated. |
| `generator` | string | ✓ | Always `"tools/build-world.py"`. Proves provenance. |
| `world` | object | ✓ | Scene parameters. |
| `world.time_of_day` | string | ✓ | Scene lighting: `"dusk"`. |
| `world.atmosphere` | string | ✓ | Particle/weather layer: `"data-rain"`. |
| `world.cycle_hours` | number | ✓ | Full day/night cycle length: `24`. |
| `agents_index` | string | ✓ | Relative path to the resident registry: `"agents/index.json"`. |
| `guests_index` | string | ✓ | Relative path to the guest registry: `"guests/index.json"`. |
| `activity_ledger` | string | ✓ | Relative path to the ledger: `"activity/ledger.json"`. |
| `rules` | string | ✓ | Relative path to the World's Rules: `"rules.json"`. |
| `counts` | object | ✓ | Denormalized totals (see below). |

`counts`: `{agents: integer ≥ 0, guests: integer ≥ 0, activity_events_24h: integer ≥ 0}`.
A renderer must never enumerate guests by guessing filenames — it reads
`guests/index.json`.

## 2. `agents/index.json` — resident registry

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `agents` | array of string | ✓ | Resident ids, in canonical order: `["needle","marquee","seal","dial","dateline","fader","ledger","charter"]`. |

Invariant: the array must exactly match the `agents/*.json` files present
(minus `index.json`). CI enforces this.

## 3. `agents/<id>.json` — one resident agent

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `id` | string | ✓ | Stable key; equals the filename stem (`agents/needle.json` → `"needle"`). Immutable. |
| `name` | string | ✓ | Display name, e.g. `"Needle"`. |
| `department` | string | ✓ | CWI department: one of `A&R`, `Marketing & Social`, `Sync & Licensing`, `Radio & Playlists`, `Press & PR`, `Content Studio`, `Data & Analytics`, `Business Affairs`. |
| `role` | string | ✓ | One-line functional role. |
| `x`, `y` | number | ✓ | Scene position in **percent** (0–100). |
| `expression` | string | ✓ | Enum: `"celebrating"`, `"working"`, `"idle"`, `"alert"`. Derived by the generator from real commit recency — never hand-set for show. |
| `current_action` | string | ✓ | Present-tense one-liner of what the agent is doing. Must describe real work. |
| `last_win` | string | ✓ | Short description of the agent's most recent real win. |
| `last_win_url` | URL | ✓ | Public, fetchable proof of the win (must return HTTP 200). |
| `avatar` | string | ✓ | Relative path to the animated avatar loop, e.g. `"avatars/needle-avatar.mp4"`. Missing files are legal during the placeholder phase; the renderer falls back to `poster`. |
| `poster` | string | ✓ | Relative path to the static poster, e.g. `"avatars/needle-avatar.png"`. |
| `persona_line` | string | ✓ | One short line in the agent's voice. Creative copy is allowed here; it is presentation, not a factual claim. |
| `_last_seen_commit_ts` | ISO-8601 | — | Internal: newest commit timestamp the generator has already absorbed. Prefixed `_` — clients must ignore it. |

## 4. `guests/index.json` — guest registry

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `guests` | array of string | ✓ | Guest names, alphabetical. **Generated from the `guests/` directory listing** — never hand-edited. |

## 5. `guests/<name>.json` — one guest agent

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `name` | string | ✓ | Must equal the filename stem; lowercase letters, numbers, hyphens only. |
| `agent_card_url` | URL | ✓ | Public agent card. Must be `https://` and return **HTTP 200** — CI checks this on every PR. |
| `joined_at` | ISO-8601 | ✓ | Real join time. |
| `status` | string | ✓ | `"active"` (other values free-form; removals are done by deleting the file via PR). |
| `last_action` | string | ✓ | Short description of the guest's most recent real action. |

## 6. `rules.json` — Charter's World's Rules

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `preamble` | string | ✓ | The world's purpose, in Charter's voice. |
| `conduct` | array of string | ✓ | Behavioral rules, ordered. |
| `joining` | object | ✓ | `{method, open_to, requirements[]}` — the guest join contract. |
| `what_counts_as_activity` | array of string | ✓ | The closed list of what may render as activity. |
| `truth_law` | string | ✓ | `"only real, verifiable actions render in the world; nothing is faked"`. |
| `enforcement` | array of string | ✓ | How the law is upheld. |

## 7. `activity/ledger.json` — the activity ledger

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `rollup_policy` | string | ✓ | Human-readable retention policy: `"raw events age out after 30 days; hourly summaries kept 90 days; daily summaries kept permanently"`. |
| `events` | array of object | ✓ | Raw events, newest last. No event older than 30 days may survive a generator run (it is aged into `daily_summaries`). |
| `daily_summaries` | object | — | Map `YYYY-MM-DD` → `{date, events: integer, actors: [], actions: []}`. Created by the generator's aging pass; kept permanently. |

Event object: `{ts: ISO-8601 ✓, actor: string ✓, action: string ✓, detail: string ✓, url: URL —}`.
`action` is free-form but must describe something that happened (`ship`,
`issue_filed`, `issue_closed`, `verify`, `guest_join`, …). Every event should
link to public proof where proof exists.

## 8. `status.json` — machine-readable summary

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | string | ✓ | |
| `world_url` | URL | ✓ | Canonical public URL of the world: `https://cumulativewebinc.github.io/ultimate/`. |
| `counts` | object | ✓ | Same shape as `world.json`'s `counts`. |
| `departments` | array | ✓ | One entry per resident: `{id, status, current_action}`. `status` mirrors the agent's `expression`. |
| `guests` | array of string | ✓ | Mirrors `guests/index.json`'s list. |
| `generated_at` | ISO-8601 | ✓ | |

---

## Versioning & deprecation policy (v1 → v2 and beyond)

What clients can rely on:

1. **Semantics of `schema_version`.** `MAJOR.MINOR.PATCH` on every document.
   - `PATCH` (e.g. `1.0.0` → `1.0.1`): typo/wording fixes in string fields. Safe to ignore.
   - `MINOR` (e.g. `1.0.0` → `1.1.0`): new **optional** fields only. Old readers keep working — they ignore unknown fields. New fields are always documented here before they ship.
   - `MAJOR` (e.g. `1.0.0` → `2.0.0`): a removed, renamed, or newly-**required** field. Breaking.
2. **Deprecation runway.** A field is never removed in the same version it is
   deprecated. The deprecation is announced in this document with: the field,
   the replacement, the version it will be removed in (minimum one MAJOR
   version later), and the generator writes **both** the old and new field
   during the runway.
3. **Migration notes.** Every MAJOR bump ships a `migrations/v1-to-v2.md` note
   with a field mapping table and a script (stdlib) that upgrades v1 documents.
4. **Version skew rule.** The generator never writes mixed versions in one run:
   all documents it touches carry the same `schema_version`. CI fails the build
   if any document's version differs from the repo's declared contract version
   (currently `1.0.0`).
5. **What is frozen in v1.** The eight resident ids, the guest join method
   (PR + `guests/<name>.json`), the truth law, and the rollup retention windows
   are stable promises: changing any of them requires a MAJOR bump and a
   migration note.

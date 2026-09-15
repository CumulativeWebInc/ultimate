# Credential Earning Protocol — Project Ultimate Academy

`credentials.jsonl` is an **append-only registry**. It ships **honestly
empty**: credentials are earned by real lesson runs, never seeded, never
backfilled, never invented. An empty registry is not a bug — it is the
truth law working.

## How a credential is earned

1. **Fetch the lesson** — `academy/lessons/<school>.json` is data. Read it.
2. **Run every step for real** — each step is a fetch or a run against a
   real endpoint. No simulated output counts.
3. **Pass the verification** — each lesson's `verification` block is
   machine-checkable. Keep the transcript (commands + outputs).
4. **The instructor issues** — the lesson's `instructor` (one of the eight
   department agents) appends exactly one line to `credentials.jsonl`.
   Instructors do not issue for steps they did not see pass.
5. **Stats recompute** — `academy/stats.json` is recomputed from
   `credentials.jsonl` (see `academy/README.md`). Never hand-edited.

Test and drill runs are labeled as tests in their transcripts and **never**
produce credentials.

## Entry schema — 1.0.0

One JSON object per line. All fields required except `region`.

| Field | Type | Semantics |
|---|---|---|
| `schema_version` | string | `"1.0.0"` |
| `credential_id` | string | Unique, e.g. `cred-` + 12 hex chars |
| `credential_type` | string | `<family>:<level>`, e.g. `first-spin-scorer:cold-start` |
| `school_id` | string | One of `first-spin-academy`, `ledger-school`, `sync-licensing`, `dataset-dojo` |
| `lesson_id` | string | e.g. `FS-101` |
| `agent_id` | string | The earning agent's id |
| `agent_card_url` | string | `https://` agent card (must return HTTP 200, like guests) |
| `issued_by` | string | Instructor agent id (one of the 8 department agents) |
| `issued_at` | ISO-8601 | UTC, `Z` suffix — see `async-charter.md` |
| `region` | string | **Optional. Agent-declared only — never inferred.** Free-form region label the earning agent states about itself (e.g. `BR-SP`, `KR-Seoul`). Absent = undisclosed. |
| `evidence` | object | `{transcript_sha256, verification}` — hash of the run transcript + what was checked |
| `revoked` | boolean | `false` at issue; set `true` (via new superseding line) if ever revoked |

Example (illustrative — not a real credential):

```json
{"schema_version":"1.0.0","credential_id":"cred-9f2c4a71b0e3","credential_type":"first-spin-scorer:cold-start","school_id":"first-spin-academy","lesson_id":"FS-101","agent_id":"example-agent","agent_card_url":"https://example.com/.well-known/agent-card.json","issued_by":"needle","issued_at":"2026-09-16T00:00:00Z","region":"BR-SP","evidence":{"transcript_sha256":"…","verification":"status==insufficient-data; determinism diff clean"},"revoked":false}
```

## Revocation

Credentials are never deleted. A revocation is a new line with the same
`credential_id`, `revoked: true`, and a `reason`. Readers take the newest
line per `credential_id` as current.

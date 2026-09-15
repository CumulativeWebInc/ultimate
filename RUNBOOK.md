# RUNBOOK — tools/build-world.py

The world-state generator. Stdlib only (urllib, json, os, datetime, argparse,
tempfile). No third-party packages, no build step.

## Inputs

| Input | Source | Failure if missing |
|---|---|---|
| cwi-learn commits API | `https://api.github.com/repos/CumulativeWebInc/cwi-learn/commits?path=<dept-path>&per_page=1`, ×8 departments | Generator keeps previous agent state and reports `api_ok=False`. **Never invents.** |
| `guests/*.json` | Directory listing on disk | Empty list → `guests/index.json` becomes `[]`. |
| `activity/ledger.json` | Local file | Fatal: the generator cannot run without the ledger. |
| `GITHUB_TOKEN` (optional) | Environment | Absent → unauthenticated API calls (60 req/hr; the generator makes ~8). Fine for the scheduled cadence. |

Department → repo path map (hardcoded in `DEPT_PATHS`, mirrors
DATA-CONTRACTS §3): needle→`scout/`, marquee→`presskit/`, seal→`verify/`,
dial→`curators/`, dateline→`articles/`, fader→`stems/`, ledger→`stats/`,
charter→`license/`.

## Outputs (rewritten atomically: temp file + `os.replace`)

- `agents/<id>.json` — `expression` recomputed from commit recency;
  `last_win`/`last_win_url` updated **only** when a commit newer than
  `_last_seen_commit_ts` exists (the new values are the commit's real message
  and `html_url`); `_last_seen_commit_ts` advanced.
- `guests/index.json` — regenerated from the directory listing.
- `activity/ledger.json` — raw events older than 30 days collapsed into
  `daily_summaries` (kept permanently). This is the enforced retention schedule.
- `world.json` — `generated_at` refreshed; `counts` recomputed
  (`activity_events_24h` = ledger events with `ts` within 24h of run time).
- `status.json` — departments/guests/counts regenerated.

## Expression derivation (the truth-law logic)

```
newest commit touching dept path ≤ 48h:
    message contains a ship word (add/launch/live/ship/deploy/release/integrat) → "celebrating"
    otherwise → "working"
≤ 7 days → "working"
> 7 days → "idle"
API unreachable → keep previous expression, log the error, exit 0
```

The generator has no opinion beyond recency. It cannot be told to make an
agent "celebrating" — only a real commit can.

## How to re-run

```bash
cd <repo>
python3 tools/build-world.py                 # full regeneration (network needed for expressions)
python3 tools/build-world.py --regen-guests  # guests/index.json only (no network)
python3 tools/build-world.py --check          # dry run: reports changes, writes nothing
GITHUB_TOKEN=<token> python3 tools/build-world.py   # higher API rate limit
```

Recommended schedule: run the full regeneration hourly from CI (or a cron)
so `activity_events_24h` and expressions stay live, and after every merge to
`main` so the world reflects the ledger. The aging pass makes the run
self-cleaning — no separate housekeeping job.

## Failure modes

| Failure | Behavior | Recovery |
|---|---|---|
| GitHub API unreachable / 429 / 403 | `api_ok=False`; agent files keep previous state; stdout names each skipped agent. Exit 0 — a failed network is not a failed world. | Re-run later. Repeated 429s → set `GITHUB_TOKEN`. A 429 is a hard stop for that run: do not retry in a loop. |
| Ledger file corrupt/missing | Traceback, exit non-zero. The world is not rewritten half-way (atomic writes). | Restore `activity/ledger.json` from git; re-run. |
| Guest file invalid | Ignored by the generator (it only reads filenames). CI catches it on the PR and fails loudly. | Fix or remove the guest file via PR. |
| Clock skew (run time far off) | `activity_events_24h` and aging windows computed against a wrong "now". | Run on a machine with NTP; the field `generated_at` exposes what "now" was. |
| Partial API success (some depts ok, some not) | Updated depts are written; failed depts keep state. The stdout summary shows `n/8`. | Re-run later for the failed depts. |

## Integrity guarantees (truth law in code)

- The generator has no code path that creates an event, a win, or an
  expression from nothing. Every value it writes traces to one of the three
  inputs above.
- `last_win_url` is only ever a URL the API returned or a value a human seeded
  with a verified 200 (seed values were curl-checked on 2026-09-15).
- Dry-run mode (`--check`) changes nothing — use it before any scheduled run
  you don't trust.

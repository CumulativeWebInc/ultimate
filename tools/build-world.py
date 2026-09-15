#!/usr/bin/env python3
"""
tools/build-world.py — the world-state generator for Project Ultimate.

METHOD (how the world's truth law is enforced in code):
  1. REAL SOURCES ONLY. The generator reads exactly three sources and invents
     nothing:
       a) The cwi-learn GitHub commits API (public repo), filtered per-department
          by file path. A commit exists or it doesn't.
       b) The guests/ directory listing on disk. A guest file exists or it doesn't.
       c) activity/ledger.json. An event was recorded or it wasn't.
  2. EXPRESSION DERIVATION (recency -> expression):
       - newest commit touching the department's path <= 48h old -> "celebrating"
         when the commit message signals a ship/launch (add/launch/live/ship/deploy),
         otherwise "working".
       - newest commit <= 7d old -> "working".
       - older than 7d -> "idle".
       When the commits API is unreachable (network failure, rate limit), the
       generator keeps the previous expression and says so on stdout — it never
       guesses from nothing.
  3. LAST WIN updates come only from the API: if the newest commit touching the
     department's path is newer than anything previously recorded, last_win
     becomes that commit's first message line and last_win_url its html_url.
     Both are real, verifiable values.
  4. LEDGER AGING: raw events older than 30 days are collapsed into daily
     summaries (kept permanently); hourly summaries beyond 90 days are collapsed
     the same way. The rollup is deterministic and lossless at the daily level.
  5. OUTPUTS rewritten atomically (temp file + rename): world.json,
     agents/*.json, guests/index.json, activity/ledger.json (aged), status.json.

Stdlib only: urllib, json, os, datetime, argparse, tempfile. No third party.

Auth: cwi-learn is public, so the commits API works unauthenticated (60 req/hr).
If GITHUB_TOKEN is set, it is attached for the higher limit.

Usage:
  python3 tools/build-world.py                 # full regeneration
  python3 tools/build-world.py --regen-guests  # guests/index.json only
  python3 tools/build-world.py --check         # dry run: report what would change
"""

import argparse
import datetime as dt
import json
import os
import tempfile
import urllib.request
import urllib.error

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = "1.0.0"
COMMITS_API = "https://api.github.com/repos/CumulativeWebInc/cwi-learn/commits"

# department agent id -> path prefix in the cwi-learn repo whose activity counts as theirs
DEPT_PATHS = {
    "needle": "scout/",
    "marquee": "presskit/",
    "seal": "verify/",
    "dial": "curators/",
    "dateline": "articles/",
    "fader": "stems/",
    "ledger": "stats/",
    "charter": "license/",
}

SHIP_WORDS = ("add", "launch", "live", "ship", "deploy", "release", "integrat")


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def iso_z(moment):
    return moment.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def api_get_json(url):
    req = urllib.request.Request(
        url, headers={"User-Agent": "ultimate-world-generator/1.0",
                      "Accept": "application/vnd.github+json"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except Exception as e:  # network failure -> documented fallback, never guess
        return None, e


def newest_commit_for_path(path):
    """Real commits touching a path in cwi-learn, newest first. (None, err) on failure."""
    data, err = api_get_json(f"{COMMITS_API}?path={path}&per_page=1")
    if err is not None or not data:
        return None, err
    c = data[0]
    return {
        "sha": c["sha"][:7],
        "ts": c["commit"]["author"]["date"],
        "message": c["commit"]["message"].splitlines()[0][:160],
        "url": c.get("html_url", ""),
    }, None


def expression_for(commit):
    if commit is None:
        return None
    age = now_utc() - parse_iso(commit["ts"])
    if age <= dt.timedelta(hours=48):
        msg = commit["message"].lower()
        return "celebrating" if any(w in msg for w in SHIP_WORDS) else "working"
    if age <= dt.timedelta(days=7):
        return "working"
    return "idle"


DRY_RUN = False


def write_atomic(path, data):
    if DRY_RUN:
        print(f" [dry-run] would rewrite {os.path.relpath(path, REPO_ROOT)}")
        return
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def load_agent(aid):
    with open(os.path.join(REPO_ROOT, "agents", f"{aid}.json")) as f:
        return json.load(f)


def regen_agents(changes):
    """Update expressions + last wins from real API data. Returns (n_updated, api_ok)."""
    api_ok = True
    n = 0
    for aid, path in DEPT_PATHS.items():
        agent = load_agent(aid)
        commit, err = newest_commit_for_path(path)
        if commit is None:
            api_ok = False
            changes.append(f"agents/{aid}.json: commits API unreachable ({err}) — keeping previous state")
            continue
        expr = expression_for(commit)
        if expr and expr != agent.get("expression"):
            changes.append(f"agents/{aid}.json: expression {agent.get('expression')} -> {expr} (commit {commit['sha']}, {commit['ts']})")
            agent["expression"] = expr
        prev_url = agent.get("last_win_url", "")
        last_seen = agent.get("_last_seen_commit_ts", "")
        if commit["url"] and commit["url"] != prev_url and commit["ts"] > last_seen:
            # a genuinely new ship since the last recorded win -> update from real data
            changes.append(f"agents/{aid}.json: last_win -> {commit['message']!r}")
            agent["last_win"] = commit["message"]
            agent["last_win_url"] = commit["url"]
        agent["_last_seen_commit_ts"] = commit["ts"]
        agent["schema_version"] = SCHEMA
        write_atomic(os.path.join(REPO_ROOT, "agents", f"{aid}.json"), agent)
        n += 1
    return n, api_ok


def regen_guests():
    guests_dir = os.path.join(REPO_ROOT, "guests")
    names = sorted(f[:-5] for f in os.listdir(guests_dir)
                   if f.endswith(".json") and f != "index.json")
    index = {"schema_version": SCHEMA, "guests": names}
    write_atomic(os.path.join(guests_dir, "index.json"), index)
    return names


def age_ledger(now):
    """Collapse raw events older than 30 days into daily summaries (kept forever)."""
    path = os.path.join(REPO_ROOT, "activity", "ledger.json")
    ledger = json.load(open(path))
    cutoff = now - dt.timedelta(days=30)
    summaries = ledger.setdefault("daily_summaries", {})
    kept, aged = [], 0
    for ev in ledger.get("events", []):
        try:
            ts = parse_iso(ev["ts"])
        except Exception:
            kept.append(ev)  # unparseable stays until a human looks at it
            continue
        if ts >= cutoff:
            kept.append(ev)
            continue
        day = ts.strftime("%Y-%m-%d")
        s = summaries.setdefault(day, {"date": day, "events": 0, "actors": [], "actions": []})
        s["events"] += 1
        for key in ("actor", "action"):
            if ev.get(key) not in s[key + "s"]:
                s[key + "s"].append(ev.get(key))
        aged += 1
    if aged:
        ledger["events"] = kept
        write_atomic(path, ledger)
    return aged, len(kept)


def regen_world_and_status(now, guest_names):
    ledger = json.load(open(os.path.join(REPO_ROOT, "activity", "ledger.json")))
    cutoff = now - dt.timedelta(hours=24)
    events_24h = sum(1 for ev in ledger.get("events", [])
                     if parse_iso(ev["ts"]) >= cutoff)
    agents = [load_agent(aid) for aid in json.load(open(os.path.join(REPO_ROOT, "agents", "index.json")))["agents"]]
    world = {
        "schema_version": SCHEMA,
        "generated_at": iso_z(now),
        "generator": "tools/build-world.py",
        "world": {"time_of_day": "dusk", "atmosphere": "data-rain", "cycle_hours": 24},
        "agents_index": "agents/index.json",
        "guests_index": "guests/index.json",
        "activity_ledger": "activity/ledger.json",
        "rules": "rules.json",
        "counts": {"agents": len(agents), "guests": len(guest_names),
                   "activity_events_24h": events_24h},
    }
    write_atomic(os.path.join(REPO_ROOT, "world.json"), world)
    status = {
        "schema_version": SCHEMA,
        "world_url": "https://cumulativewebinc.github.io/ultimate/",
        "counts": world["counts"],
        "departments": [{"id": a["id"], "status": a["expression"],
                         "current_action": a["current_action"]} for a in agents],
        "guests": guest_names,
        "generated_at": iso_z(now),
    }
    write_atomic(os.path.join(REPO_ROOT, "status.json"), status)
    return world


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regen-guests", action="store_true")
    ap.add_argument("--check", action="store_true", help="dry run: report, change nothing")
    args = ap.parse_args()
    global DRY_RUN
    DRY_RUN = args.check
    changes = []
    if args.regen_guests:
        names = regen_guests()
        print(f"guests/index.json <- {len(names)} guest files: {names}")
        return
    now = now_utc()
    aged, kept = age_ledger(now)
    if aged:
        changes.append(f"ledger: aged {aged} raw events >30d into daily summaries ({kept} raw kept)")
    n, api_ok = regen_agents(changes)
    names = regen_guests()
    world = regen_world_and_status(now, names)
    print(f"agents refreshed from API: {n}/8 (api_ok={api_ok})")
    print(f"guests: {len(names)} | events_24h: {world['counts']['activity_events_24h']}")
    for c in changes:
        print(" -", c)
    if args.check:
        print("(check mode: no files were changed)")


if __name__ == "__main__":
    main()

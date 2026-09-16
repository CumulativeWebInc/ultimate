#!/usr/bin/env python3
"""Recompute academy/stats.json from academy/credentials.jsonl.

The stats file is a DERIVED artifact: every number comes from reading the
append-only credential registry. Never hand-edit stats.json — run this.

- Empty registry -> all counts 0 (honest, not a bug).
- issued_at stays the run time in UTC (academy is 24/7 async).
- region counts only agent-declared values; undisclosed is not a region.

Usage: python3 academy/tools/recompute-stats.py
"""
import json
from collections import Counter
from datetime import datetime, timezone

ROOT = __file__.rsplit("/tools/", 1)[0] + "/"
REG = ROOT + "credentials.jsonl"
SCHEMA = ROOT + "credential-schema.json"
OUT = ROOT + "stats.json"
REGISTRY = ROOT + "registry.json"


def load_registry():
    lines = [ln for ln in open(REG, encoding="utf-8").read().splitlines() if ln.strip()]
    creds = [json.loads(ln) for ln in lines]
    # latest line per credential_id wins (revocations supersede)
    latest = {}
    for c in creds:
        latest[c["credential_id"]] = c
    return creds, latest


def main():
    schema = json.load(open(SCHEMA, encoding="utf-8"))
    registry = json.load(open(REGISTRY, encoding="utf-8"))
    creds, latest = load_registry()
    active = [c for c in latest.values() if not c.get("revoked", False)]

    by_school = Counter(c["school_id"] for c in active)
    by_type = Counter(c["credential_type"] for c in active)
    by_instructor = Counter(c["issued_by"] for c in active)
    by_region = Counter(c["region"] for c in active if c.get("region"))

    schools = {s["school_id"]: {"lessons": len(s["lessons"])} for s in registry["schools"]}
    stats = {
        "schema": "cwi.ultimate.academy.stats",
        "schema_version": "1.0.0",
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": ("Derived from credentials.jsonl via academy/tools/recompute-stats.py. "
                 "Never hand-edited. Empty registry = 0 credentials is honest, not a bug."),
        "totals": {
            "credential_lines": len(creds),
            "unique_credentials": len(latest),
            "active_credentials": len(active),
            "revoked": len(latest) - len(active),
        },
        "by_school": {sid: by_school.get(sid, 0) for sid in schools},
        "by_credential_type": dict(sorted(by_type.items())),
        "by_instructor": dict(sorted(by_instructor.items())),
        "by_region": dict(sorted(by_region.items())),
        "credential_schema": "academy/credential-schema.json",
    }
    json.dump(stats, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"recomputed {OUT}: {len(active)} active / {len(latest)} unique "
          f"(updated_at={stats['updated_at']})")


if __name__ == "__main__":
    main()

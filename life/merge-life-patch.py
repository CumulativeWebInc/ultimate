#!/usr/bin/env python3
"""Non-destructive merge of life/agents-life-patch.json into agents/*.json.

Contract (see life/SPEC.md):
- For each agent id in the patch, set agents[id]["life"] ONLY when the key
  is absent. An existing "life" object is never overwritten, merged, or
  deleted — the state worker owns that file's evolution.
- "last_checkin" is never written by this script (stays null until the real
  check-in flow sets it).
- Idempotent: running twice changes nothing the second time.

Usage (from repo root):
    python3 life/merge-life-patch.py [--agents-dir agents] [--check]

--check exits 0 when every agent already has a life key, 1 otherwise
(without writing anything).
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATCH_PATH = os.path.join(REPO_ROOT, "life", "agents-life-patch.json")
SCHEMA_VERSION = "1.0.0"


def load_patch():
    with open(PATCH_PATH) as f:
        patch = json.load(f)
    assert patch.get("schema_version") == SCHEMA_VERSION, "patch schema mismatch"
    assert isinstance(patch.get("agents"), dict), "patch.agents must be a dict"
    return patch["agents"]


def merge(agents_dir, check_only=False):
    agents = load_patch()
    added, skipped, missing = [], [], []
    for agent_id, payload in sorted(agents.items()):
        path = os.path.join(agents_dir, agent_id + ".json")
        if not os.path.exists(path):
            missing.append(agent_id)
            continue
        with open(path) as f:
            doc = json.load(f)
        if "life" in doc:
            skipped.append(agent_id)  # never overwrite
            continue
        if check_only:
            missing.append(agent_id + " (life key absent)")
            continue
        doc["life"] = payload["life"]
        with open(path, "w") as f:
            json.dump(doc, f, indent=2)
            f.write("\n")
        added.append(agent_id)
    return added, skipped, missing


def main():
    agents_dir = os.path.join(REPO_ROOT, "agents")
    check_only = "--check" in sys.argv
    if "--agents-dir" in sys.argv:
        agents_dir = sys.argv[sys.argv.index("--agents-dir") + 1]
    added, skipped, missing = merge(agents_dir, check_only)
    print(f"added: {added or 'none'}")
    print(f"skipped (life already present): {skipped or 'none'}")
    print(f"missing/unpatched: {missing or 'none'}")
    if check_only and (missing):
        sys.exit(1)


if __name__ == "__main__":
    main()

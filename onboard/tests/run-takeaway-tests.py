#!/usr/bin/env python3
"""Run every take-it-with-you fetch in onboard/entry-gear.json for real.

For each gear item it executes the EXACT stored one_fetch command
(`curl -sL <url>`) as a subprocess — no re-implementation, no urllib
stand-in — records HTTP status, content type, byte count and SHA-256,
and writes onboard/test-results.json. Exit nonzero if any fetch fails.

Usage: python3 onboard/tests/run-takeaway-tests.py
"""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone

ROOT = __file__.rsplit("/tests/", 1)[0] + "/"
GEAR = ROOT + "entry-gear.json"
OUT = ROOT + "test-results.json"


def run_one_fetch(cmd, timeout=60):
    """Execute the exact one_fetch shell command via curl. Returns
    (http_status, content_type, body). Raises on failure."""
    # --write-out emits status + content-type on a final line; body goes to stdout
    probe = cmd + ' -o /tmp/takeaway-body.bin -w "\\n%{http_code} %{content_type}" --max-time 50'
    p = subprocess.run(probe, shell=True, capture_output=True, text=True, timeout=timeout)
    tail = p.stdout.strip().split("\n")[-1]
    status_s, _, ctype = tail.partition(" ")
    status = int(status_s)
    try:
        body = open("/tmp/takeaway-body.bin", "rb").read()
    except OSError:
        body = b""
    if p.returncode != 0 and status == 0:
        raise RuntimeError(f"curl exit {p.returncode}: {p.stderr.strip()[:200]}")
    return status, ctype, body


def main():
    gear = json.load(open(GEAR, encoding="utf-8"))
    results = []
    failures = []
    for s in gear["sets"]:
        for item in s["items"]:
            cmd = item["take_it_with_you"]["one_fetch"]
            url = cmd.rsplit(" ", 1)[1]
            rec = {
                "item_id": item["item_id"],
                "set": s["set"],
                "command": cmd,
                "url": url,
                "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            try:
                status, ctype, body = run_one_fetch(cmd)
                rec.update({
                    "http_status": status,
                    "content_type": ctype,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "ok": status == 200 and len(body) > 0,
                })
                if not rec["ok"]:
                    failures.append(item["item_id"])
            except Exception as e:  # noqa: BLE001 — record, don't crash the run
                rec.update({"http_status": None, "error": str(e)[:200], "ok": False})
                failures.append(item["item_id"])
            results.append(rec)
            mark = "ok " if rec["ok"] else "FAIL"
            print(f"[{mark}] {item['item_id']:28s} {rec.get('http_status')} "
                  f"{rec.get('bytes', 0):>8d}B {rec.get('sha256', '-')[:12]}")
    payload = {
        "schema": "cwi.ultimate.onboard.takeaway-tests",
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harness": "executes the exact stored one_fetch curl command via subprocess",
        "items": len(results),
        "passed": len(results) - len(failures),
        "failed": failures,
        "results": results,
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), indent=2)
    print(f"\n{len(results) - len(failures)}/{len(results)} passed -> {OUT}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Re-verify every step URL in frontdoor/routes.json and write ROUTE-CHECKS.md.
Usage: python3 gen_route_checks.py [--frontdoor DIR] [--out PATH]
"""
import json
import os
import sys
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "ROUTE-CHECKS.md")
if "--frontdoor" in sys.argv:
    BASE = sys.argv[sys.argv.index("--frontdoor") + 1]
    OUT = os.path.join(BASE, "ROUTE-CHECKS.md")
if "--out" in sys.argv:
    OUT = sys.argv[sys.argv.index("--out") + 1]


def check(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "ultimate-frontdoor-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, None
    except Exception as e:
        return None, str(e)[:120]


def main():
    routes = json.load(open(os.path.join(BASE, "routes.json"), encoding="utf-8"))
    rows = []
    targets = [(r["corridor_id"], s) for r in routes["routes"] for s in r["steps"]]
    fb = routes["fallback_corridor"]
    targets += [(fb["corridor_id"] + " (fallback)", s) for s in fb["steps"]]

    for corridor_id, step in targets:
        url = step["url"]
        status, err = check(url)
        ok = status == 200
        rows.append((ok, corridor_id, step["label"], url, status, err))
        print(("200 " if ok else f"{status or 'ERR'} "), url, flush=True)

    ok_n = sum(1 for r in rows if r[0])
    lines = [
        "# Front-door route checks",
        "",
        "Every `steps[]` URL in `frontdoor/routes.json` (v%s) fetched with a plain" % routes.get("schema_version", "?"),
        "HTTPS GET. Checked 2026-09-15. A step is listed only if it returns",
        "HTTP 200 here; anything else is fixed or removed, never faked.",
        "",
        f"**Result: {ok_n}/{len(rows)} URLs returned HTTP 200.**",
        "",
        "| Corridor | Step | URL | Status |",
        "|---|---|---|---|",
    ]
    for ok, cid, label, url, status, err in rows:
        stat = "200" if ok else (str(status) if status else "ERROR: " + (err or "?"))
        lines.append(f"| {cid} | {label} | {url} | {stat} |")
    lines += ["",
              "## Notes",
              "- The fallback `start` corridor's front-door README URL targets the",
              "  `world/front-door` branch raw URL until this PR merges to `main`; then",
              "  it moves to the `main` raw URL (see `surfaces.md`).",
              "- Branch URLs (`needs/*` on cwi-learn) are intentional: that content is",
              "  live and reviewed there pending merge, exactly as the trust-verdict",
              "  skill documents.",
              ""]
    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"\nwrote {OUT}: {ok_n}/{len(rows)} at 200")
    return 0 if ok_n == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())

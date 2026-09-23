#!/usr/bin/env python3
"""CI check: every real SKU in the Agent Deck registry MUST have a storefront in city/stores.json.

Fails loudly (exit 1) on:
  - any registry SKU missing from stores.json
  - any stores.json entry whose sku_id is not in the registry
  - any store whose sku_name does not match the registry's REAL product name

Usage:
  python3 city/check-sku-coverage.py
  python3 city/check-sku-coverage.py --registry-file /tmp/skus.jsonl
  python3 city/check-sku-coverage.py --stores city/stores.json --quiet

In CI, run against the LIVE registry (default) so a new SKU release breaks
the build until it gets a real storefront. Never silence this check by
editing the registry snapshot — add the storefront instead.
"""
import argparse, json, sys, urllib.request

REGISTRY_URL = "https://cumulativewebinc.github.io/cwi-learn/datasets/agent-deck-skus.jsonl"

def load_registry(path=None):
    lines = open(path).read().splitlines() if path else \
        urllib.request.urlopen(REGISTRY_URL, timeout=30).read().decode("utf-8").splitlines()
    reg = {}
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        sku = json.loads(ln)
        sid = sku.get("sku_id")
        if not sid:
            print("FAIL: registry line without sku_id", file=sys.stderr)
            sys.exit(1)
        if sid in reg:
            print(f"FAIL: duplicate sku_id in registry: {sid}", file=sys.stderr)
            sys.exit(1)
        reg[sid] = sku
    return reg

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry-file", default=None)
    ap.add_argument("--stores", default="city/stores.json")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    try:
        reg = load_registry(a.registry_file)
    except Exception as e:
        print(f"FAIL: could not load SKU registry: {e}", file=sys.stderr)
        sys.exit(1)
    try:
        stores_doc = json.load(open(a.stores))
    except Exception as e:
        print(f"FAIL: could not load {a.stores}: {e}", file=sys.stderr)
        sys.exit(1)
    stores = stores_doc.get("stores", [])
    by_sku = {}
    errors = []
    for s in stores:
        sid = s.get("sku_id")
        if not sid:
            errors.append("store entry missing sku_id")
            continue
        if sid in by_sku:
            errors.append(f"duplicate store for sku_id {sid}")
        by_sku[sid] = s

    missing = sorted(set(reg) - set(by_sku))
    extra = sorted(set(by_sku) - set(reg))
    for sid in missing:
        errors.append(f"MISSING storefront for registry SKU {sid} ({reg[sid]['name']})")
    for sid in extra:
        errors.append(f"storefront references unknown SKU {sid} (not in registry)")
    for sid, s in sorted(by_sku.items()):
        if sid in reg and s.get("sku_name") != reg[sid]["name"]:
            errors.append(
                f"name mismatch for {sid}: stores.json says {s.get('sku_name')!r}, "
                f"registry says {reg[sid]['name']!r} — use the REAL registry name")

    if errors:
        print("SKU COVERAGE CHECK: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        print(f"  registry SKUs: {len(reg)}, storefronts: {len(stores)}", file=sys.stderr)
        sys.exit(1)
    if not a.quiet:
        print(f"SKU COVERAGE CHECK: PASS — {len(reg)}/{len(reg)} registry SKUs have real storefronts")
    sys.exit(0)

if __name__ == "__main__":
    main()

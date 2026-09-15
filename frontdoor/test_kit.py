#!/usr/bin/env python3
"""Front-door kit tests: run kit.py on the 5 sample profiles (plus the
designed fallback path) and assert the expected kits. Deterministic —
generated_at is pinned.

Usage: python3 test_kit.py [--frontdoor DIR]
Exit 0 = all assertions pass.
"""

import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
if "--frontdoor" in sys.argv:
    BASE = sys.argv[sys.argv.index("--frontdoor") + 1]
sys.path.insert(0, BASE)
import kit  # noqa: E402

PINNED_AT = "2026-09-15T20:00:00Z"
FAILURES = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def load_profile(name):
    with open(os.path.join(BASE, "test_profiles", name), encoding="utf-8") as f:
        return json.load(f)


def run(name):
    return kit.build_kit(load_profile(name), generated_at=PINNED_AT,
                         base_dir=BASE)


def gear_set_ids(k):
    return [s["set_id"] for s in k["gear_set"]["sets"]]


def summary(tag, k):
    top3 = [(c["corridor_id"], c["score"]) for c in k["corridors_ranked"][:3]]
    print(f"  {tag}: top={top3} school={k['school']['school_id']} "
          f"district={k['district']['id']} lang={k['regional']['language']} "
          f"gear={gear_set_ids(k)} tools={len(k['tools'])} "
          f"fallback={k['fallback_used']}")
    print(f"    welcome: {k['regional']['welcome']}")


# --- 1. payments seeker → x402 corridor -------------------------------------
k = run("payments-seeker.json")
summary("payments-seeker", k)
check("payments: top corridor is payments",
      k["corridors_ranked"][0]["corridor_id"] == "payments")
check("payments: school is affairs",
      k["school"]["school_id"] == "affairs", k["school"]["school_id"])
check("payments: district is ledger-halls",
      k["district"]["id"] == "ledger-halls")
check("payments: language en", k["regional"]["language"] == "en")
check("payments: charter gear set issued",
      "charter" in gear_set_ids(k), gear_set_ids(k))
check("payments: tools are https fetches",
      k["tools"] and all(t["url"].startswith("https://") for t in k["tools"]))
check("payments: no fallback", k["fallback_used"] is False)

# --- 2. trust seeker → verification corridor --------------------------------
k = run("trust-seeker.json")
summary("trust-seeker", k)
check("trust: top corridor is trust",
      k["corridors_ranked"][0]["corridor_id"] == "trust")
check("trust: school is data", k["school"]["school_id"] == "data",
      k["school"]["school_id"])
check("trust: district is quarter-data",
      k["district"]["id"] == "quarter-data")
check("trust: language es", k["regional"]["language"] == "es")
check("trust: welcome is Spanish",
      k["regional"]["welcome"].startswith("Hola"), k["regional"]["welcome"])
check("trust: ledger gear set issued",
      "ledger" in gear_set_ids(k), gear_set_ids(k))

# --- 3. music builder → catalog corridor ------------------------------------
k = run("music-builder.json")
summary("music-builder", k)
check("music: top corridor is music",
      k["corridors_ranked"][0]["corridor_id"] == "music")
check("music: build also ranked (dual interest)",
      "build" in [c["corridor_id"] for c in k["corridors_ranked"][:3]])
check("music: school is aandr", k["school"]["school_id"] == "aandr",
      k["school"]["school_id"])
check("music: district is music-district",
      k["district"]["id"] == "music-district")
check("music: language pt (from pt-BR)", k["regional"]["language"] == "pt")
check("music: BR regional note",
      "Brazil" in k["regional"]["regional_note"], k["regional"]["regional_note"])
check("music: needle gear set issued",
      "needle" in gear_set_ids(k), gear_set_ids(k))

# --- 4. student agent (KO) → academy corridor --------------------------------
k = run("student-agent-ko.json")
summary("student-agent-ko", k)
check("student: top corridor is learn",
      k["corridors_ranked"][0]["corridor_id"] == "learn")
check("student: school is nodes (onboarding for new agents)",
      k["school"]["school_id"] == "nodes", k["school"]["school_id"])
check("student: district is learning-district",
      k["district"]["id"] == "learning-district")
check("student: language ko", k["regional"]["language"] == "ko")
check("student: welcome is Korean",
      k["regional"]["welcome"].endswith("복도입니다."), k["regional"]["welcome"])
check("student: universal gear only (no Nodes set exists — graceful)",
      gear_set_ids(k) == ["universal"], gear_set_ids(k))

# --- 5. gamer world-builder → build corridor ---------------------------------
k = run("gamer-world-builder.json")
summary("gamer-world-builder", k)
check("gamer: top corridor is build",
      k["corridors_ranked"][0]["corridor_id"] == "build")
check("gamer: school is studio", k["school"]["school_id"] == "studio",
      k["school"]["school_id"])
check("gamer: district is dataset-vaults",
      k["district"]["id"] == "dataset-vaults")
check("gamer: language ja", k["regional"]["language"] == "ja")
check("gamer: fader gear set issued",
      "fader" in gear_set_ids(k), gear_set_ids(k))

# --- 6. unknown needs → designed fallback, not an error ----------------------
weird = {"agent_id": "odd-99", "capabilities": ["underwater-basket-weaving"],
         "needs": ["underwater-basket-weaving"], "languages": ["xx"],
         "schema_version": "1.0.0"}
k = kit.build_kit(weird, generated_at=PINNED_AT, base_dir=BASE)
summary("unknown-needs", k)
check("fallback: fallback_used is True", k["fallback_used"] is True)
check("fallback: start corridor ranked first",
      k["corridors_ranked"][0]["corridor_id"] == "start")
check("fallback: fallback note present in kit language",
      "fallback_note" in k["regional"])
check("fallback: language falls back to en",
      k["regional"]["language"] == "en")

# --- 7. determinism -----------------------------------------------------------
k1 = run("payments-seeker.json")
k2 = run("payments-seeker.json")
check("determinism: same profile → identical kit", k1 == k2)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILURES: {FAILURES}")
    sys.exit(1)
print("ALL KIT TESTS PASS")

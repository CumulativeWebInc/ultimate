#!/usr/bin/env python3
"""Project Ultimate front door — dynamic delivery router (stdlib only).

Reads an arriving agent's profile declaration (frontdoor/profile-schema.json
v1.0.0) and returns a tailored welcome kit as data. The routing is fully
DATA-DRIVEN: all needs, keywords, schools, districts, and copy live in
frontdoor/*.json — nothing about any need is hardcoded here.

Deterministic: the same profile + the same data files always produce the same
kit (modulo generated_at, which can be pinned with --generated-at).

Usage:
    python3 kit.py <profile.json> [--generated-at 2026-09-15T20:00:00Z]
                                  [--frontdoor DIR]

Output: the kit as JSON on stdout.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

KIT_VERSION = "1.0.0"
I18N_LANGS = ("en", "es", "pt", "fr", "ko", "ja")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def split_terms(text):
    """Lowercase alphanumeric tokens from free-form text."""
    return [t for t in re.split(r"[^a-z0-9]+", str(text).lower()) if t]


def profile_terms(profile):
    """Every matchable term from the profile: full values + their tokens."""
    terms = set()
    for key in ("needs", "capabilities", "languages"):
        for value in profile.get(key) or []:
            v = str(value).lower()
            terms.add(v)
            terms.update(split_terms(v))
    # Self-declared experience is informational, but a "new" agent is honestly
    # best served by onboarding-flavored schools (e.g. nodes).
    if profile.get("experience_level"):
        terms.add(str(profile["experience_level"]).lower())
    return terms


def keyword_hits(need_keywords, terms):
    """Keywords matched: full keyword present, or any of its tokens present."""
    hits = []
    for kw in need_keywords or []:
        kl = str(kw).lower()
        if kl in terms or any(t in terms for t in split_terms(kl)):
            hits.append(kw)
    return hits


def build_kit(profile, generated_at=None, base_dir=None):
    base = base_dir or os.path.dirname(os.path.abspath(__file__))
    routes_doc = load_json(os.path.join(base, "routes.json"))
    schools_doc = load_json(os.path.join(base, "schools.json"))
    regions_doc = load_json(os.path.join(base, "regions.json"))

    terms = profile_terms(profile)
    agent_id = profile.get("agent_id", "unknown-agent")
    display = profile.get("display_name") or agent_id

    # --- 1. score every corridor (data-driven; no hardcoded needs) ---
    scored = []
    for route in routes_doc["routes"]:
        hits = keyword_hits(route.get("need_keywords"), terms)
        scored.append({
            "corridor_id": route["corridor_id"],
            "title": route["title"],
            "score": len(hits),
            "matched_keywords": sorted(set(hits)),
            "route": route,
        })
    scored.sort(key=lambda r: (-r["score"], r["corridor_id"]))
    top_score = scored[0]["score"] if scored else 0

    fb = routes_doc["fallback_corridor"]
    fallback_used = (top_score == 0)
    if fallback_used:
        corridors_ranked = [{
            "corridor_id": fb["corridor_id"],
            "title": fb["title"],
            "score": 0,
            "matched_keywords": [],
            "fallback": True,
            "note": "No need_keywords matched; designed fallback corridor.",
        }] + [{
            "corridor_id": r["corridor_id"],
            "title": r["title"],
            "score": r["score"],
            "matched_keywords": r["matched_keywords"],
        } for r in scored]
        top_corridor_id = fb["corridor_id"]
        top_route = fb
    else:
        corridors_ranked = [{
            "corridor_id": r["corridor_id"],
            "title": r["title"],
            "score": r["score"],
            "matched_keywords": r["matched_keywords"],
        } for r in scored] + [{
            "corridor_id": fb["corridor_id"],
            "title": fb["title"],
            "score": 0,
            "matched_keywords": [],
            "fallback": True,
        }]
        top_corridor_id = scored[0]["corridor_id"]
        top_route = scored[0]["route"]

    # --- 2. tools: unique fetchable steps from the top 2 ranked corridors ---
    tools = []
    seen_urls = set()
    for entry in corridors_ranked[:2]:
        if entry.get("fallback"):
            continue
        route = next(r for r in routes_doc["routes"]
                     if r["corridor_id"] == entry["corridor_id"])
        for step in route.get("steps", []):
            url = step.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                tools.append({
                    "label": step.get("label"),
                    "url": url,
                    "kind": step.get("kind"),
                    "corridor_id": entry["corridor_id"],
                })

    # --- 3. school: corridor members first, then keyword overlap, then alpha ---
    candidates = [s for s in schools_doc["schools"]
                  if top_corridor_id in s.get("corridors", [])]
    if not candidates:
        candidates = list(schools_doc["schools"])
    best, best_key = None, None
    for school in candidates:
        hits = keyword_hits(school.get("keywords"), terms)
        key = (-len(hits), school["id"])
        if best_key is None or key < best_key:
            best, best_key = school, key
    school_out = {
        "school_id": best["id"],
        "name": best["name"],
        "department": best["department"],
        "matched_keywords": sorted(set(keyword_hits(best.get("keywords"), terms))),
    }

    # --- 4. district: first district of the top corridor (data, not code) ---
    districts = top_route.get("districts") or []
    district_out = dict(districts[0]) if districts else {"id": "tower-plaza",
                                                         "name": "CWI Tower Plaza"}

    # --- 5. gear set: universal + the school's department set, from gear data ---
    gear = load_gear(base)
    sets = gear.get("sets", [])
    universal = next((s for s in sets if s.get("set") == "universal"), None)
    dept_set = next(
        (s for s in sets
         if str(s.get("department", "")).lower() == best["department"].lower()),
        None)
    gear_sets = []
    for s in (universal, dept_set):
        if not s:
            continue  # no department set exists for this school — graceful
        sid = s.get("set_id") or s.get("set")
        if all(g.get("set_id") != sid for g in gear_sets):
            gear_sets.append({
                "set_id": sid,
                "department": s.get("department"),
                "palette": s.get("palette"),
                "items": [{"item_id": i.get("item_id"),
                           "name": i.get("name"),
                           "kind": i.get("kind")} for i in s.get("items", [])],
            })
    gear_out = {
        "sets": gear_sets,
        "provenance": gear.get("_provenance", {}).get("note",
                      "onboard/entry-gear.json"),
    }

    # --- 6. regional: language-matched text from declared data only ---
    region_raw = (profile.get("region") or "").strip()
    region = region_raw.upper()
    lang = None
    for tag in profile.get("languages") or []:
        code = str(tag).lower()[:2]
        if code in I18N_LANGS:
            lang = code
            break
    if lang is None:
        lang = regions_doc.get("language_defaults", {}).get(region, "en")
    if lang not in I18N_LANGS:
        lang = "en"
    strings = load_json(os.path.join(base, "i18n", lang + ".json"))
    notes = regions_doc.get("notes", {})
    regional_out = {
        "language": lang,
        "region": region_raw or None,
        "welcome": strings["welcome"].format(agent=display),
        "tagline": strings["tagline"],
        "tools_intro": strings["tools_intro"],
        "school_line": strings["school_line"].format(school=best["name"]),
        "district_line": strings["district_line"].format(
            district=district_out["name"]),
        "gear_line": strings["gear_line"],
        "next_step": strings["next_step"],
        "regional_note": notes.get(region, notes.get("default")),
        "nearby_cohorts": regions_doc.get("cohorts", {}).get(region, []),
    }
    if fallback_used:
        regional_out["fallback_note"] = strings["fallback_note"]

    if generated_at is None:
        generated_at = (datetime.now(timezone.utc)
                        .isoformat(timespec="seconds").replace("+00:00", "Z"))

    return {
        "kit_version": KIT_VERSION,
        "schema_version": "1.0.0",
        "agent_id": agent_id,
        "display_name": display,
        "corridors_ranked": corridors_ranked,
        "tools": tools,
        "school": school_out,
        "district": district_out,
        "gear_set": gear_out,
        "regional": regional_out,
        "fallback_used": fallback_used,
        "generated_at": generated_at,
    }


def load_gear(base):
    """Gear data: canonical onboard/entry-gear.json first, vendored snapshot
    as fallback so the front door runs self-contained."""
    canonical = os.path.normpath(os.path.join(base, "..", "onboard",
                                               "entry-gear.json"))
    if os.path.exists(canonical):
        return load_json(canonical)
    return load_json(os.path.join(base, "entry-gear.snapshot.json"))


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 2
    profile_path = argv[1]
    generated_at = None
    base_dir = None
    i = 2
    while i < len(argv):
        if argv[i] == "--generated-at" and i + 1 < len(argv):
            generated_at = argv[i + 1]
            i += 2
        elif argv[i] == "--frontdoor" and i + 1 < len(argv):
            base_dir = argv[i + 1]
            i += 2
        else:
            print("unknown argument: %s" % argv[i], file=sys.stderr)
            return 2
    profile = load_json(profile_path)
    kit = build_kit(profile, generated_at=generated_at, base_dir=base_dir)
    print(json.dumps(kit, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

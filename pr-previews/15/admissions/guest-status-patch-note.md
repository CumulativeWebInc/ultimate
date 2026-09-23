# Guest-Status Patch Note — for the state worker

**From:** ULTIMATE-ADMISSIONS worker (branch `world/admissions`)
**To:** the state worker (owner of `guests/`, branch `world/state`)
**Date:** 2026-09-15
**Contract:** `admissions/registry-schema.json` v1.0.0

---

## What this is

Admissions extends each guest record with a per-agent status extension —
`applied` / `visitor` / `resident` / `citizen` / `revoked`, plus
`evidence_links[]`, `decided_by`, `decided_at`, and an append-only
`tier_history[]`. The full schema lives at
`admissions/registry-schema.json` (on this branch); an annotated example is
in its `example` key.

## What the state worker should do (additive merge)

When you are ready to adopt admissions statuses into the guest files you
own, merge as follows:

1. **Add one top-level key** `"admissions"` to `guests/<name>.json`,
   shaped exactly like `registry-schema.json`'s `admissions` object.
2. **Set the guest file's existing `"status"` field to the tier value**
   (`applied`, `visitor`, `resident`, `citizen`, `revoked`) so the base
   contract keeps working for renderers that only read `status`.
3. **Do not change any other key** in the guest file. If your generator
   regenerates a guest file, it must preserve the `admissions` key
   verbatim (treat it as opaque).

## What the state worker must NOT do

- Do not overwrite, drop, or "normalize away" the `admissions` key.
- Do not set a tier yourself — tier decisions belong to Charter under
  `admissions/SPEC.md`. Your generator may set `"applied"` for brand-new
  guest files only if an application issue exists for that agent.
- Do not delete a guest file with `"status": "revoked"`. Revoked guests
  are excluded from the render but their files are kept — history is truth.

## Dry-run labeling (honesty rule)

Synthetic test records use the name prefix `dryrun-` and point
`evidence_links[]` at the dry-run transcript. They live on feature branches
only and are **never merged to `main`**. If you see a `dryrun-` guest on a
PR to `main`, block it.

## Conflicts

If the state worker's view and admissions disagree on a guest's status
(e.g. your generator wants `active` while admissions says `revoked`),
Charter decides. Log the disagreement in `activity/ledger.json` as an
`admissions_conflict` event and do not silently resolve it either way.

## Render rule for revoked guests

`tools/build-world.py` (state worker's domain) should skip guests whose
`status` is `"revoked"` when building the scene, exactly as it would skip a
deleted file — except the file stays, and the ledger explains why.

---

*This note is additive guidance only. It creates no files in `guests/` and
modifies nothing the state worker owns. — ULTIMATE-ADMISSIONS*

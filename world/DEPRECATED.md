# DEPRECATED — facade-first scene code

**Date:** 2026-09-15
**Directive:** Black — back to the drawing board; rebuild FROM THE SIMULATION OUTWARD.

## What is deprecated

The static-scene implementation approach on branch `world/archipelago`:

- `world.js` — scene engine that draws a fixed archipelago and bolts on
  interactions (camera, trips, feed) as local, non-canonical state.
- `world.css` — its styles.
- `index.html` — its markup.

These files are **kept for reference, not deleted** — the archipelago art
direction, canvas techniques, and DOM patterns in them are the visual
vocabulary the simulation renderer will re-wear.

**2026-09-16 update:** the deprecated root `index.html` (facade markup) was
replaced by the simulation app (`index.html` + `sim.js` + `sim.css` at repo
root, loading the engine from `world/simulation/`). The old facade's
`world.js` / `world.css` remain for reference only and are no longer loaded by
any page.

## What is NOT deprecated (carries over)

- `world/islands.json` (v1.0.0) — the island registry: ids, names, verbs,
  palettes, interiors, positions, bridges. The simulation references it.
- The archipelago art direction itself (tropical-futurist floating islands,
  turquoise water, glowing NAME + verb signage, pavilion interiors, boats,
  palms, holographic globe, CWI logo on everything, gold crown exclusive to
  KingCode).
- The 8 animated avatars in `avatars/`.
- Districts, rules, admissions, marketplace, schools data.

## What replaces it

`world/SIMULATION-DESIGN.md` — the living world simulation design, currently
in **GATE REVIEW** (owner: Black). After approval:

- `world/simulation/` — tick engine, event log, deterministic transitions.
- `world.json` v2.0.0 — simulation state (entities, vessels, arrivals,
  departures, activities, ledger head).
- Renderer re-skinned in the archipelago art, as a **pure function of state**.
- Phase-2 interactivity re-homed as engine intents.

**Rule:** do not extend the deprecated files. New work goes into the
simulation, post-review.

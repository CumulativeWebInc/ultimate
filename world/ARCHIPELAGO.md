# Project Ultimate — Archipelago Art Direction

**Status note (2026-09-15):** the facade-first scene implementation
(`world.js`/`world.css`/`index.html`) is **DEPRECATED** per Black's redesign
directive — see `world/DEPRECATED.md`. The art direction below is retained and
will be re-worn by the simulation renderer. The authoritative design is
`world/SIMULATION-DESIGN.md` (gate review pending).

## The style

Tropical-futurist floating archipelago — the signature look every visual
follows: distinct island pavilions floating over turquoise water, connected by
bridges to a central hub island with a holographic globe. Lush palms, glowing
signage (NAME + three verbs), hyper-detailed pavilion interiors, boats,
ambient life. Vibrant, premium, alive.

## Island registry — `world/islands.json` (v1.0.0)

Data-driven. Schema: `id, name, kind, verbs[3], owner_agent, department,
palette{land,sand,glow,water_edge}, interior_theme, position{x,y},
avatar{dx,dy}, bridges[], sign{}, crown?`. The renderer reads this file; no
island facts are hardcoded in JS.

| Island | Verbs | Owner | Interior |
|---|---|---|---|
| AI HUB (center) | PLAN · WORK · GROW | KingCode 👑 | holographic globe rotunda |
| NEEDLE | SCOUT · VERIFY · SIGN | needle | scout gear lab |
| MARQUEE | PUBLISH · PROMOTE · ENGAGE | marquee | broadcast studio |
| SEAL | LICENSE · CLEAR · PROTECT | seal | licensing vault |
| DIAL | SPIN · PITCH · CHART | dial | radio spin studio |
| DATELINE | WRITE · PLACE · AMPLIFY | dateline | press newsroom |
| FADER | MIX · BUILD · SHIP | fader | content studio |
| LEDGER | COUNT · PROVE · SEAL | ledger | data walls |
| CHARTER | DRAFT · DEAL · GOVERN | charter | deal/governance hall |
| RELAX | REST · RECHARGE · REFLECT | — | pools / lounges |
| IDEAS | DREAM · SKETCH · LAUNCH | — | lighthouse of ideas |
| MARKETPLACE | BROWSE · TRADE · COLLECT | — | market stalls |
| ACADEMY | LEARN · PRACTICE · EARN | — | learning islands |
| DATA VAULT | COMPUTE · STORE · SERVE | — | server spires |

Bridges connect the hub to all 8 departments plus cross-links
(charter↔marketplace/relax, dial/dateline↔ideas, ledger/dateline↔datacenter,
marquee/seal↔academy, needle↔marketplace). Boats ferry the hub spokes.

## Brand rules (enforced)

- CWI logo (`assets/cwi-logo.jpg`) on everything: loading screen, watermark,
  KingCode node, interior overlays, hero composite.
- **Gold crown is exclusive to KingCode's hub.** No other island, agent, or
  sign uses it — enforced in `world/DEPRECATED.md` §brand and carried into
  the simulation design.

## Scene (deprecated implementation — reference)

- `world.js`: canvas sky (24h cycle) + lagoon, islands/bridges/boats drawn from
  `islands.json`; DOM island signs; pooled MP4 avatar nodes placed on islands;
  KingCode crown node on the hub; pan/zoom camera; island interior overlays;
  live agent cards; activity feed from the real ledger; owner controls
  (time-of-day override, follow-agent); bridge-trip animation.
- Graceful degradation: if `world/islands.json` fails, the flat sky stage
  renders (agents at their own x/y). Loading/error/empty states throughout.
- Perf: single rAF loop, cached layout, pooled arrays, no per-frame
  allocation blowup, IntersectionObserver video culling, adaptive quality tiers.

## Map

- `city/archipelago.svg` — archipelago view generated from `world/islands.json`
  (additive; `city/map.svg` kept intact).

## Marketing

- `marketing/hero-archipelago.png` — hero visual; real CWI logo composited via
  script (never redrawn). Source prompt in `marketing/HERO-NOTES.md`.

## Verification (honest)

- ✅ `world/islands.json` parses; schema_version 1.0.0; 14 islands.
- ✅ `node --check world.js` passes.
- ❌ NOT eyeballed: no live browser available to this worker — the deprecated
  scene was never visually rendered. The simulation renderer must be
  browser-verified before it ships.

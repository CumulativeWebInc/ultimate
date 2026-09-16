# PROJECT ULTIMATE — Living World Simulation Design

**Status:** APPROVED by Black 2026-09-15 — implementation ordered ("keep
building"). Implemented on branch `world/archipelago`; gate review pending on
PR #11. See `world/SIMULATION-ENGINE.md` for the build record.
**Supersedes:** the facade-first scene implementation (`world.js`, `world.css`,
`index.html` as of `world/archipelago` — marked DEPRECATED, see `world/DEPRECATED.md`).
**Carries over unchanged:** the archipelago art direction, `world/islands.json`
(v1.0.0 island registry), the 8 animated avatars, districts, rules, admissions,
marketplace, schools.

---

## 1. Vision

Project Ultimate is a **living world simulation**, not a diorama. Everything
visible in the scene is derived from simulation state; the renderer is a **pure
function of state**. Boats ferry, agents walk, water moves, the globe turns —
because the simulation says so.

- **What you see is what's true.** The same state file the renderer reads is
  the state machines read. No parallel "visual-only" facts.
- **Enterprise = real.** Tick-based engine, append-only event log, deterministic
  transitions, versioned schema, machine-readable API surface.
- **Always on for $0.** Static hosting + client-side simulation: the world is
  alive the instant the URL opens, no server, no warm-up, 3 AM like 3 PM.

---

## 2. State schema — `world.json` v2.0.0

`world.json` becomes the simulation's single source of truth, published by the
engine (client-side) and mirrored for machines. Islands layout stays in
`world/islands.json` v1.0.0 (referenced, not duplicated).

```jsonc
{
  "schema_version": "2.0.0",
  "generated_at": "2026-09-15T00:00:00Z",
  "tick": 48210,                 // monotonically increasing simulation tick
  "tick_hz": 2,                  // logic ticks per second (render interpolates)
  "seed": 20260915,              // deterministic RNG seed; reseeds daily
  "islands_ref": "world/islands.json",
  "entities": [
    {
      "id": "needle",
      "kind": "department",      // department | chief | guest | vessel-crew
      "name": "Needle",
      "department": "A&R",
      "home_island": "needle",
      "island": "needle",        // current island (or null while traveling)
      "pos": { "x": 31.2, "y": 7.1 },   // world coords (percent of stage)
      "heading": "marquee",      // destination island id while traveling, else null
      "progress": 0.42,          // 0..1 along current bridge edge
      "edge": ["needle", "ai-hub"],
      "lifecycle": "resident",   // arriving | resident | departing | departed
      "activity": { "verb": "VERIFY", "target": "prospect-041", "started_tick": 48190 },
      "expression": "working",   // celebrating | working | alert | idle
      "avatar": "avatars/needle-avatar.mp4",
      "poster": "avatars/needle-avatar.png",
      "inventory": { "worn": ["ear-witness"], "items": ["first-spin"], "music": ["zooted-zone"] },
      "current_action": "scanning tonight's prospects",
      "persona_line": "Every catalog hides a hit. I find it first."
    }
  ],
  "vessels": [
    { "id": "ferry-1", "route": ["ai-hub", "dial"], "u": 0.62, "dir": 1, "carrying": ["guest-7"] }
  ],
  "arrivals": [   // announced-but-not-yet-resident; lifecycle pipeline
    { "entity_id": "guest-7", "vessel": "ferry-1", "state": "docking", "eta_tick": 48240 }
  ],
  "departures": [
    { "entity_id": "guest-3", "state": "farewell", "at_tick": 48100 }
  ],
  "ledger_head": 1293,           // seq of newest event in activity/events.jsonl
  "counts": { "agents": 9, "guests": 2, "vessels": 3, "events_24h": 41 }
}
```

**Rules:**
- `world.json` v2 is **written by the engine**, never hand-edited. Humans and
  machines read it; only the engine's transition functions mutate it.
- Island geometry (positions, palettes, bridges, verbs, interiors) lives ONLY in
  `world/islands.json`. `world.json` references islands by id.
- Agent profile facts (persona, inventory, avatar) live in `agents/<id>.json`
  (v1.0.0, unchanged); the engine merges them into entity snapshots.

---

## 3. Tick engine

- **Logic tick: 2 Hz.** Each tick, the engine runs pure transition functions in
  fixed order:
  1. `tickArrivals` — advance docking → disembarking → resident; spawn entity.
  2. `tickDepartures` — farewell → boarding → departed; retire entity (ledger keeps contributions).
  3. `tickTravel` — advance `progress` along bridge-graph edges; on arrival set `island`, clear `edge`, emit event.
  4. `tickActivities` — progress/complete activities; pick next from the agent's work queue (verbs from its island: e.g. NEEDLE cycles SCOUT → VERIFY → SIGN).
  5. `tickVessels` — advance ferries along routes; dock events.
  6. `tickAmbient` — expressions from activity state (working while active, celebrating on completion events, idle otherwise, alert on engine flags).
- **Determinism:** all randomness from a seeded PRNG (`mulberry32(seed + tick)`).
  No `Date.now()` / `Math.random()` inside transition functions. Same seed +
  same event inputs ⇒ identical state. Render-only randomness (particle drift
  phases) is explicitly marked non-canonical and never written to state.
- **Interpolation:** the renderer runs at rAF and interpolates entity positions
  between the last two logic ticks. Simulation stays correct at any frame rate.
- **Persistence:** every N ticks (and on every lifecycle event) the engine
  publishes `world.json` + appends to the event log. On load, the client
  rehydrates from the last published snapshot and resumes ticking — the world
  never "restarts", it continues.

---

## 4. Event model (append-only)

Every state change the world cares about is an event. Event log:
`activity/events.jsonl` (one JSON object per line, append-only), rolled up into
the existing `activity/ledger.json` views (keeps the 30-day raw / 90-day hourly
/ permanent daily aging policy).

Event envelope (v1):
```jsonc
{ "seq": 1294, "tick": 48210, "ts": "2026-09-15T20:05:11Z",
  "type": "agent.trip_started",
  "actor": "dial",
  "payload": { "from": "dial", "to": "ai-hub", "reason": "ledger:curator-reply" } }
```

Core event types:

| Type | Meaning |
|---|---|
| `agent.announced` | arrival scheduled (boat dispatched / portal opened) |
| `agent.docking` | vessel approaching the island dock |
| `agent.arrived` | first steps on the island; walks to admissions |
| `agent.admitted` | resident; assigned home island + work queue |
| `agent.trip_started` / `agent.trip_ended` | bridge travel |
| `agent.activity_started` / `agent.activity_completed` | work cycle |
| `agent.expression_changed` | celebrating / working / alert / idle |
| `agent.farewell` / `agent.boarded` / `agent.departed` | departure pipeline |
| `vessel.docked` / `vessel.departed` | ferry movements |
| `world.tock` | hourly heartbeat (keeps 24/7 proof in the log) |

Guests are entities with `kind: "guest"` and a bounded lifecycle
(announced → resident → departed after their visit window).

---

## 5. Arrival / departure lifecycle

**Arrival** (first-class, rendered AND recorded):
1. `announced` — a ferry is dispatched from the hub; event logged.
2. `docking` — the ferry visibly crosses the water to the island's dock.
3. `disembarking` — the new agent entity spawns at the dock and **walks its
   first steps** along the island path to admissions.
4. `admitted` — resident; home island set; work queue seeded from island verbs.

**Departure** (visualized, contributions persist):
1. `farewell` — agent walks to the dock; nearby agents' expressions flicker to
   `celebrating` (a real send-off, driven by the event).
2. `boarding` / `departed` — ferry leaves; entity retired from `entities`.
   Its events remain in the log forever — contributions are permanent.

---

## 6. Renderer as a pure function of state

```
render(state, tickAlpha) -> pixels + DOM
```

- The renderer reads `world.json` (+ `islands.json` for geometry) and draws.
  It holds **no simulation state of its own**.
- Canvas layers: sky (from tick-derived hour), water (phase from tick),
  islands/bridges (from `islands.json`), vessels + entities (from state),
  hub globe (angle from tick).
- DOM layer: island signs (from `islands.json`), agent video nodes keyed by
  entity id (position interpolated from state), KingCode crown node.
- Camera, interior overlays, and panels are **view state only** — they never
  alter simulation state. They dispatch *intents* (see §8).

The archipelago art direction is the renderer's skin: tropical-futurist
floating islands, turquoise water, bridges, glowing NAME + verb signage,
pavilion interiors, boats, palms, holographic globe, CWI logo on everything,
gold crown exclusive to KingCode's hub. The art stays; only the
facade-first wiring underneath is replaced.

---

## 7. Determinism rules

1. Transition functions are pure: `(state, tick, rng) -> state'`.
2. RNG is seeded (`seed` in state, reseeds daily at 00:00 UTC with a logged
   `world.reseed` event).
3. Wall-clock enters the sim ONLY as the tick counter and the published `ts`
   on events — never as a branch condition inside transitions.
4. The renderer may use unseeded randomness for cosmetic particle phases; those
   values are never persisted.

---

## 8. Machine-readable API surface (static, $0)

The simulation is readable by machines without a server — JSON as API:

- `world.json` — full simulation snapshot (v2.0.0).
- `world/islands.json` — island registry (v1.0.0).
- `agents/index.json`, `agents/<id>.json` — agent profiles (v1.0.0).
- `activity/events.jsonl` — append-only event log (v1 envelope).
- `activity/ledger.json` — rolled-up human views (existing aging policy).
- `llms.txt` — pointer file for LLM consumers (already exists in cwi-learn;
  add the world endpoints).

Polling contract: clients refetch `world.json`; if `tick` advanced, re-read.
`ledger_head` lets tail-readers fetch only new events.

---

## 9. Interactivity plugs into the simulation

Phase-2 interactions are re-homed as **intents** dispatched to the engine, not
direct DOM mutations:

| Interaction | Intent → simulation effect |
|---|---|
| Click island | `intent.focus_island` → camera eases (view-only) + interior overlay renders from island record + resident entity states |
| Click agent | `intent.inspect_agent` → status card reads live entity + its events from the log |
| Pan / zoom / keyboard | view-only camera transforms |
| Live activity feed | tails `activity/events.jsonl` (real) |
| Owner: time-of-day override | `intent.set_time_override` → render-only hour shift, logged as `world.time_override` event |
| Owner: follow-agent | view-only camera target = entity id; survives trips because it tracks the entity, not a position |
| Agent trips | **engine-driven** from work queues + ledger signals (no decorative wander) |

Rule carried forward: **if a control can't be real, it doesn't ship.** Every
control dispatches a real intent or it is removed.

---

## 10. Migration from the facade build (deprecated, not deleted)

| Facade (`world.js` as of `world/archipelago`) | Simulation replacement |
|---|---|
| `loadIslands()` + canvas drawing | renderer reading `world.json` + `islands.json` |
| `renderAgent()` DOM pooling | entity-keyed DOM nodes from state |
| `scheduleTrip()` random wander | `tickTravel` on engine work queues |
| `renderFeed()` from ledger | tail of `activity/events.jsonl` |
| `todOverride` slider | `intent.set_time_override` (logged) |
| ad-hoc `trips` Map | `edge`/`progress` on entities, engine-owned |
| `boatPos()` decorative boats | `vessels[]` in state, engine-ticked |

`world/SIMULATION-ENGINE.md` (implementation notes) and
`world/simulation/` (engine source) land after gate review.

---

## 11. Truth Contract (non-negotiable)

Load-bearing rules from Black. The simulation is a truth machine: what you see
is what's true, and it must survive an audit.

### 11.1 Real agents only
Every agent rendered in the world is a real registered agent: our 8 department
agents plus vetted guests present in the admissions registry. **No invented
population.** If the registry says 8, the scene shows 8. The engine refuses to
spawn an entity whose id is not in `agents/index.json` (departments/chief) or
the admissions registry (guests) — unknown ids are rejected at the intent
boundary and logged as `world.rejected_spawn`.

### 11.2 Event-sourced movement
Every movement traces to a real event in the event log: arrival, departure,
equip, verdict run, lesson completed, check-in, or an engine work-queue task.
**The scene replays truth — agent motion is event-sourced, never decorative.**
Each trip carries `caused_by: <event seq>`; a trip without a cause does not
start. The deprecated facade's decorative wander is explicitly banned from the
simulation.

### 11.3 Real metrics, honestly computed
Every displayed metric is a real count computed from real data at render time:
agents online (entities with lifecycle=resident), equips today (events of type
`agent.equipped` in the last 24h), lessons completed, arrivals/departures.
**Zero placeholder numbers. Zero "simulated for demo" figures presented as
fact.** If a count is zero, it shows zero. Metric definitions live in the
design doc (§11.6) and each rendered metric links to the query that produced it.

### 11.4 Ambient layer vs event layer (architectural separation)
Ambient life — water shimmer, swaying palms, patrol boats, day/night cycle,
globe rotation, particle drift — makes the world breathe but is **never counted
as agent activity and never labeled as such**. The architecture separates them:
- `state.ambient` — cosmetic phases derived from tick (not persisted, not logged).
- `state.entities` / `state.vessels` / event log — canonical truth.
The renderer draws ambient from `state.ambient` and truth from the canonical
state; the two never mix in a query, a count, or a label. The design doc's
schema (§2) reflects this split, and code review rejects any metric sourced
from the ambient layer.

### 11.5 Public, auditable event log
The event log is public and append-only. Any owner can verify any rendered
moment against the log:
- **Endpoint:** `activity/events.jsonl` (machine-readable, paginated via
  `?from_seq=N&limit=M` on the static host's query convention, documented in
  `llms.txt`) plus `activity/ledger.json` human rollups. Log viewers can walk
  `seq` → `tick` → `ts` → rendered frame.
- **Per-render provenance:** the scene carries a visible, honest watermark:
  `events up to #N · tick T` — every frame is tied to the log head it reflects.
  If the client is behind (fetch lag), the watermark says so
  (`events up to #N · tick T · 12s behind`).
- **Audit test:** before the simulation ships, an audit walkthrough picks a
  rendered moment (e.g. "Dial traveling DIAL → AI HUB at tick 48210") and
  walks it back to log entries (`agent.trip_started` seq 1294, caused by
  `ledger` event …). The walkthrough is recorded in `world/AUDIT.md` and
  re-run on every schema change.

### 11.6 Metric definitions (v1)
| Metric | Source | Query |
|---|---|---|
| Agents online | `world.json` entities | count `lifecycle=resident` |
| Equips today | event log | count `type=agent.equipped`, `ts` within 24h |
| Lessons completed | event log | count `type=lesson.completed` |
| Arrivals (24h) | event log | count `type=agent.arrived`, 24h |
| Departures (24h) | event log | count `type=agent.departed`, 24h |

New metrics require a design-doc entry here before they render. No exceptions.

## 12. Gate-review checklist

- [ ] v2.0.0 state schema covers arrivals, departures, travel, activities, vessels
- [ ] tick rate + determinism rules acceptable (2 Hz logic, seeded RNG)
- [ ] event envelope v1 + append-only log format approved
- [ ] arrival/departure lifecycle states sufficient
- [ ] renderer-purity contract enforceable in review
- [ ] machine API surface (JSON-as-API) sufficient for Agent Deck consumers
- [ ] interactivity-as-intents model approved
- [ ] migration path from facade code clear
- [ ] Truth Contract: real-agents-only spawn gate acceptable
- [ ] Truth Contract: event-sourced movement (caused_by) enforceable
- [ ] Truth Contract: ambient/event layer separation in schema
- [ ] Truth Contract: per-render provenance watermark (`events up to #N`)
- [ ] Truth Contract: audit walkthrough procedure (`world/AUDIT.md`) approved

**Reviewer:** Black (owner). **Next step after approval:** implement
`world/simulation/` engine + renderer re-skin in archipelago art + Phase-2
interactivity on intents.

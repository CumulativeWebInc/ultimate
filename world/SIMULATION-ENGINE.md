# PROJECT ULTIMATE — Simulation Engine

**Status:** IMPLEMENTED on branch `world/archipelago` (PR #11, gate review pending).
Implements `world/SIMULATION-DESIGN.md` (approved by Black 2026-09-15).

## Layout

| Path | What it is |
|---|---|
| `index.html` | The world. Canonical URL serves the simulation directly. |
| `sim.js` | Browser host: 500 ms logic loop, rAF interpolation, camera, panels, event feed, localStorage rehydration. |
| `sim.css` | Tropical-futurist styling. |
| `world/simulation/engine.js` | Deterministic 2 Hz tick engine. Pure transitions, no I/O. |
| `world/simulation/events.js` | envelope-v1 `EventStore`: dense 1-based append-only log, JSONL parse/write, client-side `from_seq`/`limit` pagination. |
| `world/simulation/rng.js` | `mulberry32` + per-tick seeded RNG. |
| `world/simulation/metrics.js` | The five honest metrics + their query text (UI provenance). Never reads `state.ambient`. |
| `world/simulation/render/scene.js` | Pure `buildCommands(input)` → canvas + DOM command lists. No I/O, no wall-clock. |
| `world/simulation/render/apply.js` | Browser executor for those commands. |
| `world/simulation/schema-v2.json` | JSON Schema for the v2 snapshot. Rejects persisted `ambient`. |
| `world/simulation/genesis.mjs` | Boot-snapshot builder: `node world/simulation/genesis.mjs` writes `world/world.json` + `activity/events.jsonl` from real repo data via the real engine. |
| `world/simulation/tests/` | 33 tests, `node world/simulation/tests/run.mjs`. |
| `world/world.json` | Committed v2.0.0 genesis snapshot (tick 0). The public seed machines read. |
| `activity/events.jsonl` | Committed seed event log (seq 1: `world.genesis`). |

## Determinism contract (design §7)

- Transitions are pure: `(world, tick, rng) -> world'`. All randomness comes from `mulberry32(seed + tick)`.
- Wall-clock enters **only** as the injected tick clock `{ ms, iso }` — `ms` for 24 h math, `iso` for the published event `ts`. The engine never calls `Date.now()` / `Math.random()` / `new Date()` (enforced by `tests/no-clock.mjs`, static grep over `rng.js`, `events.js`, `engine.js`, `metrics.js`).
- Same seed + same event inputs ⇒ byte-identical state (enforced by `tests/determinism.mjs`: two 600-tick runs compared byte-for-byte, state AND log).

## Fixed transition order (design §3)

Every 500 ms tick runs, in order:

1. `tickArrivals` — announced → docking (6 ticks) → voyage (60) → walk (14) → admitted. Ferry `carrying` links the guest to the vessel.
2. `tickDepartures` — farewell (12 ticks) → boarded (8) → departed. Entity retired; its log contributions persist.
3. `tickTravel` — `progress += 1/18` along bridge edges; at 1.0 the entity lands, `edge` clears, `agent.trip_ended` carries the original `caused_by`.
4. `tickActivities` — work-queue verbs per island (e.g. NEEDLE: SCOUT → VERIFY → SIGN). Start/completion events; ~35% of completions hand off to a caused trip (`work-queue:<verb> follow-up`).
5. `tickVessels` — ferries shuttle hub spokes; `vessel.docked` at endpoints, reverse, `vessel.departed`.
6. `tickAmbient` — **cosmetic only**: `state.ambient` phases (water, palm sway, globe) derived from tick; expressions resolve here from canonical activity state (working while active, celebrating for 8 ticks after a completion, idle otherwise, alert on engine flags). Never persisted, never logged.

Plus: hourly `world.tock` heartbeat (tick % 7200), daily `world.reseed` (tick % 172800 — new `mulberry32` stream, event logged), owner time override (logged as `world.time_override`, render-only effect).

## Truth-contract enforcement (design §11)

- **§11.1 Spawn gate.** `requestSpawn` / `announceArrival` refuse unknown ids at the intent boundary and log `world.rejected_spawn`. The registry = `agents/index.json` (+chief) ∪ guest names with visitor/resident/citizen status. (`tests/spawn-gate.mjs`)
- **§11.2 Event-sourced movement.** `requestTrip` requires a resolvable `caused_by` event seq; `null`, `0`, and dangling seqs are refused with state untouched. Every `agent.trip_started` in a long run carries a `caused_by` that resolves. (`tests/caused-by.mjs`, `tests/transitions.mjs`)
- **§11.4 Ambient separation.** `snapshotWorld` drops `state.ambient` (schema rejects it); no metric reads it (static + runtime tests); no event is sourced from it. (`tests/ambient-separation.mjs`)
- **§11.5 Audit.** Any rendered moment walks back to log entries — see `world/AUDIT.md` and `tests/audit-scenario.mjs`.

## Machine API

Machines read the same files the renderer reads:

- `GET world/world.json` — latest committed snapshot (schema v2.0.0).
- `GET activity/events.jsonl` — the full append-only log.
- `GET agents/index.json`, `agents/<id>.json`, `guests/index.json`, `world/islands.json` — registry data.
- `llms.txt` (repo root) points agents at these endpoints.

### Pagination (`?from_seq=N&limit=M`)

Static hosting serves `activity/events.jsonl` as one file; there is no query
engine. The documented pagination contract is **client-side**:

```
GET activity/events.jsonl            # the whole log (small; one line per event)
# client filters:  events.filter(e => e.seq >= N).slice(0, M)
```

`events.js` ships the exact helper (`paginate(events, from_seq, limit)`) the
browser client uses, and the provenance watermark (`events up to #N · tick T`)
tells any reader where the log head was when the snapshot was taken.
`ledger_head` in the snapshot always equals the log's head seq.

## Persistence honesty

- **Committed public seed:** `world/world.json` + `activity/events.jsonl` are written by `genesis.mjs` (or a host publish step) and committed. This is what machines and first-time visitors read. It advances when someone runs the publisher and commits — a static host cannot append to the repo at runtime.
- **Client-local continuation:** in the browser, `sim.js` rehydrates from the committed snapshot and keeps ticking locally, persisting to `localStorage` (snapshot every 60 ticks + on every lifecycle event). Your visit continues the world *for you*; it does not rewrite the public files.
- The UI never implies the public log moves on its own: the watermark always shows the exact log head and tick the frame was built from.

## Running it

```bash
node world/simulation/genesis.mjs      # rebuild the committed boot snapshots
node world/simulation/tests/run.mjs     # 33 tests, all must pass
```

Serve the repo root over HTTP and open `index.html` (ES modules require
`http(s)`, not `file://`).

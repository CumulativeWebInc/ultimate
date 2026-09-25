# Project Ultimate — Truthful Synchronized Backend

**Status:** Design v1.0 (Phase 0) — 2026-09-16. Contracts phase; no server code,
no hosting, no deploys. Hosting is Black's decision; this doc is host-agnostic.
**Reference model:** `~/workspace/gear-ledger-3d/backend-architecture.md`
(server-authoritative lifecycle, WebSocket primary + SSE fallback, replay via
`from_seq`/`last_event_id`, presence heartbeat, LIVE vs SAMPLE separation).
**Phase 0 pattern:** `~/workspace/gear-ledger-3d/backend/` —
`contracts/*.schema.json` + `seed/` + dependency-free `tests/contracts.test.js`.

---

## 0. What the current simulation is (grounded facts)

The world that is live at `https://cumulativewebinc.github.io/ultimate/` is the
archipelago simulation (branch `world/archipelago`). Its engine is described in
`world/SIMULATION-DESIGN.md` and `world/SIMULATION-ENGINE.md`; the sources live
at `world/simulation/` on that branch. Verified facts used by this design:

- **Deterministic 2 Hz tick engine** (`world/simulation/engine.js`): pure
  transitions `(world, tick, rng) -> world'`. All randomness is
  `mulberry32(seed + tick)` (`rng.js`). Wall-clock enters only as the injected
  tick clock `{ ms, iso }`; the engine never calls `Date.now()` /
  `Math.random()` / `new Date()` (enforced by `tests/no-clock.mjs`).
- **Event envelope v1** (`events.js`): `{ seq, tick, ts, type, actor, payload }`.
  `seq` is dense and 1-based. `ts` is an ISO-8601 UTC string supplied by the
  caller. `EventStore` is append-only with client-side `from_seq`/`limit`
  pagination (`since()`).
- **Fixed transition order per tick:** arrivals → departures → travel →
  activities → vessels → ambient (ambient is cosmetic-only: `state.ambient` is
  never persisted, never logged, rejected by the snapshot schema).
- **20 engine event types** (frozen in `engine.js`; see §3 for the list).
- **Snapshot v2.0.0** (`world/simulation/schema-v2.json`): `tick`, `tick_hz: 2`,
  `seed`, `base_epoch_ms`, `islands_ref`, `entities[]`, `vessels[]`,
  `arrivals[]`, `departures[]`, `work_queues`, `time_override`, `ledger_head`,
  `counts`. `ledger_head` always equals the event log's head seq.
- **Registry:** 9 agents — 8 departments (`needle`, `marquee`, `seal`, `dial`,
  `dateline`, `fader`, `ledger`, `charter`) + chief `kingcode` (KingCode) —
  over **14 islands** (`world/islands.json`).
- **Truth-contract enforcement already in the engine:** spawn gate
  (`requestSpawn`/`announceArrival` refuse unknown ids, log
  `world.rejected_spawn`); event-sourced movement (`requestTrip` requires a
  resolvable `caused_by` seq); ambient separation; auditability (every rendered
  moment walks back to log entries — `world/AUDIT.md`).
- **Current state is browser-local:** the committed seed is `world/world.json`
  (tick 0, written by `genesis.mjs`) + `activity/events.jsonl` (seq 1:
  `world.genesis`). In the browser, `sim.js` rehydrates from the committed
  snapshot and keeps ticking locally (persisted to `localStorage`). A visitor's
  continuation never rewrites the public files — honest by design, but **not
  shared and not server-authoritative**.
- **33/33 simulation tests green** (`node world/simulation/tests/run.mjs`).
  They must stay green through every phase of this work.

### What "LIVE" must mean for Ultimate (and what it must not)

Ultimate's world *is* a simulation by design — a night-time floating
archipelago. The truth question is never "are the ferries real boats"; it is
**what causes the events, and what the client claims about them**. This design
pins the distinction:

- **SIMULATION mode (today's behavior):** the client runs the engine locally
  from the committed genesis snapshot. Every event is engine-caused
  (seeded RNG). Honest as long as it is labeled — the world must never imply
  the public log advances on its own (the existing provenance watermark,
  "events up to #N · tick T", already does this).
- **LIVE mode (this backend):** the server owns the canonical event log and
  tick authority. LIVE means *shared, server-authoritative, presence-honest* —
  it does **not** mean the world's mechanics are real-world facts. Concretely:
  shared log + real presence (heartbeats) + real interaction (intents admitted
  by the server) + real work evidence for any claimed achievement. Anything
  short of that stays labeled SIMULATION. §7 lists the truth rules that make
  this enforceable.

---

## 1. Kill-rule check: byte-identical local simulation

**Kill rule (from the task):** if the design cannot keep the simulation
byte-identical in local mode, stop and report the conflict.

**Verdict: PASS — no conflict.** The design guarantees byte-identical local
simulation by construction, three ways:

1. **Local mode is untouched.** SIMULATION mode keeps the exact current code
   path: `sim.js` → `engine.js` + `events.js` + `rng.js` → `localStorage`.
   Phase 0 changes zero files under `world/simulation/` (verified: the 33 sim
   tests are re-run after this work and must stay 33/33).
2. **The backend transports envelope-v1, never rewrites it.** Backend events
   are the sim's `{seq, tick, ts, type, actor, payload}` plus transport-only
   metadata in a wrapper the client strips before any engine contact. The
   engine never sees the wrapper, so its input space is unchanged.
3. **Separation of logs.** A LIVE client renders from the server's event
   stream into a *separate* `EventStore` used for rendering only; it never
   merges server events into a locally-ticking engine log. A SIMULATION client
   never ingests server events at all. There is no code path where backend
   data can perturb the deterministic `(world, tick, rng)` transition.

Server-side, canonical state is derived by importing the **same** `engine.js`
(`boot()` once from genesis, `stepTick()` per tick) — no rewrite, no parallel
implementation to drift. Same seed + same event inputs ⇒ byte-identical state
holds on the server exactly as it holds in the browser (the sim's own
`tests/determinism.mjs` proves the property; the backend inherits it by
reusing the code).

---

## 2. Server-authoritative mapping: engine → backend

| Engine concept (today) | Server role (LIVE) | Client role (LIVE) |
|---|---|---|
| `EventStore` (append-only log) | **Seq-authoritative.** The single canonical log, continuing the committed genesis (seq 1 = `world.genesis`). The server assigns every seq. | Merges the stream into a render-only store; never rewrites seqs. |
| 2 Hz tick authority (`sim.js` loop) | **Owns ticks.** Advances the world at 2 Hz; every tick's events are stamped by the server. | Never ticks locally in LIVE mode. |
| `snapshotWorld()` | **Derives canonical snapshots** from the canonical log with the same code. Publishes every 60 ticks + on lifecycle events (mirrors `sim.js`). | Bootstraps from `world.snapshot`; renders. |
| Registry + spawn gate (`agents/index.json`) | **Holds the seed registry** (`backend/seed/agents.json`). `requestSpawn`/`announceArrival` run server-side only. | Cannot spawn; can *request* arrival (intent). |
| `requestTrip` + `caused_by` | **Enforces caused_by** — trips still require a resolvable cause seq. In LIVE mode a trip's cause must be a real admitted intent or a real work event, never RNG wander. | Sends trip intents; animates admitted trips. |
| Presence (implicit: entities always "resident") | **Computes presence** from heartbeats (workers 15 s, viewers 25 s). Miss 3 → `away`; miss 6 → `offline`. | Sends pings; renders honest presence (dimmed/offline at home island when absent). |
| Work queues (`tickActivities`, RNG verbs) | **Disabled in LIVE server mode.** RNG-generated `agent.activity_*` events are SIMULATION-only. LIVE work events come from real-work adapters (Phase 2). | Renders admitted activity events; never invents them. |
| World mechanics (arrivals/departures pipeline, travel, vessels, `world.tock`, `world.reseed`) | Runs identically to the sim — shared world state. These are mechanics, not achievements. | Renders as world state; UI must not present them as agent wins (§7 R4). |
| Ambient (`state.ambient`) | Never persisted, never logged — unchanged. | Render-only, as today. |
| Interaction (none today) | **Admits intents**: `presence.ping`, `interaction.request` (visitor→agent ping/question, rate-limited, policy-filtered), `arrival.request`. Admission is an event; rejection is logged, never silent. | Sends intents over WS; SSE viewers are read-only. |
| Honest metrics (`metrics.js`) | Computes the same five metrics from the canonical log (never from ambient). | Displays metric + its query text (provenance), as today. |

**What the server never does:** accept client-submitted *world events*
(clients submit intents only — no path exists for a client to inject
`agent.activity_completed` or any other claim); sign anything on Black's
behalf; or emit an RNG-caused `agent.activity_*` in LIVE mode.

---

## 3. Event schema

The backend event is the sim's envelope v1, transported with server metadata.
Contract: `backend/contracts/event.schema.json`. Wire shape:

```json
{
  "event_id": "evt_000123",
  "seq": 123,
  "tick": 456,
  "ts": "2026-09-16T10:05:00.123Z",
  "server_at": "2026-09-16T10:05:00.200Z",
  "type": "agent.activity_completed",
  "actor": "needle",
  "payload": { "verb": "SCOUT", "target": "catalog", "duration_ticks": 40, "evidence_url": "https://…" },
  "origin": "engine",
  "sample": false
}
```

- `seq` — dense, 1-based, server-assigned. Continues the sim's log: the
  committed genesis event is seq 1.
- `event_id` — `evt_` + zero-padded seq (stable, replay-safe).
- `ts` — the event's own time (engine-supplied in sim terms; server-stamped at
  admission for intent-caused events).
- `server_at` — when the backend accepted/appended the event. Lets clients
  distinguish event time from arrival time.
- `actor` — entity id (`needle`, `kingcode`, …), a guest id, or `null` for
  world/system events. Same values the sim uses — no translation layer.
- `payload` — the sim's payload verbatim. Per-type shapes are documented in
  `contracts/protocol.md` §2 (they are the shapes `engine.js` emits today).
- `origin` — `engine` (from the canonical engine run) | `adapter` (a
  real-work adapter, Phase 2+) | `system` (presence, heartbeats, admin).
- `sample` — **must be `false` in LIVE mode.** Phase-0 seed fixtures and any
  locally-generated demo events are `sample: true`. The LIVE renderer drops
  `sample: true` events defensively (§7 R6).
- `type` — the frozen 20 engine types, plus an `x.`-prefixed extension
  namespace for adapter/system events:

**Frozen engine types (from `engine.js`, do not rename):**
`world.genesis`, `world.tock`, `world.reseed`, `world.time_override`,
`world.rejected_spawn`, `agent.announced`, `agent.docking`, `agent.arrived`,
`agent.admitted`, `agent.farewell`, `agent.boarded`, `agent.departed`,
`agent.trip_started`, `agent.trip_ended`, `agent.activity_started`,
`agent.activity_completed`, `agent.task_assigned`, `agent.expression_changed`,
`vessel.departed`, `vessel.docked`.

**Extension namespace (`x.*`):** reserved for the backend; never emitted by
the sim. Planned: `x.presence` (heartbeat-derived presence transitions),
`x.adapter.work_completed` (real work with evidence, Phase 2),
`x.interaction.requested` / `x.interaction.answered` (Phase 3). Extension
types are renderer-optional: a client that does not understand an `x.` type
ignores it without breaking.

**Payload conventions (frozen shapes from `engine.js`):**
- `agent.activity_completed`: `{ verb, target, duration_ticks }` — in LIVE
  mode additionally requires `evidence_url` (§7 R3).
- `agent.trip_started` / `agent.trip_ended`: carry `caused_by` (a resolvable
  event seq) — the engine's existing rule, enforced server-side.
- `agent.task_assigned`: `{ verb: "TRAVEL", from, to, reason }` — in LIVE
  mode, `TRAVEL` tasks must trace to a real reason (no `rng() >= 0.65`
  follow-ups; that branch is SIMULATION-only).
- `world.rejected_spawn`: `{ id, reason }` — the honest rejection record.

---

## 4. World/state snapshot model

The canonical snapshot is **exactly the v2.0.0 simulation snapshot**
(`world/simulation/schema-v2.json`) — the backend does not invent a second
state shape. Contract: `backend/contracts/world-snapshot.schema.json`.

Wire format (what `/world/state` and the WS `world.snapshot` frame carry):

```json
{
  "mode": "live",
  "server_at": "2026-09-16T10:05:00.200Z",
  "ledger_head": 1042,
  "snapshot": { /* v2.0.0 document, byte-identical shape to snapshotWorld() output */ }
}
```

Invariants (enforced by contract tests, Phase 0):

1. `snapshot` validates against the sim's own `schema-v2.json` **and** the
   backend contract's snapshot subschema — the two must agree (drift guard).
2. `ledger_head` equals the canonical log's head seq. A client must refuse a
   snapshot whose `ledger_head` does not match the stream it subsequently
   receives (re-sync via `from_seq`).
3. `snapshot` contains no `ambient` (the schema rejects it — same as the sim).
4. `mode` is `live` only when the payload came from the authoritative server
   over an authenticated, heartbeat-fresh connection. Anything else is
   `sample` (the committed genesis snapshot served statically is `mode:
   "sample"`).
5. The wrapper is transport-only: stripping it yields a document the sim
   ingests unchanged (this is what keeps §1's byte-identity promise).

Snapshot cadence: server publishes every 60 ticks and on every lifecycle
event (`agent.admitted`, `agent.departed`, arrivals) — the same cadence
`sim.js` uses for `localStorage`, so LIVE and SIMULATION clients share
recovery semantics.

**Retention:** the hot event log keeps 24 h (replay window for reconnects);
older history compacts to snapshots. The static layer's existing 30-day
ledger aging (`activity/ledger.json`) is untouched — the two retentions
describe different stores (server stream vs. committed public record).

---

## 5. Live-client protocol (WS primary, SSE fallback)

Contract: `backend/contracts/protocol.md`. Base is host-agnostic
(`https://api.<domain>/v1/ultimate`, `wss://stream.<domain>/v1/ultimate`);
hosting is Black's call (§9).

**Transport choice (from the reference model):** WebSocket primary —
bidirectional (server pushes events; client sends presence pings, interaction
intents, subscription filters; the world is interactive, not a broadcast).
SSE fallback (`GET /v1/ultimate/stream`) for read-only viewers on networks
that block WS upgrades — SSE clients get events but cannot send intents
(their UI shows "view-only"). Both carry the §3 event schema.

**Connection lifecycle:**

1. Client opens WS → sends `hello { client: "ultimate-web/1.0", mode_want:
   "live", last_event_id? }`.
2. Server replies `world.snapshot` (§4 wrapper, `mode: "live"`) → client
   renders the LIVE world.
3. Client subscribes with filters (`islands=[...]`, `agents=[...]`,
   `types=[...]`) to bound bandwidth.
4. Server streams `event` frames (§3 shape). Client appends to its render
   store; watermark shows `events up to #N · tick T` (the existing honesty
   pattern).
5. **Presence heartbeats:** viewers `ping` every 25 s; agent workers send
   `presence.ping` every 15 s. Miss 3 → server marks `away` (broadcasts
   `x.presence`); miss 6 → `offline`. An `offline` entity renders dimmed at
   its home island — honest absence, never fake presence.
6. **Intents (WS only):** `intent { kind: "presence.ping" |
   "interaction.request" | "arrival.request", … }`. The server admits or
   rejects; admission appends a real event (e.g. `agent.announced` after the
   spawn gate); rejection returns `intent.rejected { reason }` and, for spawn
   attempts, logs `world.rejected_spawn` — rejections are visible, never
   silent. Rate limits: visitors 5 intents/min (1/min per agent); workers 60/min.
7. **Reconnection:** exponential backoff (1 s, 2 s, 4 s … max 30 s) with
   jitter; on reconnect the client sends `last_event_id` (= last seen `seq`)
   and the server replays via the log's `since(from_seq, limit)` — the exact
   pagination helper the sim already ships in `events.js`.
8. **Degraded mode:** if WS drops and SSE fails, the client shows
   "LIVE connection lost — showing last known state" and offers SIMULATION
   mode. It never silently simulates liveness. The mode pill is structural:
   green `● LIVE` only in step 4's steady state; amber `◐ SIMULATION`
   otherwise.

**Phase-0 REST surface** (frozen shapes; no implementation in Phase 0):

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | `{"ok":true,"contract":"v1.0","mode":"sample","sample_only":true}` in Phase 0 |
| GET | `/world/state` | none | §4 snapshot wrapper |
| GET | `/world/events?from_seq=N&limit=M` | none | `since()` pagination over the canonical log |
| GET | `/agents` | none | Registry: the 9 seeded agents (`seed/agents.json`) |
| GET | `/agents/{id}/presence` | none | Current presence (`online\|away\|offline`) |
| GET | `/v1/ultimate/stream` | none | SSE fallback (read-only) |

All mutating surface arrives in Phase 1+ as WS intents, not REST POSTs —
world state changes only through the ticking engine and admitted intents.

---

## 6. Registry & seed

`backend/seed/agents.json` — the 9 registry entries, derived from the
archipelago's `agents/*.json` (the sim's own registry source). Registry keys
are the sim's lowercase ids (`needle`, …, `kingcode`) — the spawn gate
compares these exact strings, so the backend uses them verbatim: no
translation layer, no drift surface.

Per entry: `id`, `name`, `kind` (`department` | `chief`), `department`,
`role`, `home_island` (one of the 14 islands in `world/islands.json`),
`capabilities` (the home island's work verbs, e.g. needle →
`["SCOUT","VERIFY","SIGN"]`), `status` (`active`), `seed: true`,
`profile` (`avatar`, `poster`, `persona_line` refs), and `moltbook`
(`registered`, `claimed`) per the known record: `kingcode` (MUSE_CWI) claimed;
the 8 departments registered, unclaimed.

Guest agents keep their existing registry (`guests/<name>.json` via PR) —
admission runs through the spawn gate as today; the server is the gate's new
home.

---

## 7. Truth rules — LIVE vs SIMULATION (normative)

These are the rules the client and server are built against. Violating any of
them is a defect, not a judgment call.

- **R1 — Never call simulated activity "live."** An event caused by the
  engine's seeded RNG is simulation. The word "live" (and the green `● LIVE`
  pill) may only describe a heartbeat-fresh connection to the authoritative
  server (§5).
- **R2 — Mode indicator is structural.** `● LIVE` renders if and only if the
  client holds an authenticated, heartbeat-fresh backend connection serving
  `mode: "live"` snapshots. Every other state shows `◐ SIMULATION`. No
  manual override, no "looks live" state.
- **R3 — Achievements require evidence in LIVE mode.** `agent.activity_completed`
  in a LIVE log MUST carry `evidence_url`: a real, fetchable artifact of real
  work (adapter-attested, Phase 2). RNG-generated completions are
  SIMULATION-only; the LIVE server must not emit them. A completion without
  evidence in a LIVE log is a contract violation.
- **R4 — Mechanics are not achievements.** Vessel shuttles, trips, `world.tock`,
  `world.reseed`, arrivals/departures pipelines are shared world mechanics.
  The UI must never present them as agent wins. Wins come from R3 events only.
- **R5 — Presence honesty.** In LIVE mode an entity renders `online` only on
  a fresh heartbeat; otherwise it renders `away`/`offline`, dimmed at its
  home island. The sim's always-resident cast is a SIMULATION convenience and
  must not be described as live presence.
- **R6 — Defensive separation.** LIVE clients drop `sample: true` events on
  receipt. SIMULATION clients never ingest server events into the local
  engine log. The two logs never mix (§1).
- **R7 — Auditability.** Every rendered moment walks back to log seqs (the
  existing `world/AUDIT.md` pattern). The watermark always shows the exact
  `seq` and `tick` the frame was built from — in both modes.
- **R8 — Seed honesty.** All Phase-0 fixtures, seeds, and demo data carry
  `sample: true` / `seed: true` and `mode: "sample"`. Nothing in this phase
  may present itself as live.

---

## 8. Phased build plan (gates)

Black's pipeline per phase: **build → test → KingCode independent
verification → merge**. No phase merges on a promise.

- **Phase 0 — Contracts (this doc + `backend/`).** Freeze the event, agent,
  and snapshot contracts; seed the 9-agent registry; protocol doc; contract
  test suite green. **Gate:** `node backend/tests/contracts.test.js` green;
  33/33 sim tests still green; KingCode reviews the contract diff.
- **Phase 1 — World Authority + stream.** A worker imports `engine.js`
  unmodified, owns the canonical log from the committed genesis, advances
  2 Hz ticks with RNG work queues **disabled** (LIVE truth), serves
  `/world/state`, `/world/events`, WS + SSE per §5, presence heartbeats,
  `from_seq` replay. **Gate:** kill the authority mid-tick → clients show the
  degraded banner (never fake liveness); reconnect replays missed events;
  two independent runs from the same genesis are byte-identical.
- **Phase 2 — Real-work adapters.** Adapters map already-running CWI processes
  (playlist verification scans, standup task flow, gear-build queue) to
  `x.adapter.work_completed` events with `evidence_url`. RNG
  `agent.activity_*` stays SIMULATION-only forever. **Gate:** every LIVE
  `agent.activity_completed` resolves to a fetchable artifact; a completion
  without evidence is rejected by the authority and logged.
- **Phase 3 — Client LIVE wiring.** `live-client.js` (WS/SSE, render-only
  store, intent sender) + mode pill + `world.snapshot` bootstrap + "view
  evidence" opening the real artifact URL. SIMULATION path untouched.
  **Gate:** browser QA — `● LIVE` only on a real connection; agents move only
  on admitted events; evidence links resolve; SIMULATION mode byte-identical
  to today (determinism test against the pre-Phase-3 build).

---

## 9. Open decisions (need Black's call)

1. **Hosting** — Cloudflare Workers + Durable Objects + D1 (the reference
   model's $0 recommendation) vs. alternatives. The contract does not change
   with the host, but tick authority needs an always-on-ish home — confirm
   before Phase 1.
2. **Tick strategy** — server ticks at a full 2 Hz continuously, or
   tick-on-demand (ticks only when intents/events occur, snapshots otherwise
   static)? Continuous matches the sim; on-demand is cheaper and arguably
   more honest (no motion without cause). Recommend deciding before Phase 1.
3. **Adapter allow-list** — which real CWI processes become Phase-2 work
   adapters, and who attests their evidence URLs.
4. **Guest admission bar for LIVE intents** — the PR-based guest registry
   exists; confirm the same bar governs `arrival.request` intents.

---

## 10. What this doc does NOT authorize

- No server code, no infra, no hosting, no keys, no deploys.
- No outbound sends, posts, signatures, or payments.
- No metrics, adoption, or traction claims — internal testing is internal.
- Nothing in `world/simulation/` is modified by Phase 0. The 33 sim tests
  are the preservation proof and are re-run with every change to this
  backend.

*End of design v1.0. Next step: Phase 0 gate (contract tests green, sim tests
still 33/33), then Black's §9 calls, then Phase 1.*

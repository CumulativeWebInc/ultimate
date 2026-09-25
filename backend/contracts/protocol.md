# Project Ultimate — Live-client protocol (frozen, design v1.0 §5)

Base is host-agnostic: `https://api.<domain>/v1/ultimate`,
`wss://stream.<domain>/v1/ultimate`. Hosting is Black's call (design §9);
the contract does not change with the host.

## 1. Transports

- **Primary: WebSocket** (`wss://stream.<domain>/v1/ultimate`). Bidirectional:
  server pushes events; client sends presence pings, interaction intents, and
  subscription filters.
- **Fallback: SSE** (`GET /v1/ultimate/stream`). Read-only viewers on networks
  that block WS upgrades. SSE clients receive events but cannot send intents;
  their UI shows "view-only".
- Both carry the event schema in `contracts/event.schema.json`. Same events,
  same shapes, both transports.

## 2. Event payload shapes (frozen — these are what `engine.js` emits today)

| type | actor | payload |
|---|---|---|
| `world.genesis` | `null` | `{ seed, agents, vessels, islands_ref, envelope: "v1" }` |
| `world.tock` | `null` | `{ residents, vessels }` — hourly heartbeat (tick % 7200) |
| `world.reseed` | `null` | `{ old_seed, new_seed }` — daily (tick % 172800) |
| `world.time_override` | `null` | `{ hour }` — owner override, render-only effect |
| `world.rejected_spawn` | `null` | `{ id, reason }` — honest rejection record |
| `agent.announced` | entity id | `{ vessel, target_island, kind: "guest" }` |
| `agent.docking` | entity id | `{ vessel, target_island }` |
| `agent.arrived` | entity id | `{ island }` |
| `agent.admitted` | entity id | `{ island, home_island, via }` |
| `agent.farewell` | entity id | `{ island }` |
| `agent.boarded` | entity id | `{ vessel, island }` |
| `agent.departed` | entity id | `{ island, contributions_kept: true }` |
| `agent.trip_started` | entity id | `{ to, caused_by }` — `caused_by` is a resolvable event seq (engine rule) |
| `agent.trip_ended` | entity id | `{ island, caused_by }` |
| `agent.activity_started` | entity id | `{ verb, target, ends_tick }` |
| `agent.activity_completed` | entity id | `{ verb, target, duration_ticks }` — LIVE mode additionally requires `evidence_url` (design §7 R3) |
| `agent.task_assigned` | entity id | `{ verb, from, to, reason }` — in LIVE mode `TRAVEL` must trace to a real reason (design §3) |
| `agent.expression_changed` | entity id | `{ from, to, reason }` |
| `vessel.departed` | `null` | `{ vessel, from }` |
| `vessel.docked` | `null` | `{ vessel, at }` |
| `x.*` | varies | Extension events (design §3). Renderer-optional: unknown `x.*` types are ignored, never fatal. Planned: `x.presence`, `x.adapter.work_completed`, `x.interaction.requested`, `x.interaction.answered`. |

## 3. WebSocket frames

Client → server:

| frame | fields | notes |
|---|---|---|
| `hello` | `{ client, mode_want: "live", last_event_id? }` | First frame. `last_event_id` = last seen `seq` for replay. |
| `subscribe` | `{ islands?, agents?, types? }` | Filters bound bandwidth. Exact-match on ids/types. |
| `ping` | `{ at }` | Presence heartbeat. Viewers every 25 s, workers every 15 s. |
| `intent` | `{ kind, … }` | `presence.ping` \| `interaction.request` \| `arrival.request`. See §5. |

Server → client:

| frame | fields | notes |
|---|---|---|
| `world.snapshot` | §4 wrapper (`mode`, `server_at`, `ledger_head`, `snapshot`) | Sent on connect and on demand. |
| `event` | §3 event shape | The canonical stream, in seq order. |
| `x.presence` (as `event`) | `{ agent_id, status, note? }` | `online\|away\|offline`. Server-computed from heartbeats. |
| `intent.accepted` | `{ intent_id, event }` | The admitted event is also broadcast on the stream. |
| `intent.rejected` | `{ intent_id, reason }` | Rejections are visible, never silent. |
| `error` | `{ code, message }` | Snake-case codes, e.g. `unknown_intent`, `rate_limited`. |
| `pong` | `{ at }` | Heartbeat reply. |

## 4. Snapshot wrapper

`{ mode: "live"|"sample", server_at, ledger_head, snapshot }` per
`contracts/world-snapshot.schema.json`. Invariants:

- `mode: "live"` only from the authoritative server over an authenticated,
  heartbeat-fresh connection (design §7 R2).
- `ledger_head` equals the canonical log's head seq and
  `snapshot.ledger_head`. A client must refuse a snapshot that disagrees with
  the stream it subsequently receives, and re-sync via `from_seq`.
- The wrapper is transport-only: stripping it yields a document the sim
  ingests unchanged.

Snapshot cadence: every 60 ticks and on every lifecycle event
(`agent.admitted`, `agent.departed`, arrivals) — the cadence `sim.js` uses
for `localStorage`, so LIVE and SIMULATION clients share recovery semantics.

## 5. Intents (WS only)

Clients never submit world events — only intents. The server admits (appending
a real event) or rejects (reply + log). There is no code path for a client to
inject `agent.activity_completed` or any other claim.

| kind | fields | admission |
|---|---|---|
| `presence.ping` | `{ agent_id?, viewer_id? }` | Always accepted; refreshes heartbeat. |
| `interaction.request` | `{ to_agent, kind: "ping"\|"question", text }` | Rate-limited (5/min/visitor, 1/min/agent); policy-filtered (spam, injection, PII); lands in the agent's queue on accept. |
| `arrival.request` | `{ id, target_island?, name? }` | Runs the spawn gate server-side: unknown id → `intent.rejected` + `world.rejected_spawn` event; duplicate → `already-present`. |

Rate limits: visitors 5 intents/min (1/min per agent); workers 60/min.
Exceeding returns `error { code: "rate_limited" }` and throttles the sender.

## 6. Replay

`GET /world/events?from_seq=N&limit=M` and WS `hello.last_event_id` both use
the sim's `since(from_seq, limit)` semantics (`events.js`): `from_seq` is
1-based inclusive; response carries `{ events, from_seq, next_from_seq, head }`.
Event log retention: 24 h hot (reconnect window), then compacted to snapshots.

## 7. Reconnection & degraded mode

Exponential backoff (1 s, 2 s, 4 s … max 30 s) with jitter. On reconnect the
client sends `last_event_id`; the server replays missed events. If WS drops
and SSE fails, the client shows **"LIVE connection lost — showing last known
state"** and offers SIMULATION mode. It never silently simulates liveness.

## 8. Mode indicator (structural, design §7 R2)

- `● LIVE` (green) renders **iff** the client holds an authenticated,
  heartbeat-fresh backend connection serving `mode: "live"` snapshots.
- Every other state renders `◐ SIMULATION` (amber).
- No manual override. No "looks live" state. The indicator is derived from
  connection state, not set by content.

## 9. Phase-0 REST surface (frozen shapes; no implementation in Phase 0)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | `{"ok":true,"contract":"v1.0","mode":"sample","sample_only":true}` in Phase 0 |
| GET | `/world/state` | none | §4 snapshot wrapper |
| GET | `/world/events?from_seq=N&limit=M` | none | §6 pagination over the canonical log |
| GET | `/agents` | none | Registry: the 9 seeded agents (`seed/agents.json`) |
| GET | `/agents/{id}/presence` | none | Current presence (`online\|away\|offline`) |
| GET | `/v1/ultimate/stream` | none | SSE fallback (read-only) |

World state changes only through the ticking engine and admitted intents —
all mutating surface arrives in Phase 1+ as WS intents, not REST POSTs.

## 10. Frozen rules

- **Idempotency:** intents carry client-supplied `intent_id`; duplicate ids
  replay the original admission/rejection, never double-apply.
- **Caused-by:** the server enforces the engine's `requestTrip` rule — trips
  require a resolvable `caused_by` seq; `null`, `0`, and dangling seqs are
  refused with state untouched.
- **sample flag:** every event carries `sample`; the LIVE renderer drops
  `sample: true`. Phase-0 seeds are `sample: true`; they never reach a LIVE
  world.
- **Evidence rule:** a LIVE `agent.activity_completed` without `evidence_url`
  is rejected by the authority and logged (design §7 R3). RNG completions are
  SIMULATION-only.
- **Error shape:** `{"error": {"code": "<snake_case>", "message": "<human>"}}`.

## 11. Notes for Phase 1

- The World Authority imports `engine.js` unmodified (`boot()` from the
  committed genesis, `stepTick()` per tick) with RNG work queues disabled in
  LIVE mode (design §2) — a mode flag in the server harness, not in the
  engine's transition code.
- First worker: presence heartbeats for the 9 registry agents, so the world
  shows honest presence before any adapter work exists.
- KingCode verifies the Phase-1 gate independently (design §8).

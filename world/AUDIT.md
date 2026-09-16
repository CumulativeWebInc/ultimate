# PROJECT ULTIMATE — Audit Walkthrough

**Method (design §11.5):** pick a moment in the rendered world, then walk it
back to log entries. If every link resolves, the frame is truthful.
Executed for real by `world/simulation/tests/audit-scenario.mjs` — this
document records one run; re-run the test to reproduce.

## The moment

Seed `20260915`. At **tick 663** the renderer shows **Dial** mid-crossing on
the DIAL → AI HUB bridge:

- `dial.edge = ["dial", "ai-hub"]`, `progress = 0.389`
- rendered position (70.11, 43.51) — between the DIAL and AI HUB pavilions
- watermark: `events up to #228 · tick 663`

## The walk-back

| Step | Evidence |
|---|---|
| 1. The frame | `agent` DOM node for `dial` sits strictly between the DIAL and AI HUB island coordinates in the command list (`buildCommands` output, alpha 0.5). |
| 2. The trip | `agent.trip_started` **#225** @ tick 656: `{ from: "dial", to: "ai-hub", caused_by: 224, reason: "task:224" }`, actor `dial`. |
| 3. The cause | `caused_by` **#224** resolves: `agent.task_assigned` @ tick 656, actor `dial`, `{ verb: "TRAVEL", from: "dial", to: "ai-hub", reason: "work-queue:PITCH follow-up" }`. |
| 4. The work | Prior `agent.activity_completed` **#223** @ tick 656, actor `dial`: `PITCH curator-258`. The task is the follow-up to real completed work. |
| 5. The books | `ledger_head = 228` in state; the log's head seq is 228. The watermark (`events up to #228 · tick 663`) names exactly what the frame was built from. |

Chain: **rendered moment → trip_started #225 → caused_by #224 (task_assigned) → activity_completed #223 → watermark/ledger_head 228.** Every link resolves. No invented agents, no invented events.

## What was checked around it

- All 33 engine tests pass (`node world/simulation/tests/run.mjs`): determinism (byte-identical state after 600 ticks), arrival/departure pipelines, trip progress + landing, activity cycles, vessel docking, spawn-gate refusals, `caused_by` enforcement, schema validation (including rejection of `ambient` in snapshots), renderer purity (identical command lists across two `buildCommands` calls; crown renders exactly once, on `kingcode`), and the no-wall-clock static ban.
- Repo CI parity check passes locally (JSON/JSONL parse, `SCHEMA-VERSIONS.json` coverage, agents index matches directory).
- **Not verified:** visual rendering in a live browser. The renderer was tested at the command level (pure function, deterministic), not at the pixel level. The scene has not been opened in a browser in this session.

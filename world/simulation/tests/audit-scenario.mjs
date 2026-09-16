/* Audit walkthrough (§11.5): pick a rendered moment — Dial traveling
 * DIAL → AI HUB — and walk it back to log entries. Executed for real; the
 * findings feed world/AUDIT.md. Fails if any link in the chain breaks. */
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { tickWorld, TRIP_TICKS } from "../engine.js";
import { buildCommands, layoutIslands } from "../render/scene.js";
import { allMetrics } from "../metrics.js";
import { loadDeps, bootTest, C, BASE, iso } from "./helpers.mjs";

export const tests = [
  {
    name: "audit: Dial DIAL→AI HUB trip walks back to log entries",
    run() {
      const deps = loadDeps();
      const w = bootTest(deps);
      let started = null;
      let n = 0;
      for (; n < 40000 && !started; n++) {
        const { events } = tickWorld(w, C(n + 1));
        started = events.find(
          (e) => e.type === "agent.trip_started" && e.actor === "dial" && e.payload.to === "ai-hub"
        ) || null;
      }
      assert.ok(started, "dial never traveled DIAL → AI HUB in 40000 ticks");

      // let the trip run a few ticks, then freeze a rendered moment
      const momentTick = n + 6;
      for (let k = n + 1; k <= momentTick; k++) tickWorld(w, C(k));
      const dial = w.state.entities.find((e) => e.id === "dial");
      assert.ok(dial.edge, "dial should be mid-trip at the frozen moment");
      assert.ok(dial.progress > 0 && dial.progress < 1, "progress should be mid-flight");

      // the walk-back: trip_started → caused_by → task → prior activity
      const cause = w.store.get(started.payload.caused_by);
      assert.ok(cause, "caused_by does not resolve to a real event");
      assert.strictEqual(cause.type, "agent.task_assigned");
      assert.strictEqual(cause.actor, "dial");
      const priorActivity = [...w.store.events].reverse().find(
        (e) => e.actor === "dial" && e.type === "agent.activity_completed" && e.seq < cause.seq
      );
      assert.ok(priorActivity, "no prior activity_completed explains the task");

      // the rendered frame for that moment, from canonical state only
      const prev = JSON.parse(JSON.stringify(w.state));
      delete prev.ambient;
      tickWorld(w, C(momentTick + 1));
      const ui = {
        provenance: `events up to #${w.store.head} · tick ${w.state.tick}`,
        behindSec: 0,
        metrics: allMetrics(w.state, w.store, BASE),
        feed: [],
        clockText: "",
        interior: null,
        agentCard: null,
      };
      const cmds = buildCommands({
        prev, state: w.state, islands: deps.islands, renderCfg: deps.renderCfg,
        W: 1280, H: 800, alpha: 0.5, hour: 14.2, ui,
      });
      const node = cmds.dom.find((d) => d.d === "agents").items.find((x) => x.id === "dial");
      assert.ok(node, "dial has no DOM node in the rendered frame");
      const L = layoutIslands(deps.islands, deps.renderCfg, 1280, 800);
      const byId = Object.fromEntries(L.map((x) => [x.id, x]));
      const between =
        node.x > Math.min(byId.dial.x, byId["ai-hub"].x) &&
        node.x < Math.max(byId.dial.x, byId["ai-hub"].x);
      assert.ok(between, "dial node is not on the DIAL→AI HUB bridge");

      // provenance honesty: watermark numbers match the log head and tick
      assert.strictEqual(w.state.ledger_head, w.store.head, "ledger_head != log head");

      const findings = {
        scenario: "Dial traveling DIAL → AI HUB",
        seed: 20260915,
        trip_started_seq: started.seq,
        trip_started_tick: started.tick,
        trip_started_ts: started.ts,
        cause_seq: cause.seq,
        cause_type: cause.type,
        cause_tick: cause.tick,
        cause_reason: cause.payload.reason,
        prior_activity_seq: priorActivity.seq,
        prior_activity: `${priorActivity.payload.verb} ${priorActivity.payload.target}`,
        frozen_tick: w.state.tick,
        dial_progress: dial.progress,
        dial_pos: dial.pos,
        dial_edge: dial.edge,
        ledger_head: w.store.head,
        watermark: ui.provenance,
      };
      writeFileSync("/tmp/audit-findings.json", JSON.stringify(findings, null, 2));
      console.log(`    audit moment: tick ${findings.frozen_tick}, dial progress ${dial.progress.toFixed(3)}`);
      console.log(`    chain: trip_started #${started.seq} <- caused_by #${cause.seq} (${cause.type}) <- activity_completed #${priorActivity.seq}`);
    },
  },
];

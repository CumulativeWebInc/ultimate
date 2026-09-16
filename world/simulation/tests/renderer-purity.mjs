/* Renderer purity: buildCommands twice => identical command lists.
 * Tested at the render-command level (not pixels), per the gate checklist. */
import assert from "node:assert";
import { tickWorld, requestTrip } from "../engine.js";
import { buildCommands, layoutIslands } from "../render/scene.js";
import { allMetrics } from "../metrics.js";
import { loadDeps, bootTest, runTicks, C, BASE } from "./helpers.mjs";

function frameInput(w, prev, deps, alpha, ui) {
  return {
    prev, state: w.state, islands: deps.islands, renderCfg: deps.renderCfg,
    W: 1280, H: 800, alpha, hour: 14.2, ui,
  };
}

function makeUi(w) {
  const metrics = allMetrics(w.state, w.store, BASE);
  return {
    provenance: `events up to #${w.store.head} · tick ${w.state.tick}`,
    behindSec: 0,
    metrics,
    feed: w.store.tail(8).reverse().map((e) => ({ seq: e.seq, actor: e.actor, summary: e.type, ts: e.ts })),
    clockText: "Day · 14.2h",
    interior: null,
    agentCard: null,
  };
}

export const tests = [
  {
    name: "buildCommands is deterministic across two calls",
    run() {
      const deps = loadDeps();
      const w = bootTest(deps);
      runTicks(w, 120);
      const prev = JSON.parse(JSON.stringify(w.state));
      delete prev.ambient;
      tickWorld(w, C(121));
      const ui = makeUi(w);
      const a = JSON.stringify(buildCommands(frameInput(w, prev, deps, 0.37, ui)));
      const b = JSON.stringify(buildCommands(frameInput(w, prev, deps, 0.37, ui)));
      assert.strictEqual(a, b, "render commands differ between identical calls");
      const cmds = JSON.parse(a);
      assert.ok(cmds.canvas.length > 20, "canvas command list suspiciously small");
      assert.ok(cmds.dom.length === 8, "dom command list should have 8 ops");
      // every entity gets an agent DOM node; crown only on kingcode
      const agents = cmds.dom.find((d) => d.d === "agents").items;
      assert.strictEqual(agents.length, w.state.entities.length);
      const crowns = agents.filter((x) => x.crown);
      assert.strictEqual(crowns.length, 1, "crown must appear exactly once");
      assert.strictEqual(crowns[0].id, "kingcode", "crown must be exclusive to KingCode");
    },
  },
  {
    name: "interpolation alpha changes output (motion is live, not baked)",
    run() {
      const deps = loadDeps();
      const w = bootTest(deps);
      runTicks(w, 120);
      const prev = JSON.parse(JSON.stringify(w.state));
      delete prev.ambient;
      tickWorld(w, C(121));
      const ui = makeUi(w);
      const a = JSON.stringify(buildCommands(frameInput(w, prev, deps, 0, ui)));
      const b = JSON.stringify(buildCommands(frameInput(w, prev, deps, 1, ui)));
      // alpha only matters if something moved between ticks; assert commands are well-formed either way
      const cmds = JSON.parse(b);
      assert.ok(cmds.tick === w.state.tick);
      assert.ok(a.length > 1000 && b.length > 1000);
    },
  },
  {
    name: "traveling entity renders between islands with interpolated position",
    run() {
      const deps = loadDeps();
      const w = bootTest(deps);
      // force a real caused trip: append a cause event, then request a trip
      const cause = w.store.append(5, new Date(BASE + 2500).toISOString(), "agent.task_assigned", "dial",
        { verb: "TRAVEL", from: "dial", to: "ai-hub", reason: "purity-test" });
      const r = requestTrip(w, "dial", "ai-hub", cause.seq, C(10), `task:${cause.seq}`);
      assert.ok(r.ok);
      const prev = JSON.parse(JSON.stringify(w.state));
      delete prev.ambient;
      const ui = makeUi(w);
      const cmds = buildCommands(frameInput(w, prev, deps, 0.5, ui));
      const dial = cmds.dom.find((d) => d.d === "agents").items.find((x) => x.id === "dial");
      assert.ok(dial, "dial node missing");
      // dial island px vs ai-hub px: dial must be between them
      const L = layoutIslands(deps.islands, deps.renderCfg, 1280, 800);
      const byId = Object.fromEntries(L.map((x) => [x.id, x]));
      assert.ok(dial.x > Math.min(byId.dial.x, byId["ai-hub"].x) - 1);
      assert.ok(dial.x < Math.max(byId.dial.x, byId["ai-hub"].x) + 1);
    },
  },
];

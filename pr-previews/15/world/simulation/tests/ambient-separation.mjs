/* Ambient/event separation (§11.4): metrics never read state.ambient;
 * ambient is never persisted and never logged. */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotWorld, tickWorld } from "../engine.js";
import { allMetrics } from "../metrics.js";
import { loadDeps, bootTest, runTicks, C, BASE, iso, ROOT } from "./helpers.mjs";

export const tests = [
  {
    name: "metrics.js never reads state.ambient (static)",
    run() {
      const src = readFileSync(join(ROOT, "world/simulation/metrics.js"), "utf8");
      // documentation may name the layer; a metric must never READ it.
      // strip comments first so doc text can't trip the check.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.ok(!/\.ambient|\[[\'"]ambient[\'"]\]/.test(code), "metrics.js reads state.ambient");
    },
  },
  {
    name: "polluted ambient does not change any metric (runtime)",
    run() {
      const w = bootTest(loadDeps());
      runTicks(w, 200);
      const clean = allMetrics(w.state, w.store, BASE);
      w.state.ambient = { polluted: true, water_phase: 999, garbage: "yes" };
      const dirty = allMetrics(w.state, w.store, BASE);
      assert.deepStrictEqual(dirty, clean, "metrics changed with ambient pollution");
    },
  },
  {
    name: "snapshotWorld drops ambient (never persisted)",
    run() {
      const w = bootTest(loadDeps());
      runTicks(w, 50);
      assert.ok(w.state.ambient && typeof w.state.ambient.tick === "number", "live state should carry ambient");
      const snap = snapshotWorld(w, iso(BASE), C(50));
      assert.ok(!("ambient" in snap), "ambient leaked into the persisted snapshot");
    },
  },
  {
    name: "no event is ever sourced from the ambient layer",
    run() {
      const w = bootTest(loadDeps());
      runTicks(w, 500);
      const bad = w.store.events.filter((e) => e.type.startsWith("ambient") || e.payload.ambient !== undefined || e.payload.source === "ambient");
      assert.strictEqual(bad.length, 0, `ambient-sourced events: ${bad.map((e) => e.type).join(",")}`);
    },
  },
  {
    name: "metric queries are documented and honest (zero shows zero)",
    run() {
      const w = bootTest(loadDeps());
      const rows = allMetrics(w.state, w.store, BASE + 500 * 10);
      assert.strictEqual(rows.length, 5);
      for (const r of rows) {
        assert.ok(r.key && r.label && r.query, `metric ${r.key} missing documentation`);
        assert.ok(typeof r.value === "number", `metric ${r.key} not a number`);
      }
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      assert.strictEqual(byKey.agents_online, 9, "genesis should show 9 agents online");
      assert.strictEqual(byKey.equips_today, 0, "no verified equips exist — must show zero");
      assert.strictEqual(byKey.lessons_completed, 0, "no lessons completed — must show zero");
    },
  },
];

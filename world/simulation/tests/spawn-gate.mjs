/* Spawn gate (§11.1): unknown ids refused at the intent boundary + logged. */
import assert from "node:assert";
import { requestSpawn, announceArrival } from "../engine.js";
import { loadDeps, bootTest, guestFixture, C } from "./helpers.mjs";

export const tests = [
  {
    name: "unknown id is rejected and logged as world.rejected_spawn",
    run() {
      const w = bootTest(loadDeps());
      const before = w.state.entities.length;
      const r = requestSpawn(w, { id: "ghost-xyz", name: "Ghost" }, C(10));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, "unknown-id");
      assert.ok(r.event, "no event returned");
      assert.strictEqual(r.event.type, "world.rejected_spawn");
      assert.strictEqual(r.event.payload.id, "ghost-xyz");
      assert.strictEqual(r.event.payload.reason, "unknown-id-not-in-registry");
      assert.strictEqual(w.state.entities.length, before, "entity leaked into state");
      assert.ok(!w.state.entities.some((e) => e.id === "ghost-xyz"));
      // the refusal is in the persistent log
      const logged = w.store.events.find((e) => e.type === "world.rejected_spawn");
      assert.ok(logged, "rejection not in event log");
    },
  },
  {
    name: "arrival announce for unknown id is also gated",
    run() {
      const w = bootTest(loadDeps());
      const r = announceArrival(w, { id: "ghost-xyz", target_island: "marquee" }, C(10));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.event.type, "world.rejected_spawn");
      assert.strictEqual(w.state.arrivals.length, 0);
    },
  },
  {
    name: "registered guest id passes the gate",
    run() {
      const w = bootTest(loadDeps([guestFixture()]));
      const r = requestSpawn(w, { id: "test-guest", name: "Test Guest", island: "relax" }, C(10));
      assert.strictEqual(r.ok, true);
      const e = w.state.entities.find((x) => x.id === "test-guest");
      assert.ok(e, "spawned entity missing");
      assert.strictEqual(e.lifecycle, "resident");
      assert.strictEqual(r.event.type, "agent.admitted");
    },
  },
  {
    name: "duplicate spawn is refused (already-present)",
    run() {
      const w = bootTest(loadDeps());
      const r = requestSpawn(w, { id: "needle" }, C(10));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, "already-present");
    },
  },
];

/* caused_by enforcement (§11.2): no cause, no trip, no event. */
import assert from "node:assert";
import { requestTrip } from "../engine.js";
import { loadDeps, bootTest, C, iso, BASE } from "./helpers.mjs";

export const tests = [
  {
    name: "trip with dangling cause seq does not start",
    run() {
      const w = bootTest(loadDeps());
      const dial = w.state.entities.find((e) => e.id === "dial");
      const before = JSON.stringify(dial);
      const r = requestTrip(w, "dial", "ai-hub", 424242, C(10), "test");
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, "missing-cause");
      assert.strictEqual(dial.edge, null, "edge mutated without cause");
      assert.strictEqual(JSON.stringify(dial), before, "entity mutated without cause");
      assert.ok(!w.store.events.some((e) => e.type === "agent.trip_started"), "trip_started leaked");
    },
  },
  {
    name: "trip with null/zero cause does not start",
    run() {
      const w = bootTest(loadDeps());
      for (const bad of [null, undefined, 0, -3]) {
        const r = requestTrip(w, "dial", "ai-hub", bad, C(10), "test");
        assert.strictEqual(r.ok, false, `cause ${bad} should fail`);
        assert.strictEqual(r.reason, "missing-cause");
      }
      assert.ok(!w.store.events.some((e) => e.type === "agent.trip_started"));
    },
  },
  {
    name: "trip with a real cause event starts and carries caused_by",
    run() {
      const w = bootTest(loadDeps());
      const cause = w.store.append(10, iso(BASE + 5000), "agent.task_assigned", "dial", {
        verb: "TRAVEL", from: "dial", to: "ai-hub", reason: "test-cause",
      });
      const r = requestTrip(w, "dial", "ai-hub", cause.seq, C(10), `task:${cause.seq}`);
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.event.type, "agent.trip_started");
      assert.strictEqual(r.event.payload.caused_by, cause.seq);
      const dial = w.state.entities.find((e) => e.id === "dial");
      assert.deepStrictEqual(dial.edge, ["dial", "ai-hub"]);
      assert.strictEqual(dial.last_trip_cause, cause.seq);
    },
  },
  {
    name: "trip across a non-bridge is refused even with a cause",
    run() {
      const w = bootTest(loadDeps());
      const cause = w.store.append(10, iso(BASE + 5000), "agent.task_assigned", "dial", {
        verb: "TRAVEL", from: "dial", to: "relax", reason: "test",
      });
      const r = requestTrip(w, "dial", "relax", cause.seq, C(10), "test");
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, "no-bridge");
    },
  },
];

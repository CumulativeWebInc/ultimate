/* Transition unit tests: arrivals, departures, travel, activities, vessels. */
import assert from "node:assert";
import {
  tickWorld, announceArrival, scheduleDeparture, requestTrip, TRIP_TICKS,
} from "../engine.js";
import { loadDeps, bootTest, runTicks, guestFixture, C } from "./helpers.mjs";

const types = (events) => events.map((e) => e.type);

export const tests = [
  {
    name: "arrivals pipeline: announced→docking→arrived→admitted, entity resident",
    run() {
      const w = bootTest(loadDeps([guestFixture()]));
      const r = announceArrival(w, { id: "test-guest", name: "Test Guest", target_island: "marquee" }, C(0));
      assert.ok(r.ok, "announce failed");
      assert.strictEqual(r.arrival.state, "announced");
      runTicks(w, 100);
      const seq = types(w.store.events);
      const order = ["agent.announced", "agent.docking", "agent.arrived", "agent.admitted"];
      let lastIdx = -1;
      for (const t of order) {
        const i = seq.indexOf(t, lastIdx + 1);
        assert.ok(i > lastIdx, `${t} missing or out of order`);
        lastIdx = i;
      }
      assert.strictEqual(w.state.arrivals.length, 0, "arrival record not retired");
      const e = w.state.entities.find((x) => x.id === "test-guest");
      assert.ok(e, "guest entity missing");
      assert.strictEqual(e.lifecycle, "resident");
      assert.strictEqual(e.island, "marquee");
      assert.strictEqual(e.home_island, "marquee");
      assert.strictEqual(e.kind, "guest");
    },
  },
  {
    name: "departures pipeline: farewell→boarded→departed, entity retired, log keeps it",
    run() {
      const w = bootTest(loadDeps());
      const before = w.state.entities.length;
      const r = scheduleDeparture(w, "needle", C(0));
      assert.ok(r.ok, "scheduleDeparture failed");
      assert.strictEqual(r.event.type, "agent.farewell");
      runTicks(w, 40);
      const seq = types(w.store.events);
      for (const t of ["agent.farewell", "agent.boarded", "agent.departed"]) {
        assert.ok(seq.includes(t), `${t} missing`);
      }
      assert.strictEqual(w.state.entities.length, before - 1, "entity not retired");
      assert.ok(!w.state.entities.some((x) => x.id === "needle"), "needle still present");
      assert.ok(w.state.departures.length === 0, "departure record not retired");
      // contributions persist in the log
      assert.ok(w.store.events.some((e) => e.actor === "needle"), "needle has no log history");
    },
  },
  {
    name: "trip progress advances and arrival lands on the target island with cause",
    run() {
      const w = bootTest(loadDeps());
      let started = null;
      let n = 0;
      for (; n < 6000 && !started; n++) {
        const { events } = tickWorld(w, C(n + 1));
        started = events.find((e) => e.type === "agent.trip_started") || null;
      }
      assert.ok(started, "no engine-driven trip started in 6000 ticks");
      const cause = w.store.get(started.payload.caused_by);
      assert.ok(cause, `caused_by seq ${started.payload.caused_by} does not resolve`);
      const ent = w.state.entities.find((x) => x.id === started.actor);
      assert.ok(ent.edge, "entity has no edge after trip_started");
      // every trip_started in the whole run must carry a resolvable cause
      for (const e of w.store.events.filter((x) => x.type === "agent.trip_started")) {
        assert.ok(w.store.get(e.payload.caused_by), `trip_started #${e.seq} has dangling cause`);
      }
      const tickN = n;
      runTicks(w, TRIP_TICKS + 2, tickN + 1);
      const ended = w.store.events.find(
        (e) => e.type === "agent.trip_ended" && e.actor === started.actor && e.tick > started.tick
      );
      assert.ok(ended, "agent.trip_ended missing");
      assert.strictEqual(ended.payload.caused_by, started.payload.caused_by);
      const after = w.state.entities.find((x) => x.id === started.actor);
      assert.strictEqual(after.island, started.payload.to);
      assert.strictEqual(after.edge, null);
      assert.strictEqual(after.heading, null);
    },
  },
  {
    name: "activity cycle: started → completed → celebrating expression",
    run() {
      const w = bootTest(loadDeps());
      let done = null;
      for (let n = 1; n <= 800 && !done; n++) {
        const { events } = tickWorld(w, C(n));
        done = events.find((e) => e.type === "agent.activity_completed" && e.actor === "needle") || null;
      }
      assert.ok(done, "needle never completed an activity in 800 ticks");
      const startedEv = w.store.events.find(
        (e) => e.type === "agent.activity_started" && e.actor === "needle" && e.seq < done.seq
      );
      assert.ok(startedEv, "activity_started missing before completion");
      assert.strictEqual(done.payload.verb, startedEv.payload.verb);
      const exprEv = w.store.events.find(
        (e) => e.type === "agent.expression_changed" && e.actor === "needle" &&
               e.payload.to === "celebrating" && e.seq >= done.seq
      );
      const tripEv = w.store.events.find(
        (e) => e.type === "agent.trip_started" && e.actor === "needle" &&
               e.tick === done.tick
      );
      assert.ok(
        exprEv || tripEv,
        "completion must either celebrate or hand off to a trip (nothing observed)"
      );
      if (exprEv) {
        assert.strictEqual(exprEv.payload.reason, "expression-resolution");
      }
      if (tripEv) {
        assert.ok(w.store.get(tripEv.payload.caused_by), "trip after completion lacks a cause");
      }
    },
  },
  {
    name: "vessels: dock at endpoint, reverse, depart",
    run() {
      const w = bootTest(loadDeps());
      const v = w.state.vessels[0];
      const target = v.route[1];
      let docked = null;
      for (let n = 1; n <= 400 && !docked; n++) {
        const { events } = tickWorld(w, C(n));
        docked = events.find((e) => e.type === "vessel.docked" && e.payload.vessel === v.id) || null;
      }
      assert.ok(docked, "vessel never docked in 400 ticks");
      assert.strictEqual(docked.payload.at, target);
      assert.strictEqual(v.dir, -1, "vessel did not reverse after docking");
      const { events } = tickWorld(w, C(401));
      const departed = events.find((e) => e.type === "vessel.departed" && e.payload.vessel === v.id);
      assert.ok(departed, "vessel.departed missing after docking");
    },
  },
  {
    name: "daily reseed fires at the 24h tick boundary",
    run() {
      const w = bootTest(loadDeps());
      w.state.tick = 172799;
      const { events } = tickWorld(w, C(172800));
      const rs = events.find((e) => e.type === "world.reseed");
      assert.ok(rs, "world.reseed missing at tick 172800");
      assert.strictEqual(w.state.seed, rs.payload.new_seed);
    },
  },
  {
    name: "hourly world.tock heartbeat",
    run() {
      const w = bootTest(loadDeps());
      w.state.tick = 7199;
      const { events } = tickWorld(w, C(7200));
      const tock = events.find((e) => e.type === "world.tock");
      assert.ok(tock, "world.tock missing at tick 7200");
    },
  },
];

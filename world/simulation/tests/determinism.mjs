/* Determinism: same seed + same event inputs => byte-identical state. */
import assert from "node:assert";
import { tickWorld, snapshotWorld } from "../engine.js";
import { loadDeps, bootTest, C, BASE, iso } from "./helpers.mjs";

function runOnce(seed) {
  const deps = loadDeps();
  const w = bootTest(deps, seed);
  for (let n = 1; n <= 600; n++) tickWorld(w, C(n));
  const snap = snapshotWorld(w, iso(BASE), C(600));
  return { snapJson: JSON.stringify(snap), log: w.store.toJSONL(), head: w.store.head, tick: w.state.tick };
}

export const tests = [
  {
    name: "same seed + same inputs => byte-identical state after 600 ticks",
    run() {
      const a = runOnce(20260915);
      const b = runOnce(20260915);
      assert.strictEqual(a.tick, 600);
      assert.strictEqual(a.snapJson, b.snapJson, "state snapshots differ");
      assert.strictEqual(a.log, b.log, "event logs differ");
      assert.strictEqual(a.head, b.head);
      assert.ok(a.snapJson.length > 1000, "snapshot suspiciously small");
    },
  },
  {
    name: "different seed => different state (rng actually drives the sim)",
    run() {
      const a = runOnce(20260915);
      const b = runOnce(777);
      assert.notStrictEqual(a.snapJson, b.snapJson, "different seeds must diverge");
    },
  },
  {
    name: "event log seqs are dense 1-based after a long run",
    run() {
      const { log } = runOnce(20260915);
      const lines = log.trim().split("\n").map((l) => JSON.parse(l));
      lines.forEach((e, i) => assert.strictEqual(e.seq, i + 1, `seq break at line ${i + 1}`));
      for (const e of lines) {
        assert.ok(typeof e.tick === "number" && typeof e.ts === "string" && typeof e.type === "string");
      }
    },
  },
];

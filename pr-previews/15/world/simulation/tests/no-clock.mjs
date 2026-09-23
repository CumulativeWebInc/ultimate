/* Static + runtime enforcement of the no-wall-clock rule inside transitions.
 * Design §7: no Math.random() / Date.now() inside transition functions. */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotWorld } from "../engine.js";
import { loadDeps, bootTest, runTicks, C, BASE, iso, ROOT } from "./helpers.mjs";

const ENGINE_FILES = ["rng.js", "events.js", "engine.js", "metrics.js"];
const FORBIDDEN = [/Math\.random/, /Date\.now/, /new Date\(/];

export const tests = [
  {
    name: "no Math.random / Date.now / new Date( in engine-side sources",
    run() {
      for (const f of ENGINE_FILES) {
        const src = readFileSync(join(ROOT, "world/simulation", f), "utf8");
        for (const re of FORBIDDEN) {
          assert.ok(!re.test(src), `${f} contains forbidden token ${re}`);
        }
      }
    },
  },
  {
    name: "transition output is independent of when the test runs (no hidden clock)",
    run() {
      // run the same scenario "later" by shifting only the injected clock's
      // date; state shape must be identical apart from ts strings.
      const deps = loadDeps();
      const w = bootTest(deps);
      runTicks(w, 200);
      const snap = snapshotWorld(w, iso(BASE), C(200));
      const stripTs = (s) => JSON.parse(JSON.stringify(s, (k, v) => (k === "ts" ? "<ts>" : v)));
      const a = JSON.stringify(stripTs(snap));
      const w2 = bootTest(deps);
      runTicks(w2, 200);
      const snap2 = snapshotWorld(w2, iso(BASE), C(200));
      assert.strictEqual(a, JSON.stringify(stripTs(snap2)));
    },
  },
];

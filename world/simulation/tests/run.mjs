/* Test harness: node world/simulation/tests/run.mjs */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(["run.mjs", "helpers.mjs"]);
const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && !SKIP.has(f)).sort();

let pass = 0, fail = 0;
const failures = [];
for (const f of files) {
  const mod = await import(join(DIR, f));
  const tests = mod.tests || [];
  for (const t of tests) {
    try {
      await t.run();
      pass += 1;
      console.log(`PASS ${f} :: ${t.name}`);
    } catch (e) {
      fail += 1;
      failures.push(`${f} :: ${t.name}: ${e.message}`);
      console.log(`FAIL ${f} :: ${t.name}\n  ${String(e.message).split("\n").join("\n  ")}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:");
  for (const x of failures) console.log(` - ${x}`);
}
process.exit(fail ? 1 : 0);

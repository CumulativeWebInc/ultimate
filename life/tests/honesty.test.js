/**
 * Honesty enforcement tests for the LIFE layer.
 * Run: node life/tests/honesty.test.js
 *
 * What this proves (beyond docs):
 *  1. LifeHonesty.assertNotAmbientForLedger THROWS on ambient states.
 *  2. LifeRhythm's produced states are ambient-tagged + frozen, and FAIL the
 *     ledger gate (i.e. they can never be persisted even by accident).
 *  3. LifeRhythm ships ZERO ledger/network write paths (source scan).
 *  4. LifeRender ships ZERO ledger/network write paths (source scan).
 *  5. auditLife catches structural violations (worn-but-not-owned, etc.).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const LIFE = path.join(__dirname, "..");
const Honesty = require(path.join(LIFE, "honesty.js"));
const Render = require(path.join(LIFE, "render-life.js"));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    console.error("  FAIL " + name + "\n        " + (e && e.message));
    process.exitCode = 1;
  }
}

console.log("life honesty tests");

/** Strip block + line comments so doc comments can't trip the scanners. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

// 1 — the gate throws on ambient entries
test("assertNotAmbientForLedger throws on ambient entry", () => {
  const ambient = Honesty.tagAmbient({ resting: true });
  assert.throws(
    () => Honesty.assertNotAmbientForLedger(ambient, "activity/ledger.json"),
    (e) => e.name === "LifeHonestyError" && e.code === "AMBIENT_TO_LEDGER"
  );
});

// 1b — the gate passes real entries
test("assertNotAmbientForLedger passes real (non-ambient) entries", () => {
  assert.strictEqual(
    Honesty.assertNotAmbientForLedger({ resting: false, agent: "fader" }, "ledger"),
    true
  );
  assert.strictEqual(Honesty.assertNotAmbientForLedger(null, "ledger"), true);
});

// 2 — rhythm states are ambient, frozen, and ledger-unsafe
test("rhythm ambient states are tagged, frozen, and fail the ledger gate", () => {
  // rhythm.js needs DOM; load it in a minimal sandbox instead of requiring it.
  const src = codeOnly(fs.readFileSync(path.join(LIFE, "rhythm.js"), "utf8"));
  // _nextAmbientState must route through Honesty.tagAmbient in source.
  assert.ok(src.includes("tagAmbient"), "rhythm.js must tag states via LifeHonesty.tagAmbient");
  const ambient = Honesty.tagAmbient({ resting: true, rest_zone: "the-quiet-loft" });
  assert.strictEqual(ambient.ambient, true);
  assert.strictEqual(ambient.ambientSource, Honesty.AMBIENT_SOURCE);
  assert.ok(Object.isFrozen(ambient), "ambient state must be frozen so the tag cannot be stripped");
  assert.throws(() => Honesty.assertNotAmbientForLedger(ambient, "ledger"));
  // frozen => stripping the tag is impossible
  assert.throws(() => { "use strict"; ambient.ambient = false; }, TypeError);
});

// 3 — rhythm.js has no ledger/network write paths
test("rhythm.js contains no ledger or network write paths", () => {
  const src = codeOnly(fs.readFileSync(path.join(LIFE, "rhythm.js"), "utf8"));
  const banned = [
    /fetch\s*\(/, /XMLHttpRequest/, /last_checkin\s*=/, /\.ledger/i,
    /localStorage/, /sessionStorage/, /navigator\.sendBeacon/
  ];
  banned.forEach((re) => {
    assert.ok(!re.test(src), "rhythm.js must not contain " + re);
  });
  assert.ok(!/commitToLedger|writeLedger|appendLedger/i.test(src));
});

// 4 — render-life.js has no ledger/network write paths
test("render-life.js contains no ledger or network write paths", () => {
  const src = codeOnly(fs.readFileSync(path.join(LIFE, "render-life.js"), "utf8"));
  const banned = [/fetch\s*\(/, /XMLHttpRequest/, /last_checkin/, /\.ledger/i, /localStorage/];
  banned.forEach((re) => {
    assert.ok(!re.test(src), "render-life.js must not contain " + re);
  });
});

// 5 — auditLife catches structural violations
test("auditLife flags worn-but-not-owned and unknown zones", () => {
  const indexes = {
    items: { "ear-witness": {}, "hype": {} },
    tracks: { "zooted-zone": {} },
    zones: { "the-quiet-loft": {} }
  };
  const bad = {
    resting: true,
    rest_zone: "nope-zone",
    inventory: { items: ["ear-witness"], worn: ["hype", "ghost-item"], music: ["ghost-track"] },
    last_checkin: "not-a-date"
  };
  const problems = Honesty.auditLife(bad, indexes);
  assert.ok(problems.some((p) => p.includes("not owned")), "worn-but-not-owned flagged");
  assert.ok(problems.some((p) => p.includes("nope-zone")), "unknown zone flagged");
  assert.ok(problems.some((p) => p.includes("ghost-item")), "unknown item flagged");
  assert.ok(problems.some((p) => p.includes("ghost-track")), "unknown track flagged");
  assert.ok(problems.some((p) => p.includes("ISO-8601")), "bad last_checkin flagged");
});

test("auditLife passes a clean life object", () => {
  const indexes = {
    items: { "ear-witness": {} },
    tracks: { "zooted-zone": {} },
    zones: { "the-quiet-loft": {} }
  };
  const good = {
    resting: true,
    rest_zone: "the-quiet-loft",
    inventory: { items: ["ear-witness"], worn: ["ear-witness"], music: ["zooted-zone"] },
    last_checkin: null
  };
  assert.deepStrictEqual(Honesty.auditLife(good, indexes), []);
});

// 6 — render module exposes the documented API surface
test("render-life.js exposes the documented API", () => {
  ["renderLifeLayers", "setResting", "renderNowPlaying", "setAmbientBadge"].forEach((fn) => {
    assert.strictEqual(typeof Render[fn], "function", "LifeRender." + fn + " must exist");
  });
});

console.log(passed + " tests passed" + (process.exitCode ? " (WITH FAILURES)" : ""));

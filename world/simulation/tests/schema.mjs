/* Schema validation: emitted world.json must satisfy schema-v2.json.
 * A dependency-free validator for the draft-07 subset the schema uses. */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotWorld } from "../engine.js";
import { loadDeps, bootTest, runTicks, C, BASE, iso, ROOT } from "./helpers.mjs";

function checkType(t, v) {
  const ts = Array.isArray(t) ? t : [t];
  return ts.some((x) => {
    if (x === "string") return typeof v === "string";
    if (x === "number") return typeof v === "number";
    if (x === "integer") return Number.isInteger(v);
    if (x === "boolean") return typeof v === "boolean";
    if (x === "array") return Array.isArray(v);
    if (x === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
    if (x === "null") return v === null;
    return false;
  });
}

function validate(schema, value, path, errors) {
  if (schema.not !== undefined) {
    const sub = [];
    validate(schema.not, value, path, sub);
    if (sub.length === 0) errors.push(`${path}: matches forbidden 'not' schema`);
    return;
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  }
  if (schema.type && !checkType(schema.type, value)) {
    errors.push(`${path}: expected type ${JSON.stringify(schema.type)}, got ${Array.isArray(value) ? "array" : typeof value}`);
    return;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errors));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) {
      if (!(k in value)) errors.push(`${path}: missing required "${k}"`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) validate(sub, value[k], path ? `${path}.${k}` : k, errors);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!(schema.properties || {})[k]) errors.push(`${path}: additional property "${k}" forbidden`);
      }
    }
  }
}

export function validateSnapshot(schema, snap) {
  const errors = [];
  validate(schema, snap, "$", errors);
  return errors;
}

export const tests = [
  {
    name: "genesis snapshot validates against schema-v2.json",
    run() {
      const schema = JSON.parse(readFileSync(join(ROOT, "world/simulation/schema-v2.json"), "utf8"));
      const w = bootTest(loadDeps());
      const snap = snapshotWorld(w, iso(BASE), C(0));
      const errors = validateSnapshot(schema, snap);
      assert.deepStrictEqual(errors, [], `schema errors:\n${errors.join("\n")}`);
    },
  },
  {
    name: "mid-run snapshot (travel + activities + vessels) validates",
    run() {
      const schema = JSON.parse(readFileSync(join(ROOT, "world/simulation/schema-v2.json"), "utf8"));
      const w = bootTest(loadDeps());
      runTicks(w, 400);
      const snap = snapshotWorld(w, iso(BASE), C(400));
      assert.ok(snap.entities.some((e) => e.edge), "expected a trip in flight at tick 400");
      const errors = validateSnapshot(schema, snap);
      assert.deepStrictEqual(errors, [], `schema errors:\n${errors.join("\n")}`);
    },
  },
  {
    name: "invalid snapshots are rejected (bad enum, missing field, ambient leak)",
    run() {
      const schema = JSON.parse(readFileSync(join(ROOT, "world/simulation/schema-v2.json"), "utf8"));
      const w = bootTest(loadDeps());
      const good = snapshotWorld(w, iso(BASE), C(0));
      const bad1 = JSON.parse(JSON.stringify(good));
      bad1.entities[0].lifecycle = "ghost";
      assert.ok(validateSnapshot(schema, bad1).length > 0, "bad lifecycle accepted");
      const bad2 = JSON.parse(JSON.stringify(good));
      delete bad2.entities;
      assert.ok(validateSnapshot(schema, bad2).length > 0, "missing entities accepted");
      const bad3 = JSON.parse(JSON.stringify(good));
      bad3.ambient = { tick: 0 };
      assert.ok(validateSnapshot(schema, bad3).length > 0, "ambient leak accepted");
      const bad4 = JSON.parse(JSON.stringify(good));
      bad4.schema_version = "1.9.9";
      assert.ok(validateSnapshot(schema, bad4).length > 0, "wrong schema_version accepted");
    },
  },
  {
    name: "committed world/world.json validates",
    run() {
      const schema = JSON.parse(readFileSync(join(ROOT, "world/simulation/schema-v2.json"), "utf8"));
      const snap = JSON.parse(readFileSync(join(ROOT, "world/world.json"), "utf8"));
      const errors = validateSnapshot(schema, snap);
      assert.deepStrictEqual(errors, [], `committed snapshot errors:\n${errors.join("\n")}`);
    },
  },
];

/* Shared test fixtures. Deterministic wall-clock: every test uses the same
 * fixed BASE epoch; the engine receives it as an injected tick clock. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boot, tickClock, tickWorld } from "../engine.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const BASE = 1789519306583; // fixed epoch: 2026-09-16T00:41:46.583Z
export const iso = (ms) => new Date(ms).toISOString();
export const C = (n) => tickClock(BASE + n * 500, iso(BASE + n * 500));

export function loadDeps(guestFixtures = []) {
  const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
  const islandsDoc = read("world/islands.json");
  const agentIndex = read("agents/index.json");
  const guestsIndex = { schema_version: "1.0.0", guests: guestFixtures };
  const profiles = {};
  for (const id of agentIndex.agents) profiles[id] = read(`agents/${id}.json`);
  return {
    islands: islandsDoc.islands,
    renderCfg: islandsDoc.render || {},
    agents: { index: agentIndex, profiles },
    guests: guestsIndex,
  };
}

export function bootTest(deps, seed = 20260915) {
  return boot({
    seed,
    baseEpochMs: BASE,
    generatedAt: iso(BASE),
    islands: deps.islands,
    agents: deps.agents,
    guests: deps.guests,
    clock0: C(0),
  });
}

export function runTicks(w, n, from = 1) {
  let last = null;
  for (let i = 0; i < n; i++) last = tickWorld(w, C(from + i));
  return last;
}

export function guestFixture(name = "test-guest") {
  return {
    name, agent_card_url: "https://example.com/card.json",
    joined_at: iso(BASE), status: "visitor", last_action: "test",
  };
}

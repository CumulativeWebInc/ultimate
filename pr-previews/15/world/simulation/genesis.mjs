/* PROJECT ULTIMATE — genesis snapshot builder (world/simulation/genesis.mjs)
 * Builds the committed boot snapshots from REAL repo data:
 *   world/world.json        (v2.0.0 simulation snapshot, tick 0)
 *   activity/events.jsonl   (seed event log: the genesis event, seq 1)
 * The snapshot is produced BY the engine (boot()), never hand-edited.
 * Run: node world/simulation/genesis.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boot, snapshotWorld, tickClock } from "./engine.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const islandsDoc = read("world/islands.json");
const agentIndex = read("agents/index.json");
const guestsIndex = read("guests/index.json");
const profiles = {};
const ids = [...agentIndex.agents];
if (agentIndex.chief && !ids.includes(agentIndex.chief)) ids.push(agentIndex.chief);
for (const id of ids) profiles[id] = read(`agents/${id}.json`);

const nowMs = Date.now();
const generatedAt = new Date(nowMs).toISOString();
const SEED = 20260915;

const w = boot({
  seed: SEED,
  baseEpochMs: nowMs,
  generatedAt,
  islands: islandsDoc.islands,
  agents: { index: agentIndex, profiles },
  guests: guestsIndex,
  clock0: tickClock(nowMs, generatedAt),
});

const snap = snapshotWorld(w, generatedAt, tickClock(nowMs, generatedAt));

mkdirSync(join(ROOT, "world"), { recursive: true });
mkdirSync(join(ROOT, "activity"), { recursive: true });
writeFileSync(join(ROOT, "world", "world.json"), JSON.stringify(snap, null, 2) + "\n");
writeFileSync(join(ROOT, "activity", "events.jsonl"), w.store.toJSONL());

console.log(`genesis written: tick=${snap.tick} seed=${snap.seed} entities=${snap.entities.length} vessels=${snap.vessels.length}`);
console.log(`events seeded: ${w.store.head} (head seq ${w.store.head})`);
for (const e of w.store.events) {
  if (e.actor !== null) console.log(`  #${e.seq} ${e.type} actor=${e.actor}`);
}

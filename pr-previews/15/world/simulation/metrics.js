/* PROJECT ULTIMATE — honest metrics (world/simulation)
 * ============================================================================
 * Every displayed metric is a real count computed from real data at render
 * time. Zero shows zero. Each metric documents the exact query that produced
 * it (QUERIES), and the renderer surfaces that query on every metric.
 *
 * ARCHITECTURAL RULE (§11.4): metric functions may read ONLY canonical
 * state (entities/vessels) and the event log. They must NEVER read
 * state.ambient. This file contains no reference to ambient, and the test
 * suite enforces that statically and at runtime.
 * ============================================================================
 */

export const QUERIES = {
  agents_online:
    "count(world.json entities where lifecycle = 'resident')",
  equips_today:
    "count(activity/events.jsonl where type = 'agent.equipped' and ts within 24h)",
  lessons_completed:
    "count(activity/events.jsonl where type = 'lesson.completed')",
  arrivals_24h:
    "count(activity/events.jsonl where type = 'agent.arrived' and ts within 24h)",
  departures_24h:
    "count(activity/events.jsonl where type = 'agent.departed' and ts within 24h)",
};

const DAY_MS = 86400000;

function within24h(ts, nowMs) {
  const t = Date.parse(ts);
  return !Number.isNaN(t) && t >= nowMs - DAY_MS && t <= nowMs + 60000;
}

export function agentsOnline(state) {
  return state.entities.filter((e) => e.lifecycle === "resident").length;
}

export function equipsToday(store, nowMs) {
  return store.events.filter((e) => e.type === "agent.equipped" && within24h(e.ts, nowMs)).length;
}

export function lessonsCompleted(store) {
  return store.events.filter((e) => e.type === "lesson.completed").length;
}

export function arrivals24h(store, nowMs) {
  return store.events.filter((e) => e.type === "agent.arrived" && within24h(e.ts, nowMs)).length;
}

export function departures24h(store, nowMs) {
  return store.events.filter((e) => e.type === "agent.departed" && within24h(e.ts, nowMs)).length;
}

/* One call the renderer uses. Returns rows: { key, label, value, query }.
 * Reads canonical state + event log only. */
export function allMetrics(state, store, nowMs) {
  return [
    { key: "agents_online", label: "Agents online", value: agentsOnline(state), query: QUERIES.agents_online },
    { key: "equips_today", label: "Equips today", value: equipsToday(store, nowMs), query: QUERIES.equips_today },
    { key: "lessons_completed", label: "Lessons completed", value: lessonsCompleted(store), query: QUERIES.lessons_completed },
    { key: "arrivals_24h", label: "Arrivals · 24h", value: arrivals24h(store, nowMs), query: QUERIES.arrivals_24h },
    { key: "departures_24h", label: "Departures · 24h", value: departures24h(store, nowMs), query: QUERIES.departures_24h },
  ];
}

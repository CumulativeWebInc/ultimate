/* PROJECT ULTIMATE — living world tick engine (world/simulation)
 * ============================================================================
 * 2 Hz deterministic simulation. Pure transition functions run in fixed order
 * every tick: tickArrivals -> tickDepartures -> tickTravel -> tickActivities
 * -> tickVessels -> tickAmbient.
 *
 * Determinism contract (SIMULATION-DESIGN.md §7):
 *  - transitions are pure: (world, tick, rng) -> world'; rng is seeded.
 *  - wall-clock enters ONLY as the tick counter and the event `ts` string,
 *    both injected by the host via the tick clock. The engine never reads a clock.
 *  - no unseeded randomness anywhere in this file.
 *
 * Truth contract enforcement:
 *  - §11.1 spawn gate: requestSpawn / announceArrival refuse unknown ids and
 *    log world.rejected_spawn. The gate lives at the intent boundary.
 *  - §11.2 event-sourced movement: requestTrip refuses to start a trip
 *    without a resolvable caused_by event seq. No cause, no trip, no event.
 *  - §11.4 ambient separation: state.ambient is cosmetic, derived from tick,
 *    never persisted (snapshotWorld drops it) and never logged.
 * ============================================================================
 * Vanilla JS, no dependencies. Runs in browsers (module script) and Node.
 */

import { mulberry32 } from "./rng.js";
import { EventStore } from "./events.js";

export const TICK_HZ = 2;
export const SCHEMA_VERSION = "2.0.0";
export const TRIP_TICKS = 18;          // one bridge crossing = 9s at 2Hz
export const VESSEL_LEG_TICKS = 240;    // one ferry leg = 120s
export const FAREWELL_TICKS = 12;       // walk to the dock
export const BOARD_TICKS = 8;          // boarding window
export const ARRIVAL_SAIL_TICKS = 6;    // announced -> docking
export const ARRIVAL_VOYAGE_TICKS = 60; // docking -> disembarking
export const ARRIVAL_WALK_TICKS = 14;   // dock -> admissions walk
export const CELEBRATE_TICKS = 8;       // expression hold after a win
export const PUBLISH_EVERY_TICKS = 60;  // snapshot cadence (host persists)
export const TOCKS_EVERY_TICKS = 7200;  // hourly heartbeat at 2Hz
export const RESEED_EVERY_TICKS = 172800; // daily reseed at 2Hz

/* Lifecycle event types: the host persists the snapshot + session log
 * immediately when any of these is emitted (in addition to the N-tick cadence). */
const LIFECYCLE_EVENT_TYPES = new Set([
  "world.genesis",
  "world.rejected_spawn",
  "agent.announced",
  "agent.docking",
  "agent.arrived",
  "agent.admitted",
  "agent.trip_started",
  "agent.trip_ended",
  "agent.farewell",
  "agent.boarded",
  "agent.departed",
]);
export function isLifecycleEvent(type) {
  return LIFECYCLE_EVENT_TYPES.has(type);
}

/* Work-queue target nouns per island verb. These are the simulation's own
 * task labels (auditable in the log), never claims about the outside world. */
const VERB_TARGETS = {
  SCOUT: "prospect", VERIFY: "submission", SIGN: "act",
  PUBLISH: "drop", PROMOTE: "push", ENGAGE: "thread",
  LICENSE: "placement", CLEAR: "cue-sheet", PROTECT: "claim",
  SPIN: "record", PITCH: "curator", CHART: "tracker",
  WRITE: "story", PLACE: "feature", AMPLIFY: "signal",
  MIX: "stem", BUILD: "cut", SHIP: "master",
  COUNT: "report", PROVE: "receipt", SEAL: "ledger-page",
  DRAFT: "clause", DEAL: "term-sheet", GOVERN: "motion",
  PLAN: "sprint", WORK: "build", GROW: "loop",
  REST: "break", RECHARGE: "session", REFLECT: "note",
  DREAM: "concept", SKETCH: "mock", LAUNCH: "window",
  BROWSE: "stall", TRADE: "swap", COLLECT: "find",
  LEARN: "lesson", PRACTICE: "drill", EARN: "badge",
  COMPUTE: "job", STORE: "shard", SERVE: "query",
};

function targetFor(entityId, verb, rng) {
  const noun = VERB_TARGETS[verb] || "item";
  return `${noun}-${String(100 + Math.floor(rng() * 900))}`;
}

/* ---------------- registries & geometry ---------------- */

export function buildRegistry(agentIndex, guestsIndex) {
  const agents = new Set(agentIndex && agentIndex.agents ? agentIndex.agents : []);
  if (agentIndex && agentIndex.chief) agents.add(agentIndex.chief);
  const guests = new Set();
  const list = guestsIndex && guestsIndex.guests ? guestsIndex.guests : [];
  for (const g of list) {
    const status = typeof g === "string" ? null : g && g.status;
    const name = typeof g === "string" ? g : g && g.name;
    if (name && (status === "visitor" || status === "resident" || status === "citizen")) {
      guests.add(name);
    }
  }
  return {
    agents,
    guests,
    has(id) {
      return agents.has(id) || guests.has(id);
    },
  };
}

function buildGeo(islands) {
  const geo = {};
  for (const isl of islands || []) {
    geo[isl.id] = {
      x: isl.position.x,
      y: isl.position.y,
      bridges: [...(isl.bridges || [])],
    };
  }
  return geo;
}

function homeIslandFor(agentId, islandsById) {
  for (const id of Object.keys(islandsById)) {
    if (islandsById[id].owner_agent === agentId) return id;
  }
  return null;
}

function normalizeInventory(profile) {
  const inv = (profile && profile.life && profile.life.inventory) || {};
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  return { worn: arr(inv.worn), items: arr(inv.items), music: arr(inv.music) };
}

function findEntity(w, id) {
  return w.state.entities.find((e) => e.id === id) || null;
}

function centerPoint(w, islandId) {
  const g = w.geo[islandId];
  return { x: g.x, y: g.y };
}

/* The dock: water-side of the island pavilion, in island-percent coords. */
function dockPoint(w, islandId) {
  const g = w.geo[islandId];
  return { x: g.x + 5, y: g.y + 6 };
}

/* The host injects the tick clock { ms, iso }: wall-clock enters the sim
 * ONLY here — as the tick counter (ms, for 24h math) and the published event
 * ts (iso). The engine never reads a clock and never formats time. */
export function tickClock(ms, iso) {
  return { ms, iso };
}

function emit(w, tick, clock, type, actor, payload) {
  return w.store.append(tick, clock.iso, type, actor, payload || {});
}

function setExpression(w, tick, clock, entity, expr, reason) {
  if (entity.expression === expr) return null;
  const from = entity.expression;
  entity.expression = expr;
  return emit(w, tick, clock, "agent.expression_changed", entity.id, { from, to: expr, reason: reason || "" });
}

/* ---------------- world construction ---------------- */

function spawnEntityInternal(w, spec) {
  const entity = {
    id: spec.id,
    kind: spec.kind || "guest",
    name: spec.name || spec.id,
    department: spec.department || "",
    home_island: spec.home_island || spec.island || "ai-hub",
    island: spec.island || "ai-hub",
    pos: spec.pos ? { x: spec.pos.x, y: spec.pos.y } : { x: 50, y: 46 },
    heading: null,
    progress: 0,
    edge: null,
    last_trip_cause: null,
    lifecycle: spec.lifecycle || "resident",
    activity: null,
    expression: spec.expression || "idle",
    avatar: spec.avatar || `avatars/${spec.id}-avatar.png`,
    poster: spec.poster || `avatars/${spec.id}-avatar.png`,
    inventory: spec.inventory || { worn: [], items: [], music: [] },
    current_action: spec.current_action || "",
    persona_line: spec.persona_line || "",
    celebrate_until: 0,
  };
  w.state.entities.push(entity);
  return entity;
}

/* boot(): build the genesis world. deps:
 *   seed, baseEpochMs, generatedAt (ISO string, host-supplied),
 *   islands (islands.json records), agents {index, profiles},
 *   guests (guests/index.json).
 * Returns the live world handle { state, store, geo, registry, islandsById }.
 * The genesis event is the log's seq 1. */
export function boot({ seed, baseEpochMs, generatedAt, islands, agents, guests, clock0 }) {
  const c0 = clock0 || tickClock(baseEpochMs, generatedAt);
  const islandsById = {};
  for (const isl of islands || []) islandsById[isl.id] = isl;
  const geo = buildGeo(islands);
  const registry = buildRegistry(agents.index, guests);

  const state = {
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    tick: 0,
    tick_hz: TICK_HZ,
    seed,
    base_epoch_ms: baseEpochMs,
    islands_ref: "world/islands.json",
    entities: [],
    vessels: [],
    arrivals: [],
    departures: [],
    work_queues: {},
    time_override: null,
    ledger_head: 0,
    counts: { agents: 0, guests: 0, vessels: 0, events_24h: 0 },
    ambient: null,
  };
  const w = { state, store: new EventStore(), geo, registry, islandsById };

  const order = [...(agents.index.agents || [])];
  if (agents.index.chief && !order.includes(agents.index.chief)) order.push(agents.index.chief);
  for (const id of order) {
    const p = agents.profiles[id];
    // Only real agent profiles spawn entities. agents/index.json also indexes
    // registry/docs files (e.g. tool-registry); they carry no agent `id` and
    // must never materialize as world entities. Truth contract §11.
    if (!p || typeof p.id !== "string") continue;
    const home = homeIslandFor(id, islandsById) || "ai-hub";
    const entity = spawnEntityInternal(w, {
      id,
      kind: id === agents.index.chief ? "chief" : "department",
      name: p.name || id,
      department: p.department || "",
      island: home,
      home_island: home,
      pos: centerPoint(w, home),
      lifecycle: "resident",
      expression: "working",
      avatar: p.avatar,
      poster: p.poster,
      inventory: normalizeInventory(p),
      current_action: p.current_action || p.role || "",
      persona_line: p.persona_line || "",
    });
    entity.home_island = home;
    const isl = islandsById[home];
    w.state.work_queues[id] = { verbs: [...((isl && isl.verbs) || ["WORK"])], idx: 0 };
  }

  const route = (a, b) => (geo[a] && geo[b] ? [a, b] : null);
  const routes = [route("ai-hub", "dial"), route("ai-hub", "needle"), route("ai-hub", "charter")].filter(Boolean);
  const starts = [0.2, 0.5, 0.8];
  routes.forEach((r, i) => {
    w.state.vessels.push({ id: `ferry-${i + 1}`, route: r, u: starts[i % starts.length], dir: 1, carrying: [], docked: false });
  });

  emit(w, 0, c0, "world.genesis", null, {
    seed,
    agents: w.state.entities.length,
    vessels: w.state.vessels.length,
    islands_ref: state.islands_ref,
    envelope: "v1",
  });
  refreshCounts(w, c0.ms);
  state.ledger_head = w.store.head;
  return w;
}

function refreshCounts(w, nowMs) {
  const s = w.state;
  const residents = s.entities.filter((e) => e.lifecycle === "resident");
  const cutoff = nowMs - 86400000;
  let recent = 0;
  for (const e of w.store.events) {
    const t = Date.parse(e.ts);
    if (!Number.isNaN(t) && t >= cutoff) recent += 1;
  }
  s.counts = {
    agents: residents.filter((e) => e.kind !== "guest").length,
    guests: residents.filter((e) => e.kind === "guest").length,
    vessels: s.vessels.length,
    events_24h: recent,
  };
}

/* ---------------- the tick ---------------- */

export function tickWorld(w, clock) {
  const s = w.state;
  const tick = s.tick + 1;
  s.tick = tick;
  const rng = mulberry32((s.seed + tick) >>> 0);
  const before = w.store.head;

  tickArrivals(w, tick, rng, clock);
  tickDepartures(w, tick, rng, clock);
  tickTravel(w, tick, rng, clock);
  tickActivities(w, tick, rng, clock);
  tickVessels(w, tick, rng, clock);
  tickAmbient(w, tick, rng, clock);

  if (tick % TOCKS_EVERY_TICKS === 0) {
    emit(w, tick, clock, "world.tock", null, {
      residents: s.entities.filter((e) => e.lifecycle === "resident").length,
      vessels: s.vessels.length,
    });
  }
  if (tick % RESEED_EVERY_TICKS === 0) {
    const newSeed = (Math.imul(s.seed, 31) + tick) >>> 0;
    emit(w, tick, clock, "world.reseed", null, { old_seed: s.seed, new_seed: newSeed });
    s.seed = newSeed;
  }

  s.ledger_head = w.store.head;
  refreshCounts(w, clock.ms);
  return { tick, events: w.store.events.slice(before) };
}

/* 1. arrivals: announced -> docking -> disembarking -> admitted */
function tickArrivals(w, tick, rng, clock) {
  const s = w.state;
  for (let i = s.arrivals.length - 1; i >= 0; i--) {
    const ar = s.arrivals[i];
    if (ar.state === "announced" && tick >= ar.sail_tick) {
      ar.state = "docking";
      emit(w, tick, clock, "agent.docking", ar.entity_id, { vessel: ar.vessel, target_island: ar.target_island });
    } else if (ar.state === "docking" && tick >= ar.eta_tick) {
      ar.state = "disembarking";
      spawnEntityInternal(w, {
        id: ar.entity_id, kind: "guest", name: ar.name,
        island: ar.target_island, pos: dockPoint(w, ar.target_island), lifecycle: "arriving",
      });
      emit(w, tick, clock, "agent.arrived", ar.entity_id, { island: ar.target_island });
    } else if (ar.state === "disembarking") {
      const e = findEntity(w, ar.entity_id);
      const p = Math.min(1, (tick - ar.eta_tick) / ARRIVAL_WALK_TICKS);
      const dock = dockPoint(w, ar.target_island);
      const c = centerPoint(w, ar.target_island);
      if (e) e.pos = { x: dock.x + (c.x - dock.x) * p, y: dock.y + (c.y - dock.y) * p };
      if (tick >= ar.admit_tick) {
        if (e) {
          e.lifecycle = "resident";
          e.home_island = ar.target_island;
          e.pos = { x: c.x, y: c.y };
          e.expression = "working";
        }
        s.arrivals.splice(i, 1);
        emit(w, tick, clock, "agent.admitted", ar.entity_id, {
          island: ar.target_island, home_island: ar.target_island,
        });
      }
    }
  }
}

/* 2. departures: farewell -> boarding -> departed (entity retired; log keeps it) */
function tickDepartures(w, tick, rng, clock) {
  const s = w.state;
  for (let i = s.departures.length - 1; i >= 0; i--) {
    const d = s.departures[i];
    const e = findEntity(w, d.entity_id);
    if (!e) {
      s.departures.splice(i, 1);
      continue;
    }
    if (d.state === "farewell") {
      const p = Math.min(1, (tick - d.start_tick) / FAREWELL_TICKS);
      const c = centerPoint(w, e.island);
      const dock = dockPoint(w, e.island);
      e.pos = { x: c.x + (dock.x - c.x) * p, y: c.y + (dock.y - c.y) * p };
      if (tick >= d.start_tick + FAREWELL_TICKS) {
        d.state = "boarding";
        e.lifecycle = "departing";
        e.pos = { x: dock.x, y: dock.y };
        emit(w, tick, clock, "agent.boarded", e.id, { vessel: d.vessel, island: e.island });
      }
    } else if (d.state === "boarding" && tick >= d.start_tick + FAREWELL_TICKS + BOARD_TICKS) {
      const island = e.island;
      s.entities = s.entities.filter((x) => x.id !== e.id);
      s.departures.splice(i, 1);
      emit(w, tick, clock, "agent.departed", d.entity_id, { island, contributions_kept: true });
    }
  }
}

/* 3. travel: advance progress along the bridge edge; engine owns pos. */
function tickTravel(w, tick, rng, clock) {
  for (const e of w.state.entities) {
    if (!e.edge) continue;
    const [a, b] = e.edge;
    const A = w.geo[a];
    const B = w.geo[b];
    if (!A || !B) {
      e.edge = null; e.heading = null; e.progress = 0;
      continue;
    }
    e.progress = Math.min(1, e.progress + 1 / TRIP_TICKS);
    const p = e.progress;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(p * Math.PI) * 2.0; // gentle arc over the water
    e.pos = {
      x: A.x + dx * p + (-dy / len) * bow,
      y: A.y + dy * p + (dx / len) * bow,
    };
    if (e.progress >= 1) {
      const cause = e.last_trip_cause;
      e.island = b;
      e.pos = { x: B.x, y: B.y };
      e.edge = null;
      e.heading = null;
      e.progress = 0;
      e.last_trip_cause = null;
      emit(w, tick, clock, "agent.trip_ended", e.id, {
        from: a, to: b, caused_by: cause, duration_ticks: TRIP_TICKS,
      });
    }
  }
}

/* 4. activities: work-queue verb cycles; completions may schedule trips. */
function tickActivities(w, tick, rng, clock) {
  const s = w.state;
  for (const e of s.entities) {
    if (e.lifecycle !== "resident" || e.edge) continue;
    if (!e.activity) {
      const q = s.work_queues[e.id];
      if (!q || !q.verbs.length) continue;
      const verb = q.verbs[q.idx % q.verbs.length];
      q.idx += 1;
      const target = targetFor(e.id, verb, rng);
      const dur = 60 + Math.floor(rng() * 120);
      e.activity = { verb, target, started_tick: tick, ends_tick: tick + dur };
      e.current_action = `${verb.toLowerCase()} ${target}`;
      emit(w, tick, clock, "agent.activity_started", e.id, { verb, target, ends_tick: tick + dur });
    } else if (tick >= e.activity.ends_tick) {
      const { verb, target } = e.activity;
      const dur = tick - e.activity.started_tick;
      e.activity = null;
      e.celebrate_until = tick + CELEBRATE_TICKS;
      e.current_action = `shipped ${verb.toLowerCase()} ${target}`;
      emit(w, tick, clock, "agent.activity_completed", e.id, { verb, target, duration_ticks: dur });
      maybeScheduleTrip(w, tick, rng, clock, e, verb);
    }
  }
}

function maybeScheduleTrip(w, tick, rng, clock, e, verb) {
  if (rng() >= 0.65) return;
  const from = e.island;
  const opts = (w.geo[from] ? w.geo[from].bridges : []).filter((id) => id !== from && w.geo[id]);
  if (!opts.length) return;
  const to = opts[Math.floor(rng() * opts.length)];
  const task = emit(w, tick, clock, "agent.task_assigned", e.id, {
    verb: "TRAVEL", from, to, reason: `work-queue:${verb} follow-up`,
  });
  requestTrip(w, e.id, to, task.seq, clock, `task:${task.seq}`);
}

/* 5. vessels: ferries shuttle the hub spokes; dock/depart events are real. */
function tickVessels(w, tick, rng, clock) {
  for (const v of w.state.vessels) {
    const [a, b] = v.route;
    if (v.docked) {
      v.docked = false;
      emit(w, tick, clock, "vessel.departed", null, { vessel: v.id, from: v.dir === 1 ? a : b });
    }
    v.u += v.dir / VESSEL_LEG_TICKS;
    if (v.u >= 1) {
      v.u = 1; v.dir = -1; v.docked = true;
      emit(w, tick, clock, "vessel.docked", null, { vessel: v.id, at: b });
    } else if (v.u <= 0) {
      v.u = 0; v.dir = 1; v.docked = true;
      emit(w, tick, clock, "vessel.docked", null, { vessel: v.id, at: a });
    }
    v.carrying = w.state.arrivals
      .filter((ar) => ar.vessel === v.id && ar.state === "docking")
      .map((ar) => ar.entity_id);
  }
}

/* 6. ambient: cosmetic phases derived from tick. NEVER persisted, never logged.
 * Expressions resolve here from canonical activity state (single owner). */
function tickAmbient(w, tick, rng, clock) {
  const s = w.state;
  s.ambient = {
    tick,
    water_phase: (tick * 0.021) % (Math.PI * 2),
    palm_sway: (tick * 0.013) % (Math.PI * 2),
    globe_angle: (tick * 0.0045) % (Math.PI * 2),
  };
  for (const e of s.entities) {
    if (e.lifecycle !== "resident" || e.edge) continue;
    const desired = tick <= e.celebrate_until ? "celebrating" : e.activity ? "working" : "idle";
    setExpression(w, tick, clock, e, desired, "expression-resolution");
  }
}

/* ---------------- intents (the only way the outside touches the sim) ---------------- */

/* §11.1 spawn gate. Unknown ids are refused at the intent boundary and the
 * refusal itself is logged as world.rejected_spawn. Nothing spawns otherwise. */
export function requestSpawn(w, spec, clock) {
  const s = w.state;
  const id = spec && spec.id;
  if (!id || !w.registry.has(id)) {
    const ev = emit(w, s.tick, clock, "world.rejected_spawn", null, {
      id: id || null, reason: "unknown-id-not-in-registry",
    });
    s.ledger_head = w.store.head;
    return { ok: false, reason: "unknown-id", event: ev };
  }
  if (findEntity(w, id)) return { ok: false, reason: "already-present" };
  const island = spec.island && w.geo[spec.island] ? spec.island : "ai-hub";
  const e = spawnEntityInternal(w, {
    id,
    kind: spec.kind || "guest",
    name: spec.name || id,
    department: spec.department || "",
    island,
    home_island: island,
    pos: centerPoint(w, island),
    lifecycle: "resident",
    expression: "working",
    avatar: spec.avatar,
    poster: spec.poster,
    inventory: spec.inventory,
    current_action: spec.current_action || "",
    persona_line: spec.persona_line || "",
  });
  const ev = emit(w, s.tick, clock, "agent.admitted", id, {
    island, home_island: island, via: "spawn-intent",
  });
  s.ledger_head = w.store.head;
  refreshCounts(w, clock.ms);
  return { ok: true, entity: e, event: ev };
}

/* Arrival pipeline entry. Gated like spawn; the ferry does the rest. */
export function announceArrival(w, spec, clock) {
  const s = w.state;
  const id = spec && spec.id;
  if (!id || !w.registry.has(id)) {
    const ev = emit(w, s.tick, clock, "world.rejected_spawn", null, {
      id: id || null, reason: "unknown-id-not-in-registry",
    });
    s.ledger_head = w.store.head;
    return { ok: false, reason: "unknown-id", event: ev };
  }
  if (findEntity(w, id) || s.arrivals.some((a) => a.entity_id === id)) {
    return { ok: false, reason: "already-present" };
  }
  const target = spec.target_island && w.geo[spec.target_island] ? spec.target_island : "ai-hub";
  const vessel = (s.vessels.find((v) => v.route.includes(target)) || s.vessels[0]).id;
  const rec = {
    entity_id: id,
    name: (spec && spec.name) || id,
    kind: "guest",
    vessel,
    target_island: target,
    state: "announced",
    sail_tick: s.tick + ARRIVAL_SAIL_TICKS,
    eta_tick: s.tick + ARRIVAL_SAIL_TICKS + ARRIVAL_VOYAGE_TICKS,
    admit_tick: s.tick + ARRIVAL_SAIL_TICKS + ARRIVAL_VOYAGE_TICKS + ARRIVAL_WALK_TICKS,
  };
  s.arrivals.push(rec);
  const ev = emit(w, s.tick, clock, "agent.announced", id, {
    vessel, target_island: target, kind: "guest",
  });
  s.ledger_head = w.store.head;
  return { ok: true, event: ev, arrival: rec };
}

/* Departure pipeline entry. Emits agent.farewell now; the ticks do the rest.
 * Nearby residents get a real send-off (celebrating, driven by the event). */
export function scheduleDeparture(w, entityId, clock) {
  const s = w.state;
  const e = findEntity(w, entityId);
  if (!e || e.lifecycle !== "resident" || e.edge) return { ok: false, reason: "not-available" };
  e.lifecycle = "departing";
  s.departures.push({
    entity_id: entityId, state: "farewell", start_tick: s.tick, vessel: "ferry-1",
  });
  for (const o of s.entities) {
    if (o.id !== entityId && o.island === e.island && o.lifecycle === "resident") {
      o.celebrate_until = s.tick + CELEBRATE_TICKS;
    }
  }
  const ev = emit(w, s.tick, clock, "agent.farewell", entityId, { island: e.island });
  s.ledger_head = w.store.head;
  refreshCounts(w, clock.ms);
  return { ok: true, event: ev };
}

/* §11.2 event-sourced movement. A trip starts ONLY with a resolvable caused_by
 * event seq. No cause -> no trip, no event, state untouched. */
export function requestTrip(w, entityId, toIsland, causeSeq, clock, reason) {
  const s = w.state;
  const e = findEntity(w, entityId);
  if (!e) return { ok: false, reason: "unknown-entity" };
  if (e.lifecycle !== "resident") return { ok: false, reason: "not-resident" };
  if (e.edge) return { ok: false, reason: "already-traveling" };
  if (!causeSeq || !w.store.has(causeSeq)) return { ok: false, reason: "missing-cause" };
  const from = e.island;
  if (from === toIsland) return { ok: false, reason: "already-there" };
  if (!w.geo[from] || !(w.geo[from].bridges || []).includes(toIsland)) {
    return { ok: false, reason: "no-bridge" };
  }
  e.heading = toIsland;
  e.edge = [from, toIsland];
  e.progress = 0;
  e.last_trip_cause = causeSeq;
  const ev = emit(w, s.tick, clock, "agent.trip_started", entityId, {
    from, to: toIsland, caused_by: causeSeq, reason: reason || "",
  });
  s.ledger_head = w.store.head;
  return { ok: true, event: ev };
}

/* Owner intent: time-of-day override. Render-only effect, but it is logged —
 * even view-affecting owner actions leave a trace in the log. */
export function setTimeOverride(w, hourOrNull, clock) {
  const h = hourOrNull === null || hourOrNull === undefined ? null : Number(hourOrNull);
  w.state.time_override = h === null || Number.isNaN(h) ? null : Math.min(24, Math.max(0, h));
  const ev = emit(w, w.state.tick, clock, "world.time_override", null, { hour: w.state.time_override });
  w.state.ledger_head = w.store.head;
  return ev;
}

/* ---------------- persistence surface (host-driven) ---------------- */

/* The canonical snapshot writer. state.ambient is EXCLUDED — it is cosmetic,
 * derived from tick, and must never be persisted or mistaken for truth. */
export function snapshotWorld(w, generatedAt, clock) {
  refreshCounts(w, clock.ms);
  const s = w.state;
  const { ambient, ...rest } = s;
  void ambient;
  const snap = JSON.parse(JSON.stringify(rest));
  snap.generated_at = generatedAt;
  snap.ledger_head = w.store.head;
  return snap;
}

export function rehydrateWorld(snapshot, { islands, agents, guests }) {
  if (!snapshot || snapshot.schema_version !== SCHEMA_VERSION) {
    throw new Error(`rehydrateWorld: expected schema_version ${SCHEMA_VERSION}`);
  }
  const islandsById = {};
  for (const isl of islands || []) islandsById[isl.id] = isl;
  const state = JSON.parse(JSON.stringify(snapshot));
  state.ambient = null;
  const w = {
    state,
    store: new EventStore(),
    geo: buildGeo(islands),
    registry: buildRegistry(agents.index, guests),
    islandsById,
  };
  return w;
}

/* Resolve the render hour: owner override wins; otherwise the world's own
 * clock (boot wall-time + elapsed ticks). Pure function of state. */
export function resolveHour(state) {
  if (state.time_override !== null && state.time_override !== undefined) return state.time_override;
  const hours = state.base_epoch_ms / 3600000 + state.tick / (TICK_HZ * 3600);
  return ((hours % 24) + 24) % 24;
}

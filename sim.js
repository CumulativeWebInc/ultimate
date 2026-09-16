/* PROJECT ULTIMATE — simulation host (repo-root app shell: index.html + sim.js + sim.css)
 * ============================================================================
 * Browser host for the living world. Owns: data loading, the wall clock
 * (injected into the engine as {ms, iso} — the ONLY way wall-clock enters),
 * the 2Hz logic loop, rAF interpolation, camera (view-only), intents, and
 * client-side persistence (localStorage; the world never restarts for a
 * returning client). The committed world/world.json + activity/events.jsonl
 * are boot snapshots for first visits and machines.
 * ============================================================================
 */

import {
  boot, tickWorld, tickClock, rehydrateWorld, snapshotWorld,
  resolveHour, requestTrip, announceArrival, scheduleDeparture,
  setTimeOverride, isLifecycleEvent, PUBLISH_EVERY_TICKS,
} from "./world/simulation/engine.js";
import { EventStore } from "./world/simulation/events.js";
import { allMetrics } from "./world/simulation/metrics.js";
import { buildCommands } from "./world/simulation/render/scene.js";
import { createApplier } from "./world/simulation/render/apply.js";

const $ = (s) => document.querySelector(s);
const LS_SNAP = "cwi.ultimate.v2.snapshot";
const LS_SESSION = "cwi.ultimate.v2.session";
const SESSION_CAP = 4000; // max session event lines kept in localStorage
const LOGO = "assets/cwi-logo.jpg";

const nowIso = (ms) => new Date(ms).toISOString();
const clockNow = () => {
  const ms = Date.now();
  return tickClock(ms, nowIso(ms));
};

async function j(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}
const optional = async (url, parse) => {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return parse ? parse(await r.text()) : r.json();
  } catch { return null; }
};

/* human one-liners for the live feed — summaries only, truth stays in the log */
function summarize(e) {
  const p = e.payload || {};
  switch (e.type) {
    case "world.genesis": return `world booted · seed ${p.seed} · ${p.agents} agents`;
    case "world.tock": return `heartbeat · ${p.residents} residents`;
    case "world.reseed": return `daily reseed ${p.old_seed} → ${p.new_seed}`;
    case "world.time_override": return p.hour === null ? "time override cleared — live sky" : `time override → ${p.hour}h`;
    case "world.rejected_spawn": return `spawn refused: ${p.id || "?"} (${p.reason})`;
    case "agent.announced": return `announced → ${p.target_island} aboard ${p.vessel}`;
    case "agent.docking": return `docking at ${p.target_island}`;
    case "agent.arrived": return `first steps on ${p.island}`;
    case "agent.admitted": return `admitted · home ${p.home_island}`;
    case "agent.task_assigned": return `task: ${p.verb} ${p.from} → ${p.to}`;
    case "agent.trip_started": return `traveling ${p.from} → ${p.to} (cause #${p.caused_by})`;
    case "agent.trip_ended": return `arrived ${p.to}`;
    case "agent.activity_started": return `${p.verb} ${p.target}`;
    case "agent.activity_completed": return `shipped ${p.verb} ${p.target}`;
    case "agent.expression_changed": return `expression ${p.from} → ${p.to}`;
    case "agent.farewell": return `farewell on ${p.island}`;
    case "agent.boarded": return `boarded ${p.vessel}`;
    case "agent.departed": return `departed ${p.island} — contributions kept`;
    case "vessel.docked": return `${p.vessel} docked at ${p.at}`;
    case "vessel.departed": return `${p.vessel} departed ${p.from}`;
    default: return e.type;
  }
}

async function bootWorld() {
  const [islandsDoc, seedSnap, seedEvents, agentIndex, guestsIndex] = await Promise.all([
    j("world/islands.json"),
    j("world/world.json"),
    optional("activity/events.jsonl", (t) => t),
    j("agents/index.json"),
    j("guests/index.json"),
  ]);
  const profiles = {};
  const ids = [...(agentIndex.agents || [])];
  if (agentIndex.chief && !ids.includes(agentIndex.chief)) ids.push(agentIndex.chief);
  await Promise.all(ids.map(async (id) => {
    const p = await optional(`agents/${id}.json`);
    if (p) profiles[id] = p;
  }));

  const deps = { islands: islandsDoc.islands, agents: { index: agentIndex, profiles }, guests: guestsIndex };
  const seedStore = seedEvents ? EventStore.fromJSONL(seedEvents) : new EventStore();

  // rehydrate: freshest valid snapshot wins (localStorage > committed seed)
  let world = null;
  let sessionLines = [];
  try {
    const raw = localStorage.getItem(LS_SNAP);
    const sess = localStorage.getItem(LS_SESSION);
    if (sess) sessionLines = sess.split("\n").filter((l) => l.trim());
    if (raw) {
      const snap = JSON.parse(raw);
      if (snap.schema_version === "2.0.0" && snap.tick >= (seedSnap.tick || 0)) {
        world = rehydrateWorld(snap, deps);
      }
    }
  } catch { world = null; }
  if (!world) {
    world = rehydrateWorld(seedSnap, deps);
    sessionLines = [];
  }

  // merge seed log + session log; seqs continue densely
  const store = new EventStore();
  for (const e of seedStore.events) store.events.push(e);
  for (const line of sessionLines.slice(-SESSION_CAP)) {
    try {
      const e = JSON.parse(line);
      if (e.seq === store.events.length + 1) store.events.push(e);
    } catch { /* skip corrupt session lines */ }
  }
  world.store = store;
  world.state.ledger_head = store.head;
  return { world, deps, islandsDoc };
}

function persist(world) {
  try {
    const c = clockNow();
    const snap = snapshotWorld(world, nowIso(c.ms), c);
    localStorage.setItem(LS_SNAP, JSON.stringify(snap));
  } catch { /* storage full/blocked: the world still runs */ }
}
function persistSession(world, newEvents) {
  try {
    const prev = (localStorage.getItem(LS_SESSION) || "").split("\n").filter((l) => l.trim());
    const lines = prev.concat(newEvents.map((e) => JSON.stringify(e))).slice(-SESSION_CAP);
    localStorage.setItem(LS_SESSION, lines.join("\n") + (lines.length ? "\n" : ""));
  } catch { /* non-fatal */ }
}

/* ---------------- camera (view-only; never touches simulation state) ---------------- */
const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, followId: null };
function camHome(W, H) { return { x: W / 2, y: H / 2, z: 1 }; }

async function main() {
  const canvas = $("#sky");
  const stage = $("#stage");
  const els = {
    watermark: $("#watermark"), metrics: $("#metrics"), feedList: $("#feed-list"),
    clock: $("#world-clock"), interior: $("#interior-overlay"), statusCard: $("#status-card"),
    loading: $("#loading"),
  };

  let boot;
  try {
    boot = await bootWorld();
  } catch (e) {
    console.error("[ultimate] boot failed:", e);
    els.loading.innerHTML = `<img src="${LOGO}" alt="Cumulative Web Inc"><p>World data unreachable — retrying…</p>`;
    setTimeout(() => location.reload(), 15000);
    return;
  }
  const { world, deps, islandsDoc } = boot;
  const islands = islandsDoc.islands;
  const renderCfg = islandsDoc.render || {};

  const applier = createApplier({
    canvas, stage, els, logo: LOGO,
    onIslandClick: (id) => openInterior(id),
    onAgentClick: (id) => { selectedAgent = selectedAgent === id ? null : id; },
  });

  const W = () => canvas.clientWidth || innerWidth;
  const H = () => canvas.clientHeight || innerHeight;
  const home = camHome(W(), H());
  Object.assign(cam, { x: home.x, y: home.y, tx: home.x, ty: home.y });

  let selectedAgent = null;
  let interiorIsland = null;
  let lastTickPerf = performance.now();
  let prevSnap = JSON.parse(JSON.stringify(world.state));
  delete prevSnap.ambient;

  const hourLabel = (h) => (h < 5 ? "Night" : h < 7.5 ? "Dawn" : h < 16.5 ? "Day" : h < 20 ? "Dusk" : "Night");

  function uiForFrame() {
    const c = clockNow();
    const behindSec = Math.max(0, Math.round((performance.now() - lastTickPerf) / 1000) - 1);
    const metrics = allMetrics(world.state, world.store, c.ms);
    const feed = world.store.tail(8).reverse().map((e) => ({
      seq: e.seq, actor: e.actor || "world", summary: summarize(e), ts: e.ts,
    }));
    const hour = resolveHour(world.state);
    let interior = null;
    if (interiorIsland) {
      const isl = islands.find((i) => i.id === interiorIsland);
      if (isl) {
        interior = {
          island: {
            id: isl.id, name: isl.name, kind: isl.kind || "department",
            verbs: isl.verbs || [], glow: (isl.palette && isl.palette.glow) || "#8fc3ff",
            interior_theme: isl.interior_theme || "",
            bridges: (isl.bridges || []).map((b) => {
              const t = islands.find((i) => i.id === b);
              return { id: b, name: t ? t.name : b };
            }),
          },
          residents: world.state.entities
            .filter((e) => e.island === isl.id && (e.lifecycle === "resident" || e.lifecycle === "arriving"))
            .map((e) => ({ id: e.id, name: e.name, avatar: e.avatar, poster: e.poster, current_action: e.current_action, expr: e.expression })),
        };
      }
    }
    let agentCard = null;
    if (selectedAgent) {
      const e = world.state.entities.find((x) => x.id === selectedAgent);
      if (e) {
        agentCard = {
          entity: e,
          events: world.store.filter((ev) => ev.actor === selectedAgent).slice(-8).reverse(),
        };
      } else {
        selectedAgent = null;
      }
    }
    return {
      provenance: `events up to #${world.store.head} · tick ${world.state.tick}`,
      behindSec,
      metrics, feed,
      clockText: `${hourLabel(hour)} · ${hour.toFixed(1)}h${world.state.time_override !== null ? " · ⏱ override" : ""}`,
      interior, agentCard, hour,
    };
  }

  function renderFrame() {
    const wpx = W(), hpx = H();
    const ui = uiForFrame();
    const now = performance.now();
    const alpha = Math.min(1, Math.max(0, (now - lastTickPerf) / 500));
    const cmds = buildCommands({
      prev: prevSnap, state: world.state, islands, renderCfg,
      W: wpx, H: hpx, alpha, hour: ui.hour, ui,
    });
    // camera transform on the stage wrapper
    cam.x += (cam.tx - cam.x) * 0.12;
    cam.y += (cam.ty - cam.y) * 0.12;
    cam.z += (cam.tz - cam.z) * 0.12;
    $("#camera").style.transform =
      `translate(${wpx / 2 - cam.x * cam.z}px, ${hpx / 2 - cam.y * cam.z}px) scale(${cam.z})`;
    applier.apply(cmds, wpx, hpx, {
      closeInterior: () => { interiorIsland = null; },
      gotoIsland: (id) => openInterior(id),
    });
    if (cam.followId) {
      const p = applier.agentWorldPos(cam.followId);
      if (p) { cam.tx = p.x; cam.ty = p.y; }
    }
  }

  function openInterior(id) {
    interiorIsland = id;
    const isl = islands.find((i) => i.id === id);
    // camera eases toward the island (view-only)
    if (isl) {
      const horizon = H() * (renderCfg.water_level || 0.42);
      const x = (isl.position.x / 100) * W();
      const y = horizon + (isl.position.y / 100) * (H() - horizon);
      cam.tx = x; cam.ty = y; cam.tz = 2.1; cam.followId = null;
      const sel = $("#follow-select");
      if (sel) sel.value = "";
    }
  }

  /* ----- 2Hz logic loop ----- */
  setInterval(() => {
    prevSnap = JSON.parse(JSON.stringify(world.state));
    delete prevSnap.ambient;
    const c = clockNow();
    const { tick, events } = tickWorld(world, c);
    lastTickPerf = performance.now();
    persistSession(world, events);
    if (tick % PUBLISH_EVERY_TICKS === 0 || events.some((e) => isLifecycleEvent(e.type))) {
      persist(world);
    }
  }, 500);

  /* ----- rAF render loop ----- */
  function loop() {
    renderFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ----- camera input (view-only) ----- */
  const toWorld = (sx, sy) => {
    const wpx = W(), hpx = H();
    return {
      x: (sx - (wpx / 2 - cam.x * cam.z)) / cam.z,
      y: (sy - (hpx / 2 - cam.y * cam.z)) / cam.z,
    };
  };
  addEventListener("wheel", (e) => {
    if (e.target.closest && e.target.closest(".panel, #status-card, #interior-overlay, #feed-panel, #nav-controls")) return;
    e.preventDefault();
    const wpt = toWorld(e.clientX, e.clientY);
    cam.tz = Math.min(4, Math.max(0.6, cam.tz * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    cam.tx = wpt.x - (e.clientX - W() / 2) / cam.tz;
    cam.ty = wpt.y - (e.clientY - H() / 2) / cam.tz;
    cam.followId = null;
    const sel = $("#follow-select");
    if (sel) sel.value = "";
  }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { sx: e.clientX, sy: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cam.tx -= (e.clientX - drag.sx) / cam.tz;
    cam.ty -= (e.clientY - drag.sy) / cam.tz;
    drag.sx = e.clientX; drag.sy = e.clientY;
    cam.followId = null;
    const sel = $("#follow-select");
    if (sel) sel.value = "";
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  addEventListener("keydown", (e) => {
    if (e.target.matches && e.target.matches("input, select, textarea")) return;
    const step = 120 / cam.tz;
    if (e.key === "Escape") { interiorIsland = null; selectedAgent = null; }
    else if (e.key === "+" || e.key === "=") cam.tz = Math.min(4, cam.tz * 1.2);
    else if (e.key === "-" || e.key === "_") cam.tz = Math.max(0.6, cam.tz / 1.2);
    else if (e.key === "0") { const h = camHome(W(), H()); cam.tx = h.x; cam.ty = h.y; cam.tz = 1; cam.followId = null; }
    else if (e.key === "ArrowLeft") cam.tx -= step;
    else if (e.key === "ArrowRight") cam.tx += step;
    else if (e.key === "ArrowUp") cam.ty -= step;
    else if (e.key === "ArrowDown") cam.ty += step;
    else return;
    if (e.key !== "Escape") {
      cam.followId = null;
      const sel = $("#follow-select");
      if (sel) sel.value = "";
    }
  });

  /* ----- owner controls (all real, all wired) ----- */
  const tod = $("#tod-range"), todLabel = $("#tod-label");
  if (tod) {
    tod.addEventListener("input", () => {
      const h = parseFloat(tod.value);
      setTimeOverride(world, h, clockNow()); // logged as world.time_override
      persist(world);
      if (todLabel) todLabel.textContent = `${h.toFixed(1)}h`;
    });
  }
  const live = $("#tod-live");
  if (live) live.addEventListener("click", () => {
    setTimeOverride(world, null, clockNow());
    persist(world);
    if (tod) tod.value = "12";
    if (todLabel) todLabel.textContent = "live";
  });
  const sel = $("#follow-select");
  if (sel) {
    sel.innerHTML = `<option value="">Follow: none</option>` + world.state.entities.map((e) =>
      `<option value="${e.id}">${e.name}</option>`).join("");
    sel.addEventListener("change", () => {
      cam.followId = sel.value || null;
      if (cam.followId) {
        const p = applier.agentWorldPos(cam.followId);
        if (p) { cam.tx = p.x; cam.ty = p.y; cam.tz = Math.max(cam.tz, 1.6); }
      }
    });
  }
  const wire = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", fn); };
  wire("#cam-in", () => { cam.tz = Math.min(4, cam.tz * 1.25); cam.followId = null; });
  wire("#cam-out", () => { cam.tz = Math.max(0.6, cam.tz / 1.25); cam.followId = null; });
  wire("#cam-reset", () => { const h = camHome(W(), H()); cam.tx = h.x; cam.ty = h.y; cam.tz = 1; cam.followId = null; });
  wire("#feed-toggle", () => $("#feed-panel").classList.toggle("collapsed"));
  wire("#owner-toggle", () => $("#owner-panel").classList.toggle("open"));
  if (new URLSearchParams(location.search).get("owner") === "1") $("#owner-panel").classList.add("open");

  // metric query documentation (each rendered metric links its query via title/data-query)
  const mq = $("#metric-queries");
  if (mq) {
    const { QUERIES } = await import("./world/simulation/metrics.js");
    mq.innerHTML = Object.entries(QUERIES).map(([k, q]) =>
      `<div class="mquery"><span class="k">${k}</span><span class="q">${q}</span></div>`).join("");
  }

  // owner ledger: real tail of the event log
  const renderLedger = () => {
    const box = $("#ledger-list");
    if (!box) return;
    const rows = world.store.tail(20).reverse().map((e) =>
      `<div class="ledger-entry"><span class="f-seq">#${e.seq}</span> <span class="actor">${e.actor || "world"}</span> ` +
      `<span class="action">${summarize(e)}</span><div class="ts">${e.ts}</div></div>`).join("");
    const html = rows || `<div class="incoming">Ledger quiet — no activity yet.</div>`;
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
  };
  setInterval(renderLedger, 2000);
  renderLedger();

  els.loading.classList.add("hidden");
  console.info(`[ultimate] living world online · tick ${world.state.tick} · events up to #${world.store.head}`);
}

document.addEventListener("DOMContentLoaded", main);

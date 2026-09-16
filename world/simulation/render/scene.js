/* PROJECT ULTIMATE — renderer as a pure function of state (world/simulation)
 * ============================================================================
 * buildCommands(input) -> { canvas: [...], dom: [...], tick }
 *
 * The renderer holds NO simulation state. Given the same (prev, state,
 * islands, view, ui) inputs it returns byte-identical command lists — this is
 * what the renderer-purity test asserts. A thin browser applier
 * (render/apply.js) executes the commands against canvas/DOM; the applier is
 * NOT part of the purity contract, only these builders are.
 *
 * Layers (canvas): sky from tick-derived hour, water phase from tick,
 * islands/bridges from islands.json, vessels + entities from state,
 * hub globe angle from tick.
 * DOM: island signs from islands.json, agent video nodes keyed by entity id
 * with interpolated positions, KingCode crown node (crown exclusive).
 * ============================================================================
 */

export function layoutIslands(islands, renderCfg, W, H) {
  const cfg = renderCfg || {};
  const horizon = H * (cfg.water_level !== undefined ? cfg.water_level : 0.42);
  const base = Math.min(W, H);
  const hubR = (cfg.hub_radius_vw !== undefined ? cfg.hub_radius_vw : 12) / 100;
  const islR = (cfg.island_radius_vw !== undefined ? cfg.island_radius_vw : 8.5) / 100;
  return (islands || []).map((isl) => {
    const kind = isl.kind || "department";
    const pal = isl.palette || {};
    const r = base * (kind === "hub" ? hubR : islR);
    return {
      id: isl.id,
      kind,
      name: isl.name,
      verbs: [...(isl.verbs || [])],
      glow: pal.glow || "#8fc3ff",
      land: pal.land || "#0e5f4a",
      sand: pal.sand || "#f4e3b2",
      x: (isl.position.x / 100) * W,
      y: horizon + (isl.position.y / 100) * (H - horizon),
      r,
      avatarDx: ((isl.avatar && isl.avatar.dx) || 0) / 100 * W,
      avatarDy: ((isl.avatar && isl.avatar.dy) || 0) / 100 * H,
      crown: !!isl.crown,
      bridges: [...(isl.bridges || [])],
      interior_theme: isl.interior_theme || "",
    };
  });
}

/* Entity pos is in island-percent coords (x: 0..100 of width, y: 0..100 of
 * the water field below the horizon) — the same space as islands.json. */
export function pctToPx(pos, W, H, horizon) {
  return { x: (pos.x / 100) * W, y: horizon + (pos.y / 100) * (H - horizon) };
}

export function interpPos(a, b, alpha) {
  const t = Math.min(1, Math.max(0, alpha));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/* input:
 *   prev, state      — world snapshots (state = current tick, prev = prior)
 *   islands          — islands.json records
 *   renderCfg        — islands.json render config
 *   W, H             — viewport px
 *   alpha            — 0..1 interpolation between prev and state
 *   hour             — resolved sky hour (tick-derived or owner override)
 *   ui               — { provenance, behindSec, metrics[], feed[], clockText,
 *                        interior|null, agentCard|null }
 *                        (computed by the host from canonical state + log) */
export function buildCommands(input) {
  const { prev, state, islands, renderCfg, W, H, alpha, hour, ui } = input;
  const cfg = renderCfg || {};
  const horizon = H * (cfg.water_level !== undefined ? cfg.water_level : 0.42);
  const L = layoutIslands(islands, renderCfg, W, H);
  const byId = {};
  for (const r of L) byId[r.id] = r;

  const canvas = [];
  canvas.push({ c: "sky", hour, W, H, horizon });
  canvas.push({ c: "stars", hour, W, H, horizon, tick: state.tick });
  canvas.push({ c: "sunmoon", hour, W, H, horizon });
  canvas.push({ c: "water", tick: state.tick, hour, W, H, horizon });

  const seen = new Set();
  for (const r of L) {
    for (const b of r.bridges) {
      if (!byId[b] || b === r.id) continue;
      const key = [r.id, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const o = byId[b];
      canvas.push({ c: "bridge", x1: r.x, y1: r.y, x2: o.x, y2: o.y });
    }
  }

  for (const r of L) {
    canvas.push({
      c: "island", id: r.id, x: r.x, y: r.y, r: r.r, kind: r.kind,
      land: r.land, sand: r.sand, glow: r.glow, tick: state.tick,
    });
    if (r.kind === "hub") {
      canvas.push({
        c: "globe", x: r.x, y: r.y - r.r * 0.95, r: r.r * 0.42,
        angle: (state.tick * 0.0045) % (Math.PI * 2), glow: r.glow,
      });
    }
  }

  for (const v of state.vessels || []) {
    const A = byId[v.route[0]];
    const B = byId[v.route[1]];
    if (!A || !B) continue;
    const u = Math.min(1, Math.max(0, v.u));
    canvas.push({
      c: "vessel",
      id: v.id,
      x: A.x + (B.x - A.x) * u,
      y: A.y + (B.y - A.y) * u + Math.sin(state.tick / 9 + u * 12) * 4,
      s: Math.min(W, H) * 0.008 + 5,
    });
  }

  canvas.push({ c: "particles", tick: state.tick, n: 140, W, H });

  /* --- DOM layer --- */
  const prevById = {};
  for (const e of (prev && prev.entities) || []) prevById[e.id] = e;
  const agents = [];
  for (const e of state.entities || []) {
    const p0 = prevById[e.id] ? prevById[e.id].pos : e.pos;
    const s = pctToPx(interpPos(p0, e.pos, alpha), W, H, horizon);
    agents.push({
      id: e.id,
      name: e.name,
      x: s.x,
      y: s.y,
      expr: e.expression,
      avatar: e.avatar,
      poster: e.poster,
      crown: e.id === "kingcode", // gold crown exclusive to KingCode
      lifecycle: e.lifecycle,
      activity: e.activity ? { verb: e.activity.verb, target: e.activity.target } : null,
      current_action: e.current_action,
    });
  }

  const dom = [
    {
      d: "signs",
      items: L.map((r) => ({
        id: r.id, name: r.name, verbs: r.verbs, glow: r.glow,
        x: r.x, y: r.y - r.r * 1.9, kind: r.kind,
      })),
    },
    { d: "agents", items: agents },
    { d: "watermark", text: ui.provenance, behind: ui.behindSec },
    { d: "metrics", rows: ui.metrics },
    { d: "feed", entries: ui.feed },
    { d: "clock", text: ui.clockText },
    { d: "interior", data: ui.interior || null },
    { d: "agentCard", data: ui.agentCard || null },
  ];

  return { canvas, dom, tick: state.tick };
}

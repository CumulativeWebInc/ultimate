/* ============================================================================
 * DEPRECATED — FACADE-FIRST SCENE (2026-09-15, Black's redesign directive)
 * This file renders a static scene with interactions bolted on. It is kept
 * for reference only. The living world simulation design is authoritative:
 * see world/SIMULATION-DESIGN.md (gate review pending). Do not extend this
 * file — build the simulation engine instead (world/simulation/, post-review).
 * ============================================================================
 */
/* PROJECT ULTIMATE — archipelago world scene engine (Cumulative Web Inc)
 * Tropical-futurist floating archipelago art direction. Canvas sky + lagoon,
 * data-driven islands (world/islands.json, v1.0.0) + pooled video agents
 * placed ON their islands + state contract loading + full interactivity:
 * pan/zoom camera, island interior zoom views, live agent status cards,
 * activity feed, owner controls (time-of-day override, follow-agent camera),
 * and agents traveling the bridges between islands.
 *
 * State contract: world.json -> agents/index.json -> agents/<id>.json,
 * guests/index.json, activity/ledger.json, rules.json. Refetch cadence 60s.
 * Per-agent files are only re-fetched when world.json's generated_at changes.
 *
 * Archipelago contract: world/islands.json -> { schema_version, islands[] }.
 * No island data is hardcoded here: positions, palettes, verbs, interiors and
 * bridges all come from islands.json. If islands.json fails to load, the
 * scene degrades to the flat sky stage (agents at their own x/y) — never a
 * blank or broken page.
 */
"use strict";

const $ = (s) => document.querySelector(s);
const CANVAS = $("#sky"), CTX = CANVAS.getContext("2d");
const STAGE = $("#stage");
const CAMERA = $("#camera");
const MAX_VIDEO_NODES = 24; // soft pool target: overflow creates nodes, never drops an agent
const POLL_MS = 60_000;
const MAX_FAILS_BEFORE_ERROR = 2;
const ISLANDS_URL = "world/islands.json";
const BRAND_LOGO = "assets/cwi-logo.jpg";

/* ---------------- quality tiers ---------------- */
const quality = { tier: "high", particleCount: 140, parallax: true, fpsSamples: [] };
function measureFps(t) {
  const s = quality.fpsSamples; s.push(t);
  if (s.length > 60) s.shift();
  if (s.length === 60) {
    const dt = (s[59] - s[0]) / 59, fps = 1000 / Math.max(dt, 1);
    const dpr = window.devicePixelRatio || 1;
    let tier = "high";
    if (fps < 28 || dpr < 1.2) tier = "low";
    else if (fps < 45 || dpr < 1.6) tier = "medium";
    if (tier !== quality.tier) {
      quality.tier = tier;
      quality.particleCount = tier === "high" ? 140 : tier === "medium" ? 70 : 30;
      quality.parallax = tier !== "low";
      initParticles();
    }
  }
}

/* ---------------- sky: 24h time-of-day palettes ---------------- */
const KEYS = [ // [hour, top, mid, bot, stars(0-1)]
  [0,  "#03040a", "#0a0e24", "#131a3a", 1],
  [5,  "#03040a", "#0a0e24", "#131a3a", 1],
  [6.5,"#2b3a6e", "#b06a8a", "#f2a56e", 0.25],
  [9,  "#2f7fd0", "#7cc0ee", "#cfeef7", 0],
  [16, "#2f7fd0", "#7cc0ee", "#cfeef7", 0],
  [17.5,"#232a5e","#a04a6e", "#f28a4a", 0.1],
  [20, "#03040a", "#0a0e24", "#131a3a", 1],
  [22, "#03040a", "#0a0e24", "#131a3a", 1],
  [24, "#03040a", "#0a0e24", "#131a3a", 1],
];
const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const mix = (a, b, t) => `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
let todOverride = null; // owner control: null = live clock
function skyPalette() {
  const now = new Date();
  const h = todOverride !== null ? todOverride : (now.getHours() + now.getMinutes() / 60);
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1][0]) i++;
  const [h0, t0, m0, b0, s0] = KEYS[i], [h1, t1, m1, b1, s1] = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  return { top: mix(hex(t0), hex(t1), t), mid: mix(hex(m0), hex(m1), t),
           bot: mix(hex(b0), hex(b1), t), stars: s0 + (s1 - s0) * t, hour: h };
}

let stars = [], particles = [];
function initSky() {
  stars = Array.from({length: 130}, () => ({ x: Math.random(), y: Math.random() * 0.7,
    r: Math.random() * 1.4 + 0.4, ph: Math.random() * 6.28 }));
  initParticles();
}
function initParticles() {
  particles = Array.from({length: quality.particleCount}, () => ({
    x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0004,
    vy: (Math.random() - .5) * .0003, s: Math.random() * 2.2 + .6,
    a: Math.random() * .5 + .15, hue: Math.random() < .5 ? "120,200,255" : "190,140,255" }));
}

function resize() { CANVAS.width = innerWidth; CANVAS.height = innerHeight; layoutIslands(); }
addEventListener("resize", resize); resize(); initSky();

/* ---------------- camera: pan / zoom / follow ---------------- */
const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, followId: null };
function camHome() { return { x: CANVAS.width / 2, y: CANVAS.height / 2, z: 1 }; }
function camApply() {
  const W = CANVAS.width, H = CANVAS.height;
  cam.x += (cam.tx - cam.x) * 0.12;
  cam.y += (cam.ty - cam.y) * 0.12;
  cam.z += (cam.tz - cam.z) * 0.12;
  CAMERA.style.transform = `translate(${W / 2 - cam.x * cam.z}px, ${H / 2 - cam.y * cam.z}px) scale(${cam.z})`;
}
function camReset() {
  const h = camHome();
  cam.tx = h.x; cam.ty = h.y; cam.tz = h.z; cam.followId = null;
  const sel = $("#follow-select"); if (sel) sel.value = "";
}
function camFocus(wx, wy, z) { cam.tx = wx; cam.ty = wy; cam.tz = z; cam.followId = null; }
function screenToWorld(sx, sy) {
  const W = CANVAS.width, H = CANVAS.height;
  return { x: (sx - (W / 2 - cam.x * cam.z)) / cam.z, y: (sy - (H / 2 - cam.y * cam.z)) / cam.z };
}
function getAgentWorldPos(id) {
  const node = agentNodes.get(id);
  if (node && node._world) return node._world;
  const kc = id === "kingcode" && $("#kingcode-node");
  if (kc && kc._world) return kc._world;
  return null;
}
(function initCameraHome() { const h = camHome(); cam.x = cam.tx = h.x; cam.y = cam.ty = h.y; })();

// wheel: zoom toward cursor — real, wired
addEventListener("wheel", (e) => {
  if (e.target.closest && e.target.closest(".panel, #status-card, #interior-overlay, #feed-panel, #nav-controls")) return;
  e.preventDefault();
  const w = screenToWorld(e.clientX, e.clientY);
  const z2 = Math.min(4, Math.max(0.6, cam.tz * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
  cam.tz = z2;
  cam.tx = w.x - (e.clientX - CANVAS.width / 2) / z2;
  cam.ty = w.y - (e.clientY - CANVAS.height / 2) / z2;
  cam.followId = null;
  const sel = $("#follow-select"); if (sel) sel.value = "";
}, { passive: false });

// drag: pan the world — real, wired (background drags only; agents/signs keep their clicks)
let drag = null;
CANVAS.addEventListener("pointerdown", (e) => { drag = { sx: e.clientX, sy: e.clientY, moved: false }; CANVAS.setPointerCapture(e.pointerId); });
CANVAS.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  cam.tx -= dx / cam.tz; cam.ty -= dy / cam.tz;
  drag.sx = e.clientX; drag.sy = e.clientY;
  cam.followId = null;
  const sel = $("#follow-select"); if (sel) sel.value = "";
});
CANVAS.addEventListener("pointerup", () => { drag = null; });

// keyboard: arrows pan, +/- zoom, 0 reset, Esc closes — real, wired
addEventListener("keydown", (e) => {
  if (e.target.matches && e.target.matches("input, select, textarea")) return;
  const step = 120 / cam.tz;
  if (e.key === "Escape") { closeInterior(); $("#status-card").classList.remove("open"); }
  else if (e.key === "+" || e.key === "=") { cam.tz = Math.min(4, cam.tz * 1.2); cam.followId = null; }
  else if (e.key === "-" || e.key === "_") { cam.tz = Math.max(0.6, cam.tz / 1.2); cam.followId = null; }
  else if (e.key === "0") camReset();
  else if (e.key === "ArrowLeft") { cam.tx -= step; cam.followId = null; }
  else if (e.key === "ArrowRight") { cam.tx += step; cam.followId = null; }
  else if (e.key === "ArrowUp") { cam.ty -= step; cam.followId = null; }
  else if (e.key === "ArrowDown") { cam.ty += step; cam.followId = null; }
  else return;
  const sel = $("#follow-select"); if (sel && (e.key.startsWith("Arrow") || e.key === "+" || e.key === "-" || e.key === "=" || e.key === "_" || e.key === "0")) sel.value = "";
});

/* ---------------- archipelago data (all from islands.json) ---------------- */
let ISLANDS = null;          // array of island records from islands.json
let ISLAND_LAYOUT = [];      // screen-space cache, rebuilt on resize (no per-frame alloc)
let islandRenderCfg = { hub_radius_vw: 12, island_radius_vw: 8.5, water_level: 0.42 };
let brandLogo = BRAND_LOGO;
let boats = [];

async function loadIslands() {
  try {
    const r = await fetch(ISLANDS_URL + "?_=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(ISLANDS_URL + " -> " + r.status);
    const data = await r.json();
    if (!data || data.schema_version !== "1.0.0" || !Array.isArray(data.islands))
      throw new Error("islands.json failed schema check (need schema_version 1.0.0 + islands[])");
    ISLANDS = data.islands;
    if (data.render) islandRenderCfg = { ...islandRenderCfg, ...data.render };
    if (data.brand && data.brand.logo) brandLogo = data.brand.logo;
    buildSigns(); layoutIslands(); initBoats();
    console.info(`[ultimate] archipelago online: ${ISLANDS.length} islands, schema ${data.schema_version}`);
  } catch (e) {
    console.warn("[ultimate] archipelago offline (graceful):", e.message || e);
    ISLANDS = null; ISLAND_LAYOUT = [];
    clearSigns();
  }
}

// project island data-percent (x: 0-100 of width, y: 0-100 of water field) to px
function layoutIslands() {
  if (!ISLANDS) { ISLAND_LAYOUT = []; return; }
  const W = CANVAS.width, H = CANVAS.height;
  const horizon = H * islandRenderCfg.water_level;
  const byId = {};
  ISLAND_LAYOUT = ISLANDS.map((isl) => {
    const kind = isl.kind || "department";
    const rBase = Math.min(W, H);
    const radius = rBase * ((kind === "hub" ? islandRenderCfg.hub_radius_vw : islandRenderCfg.island_radius_vw) / 100);
    const rec = {
      isl, kind,
      x: (isl.position.x / 100) * W,
      y: horizon + (isl.position.y / 100) * (H - horizon),
      radius,
      avatarDx: ((isl.avatar && isl.avatar.dx) || 0) / 100 * W,
      avatarDy: ((isl.avatar && isl.avatar.dy) || 0) / 100 * H,
    };
    byId[isl.id] = rec;
    return rec;
  });
  ISLAND_LAYOUT.byId = byId;
  positionSigns();
}

function islandForAgent(agentId) {
  if (!ISLANDS) return null;
  return ISLANDS.find((i) => i.owner_agent === agentId) || null;
}
function islandById(id) { return (ISLANDS || []).find((i) => i.id === id) || null; }

/* ---------------- island signage (DOM, crisp glowing text, clickable) ---------------- */
function buildSigns() {
  clearSigns();
  if (!ISLANDS) return;
  const layer = document.createElement("div");
  layer.id = "island-signs";
  for (const isl of ISLANDS) {
    const d = document.createElement("div");
    d.className = "island-sign" + ((isl.kind || "department") === "hub" ? " hub-sign" : "");
    d.dataset.island = isl.id;
    const glow = (isl.palette && isl.palette.glow) || "#8fc3ff";
    d.style.setProperty("--glow", glow);
    const verbs = (isl.verbs || []).join(" · ");
    d.innerHTML = `<div class="island-name">${esc(isl.name)}</div><div class="island-verbs">${esc(verbs)}</div>`;
    d.setAttribute("role", "button");
    d.setAttribute("tabindex", "0");
    d.setAttribute("aria-label", `Zoom into ${isl.name} island interior`);
    d.addEventListener("click", () => openInterior(isl.id));
    d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInterior(isl.id); } });
    layer.appendChild(d);
  }
  STAGE.appendChild(layer);
  positionSigns();
}
function clearSigns() { const l = $("#island-signs"); if (l) l.remove(); }
function positionSigns() {
  if (!ISLAND_LAYOUT.length) return;
  const layer = $("#island-signs");
  if (!layer) return;
  for (const rec of ISLAND_LAYOUT) {
    const d = layer.querySelector(`[data-island="${rec.isl.id}"]`);
    if (!d) continue;
    d.style.left = rec.x + "px";
    d.style.top = (rec.y - rec.radius * 1.9) + "px";
  }
}

/* ---------------- island interior view (lazy-built, real data only) ---------------- */
let interiorOpenFor = null;
function openInterior(islandId) {
  const isl = islandById(islandId);
  if (!isl) return;
  const rec = ISLAND_LAYOUT.byId && ISLAND_LAYOUT.byId[islandId];
  if (rec) camFocus(rec.x, rec.y - rec.radius * 0.4, 2.1); // zoom into the pavilion
  interiorOpenFor = islandId;
  setTimeout(() => { if (interiorOpenFor === islandId) renderInterior(isl); }, 550);
}
function closeInterior() {
  interiorOpenFor = null;
  const o = $("#interior-overlay");
  if (o) o.classList.add("hidden");
  if (o && o.dataset.zoomed === "1") { o.dataset.zoomed = ""; camReset(); }
}
function renderInterior(isl) {
  const o = $("#interior-overlay");
  const glow = (isl.palette && isl.palette.glow) || "#8fc3ff";
  const land = (isl.palette && isl.palette.land) || "#0e5f4a";
  const agent = isl.owner_agent ? agentNodes.get(isl.owner_agent) : null;
  const a = agent && agent._data;
  // craft stations: parsed from the interior_theme record itself — no invented detail
  const theme = isl.interior_theme || "";
  const stations = theme.split(/[—–]/).map(s => s.trim()).filter(Boolean);
  const bridges = (isl.bridges || []).map(id => islandById(id)).filter(Boolean);
  o.dataset.zoomed = "1";
  o.innerHTML = `
    <div class="interior-walls" style="--glow:${glow};--land:${land}"></div>
    <div class="interior-card">
      <button class="interior-close" aria-label="Close interior view">✕</button>
      <img class="interior-logo" src="${brandLogo}" alt="Cumulative Web Inc">
      <div class="interior-kicker">${esc((isl.kind || "department").toUpperCase())} ISLAND</div>
      <h2 style="--glow:${glow}">${esc(isl.name)}</h2>
      <div class="interior-verbs" style="--glow:${glow}">${esc((isl.verbs || []).join(" · "))}</div>
      ${a ? `<div class="interior-agent">
        <video src="${esc(a.avatar || `avatars/${a.id}-avatar.mp4`)}" poster="${esc(a.poster || `avatars/${a.id}-avatar.png`)}" muted loop autoplay playsinline></video>
        <div><div class="interior-agent-name">${esc(a.name)}</div>
        <div class="interior-agent-role">${esc(a.department || "")} — ${esc(a.current_action || a.role || "")}</div></div>
      </div>` : ""}
      <p class="interior-theme">${esc(theme)}</p>
      <div class="interior-stations">
        ${stations.map(s => `<div class="station"><span class="station-dot" style="--glow:${glow}"></span>${esc(s)}</div>`).join("")}
      </div>
      ${bridges.length ? `<div class="interior-bridges"><span class="k">Connected</span>${bridges.map(b => `<button class="bridge-link" data-go="${b.id}">${esc(b.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  o.classList.remove("hidden");
  o.querySelector(".interior-close").addEventListener("click", closeInterior);
  o.querySelectorAll(".bridge-link").forEach(b =>
    b.addEventListener("click", () => { closeInterior(); setTimeout(() => openInterior(b.dataset.go), 120); }));
}

/* ---------------- boats (ambient, preallocated) ---------------- */
function initBoats() {
  boats = [];
  if (!ISLANDS) return;
  const hub = ISLANDS.find((i) => (i.kind || "") === "hub");
  if (!hub) return;
  const spokes = (hub.bridges || []).slice(0, 8);
  spokes.forEach((id, k) => {
    const target = ISLANDS.find((i) => i.id === id);
    if (target) boats.push({ from: hub.id, to: target.id, t: (k / Math.max(1, spokes.length)), speed: 0.00012 + (k % 3) * 0.00004 });
  });
}
function boatPos(b, t) {
  const L = ISLAND_LAYOUT.byId || {};
  const a = L[b.from], c = L[b.to];
  if (!a || !c) return null;
  const tt = (b.t + t * b.speed * 60) % 2;
  const fwd = tt < 1, u = fwd ? tt : 2 - tt;
  const bob = Math.sin(t / 480 + u * 12) * 4;
  return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u + bob };
}

/* ---------------- canvas: sky, water, islands, bridges, boats ---------------- */
function drawSky(t) {
  const W = CANVAS.width, H = CANVAS.height, p = skyPalette();
  const horizon = H * islandRenderCfg.water_level;

  // sky above horizon
  const g = CTX.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, p.top); g.addColorStop(1, p.mid);
  CTX.fillStyle = g; CTX.fillRect(0, 0, W, horizon);

  // stars
  if (p.stars > .02) {
    CTX.save(); CTX.globalAlpha = p.stars;
    for (const s of stars) {
      const tw = .5 + .5 * Math.sin(t / 700 + s.ph);
      CTX.globalAlpha = p.stars * (.3 + .7 * tw);
      CTX.fillStyle = "#dfeaff";
      CTX.beginPath(); CTX.arc(s.x * W, s.y * horizon * 1.2, s.r, 0, 6.28); CTX.fill();
    }
    CTX.restore();
  }

  // sun / moon arc
  const dayT = (p.hour - 6) / 12, ang = Math.PI * Math.min(1, Math.max(0, dayT));
  if (dayT > 0 && dayT < 1) {
    const sx = W * (0.1 + 0.8 * dayT), sy = horizon * (0.9 - 0.7 * Math.sin(ang));
    const glow = CTX.createRadialGradient(sx, sy, 0, sx, sy, 160);
    glow.addColorStop(0, "rgba(255,240,200,.95)"); glow.addColorStop(1, "rgba(255,240,200,0)");
    CTX.fillStyle = glow; CTX.beginPath(); CTX.arc(sx, sy, 160, 0, 6.28); CTX.fill();
    CTX.fillStyle = "#fff3d0"; CTX.beginPath(); CTX.arc(sx, sy, 34, 0, 6.28); CTX.fill();
  } else {
    const nt = ((p.hour + 24 - 18) % 24) / 12, nang = Math.PI * Math.min(1, Math.max(0, nt));
    const mx = W * (0.12 + 0.76 * nt), my = horizon * (0.85 - 0.6 * Math.sin(nang));
    CTX.fillStyle = "rgba(230,238,255,.9)";
    CTX.beginPath(); CTX.arc(mx, my, 24, 0, 6.28); CTX.fill();
    CTX.fillStyle = p.top; CTX.beginPath(); CTX.arc(mx + 10, my - 6, 20, 0, 6.28); CTX.fill();
  }

  drawWater(t, W, H, horizon, p);
  if (ISLAND_LAYOUT.length) {
    drawBridges(t, W, H);
    drawIslands(t);
    drawBoats(t);
  } else {
    // graceful fallback: gentle terrain when the archipelago is offline
    const par = quality.parallax ? Math.sin(t / 9000) * 8 : 0;
    for (const [base, amp, col, off] of [[0.78, 46, "rgba(8,14,30,.55)", 0], [0.86, 60, "rgba(4,8,18,.8)", par]]) {
      CTX.fillStyle = col; CTX.beginPath(); CTX.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const y = H * base - amp * Math.sin(x / 300 + off / 40) - amp * .5 * Math.sin(x / 130 + 2);
        CTX.lineTo(x, y);
      }
      CTX.lineTo(W, H); CTX.closePath(); CTX.fill();
    }
  }

  // drifting data particles (extend the existing adaptive particle field)
  CTX.save();
  for (const pt of particles) {
    pt.x = (pt.x + pt.vx + 1) % 1; pt.y = (pt.y + pt.vy + 1) % 1;
    CTX.fillStyle = `rgba(${pt.hue},${pt.a})`;
    CTX.beginPath(); CTX.arc(pt.x * W, pt.y * H, pt.s, 0, 6.28); CTX.fill();
  }
  CTX.restore();
}

function drawWater(t, W, H, horizon, p) {
  const day = p.hour > 6.5 && p.hour < 17.5;
  const deep = day ? "rgb(8,84,110)" : "rgb(3,26,44)";
  const lite = day ? "rgb(46,196,199)" : "rgb(14,66,86)";
  const g = CTX.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, lite); g.addColorStop(0.25, day ? "rgb(32,170,188)" : "rgb(9,48,66)"); g.addColorStop(1, deep);
  CTX.fillStyle = g; CTX.fillRect(0, horizon, W, H - horizon);

  // horizon glow line
  CTX.fillStyle = day ? "rgba(255,255,255,.35)" : "rgba(120,180,255,.18)";
  CTX.fillRect(0, horizon - 1, W, 2);

  // day shimmer / moon glitter: reuse particle field positions, drawn denser near sun
  CTX.save();
  const n = Math.min(particles.length, 90);
  for (let i = 0; i < n; i++) {
    const pt = particles[(i * 7) % particles.length];
    const wy = horizon + ((pt.y * 997 + t / 2400) % 1) * (H - horizon);
    const tw = .35 + .65 * Math.abs(Math.sin(t / 900 + i));
    CTX.fillStyle = day ? `rgba(255,255,240,${.28 * tw})` : `rgba(150,200,255,${.2 * tw})`;
    CTX.beginPath(); CTX.ellipse(pt.x * W, wy, pt.s * 2.4, pt.s * 0.9, 0, 0, 6.28); CTX.fill();
  }
  CTX.restore();
}

function drawBridges() {
  const L = ISLAND_LAYOUT.byId || {};
  CTX.save();
  CTX.lineCap = "round";
  for (const rec of ISLAND_LAYOUT) {
    for (const id of (rec.isl.bridges || [])) {
      const o = L[id];
      if (!o || o === rec) continue;
      if (rec.isl.id > id) continue; // draw each pair once
      CTX.strokeStyle = "rgba(120,84,40,.85)"; CTX.lineWidth = 7;
      CTX.beginPath(); CTX.moveTo(rec.x, rec.y); CTX.lineTo(o.x, o.y); CTX.stroke();
      CTX.strokeStyle = "rgba(255,220,150,.28)"; CTX.lineWidth = 7; CTX.setLineDash([6, 14]);
      CTX.beginPath(); CTX.moveTo(rec.x, rec.y); CTX.lineTo(o.x, o.y); CTX.stroke();
      CTX.setLineDash([]);
    }
  }
  CTX.restore();
}

function drawIslands(t) {
  for (const rec of ISLAND_LAYOUT) drawIsland(rec, t);
}

function drawIsland(rec, t) {
  const { x, y, radius: r, isl, kind } = rec;
  const pal = isl.palette || {};
  const land = pal.land || "#0e5f4a", sand = pal.sand || "#f4e3b2", glow = pal.glow || "#8fc3ff";

  // glow rim on water
  const rg = CTX.createRadialGradient(x, y, r * 0.4, x, y, r * 1.5);
  rg.addColorStop(0, glow + "55"); rg.addColorStop(1, glow + "00");
  CTX.fillStyle = rg;
  CTX.beginPath(); CTX.ellipse(x, y, r * 1.5, r * 0.62, 0, 0, 6.28); CTX.fill();

  // sand ring then landmass
  CTX.fillStyle = sand;
  CTX.beginPath(); CTX.ellipse(x, y, r * 1.06, r * 0.44, 0, 0, 6.28); CTX.fill();
  const lg = CTX.createRadialGradient(x - r * .2, y - r * .1, r * .1, x, y, r);
  lg.addColorStop(0, land); lg.addColorStop(1, shade(land, -18));
  CTX.fillStyle = lg;
  CTX.beginPath(); CTX.ellipse(x, y, r * 0.92, r * 0.38, 0, 0, 6.28); CTX.fill();

  // pavilion: glowing structure whose windows echo the interior theme
  const pw = r * 0.86, ph = r * 0.5, px = x - pw / 2, py = y - r * 0.42;
  CTX.fillStyle = "rgba(6,10,24,.88)";
  CTX.beginPath();
  if (CTX.roundRect) CTX.roundRect(px, py, pw, ph, r * 0.12); else CTX.rect(px, py, pw, ph);
  CTX.fill();
  CTX.strokeStyle = glow; CTX.lineWidth = 2; CTX.stroke();
  // glowing interior windows (hyper-detailed feel: alternating warm/cool panes)
  const panes = Math.max(3, Math.floor(pw / (r * 0.16)));
  for (let i = 0; i < panes; i++) {
    const wx = px + pw * (0.08 + 0.84 * (i / Math.max(1, panes - 1)));
    const flick = .55 + .45 * Math.sin(t / 600 + i * 1.7 + x);
    CTX.fillStyle = i % 2 ? `rgba(255,214,120,${flick})` : glowHexA(glow, .35 + .4 * flick);
    CTX.beginPath(); CTX.arc(wx, py + ph * 0.55, r * 0.055, 0, 6.28); CTX.fill();
  }
  // pavilion roof light
  CTX.fillStyle = glowHexA(glow, .9);
  CTX.beginPath(); CTX.ellipse(x, py - 2, pw * 0.52, r * 0.07, 0, 0, 6.28); CTX.fill();

  // palms: trunk + fronds, swaying
  const palmN = kind === "hub" ? 4 : 2;
  for (let i = 0; i < palmN; i++) {
    const pxx = x - r * 0.55 + i * (r * 0.38), pyy = y - r * 0.1;
    const sway = Math.sin(t / 1400 + i * 2 + x * 0.01) * r * 0.05;
    CTX.strokeStyle = "#5b3a1e"; CTX.lineWidth = Math.max(2, r * 0.035);
    CTX.beginPath(); CTX.moveTo(pxx, pyy); CTX.quadraticCurveTo(pxx + sway, pyy - r * 0.3, pxx + sway * 1.4, pyy - r * 0.48); CTX.stroke();
    CTX.strokeStyle = "rgba(64,190,120,.95)"; CTX.lineWidth = Math.max(2, r * 0.045);
    const tx = pxx + sway * 1.4, ty = pyy - r * 0.48;
    for (const a of [-2.4, -1.9, -1.2, -0.7]) {
      CTX.beginPath(); CTX.moveTo(tx, ty);
      CTX.quadraticCurveTo(tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.2 - r * 0.08, tx + Math.cos(a) * r * 0.44, ty + Math.sin(a) * r * 0.3 + r * 0.06);
      CTX.stroke();
    }
  }

  // hub extras: holographic globe
  if (kind === "hub") drawGlobe(x, y - r * 0.95, r * 0.42, t, glow);
}

function drawGlobe(x, y, r, t, glow) {
  CTX.save();
  // hologram base shimmer
  CTX.fillStyle = "rgba(120,220,255,.10)";
  CTX.beginPath(); CTX.arc(x, y, r * 1.25, 0, 6.28); CTX.fill();
  // sphere
  const g = CTX.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
  g.addColorStop(0, "rgba(150,230,255,.55)"); g.addColorStop(0.6, "rgba(60,140,220,.35)"); g.addColorStop(1, "rgba(20,60,140,.25)");
  CTX.fillStyle = g; CTX.beginPath(); CTX.arc(x, y, r, 0, 6.28); CTX.fill();
  // rotating meridians (hologram)
  CTX.strokeStyle = glowHexA("#9fe8ff", .8); CTX.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) {
    const ph = t / 2600 + k * Math.PI / 3;
    CTX.beginPath();
    CTX.ellipse(x, y, Math.abs(Math.cos(ph)) * r, r, 0, 0, 6.28);
    CTX.stroke();
  }
  CTX.beginPath(); CTX.ellipse(x, y, r, r * 0.32, 0, 0, 6.28); CTX.stroke();
  CTX.restore();
}

function drawBoats(t) {
  CTX.save();
  for (const b of boats) {
    const p = boatPos(b, t);
    if (!p) continue;
    const s = Math.min(CANVAS.width, CANVAS.height) * 0.008 + 5;
    CTX.fillStyle = "rgba(20,30,52,.9)";
    CTX.beginPath();
    CTX.moveTo(p.x - s, p.y); CTX.lineTo(p.x + s, p.y);
    CTX.lineTo(p.x + s * 0.6, p.y + s * 0.55); CTX.lineTo(p.x - s * 0.6, p.y + s * 0.55);
    CTX.closePath(); CTX.fill();
    CTX.strokeStyle = "rgba(255,215,94,.9)"; CTX.lineWidth = 2;
    CTX.beginPath(); CTX.moveTo(p.x, p.y); CTX.lineTo(p.x, p.y - s * 1.5); CTX.stroke();
    CTX.fillStyle = "rgba(255,215,94,.55)";
    CTX.beginPath(); CTX.arc(p.x, p.y - s * 1.7, 2.5, 0, 6.28); CTX.fill();
  }
  CTX.restore();
}

/* small color helpers (pure, no allocations beyond return strings) */
function shade(hexC, amt) {
  const [r, g, b] = hex(hexC);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function glowHexA(hexC, a) {
  if (!hexC || hexC[0] !== "#") return hexC;
  const [r, g, b] = hex(hexC);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------- world clock label ---------------- */
function tickClock() {
  const n = new Date(), p = skyPalette();
  const label = p.hour < 5 ? "Night" : p.hour < 7.5 ? "Dawn" : p.hour < 16.5 ? "Day" : p.hour < 20 ? "Dusk" : "Night";
  const isl = ISLANDS ? ` · ${ISLANDS.length} islands` : " · charting waters";
  const ov = todOverride !== null ? ` · ⏱ ${todOverride.toFixed(1)}h` : "";
  $("#world-clock").textContent = `${n.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})} · ${label} · ${quality.tier} detail${isl}${ov}`;
}
setInterval(tickClock, 1000); tickClock();

/* ---------------- agent video pool ---------------- */
const pool = [], agentNodes = new Map();
function acquireVideo() {
  if (pool.length) return pool.pop();
  const count = STAGE.querySelectorAll("video").length;
  const v = document.createElement("video");
  v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = "auto";
  if (count >= MAX_VIDEO_NODES && !acquireVideo._warned) {
    acquireVideo._warned = true;
    console.info(`[ultimate] video pool overflow at ${count} nodes — creating overflow nodes; off-screen culling keeps playback bounded.`);
  }
  return v; // never null: no hardcoded cap on how many agents can exist
}
// off-screen culling: pause videos not in view
const culler = new IntersectionObserver((es) => {
  for (const e of es) { if (e.isIntersecting) e.target.play().catch(()=>{}); else e.target.pause(); }
});

const EXPR = { celebrating: "expr-celebrating", working: "expr-working", alert: "expr-alert", idle: "expr-idle" };
function agentScreenPos(a) {
  // Archipelago placement: the agent's island owns its stage position.
  const isl = islandForAgent(a.id);
  if (isl && ISLAND_LAYOUT.byId && ISLAND_LAYOUT.byId[isl.id]) {
    const rec = ISLAND_LAYOUT.byId[isl.id];
    return { x: rec.x + rec.avatarDx, y: rec.y + rec.avatarDy, pct: false };
  }
  return { x: a.x ?? 50, y: a.y ?? 50, pct: true };
}
function renderAgent(a) {
  let node = agentNodes.get(a.id);
  if (!node) {
    const v = acquireVideo();
    node = document.createElement("div");
    node.className = "agent expr-idle";
    node.appendChild(v);
    const ring = document.createElement("div"); ring.className = "ring"; node.appendChild(ring);
    const badge = document.createElement("div"); badge.className = "badge"; badge.textContent = "✨"; node.appendChild(badge);
    const plate = document.createElement("div"); plate.className = "nameplate"; node.appendChild(plate);
    node.addEventListener("click", () => showCard(a));
    STAGE.appendChild(node); culler.observe(v);
    agentNodes.set(a.id, node);
  }
  node.dataset.id = a.id;
  // while an agent is traveling a bridge, the trip engine owns its position
  if (!trips.has(a.id)) {
    const pos = agentScreenPos(a);
    if (pos.pct) { node.style.left = pos.x + "%"; node.style.top = pos.y + "%"; }
    else { node.style.left = pos.x + "px"; node.style.top = pos.y + "px"; }
  }
  node._world = nodeWorldFromStyle(node, a);
  node.querySelector(".nameplate").textContent = a.name || a.id;
  const v = node.querySelector("video");
  const src = a.avatar || `avatars/${a.id}-avatar.mp4`;
  if (v.dataset.src !== src) { v.dataset.src = src; v.src = src; v.poster = a.poster || `avatars/${a.id}-avatar.png`; v.play().catch(()=>{}); }
  const exprClass = EXPR[a.expression] || EXPR.idle;
  if (!node.classList.contains(exprClass)) {
    Object.values(EXPR).forEach(c => node.classList.remove(c));
    node.classList.add(exprClass); // transitions handled by CSS animations
  }
  node._data = a;
}
function nodeWorldFromStyle(node, a) {
  const pos = agentScreenPos(a);
  return pos.pct
    ? { x: (pos.x / 100) * CANVAS.width, y: (pos.y / 100) * CANVAS.height }
    : { x: pos.x, y: pos.y };
}
function showCard(a) {
  const c = $("#status-card");
  const isl = islandForAgent(a.id);
  const islandLine = isl ? `<div class="row"><span class="k">Island</span>${esc(isl.name)} — ${esc((isl.verbs || []).join(" · "))}</div>` : "";
  const inv = (a.life && a.life.inventory) || {};
  const invLine = (inv.items && inv.items.length) || (inv.worn && inv.worn.length)
    ? `<div class="row"><span class="k">Inventory</span>${esc([].concat(inv.worn || [], (inv.items || []).filter(i => !(inv.worn || []).includes(i))).join(", "))}</div>` : "";
  const musicLine = inv.music && inv.music.length ? `<div class="row"><span class="k">On the decks</span>${esc(inv.music.join(", "))}</div>` : "";
  const wins = recentWinsFor(a.id, a.name);
  const winsLine = wins.length
    ? `<div class="row"><span class="k">Recent wins</span>${wins.map(w => `<div class="win">${esc(w.action)} — ${esc(w.detail)}${w.url ? ` <a href="${esc(w.url)}" target="_blank" rel="noopener">↗</a>` : ""}<div class="ts">${esc(timeAgo(w.ts))}</div></div>`).join("")}</div>`
    : "";
  c.innerHTML = `<span class="close">✕</span>
    <h2>${esc(a.name || a.id)}</h2>
    <div class="dept">${esc(a.department || "CWI")} · <span class="expr-tag">${esc(a.expression || "idle")}</span></div>
    ${islandLine}
    <div class="row"><span class="k">Current task</span>${esc(a.current_action || "—")}</div>
    ${invLine}${musicLine}${winsLine}
    <div class="row"><span class="k">Persona</span>${esc(a.persona_line || "—")}</div>`;
  c.classList.add("open");
  c.style.left = Math.min(innerWidth - 340, Math.max(10, innerWidth / 2 - 160)) + "px";
  c.style.top = Math.min(innerHeight - 420, Math.max(60, innerHeight * 0.45 - 100)) + "px";
  c.querySelector(".close").onclick = () => c.classList.remove("open");
}
function showGuestCard(g) {
  const c = $("#status-card");
  c.innerHTML = `<span class="close">✕</span>
    <h2>${esc(g.name || "Guest")}</h2>
    <div class="dept">VISITOR · GUEST PRESENCE</div>
    <div class="row"><span class="k">Status</span>Visiting the archipelago — ${esc(g.note || "taking in the view")}</div>
    <div class="row"><span class="k">Persona</span>Guest agents appear as visitor presences and share the world's aliveness.</div>`;
  c.classList.add("open");
  c.style.left = Math.min(innerWidth - 340, Math.max(10, innerWidth / 2 - 160)) + "px";
  c.style.top = Math.min(innerHeight - 320, Math.max(60, innerHeight * 0.45 - 80)) + "px";
  c.querySelector(".close").onclick = () => c.classList.remove("open");
}

/* ---------------- KingCode on the hub (gold crown exclusive) ---------------- */
function renderKingCode() {
  if ($("#kingcode-node") || !ISLAND_LAYOUT.byId || !ISLAND_LAYOUT.byId["ai-hub"]) return;
  const hub = ISLAND_LAYOUT.byId["ai-hub"];
  const node = document.createElement("div");
  node.id = "kingcode-node";
  node.className = "agent expr-idle";
  const wx = hub.x + hub.avatarDx, wy = hub.y + hub.avatarDy;
  node.style.left = wx + "px";
  node.style.top = wy + "px";
  node._world = { x: wx, y: wy };
  node.innerHTML = `<div class="crown" aria-label="KingCode crown"></div>
    <img class="kc-avatar" src="${brandLogo}" alt="KingCode">
    <div class="nameplate">KINGCODE</div>`;
  node.addEventListener("click", () => showCard({
    id: "kingcode", name: "KingCode", department: "Chief of Staff",
    expression: "working",
    current_action: "Overseeing the archipelago — planning, working, growing.",
    persona_line: "The switchboard at the center of the CWI machine.",
  }));
  STAGE.appendChild(node);
  agentNodes.set("kingcode", node);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

/* ---------------- guests: visitor presences ---------------- */
function renderGuests(list) {
  document.querySelectorAll(".guest").forEach(e => e.remove());
  for (const g of (list || []).slice(0, 40)) { // paginated-friendly cap per page
    const el = document.createElement("div"); el.className = "guest";
    el.style.left = (g.x ?? 50) + "%"; el.style.top = (g.y ?? 50) + "%";
    el.setAttribute("role", "button"); el.setAttribute("tabindex", "0");
    const initial = (g.name || "?").trim().charAt(0).toUpperCase();
    el.innerHTML = `<div class="orb">${esc(initial)}</div><div class="glabel">${esc(g.name || "Guest")}</div>`;
    el.addEventListener("click", () => showGuestCard(g));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showGuestCard(g); } });
    STAGE.appendChild(el);
  }
}

/* ---------------- agent trips: traveling the bridges ----------------
 * Agents visibly walk the bridges between islands. Destinations are tied to
 * real work: recent activity-ledger events naming an island steer the trip;
 * otherwise a connected neighbor island is chosen. Bounded: max 3 at once. */
const trips = new Map();
const TRIP_MS = 9000, DWELL_MS = 6000;
let lastTripSchedule = 0;
function easeInOut(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
function scheduleTrip(t) {
  if (trips.size >= 3 || !ISLAND_LAYOUT.byId) return;
  const ids = [...agentNodes.keys()].filter(id => id !== "kingcode" && !trips.has(id) && islandForAgent(id));
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const home = islandForAgent(id);
  const neighbors = (home.bridges || []).map(islandById).filter(b => b && b.id !== home.id);
  if (!neighbors.length) return;
  // prefer a destination the agent's recent real work points at
  let dest = neighbors[Math.floor(Math.random() * neighbors.length)];
  const hint = ledgerMentionsIsland(id, neighbors);
  if (hint) dest = hint;
  const from = ISLAND_LAYOUT.byId[home.id], to = ISLAND_LAYOUT.byId[dest.id];
  if (!from || !to) return;
  trips.set(id, { from, to, homeId: home.id, destId: dest.id, t0: t, phase: "out" });
  console.info(`[ultimate] ${id} traveling ${home.name} → ${dest.name}`);
}
function updateTrips(t) {
  if (t - lastTripSchedule > 15000) { lastTripSchedule = t; scheduleTrip(t); }
  for (const [id, trip] of trips) {
    const node = agentNodes.get(id);
    if (!node) { trips.delete(id); continue; }
    const el = t - trip.t0;
    let u, done = false, returning = false;
    if (trip.phase === "out") {
      u = el / TRIP_MS;
      if (u >= 1) { trip.phase = "dwell"; trip.t0 = t; u = 1; }
    } else if (trip.phase === "dwell") {
      u = 1;
      if (el >= DWELL_MS) { trip.phase = "back"; trip.t0 = t; returning = true; u = 0; }
    } else {
      u = el / TRIP_MS;
      returning = true;
      if (u >= 1) { done = true; u = 1; }
    }
    const e = easeInOut(Math.min(1, Math.max(0, u)));
    const ax = trip.from.x + trip.from.avatarDx, ay = trip.from.y + trip.from.avatarDy;
    const bx = trip.to.x + trip.to.avatarDx, by = trip.to.y + trip.to.avatarDy;
    const fx = returning ? bx : ax, fy = returning ? by : ay;
    const txp = returning ? ax : bx, typ = returning ? ay : by;
    const wx = fx + (txp - fx) * e, wy = fy + (typ - fy) * e;
    node.style.left = wx + "px"; node.style.top = wy + "px";
    node._world = { x: wx, y: wy };
    if (done) {
      trips.delete(id);
      const pos = agentScreenPos(node._data || { id });
      if (!pos.pct) { node.style.left = pos.x + "px"; node.style.top = pos.y + "px"; }
      node._world = { x: pos.pct ? 0 : pos.x, y: pos.pct ? 0 : pos.y };
    }
  }
}

/* ---------------- activity ledger: real data, two shapes ---------------- */
let ledgerCache = [];
function ledgerEvents(ledger) {
  if (!ledger) return [];
  const raw = ledger.events || ledger.entries || [];
  return raw.map(e => ({
    ts: e.ts || e.timestamp || "",
    actor: e.actor || "—",
    action: e.action || "",
    detail: e.detail || "",
    url: e.url || e.last_win_url || "",
  }));
}
function recentWinsFor(agentId, agentName) {
  const needle = (agentId + " " + (agentName || "")).toLowerCase();
  return ledgerCache
    .filter(e => (e.actor + " " + e.detail).toLowerCase().includes(needle.split(" ")[0]) && /win|ship|live|launch|closed|placed/i.test(e.action + " " + e.detail))
    .slice(-3).reverse();
}
function ledgerMentionsIsland(agentId, neighbors) {
  const mine = ledgerCache.filter(e => e.actor.toLowerCase().includes(agentId.toLowerCase())).slice(-5);
  for (const e of mine) {
    const hay = (e.detail + " " + e.action).toLowerCase();
    const hit = neighbors.find(n => hay.includes(n.name.toLowerCase()) || hay.includes(n.id));
    if (hit) return hit;
  }
  return null;
}
function timeAgo(ts) {
  const d = Date.parse(ts);
  if (isNaN(d)) return "";
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ---------------- loading / error / empty states ---------------- */
let consecutiveFails = 0, worldEverLoaded = false;
function setLoading(on) { $("#loading").classList.toggle("hidden", !on); }
function setError(on) { $("#error-banner").classList.toggle("hidden", !on); }

/* ---------------- state loading (scalability contract) ---------------- */
let lastGeneratedAt = null;
async function j(url) {
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}
const optional = async (url) => { try { return await j(url); } catch { return null; } };

async function loadState(force) {
  try {
    const w = await j("world.json");
    const gen = w.generated_at;
    const first = lastGeneratedAt === null;
    if (first || force || gen !== lastGeneratedAt) {
      lastGeneratedAt = gen;
      const idx = await optional(w.agents_index || "agents/index.json");
      const ids = (idx && idx.agents) || [];
      for (const id of ids) {
        const a = await optional(`agents/${id}.json`);
        if (a) renderAgent(a);
      }
      buildFollowOptions();
      $("#stage-empty").classList.toggle("hidden", agentNodes.size > 0);
      const gi = await optional(w.guests_index || "guests/index.json");
      renderGuests(gi && gi.guests);
      const rules = await optional(w.rules || "rules.json");
      renderRules(rules);
    }
    const ledger = await optional((w && w.activity_ledger) || "activity/ledger.json");
    if (ledger) {
      ledgerCache = ledgerEvents(ledger);
      renderFeed(ledgerCache);
      renderOwnerLedger(ledgerCache);
    }
    consecutiveFails = 0; setError(false);
    if (!worldEverLoaded) { worldEverLoaded = true; setLoading(false); }
  } catch (e) {
    console.warn("state load failed:", e);
    consecutiveFails++;
    if (!worldEverLoaded && consecutiveFails >= MAX_FAILS_BEFORE_ERROR) { setLoading(false); setError(true); }
    else if (worldEverLoaded && consecutiveFails >= MAX_FAILS_BEFORE_ERROR) setError(true);
  }
}

function renderRules(rules) {
  const box = $("#rules-list");
  if (!rules || !rules.rules || !rules.rules.length) {
    box.innerHTML = `<div class="incoming">Rules incoming — Charter is drafting the World's Rules.</div>`;
    return;
  }
  box.innerHTML = rules.rules.map(r =>
    `<div class="rule">${esc(typeof r === "string" ? r : (r.text || r.title || ""))}</div>`).join("");
}

/* live activity feed — real ledger events, updates every poll */
function renderFeed(events) {
  const list = $("#feed-list");
  const latest = events.slice(-8).reverse();
  if (!latest.length) { list.innerHTML = `<div class="incoming">Ledger quiet — no activity yet.</div>`; return; }
  list.innerHTML = latest.map(e =>
    `<div class="feed-entry"><span class="actor">${esc(e.actor)}</span> <span class="action">${esc(e.action)}</span>
     <div class="detail">${esc(e.detail)}${e.url ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">↗</a>` : ""}</div>
     <div class="ts">${esc(timeAgo(e.ts))}</div></div>`).join("");
}
function renderOwnerLedger(events) {
  const box = $("#ledger-list"), latest = events.slice(-20).reverse();
  if (!latest.length) { box.innerHTML = `<div class="incoming">Ledger quiet — no activity yet.</div>`; return; }
  box.innerHTML = latest.map(e =>
    `<div class="ledger-entry"><span class="actor">${esc(e.actor)}</span> <span class="action">${esc(e.action)}</span>
     <div class="detail">${esc(e.detail)}</div>
     <div class="ts">${esc(timeAgo(e.ts))}</div></div>`).join("");
}

/* ---------------- owner controls (all real, all wired) ---------------- */
function buildFollowOptions() {
  const sel = $("#follow-select");
  if (!sel || sel.dataset.built) return;
  sel.dataset.built = "1";
  const opts = [...agentNodes.keys()].map(id => {
    const n = agentNodes.get(id), a = n && n._data;
    return `<option value="${esc(id)}">${esc((a && a.name) || id)}</option>`;
  }).join("");
  sel.innerHTML = `<option value="">Follow: none</option>` + opts;
}
function wireOwnerControls() {
  const tod = $("#tod-range"), todLabel = $("#tod-label"), live = $("#tod-live");
  if (tod) {
    tod.addEventListener("input", () => {
      todOverride = parseFloat(tod.value);
      if (todLabel) todLabel.textContent = `${todOverride.toFixed(1)}h`;
      tickClock();
    });
  }
  if (live) live.addEventListener("click", () => {
    todOverride = null;
    if (tod) tod.value = "12";
    if (todLabel) todLabel.textContent = "live";
    tickClock();
  });
  const sel = $("#follow-select");
  if (sel) sel.addEventListener("change", () => {
    cam.followId = sel.value || null;
    if (cam.followId) {
      const p = getAgentWorldPos(cam.followId);
      if (p) { cam.tx = p.x; cam.ty = p.y; cam.tz = Math.max(cam.tz, 1.6); }
    }
  });
  const fi = $("#cam-in"), fo = $("#cam-out"), fr = $("#cam-reset"), ff = $("#feed-toggle");
  if (fi) fi.addEventListener("click", () => { cam.tz = Math.min(4, cam.tz * 1.25); cam.followId = null; });
  if (fo) fo.addEventListener("click", () => { cam.tz = Math.max(0.6, cam.tz / 1.25); cam.followId = null; });
  if (fr) fr.addEventListener("click", camReset);
  if (ff) ff.addEventListener("click", () => $("#feed-panel").classList.toggle("collapsed"));
  const ic = $("#interior-close-btn");
  if (ic) ic.addEventListener("click", closeInterior);
}
$("#owner-toggle").addEventListener("click", () => $("#owner-panel").classList.toggle("open"));
if (new URLSearchParams(location.search).get("owner") === "1") $("#owner-panel").classList.add("open");

/* ---------------- main loop (single rAF; layout cached; arrays pooled) ---------------- */
let lastT = 0;
function loop(t) {
  measureFps(t);
  // follow-an-agent camera: real tracking, eased
  if (cam.followId) {
    const p = getAgentWorldPos(cam.followId);
    if (p) { cam.tx = p.x; cam.ty = p.y; }
  }
  camApply();
  updateTrips(t);
  drawSky(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
wireOwnerControls();
loadIslands().then(() => { renderKingCode(); layoutIslands(); });
loadState(true);
setInterval(() => loadState(false), POLL_MS);

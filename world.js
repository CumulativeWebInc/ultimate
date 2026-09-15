/* PROJECT ULTIMATE — living world scene engine (Cumulative Web Inc)
 * Canvas sky + pooled video agents + state contract loading.
 * State contract: world.json -> agents/index.json -> agents/<id>.json,
 * guests/index.json, activity/ledger.json, rules.json. Refetch cadence 60s.
 * Per-agent files are only re-fetched when world.json's generated_at changes.
 */
"use strict";

const $ = (s) => document.querySelector(s);
const CANVAS = $("#sky"), CTX = CANVAS.getContext("2d");
const STAGE = $("#stage");
const MAX_VIDEO_NODES = 24; // soft pool target: overflow creates nodes, never drops an agent
const POLL_MS = 60_000;
const MAX_FAILS_BEFORE_ERROR = 2;

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
function skyPalette() {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
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

function resize() { CANVAS.width = innerWidth; CANVAS.height = innerHeight; }
addEventListener("resize", resize); resize(); initSky();

function drawSky(t) {
  const W = CANVAS.width, H = CANVAS.height, p = skyPalette();
  const g = CTX.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.top); g.addColorStop(.55, p.mid); g.addColorStop(1, p.bot);
  CTX.fillStyle = g; CTX.fillRect(0, 0, W, H);

  // stars
  if (p.stars > .02) {
    CTX.save(); CTX.globalAlpha = p.stars;
    for (const s of stars) {
      const tw = .5 + .5 * Math.sin(t / 700 + s.ph);
      CTX.globalAlpha = p.stars * (.3 + .7 * tw);
      CTX.fillStyle = "#dfeaff";
      CTX.beginPath(); CTX.arc(s.x * W, s.y * H, s.r, 0, 6.28); CTX.fill();
    }
    CTX.restore();
  }

  // sun / moon arc
  const dayT = (p.hour - 6) / 12, ang = Math.PI * Math.min(1, Math.max(0, dayT));
  if (dayT > 0 && dayT < 1) {
    const sx = W * (0.1 + 0.8 * dayT), sy = H * (0.85 - 0.62 * Math.sin(ang));
    const glow = CTX.createRadialGradient(sx, sy, 0, sx, sy, 160);
    glow.addColorStop(0, "rgba(255,240,200,.95)"); glow.addColorStop(1, "rgba(255,240,200,0)");
    CTX.fillStyle = glow; CTX.beginPath(); CTX.arc(sx, sy, 160, 0, 6.28); CTX.fill();
    CTX.fillStyle = "#fff3d0"; CTX.beginPath(); CTX.arc(sx, sy, 34, 0, 6.28); CTX.fill();
  } else {
    const nt = ((p.hour + 24 - 18) % 24) / 12, nang = Math.PI * Math.min(1, Math.max(0, nt));
    const mx = W * (0.12 + 0.76 * nt), my = H * (0.8 - 0.55 * Math.sin(nang));
    CTX.fillStyle = "rgba(230,238,255,.9)";
    CTX.beginPath(); CTX.arc(mx, my, 24, 0, 6.28); CTX.fill();
    CTX.fillStyle = p.top; CTX.beginPath(); CTX.arc(mx + 10, my - 6, 20, 0, 6.28); CTX.fill();
  }

  // terrain silhouettes (two parallax layers)
  const par = quality.parallax ? Math.sin(t / 9000) * 8 : 0;
  for (const [base, amp, col, off] of [[0.78, 46, "rgba(8,14,30,.55)", 0], [0.86, 60, "rgba(4,8,18,.8)", par]]) {
    CTX.fillStyle = col; CTX.beginPath(); CTX.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = H * base - amp * Math.sin(x / 300 + off / 40) - amp * .5 * Math.sin(x / 130 + 2);
      CTX.lineTo(x, y);
    }
    CTX.lineTo(W, H); CTX.closePath(); CTX.fill();
  }

  // drifting data particles
  CTX.save();
  for (const pt of particles) {
    pt.x = (pt.x + pt.vx + 1) % 1; pt.y = (pt.y + pt.vy + 1) % 1;
    CTX.fillStyle = `rgba(${pt.hue},${pt.a})`;
    CTX.beginPath(); CTX.arc(pt.x * W, pt.y * H, pt.s, 0, 6.28); CTX.fill();
  }
  CTX.restore();
}

/* ---------------- world clock label ---------------- */
function tickClock() {
  const n = new Date(), p = skyPalette();
  const label = p.hour < 5 ? "Night" : p.hour < 7.5 ? "Dawn" : p.hour < 16.5 ? "Day" : p.hour < 20 ? "Dusk" : "Night";
  $("#world-clock").textContent = `${n.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})} · ${label} · ${quality.tier} detail`;
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
  node.style.left = (a.x ?? 50) + "%"; node.style.top = (a.y ?? 50) + "%";
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
function showCard(a) {
  const c = $("#status-card");
  c.innerHTML = `<span class="close">✕</span>
    <h2>${esc(a.name || a.id)}</h2>
    <div class="dept">${esc(a.department || "CWI")}</div>
    <div class="row"><span class="k">Current action</span>${esc(a.current_action || "—")}</div>
    <div class="row"><span class="k">Last win</span>${a.last_win_url ? `<a href="${esc(a.last_win_url)}" target="_blank" rel="noopener">${esc(a.last_win)}</a>` : esc(a.last_win || "—")}</div>
    <div class="row"><span class="k">Persona</span>${esc(a.persona_line || "—")}</div>`;
  c.classList.add("open");
  c.style.left = Math.min(innerWidth - 320, Math.max(10, innerWidth / 2 - 150)) + "px";
  c.style.top = Math.min(innerHeight - 320, Math.max(60, innerHeight * (a.y / 100) - 80)) + "px";
  c.querySelector(".close").onclick = () => c.classList.remove("open");
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

/* ---------------- guests ---------------- */
function renderGuests(list) {
  document.querySelectorAll(".guest").forEach(e => e.remove());
  for (const g of (list || []).slice(0, 40)) { // paginated-friendly cap per page
    const el = document.createElement("div"); el.className = "guest";
    el.style.left = (g.x ?? 50) + "%"; el.style.top = (g.y ?? 50) + "%";
    const initial = (g.name || "?").trim().charAt(0).toUpperCase();
    el.innerHTML = `<div class="orb">${esc(initial)}</div><div class="glabel">${esc(g.name || "Guest")}</div>`;
    STAGE.appendChild(el);
  }
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
      $("#stage-empty").classList.toggle("hidden", agentNodes.size > 0);
      const gi = await optional(w.guests_index || "guests/index.json");
      renderGuests(gi && gi.guests);
      const rules = await optional(w.rules || "rules.json");
      renderRules(rules);
    }
    const ledger = await optional((w && w.activity_ledger) || "activity/ledger.json");
    if (ledger) renderLedger(ledger);
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

function renderLedger(ledger) {
  const box = $("#ledger-list"), entries = (ledger.entries || []).slice(-20).reverse();
  if (!entries.length) { box.innerHTML = `<div class="incoming">Ledger quiet — no activity yet.</div>`; return; }
  box.innerHTML = entries.map(e =>
    `<div class="ledger-entry"><span class="actor">${esc(e.actor)}</span> <span class="action">${esc(e.action)}</span>
     <div class="detail">${esc(e.detail || "")}</div>
     <div class="ts">${esc(e.timestamp || "")}</div></div>`).join("");
}

/* ---------------- owner view ---------------- */
$("#owner-toggle").addEventListener("click", () => $("#owner-panel").classList.toggle("open"));
if (new URLSearchParams(location.search).get("owner") === "1") $("#owner-panel").classList.add("open");

/* ---------------- main loop ---------------- */
let lastT = 0;
function loop(t) {
  measureFps(t); drawSky(t); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
loadState(true);
setInterval(() => loadState(false), POLL_MS);

/* PROJECT ULTIMATE — render command applier (world/simulation/render)
 * ============================================================================
 * Browser-only executor for the pure command lists built by render/scene.js.
 * This file is intentionally thin: it draws what the commands say, keyed by
 * id, and holds no simulation state. Camera/interaction callbacks are wired
 * by the host (sim.js). Not covered by the renderer-purity test (which runs
 * at the command level); covered instead by "commands are complete" review.
 * ============================================================================
 */

const esc = (s) =>
  String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));

/* i18n: the shared loader (data-app="ultimate") defines window.CWI18n before the
   deferred host module runs; this module is only ever imported from the browser
   host, so CWI18n is present. Guard anyway and fall back to inline English. */
const hasI18n = () => typeof CWI18n !== "undefined" && !!CWI18n;

/* ---------------- sky palettes (24h keys) ---------------- */
const KEYS = [
  [0, "#03040a", "#0a0e24", "#131a3a", 1],
  [5, "#03040a", "#0a0e24", "#131a3a", 1],
  [6.5, "#2b3a6e", "#b06a8a", "#f2a56e", 0.25],
  [9, "#2f7fd0", "#7cc0ee", "#cfeef7", 0],
  [16, "#2f7fd0", "#7cc0ee", "#cfeef7", 0],
  [17.5, "#232a5e", "#a04a6e", "#f28a4a", 0.1],
  [20, "#03040a", "#0a0e24", "#131a3a", 1],
  [22, "#03040a", "#0a0e24", "#131a3a", 1],
  [24, "#03040a", "#0a0e24", "#131a3a", 1],
];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
function skyPalette(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && hour > KEYS[i + 1][0]) i++;
  const [h0, t0, m0, b0, s0] = KEYS[i];
  const [h1, t1, m1, b1, s1] = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  return {
    top: mix(hex(t0), hex(t1), t), mid: mix(hex(m0), hex(m1), t),
    bot: mix(hex(b0), hex(b1), t), stars: s0 + (s1 - s0) * t,
  };
}
function shade(hexC, amt) {
  const [r, g, b] = hex(hexC);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function glowA(hexC, a) {
  if (!hexC || hexC[0] !== "#") return hexC;
  const [r, g, b] = hex(hexC);
  return `rgba(${r},${g},${b},${a})`;
}
/* deterministic particle field: hash(i, tick), no Math.random anywhere */
function phash(i, tick, salt) {
  let h = (i * 374761393 + tick * 668265263 + salt * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createApplier({ canvas, stage, els, logo, onIslandClick, onAgentClick }) {
  const ctx = canvas.getContext("2d");
  const signNodes = new Map();
  const agentNodes = new Map();

  function sizeCanvas(W, H) {
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
  }

  /* ---------------- canvas executors ---------------- */
  function drawSky(p) {
    const pal = skyPalette(p.hour);
    const g = ctx.createLinearGradient(0, 0, 0, p.horizon);
    g.addColorStop(0, pal.top);
    g.addColorStop(1, pal.mid);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, p.W, p.horizon);
    p._pal = pal;
  }
  function drawStars(p) {
    const pal = p._pal || skyPalette(p.hour);
    if (pal.stars < 0.02) return;
    ctx.save();
    for (let i = 0; i < 130; i++) {
      const x = phash(i, 0, 11) * p.W;
      const y = phash(i, 0, 12) * p.horizon * 0.85;
      const tw = 0.5 + 0.5 * Math.sin(p.tick / 14 + phash(i, 0, 13) * 6.28);
      ctx.globalAlpha = pal.stars * (0.3 + 0.7 * tw);
      ctx.fillStyle = "#dfeaff";
      ctx.beginPath();
      ctx.arc(x, y, 0.4 + phash(i, 0, 14) * 1.4, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawSunMoon(p) {
    const pal = p._pal || skyPalette(p.hour);
    const dayT = (p.hour - 6) / 12;
    if (dayT > 0 && dayT < 1) {
      const ang = Math.PI * dayT;
      const sx = p.W * (0.1 + 0.8 * dayT);
      const sy = p.horizon * (0.9 - 0.7 * Math.sin(ang));
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160);
      glow.addColorStop(0, "rgba(255,240,200,.95)");
      glow.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 160, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#fff3d0";
      ctx.beginPath(); ctx.arc(sx, sy, 34, 0, 6.28); ctx.fill();
    } else {
      const nt = (((p.hour + 24 - 18) % 24) / 12);
      const nang = Math.PI * Math.min(1, Math.max(0, nt));
      const mx = p.W * (0.12 + 0.76 * nt);
      const my = p.horizon * (0.85 - 0.6 * Math.sin(nang));
      ctx.fillStyle = "rgba(230,238,255,.9)";
      ctx.beginPath(); ctx.arc(mx, my, 24, 0, 6.28); ctx.fill();
      ctx.fillStyle = pal.top;
      ctx.beginPath(); ctx.arc(mx + 10, my - 6, 20, 0, 6.28); ctx.fill();
    }
  }
  function drawWater(p) {
    const day = p.hour > 6.5 && p.hour < 17.5;
    const deep = day ? "rgb(8,84,110)" : "rgb(3,26,44)";
    const lite = day ? "rgb(46,196,199)" : "rgb(14,66,86)";
    const g = ctx.createLinearGradient(0, p.horizon, 0, p.H);
    g.addColorStop(0, lite);
    g.addColorStop(0.25, day ? "rgb(32,170,188)" : "rgb(9,48,66)");
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, p.horizon, p.W, p.H - p.horizon);
    ctx.fillStyle = day ? "rgba(255,255,255,.35)" : "rgba(120,180,255,.18)";
    ctx.fillRect(0, p.horizon - 1, p.W, 2);
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const x = phash(i, p.tick, 21) * p.W;
      const wy = p.horizon + phash(i, p.tick, 22) * (p.H - p.horizon);
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.tick / 18 + i));
      ctx.fillStyle = day ? `rgba(255,255,240,${0.28 * tw})` : `rgba(150,200,255,${0.2 * tw})`;
      ctx.beginPath();
      ctx.ellipse(x, wy, 4.5, 1.8, 0, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawBridge(p) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(120,84,40,.85)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,220,150,.28)";
    ctx.setLineDash([6, 14]);
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  function drawIsland(p) {
    const { x, y, r } = p;
    const rg = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 1.5);
    rg.addColorStop(0, glowA(p.glow, 0.33));
    rg.addColorStop(1, glowA(p.glow, 0));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.62, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = p.sand;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.06, r * 0.44, 0, 0, 6.28); ctx.fill();
    const lg = ctx.createRadialGradient(x - r * 0.2, y - r * 0.1, r * 0.1, x, y, r);
    lg.addColorStop(0, p.land);
    lg.addColorStop(1, shade(p.land, -18));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.92, r * 0.38, 0, 0, 6.28); ctx.fill();
    // pavilion with glowing interior windows
    const pw = r * 0.86, ph = r * 0.5, px = x - pw / 2, py = y - r * 0.42;
    ctx.fillStyle = "rgba(6,10,24,.88)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, r * 0.12); else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.strokeStyle = p.glow; ctx.lineWidth = 2; ctx.stroke();
    const panes = Math.max(3, Math.floor(pw / (r * 0.16)));
    for (let i = 0; i < panes; i++) {
      const wx = px + pw * (0.08 + 0.84 * (i / Math.max(1, panes - 1)));
      const flick = 0.55 + 0.45 * Math.sin(p.tick / 12 + i * 1.7 + x * 0.01);
      ctx.fillStyle = i % 2 ? `rgba(255,214,120,${flick})` : glowA(p.glow, 0.35 + 0.4 * flick);
      ctx.beginPath(); ctx.arc(wx, py + ph * 0.55, r * 0.055, 0, 6.28); ctx.fill();
    }
    ctx.fillStyle = glowA(p.glow, 0.9);
    ctx.beginPath(); ctx.ellipse(x, py - 2, pw * 0.52, r * 0.07, 0, 0, 6.28); ctx.fill();
    // palms, swaying with the tick
    const palmN = p.kind === "hub" ? 4 : 2;
    for (let i = 0; i < palmN; i++) {
      const pxx = x - r * 0.55 + i * r * 0.38, pyy = y - r * 0.1;
      const sway = Math.sin(p.tick / 28 + i * 2 + x * 0.01) * r * 0.05;
      ctx.strokeStyle = "#5b3a1e"; ctx.lineWidth = Math.max(2, r * 0.035);
      ctx.beginPath(); ctx.moveTo(pxx, pyy);
      ctx.quadraticCurveTo(pxx + sway, pyy - r * 0.3, pxx + sway * 1.4, pyy - r * 0.48);
      ctx.stroke();
      ctx.strokeStyle = "rgba(64,190,120,.95)"; ctx.lineWidth = Math.max(2, r * 0.045);
      const tx = pxx + sway * 1.4, ty = pyy - r * 0.48;
      for (const a of [-2.4, -1.9, -1.2, -0.7]) {
        ctx.beginPath(); ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.2 - r * 0.08,
          tx + Math.cos(a) * r * 0.44, ty + Math.sin(a) * r * 0.3 + r * 0.06
        );
        ctx.stroke();
      }
    }
  }
  function drawGlobe(p) {
    ctx.save();
    ctx.fillStyle = "rgba(120,220,255,.10)";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.25, 0, 6.28); ctx.fill();
    const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, "rgba(150,230,255,.55)");
    g.addColorStop(0.6, "rgba(60,140,220,.35)");
    g.addColorStop(1, "rgba(20,60,140,.25)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "rgba(159,232,255,.8)";
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const ph = p.angle + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.abs(Math.cos(ph)) * p.r, p.r, 0, 0, 6.28);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.32, 0, 0, 6.28); ctx.stroke();
    ctx.restore();
  }
  function drawVessel(p) {
    ctx.save();
    ctx.fillStyle = "rgba(20,30,52,.9)";
    ctx.beginPath();
    ctx.moveTo(p.x - p.s, p.y); ctx.lineTo(p.x + p.s, p.y);
    ctx.lineTo(p.x + p.s * 0.6, p.y + p.s * 0.55);
    ctx.lineTo(p.x - p.s * 0.6, p.y + p.s * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,215,94,.9)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.s * 1.5); ctx.stroke();
    ctx.fillStyle = "rgba(255,215,94,.55)";
    ctx.beginPath(); ctx.arc(p.x, p.y - p.s * 1.7, 2.5, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawParticles(p) {
    ctx.save();
    for (let i = 0; i < p.n; i++) {
      const x = phash(i, p.tick, 31) * p.W;
      const y = phash(i, p.tick, 32) * p.H;
      const s = 0.6 + phash(i, p.tick, 33) * 2.2;
      const a = 0.15 + phash(i, p.tick, 34) * 0.5;
      const hue = phash(i, p.tick, 35) < 0.5 ? "120,200,255" : "190,140,255";
      ctx.fillStyle = `rgba(${hue},${a})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  const CANVAS_EXEC = {
    sky: drawSky, stars: drawStars, sunmoon: drawSunMoon, water: drawWater,
    bridge: drawBridge, island: drawIsland, globe: drawGlobe,
    vessel: drawVessel, particles: drawParticles,
  };

  /* ---------------- DOM executors ---------------- */
  const EXPR = { celebrating: "expr-celebrating", working: "expr-working", alert: "expr-alert", idle: "expr-idle" };

  function syncSigns(items) {
    let layer = stage.querySelector("#island-signs");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "island-signs";
      stage.appendChild(layer);
    }
    const seenIds = new Set();
    for (const it of items) {
      seenIds.add(it.id);
      let d = signNodes.get(it.id);
      if (!d) {
        d = document.createElement("div");
        d.className = "island-sign" + (it.kind === "hub" ? " hub-sign" : "");
        d.dataset.island = it.id;
        d.setAttribute("role", "button");
        d.setAttribute("tabindex", "0");
        d.setAttribute("aria-label", (hasI18n() ? CWI18n.t("world.inspect_island") : "Inspect {name} island").replace("{name}", it.name));
        d.addEventListener("click", () => onIslandClick(it.id));
        d.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onIslandClick(it.id); }
        });
        layer.appendChild(d);
        signNodes.set(it.id, d);
      }
      d.style.setProperty("--glow", it.glow);
      d.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%,-100%)`;
      const html = `<div class="island-name">${esc(it.name)}</div><div class="island-verbs">${esc(it.verbs.join(" · "))}</div>`;
      if (d._html !== html) { d.innerHTML = html; d._html = html; }
    }
    for (const [id, d] of signNodes) {
      if (!seenIds.has(id)) { d.remove(); signNodes.delete(id); }
    }
  }

  function syncAgents(items) {
    const seenIds = new Set();
    for (const a of items) {
      seenIds.add(a.id);
      let node = agentNodes.get(a.id);
      if (!node) {
        node = document.createElement("div");
        node.className = "agent expr-idle";
        node.dataset.id = a.id;
        const v = document.createElement("video");
        v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = "auto";
        node.appendChild(v);
        const ring = document.createElement("div"); ring.className = "ring"; node.appendChild(ring);
        if (a.crown) {
          const crown = document.createElement("div");
          crown.className = "crown";
          crown.setAttribute("aria-label", hasI18n() ? CWI18n.t("world.kingcode_crown") : "KingCode crown");
          node.appendChild(crown);
        }
        const plate = document.createElement("div"); plate.className = "nameplate"; node.appendChild(plate);
        node.addEventListener("click", (ev) => { ev.stopPropagation(); onAgentClick(a.id); });
        stage.appendChild(node);
        agentNodes.set(a.id, node);
      }
      node.style.left = a.x.toFixed(1) + "px";
      node.style.top = a.y.toFixed(1) + "px";
      node._world = { x: a.x, y: a.y };
      node._id = a.id;
      const v = node.querySelector("video");
      if (v && v.dataset.src !== a.avatar) {
        v.dataset.src = a.avatar;
        v.src = a.avatar;
        v.poster = a.poster;
        v.play().catch(() => {});
      }
      const plate = node.querySelector(".nameplate");
      const label = (a.crown ? "♛ " : "") + a.name;
      if (plate.textContent !== label) plate.textContent = label;
      const exprClass = EXPR[a.expr] || EXPR.idle;
      if (!node.classList.contains(exprClass)) {
        Object.values(EXPR).forEach((c) => node.classList.remove(c));
        node.classList.add(exprClass);
      }
      node.classList.toggle("traveling", !!a.activity && false);
      node.title = a.current_action || a.name;
    }
    for (const [id, node] of agentNodes) {
      if (!seenIds.has(id)) { node.remove(); agentNodes.delete(id); }
    }
  }

  function setWatermark(text, behindSec) {
    const w = els.watermark;
    const full = behindSec > 1 ? `${text} · ${(hasI18n() ? CWI18n.t("world.behind_n") : "{n}s behind").replace("{n}", behindSec)}` : text;
    if (w._text !== full) {
      w._text = full;
      w.querySelector("span").textContent = full;
    }
    w.classList.toggle("behind", behindSec > 1);
  }

  function setMetrics(rows) {
    const box = els.metrics;
    const html = rows.map((r) =>
      `<div class="metric" data-query="${esc(r.query)}" title="${esc(r.query)}">` +
      `<span class="m-value">${esc(String(r.value))}</span><span class="m-label">${esc(r.label)}</span></div>`
    ).join("");
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
  }

  function setFeed(entries) {
    const list = els.feedList;
    const html = entries.length
      ? entries.map((e) =>
        `<div class="feed-entry"><span class="f-seq">#${e.seq}</span> ` +
        `<span class="actor">${esc(e.actor)}</span> <span class="action">${esc(e.summary)}</span>` +
        `<div class="ts">${esc(e.ts)}</div></div>`
      ).join("")
      : `<div class="incoming">${hasI18n() ? CWI18n.t("world.ledger_quiet") : "Ledger quiet — no activity yet."}</div>`;
    if (list._html !== html) { list.innerHTML = html; list._html = html; }
  }

  function setClock(text) {
    if (els.clock._text !== text) { els.clock._text = text; els.clock.textContent = text; }
  }

  function setInterior(data, ctx2) {
    const o = els.interior;
    if (!data) {
      if (!o.classList.contains("hidden")) o.classList.add("hidden");
      o._key = null;
      return;
    }
    const key = `${data.island.id}@${data.residents.map((r) => r.id).join(",")}`;
    if (o._key === key && !o.classList.contains("hidden")) return;
    o._key = key;
    const isl = data.island;
    const stations = isl.interior_theme.split(/[—–]/).map((s) => s.trim()).filter(Boolean);
    o.innerHTML =
      `<div class="interior-walls" style="--glow:${esc(isl.glow)}"></div>` +
      `<div class="interior-card">` +
      `<button class="interior-close" aria-label="${esc(hasI18n() ? CWI18n.t("world.close_interior") : "Close interior view")}">✕</button>` +
      `<img class="interior-logo" src="${esc(logo)}" alt="Cumulative Web Inc">` +
      `<div class="interior-kicker">${esc(isl.kind.toUpperCase())} ISLAND</div>` +
      `<h2 style="--glow:${esc(isl.glow)}">${esc(isl.name)}</h2>` +
      `<div class="interior-verbs" style="--glow:${esc(isl.glow)}">${esc(isl.verbs.join(" · "))}</div>` +
      (data.residents.length
        ? `<div class="interior-residents">` + data.residents.map((r) =>
          `<button class="resident" data-agent="${esc(r.id)}">` +
          `<video src="${esc(r.avatar)}" poster="${esc(r.poster)}" muted loop playsinline></video>` +
          `<span><b>${esc(r.name)}</b><i>${esc(r.current_action || r.expr)}</i></span></button>`
        ).join("") + `</div>`
        : `<div class="interior-residents none">${esc(hasI18n() ? CWI18n.t("world.no_residents") : "No agents on this island right now.")}</div>`) +
      `<p class="interior-theme">${esc(isl.interior_theme)}</p>` +
      (stations.length > 1
        ? `<div class="interior-stations">` + stations.map((s) =>
          `<div class="station"><span class="station-dot" style="--glow:${esc(isl.glow)}"></span>${esc(s)}</div>`
        ).join("") + `</div>` : "") +
      (isl.bridges.length
        ? `<div class="interior-bridges"><span class="k">${esc(hasI18n() ? CWI18n.t("world.connected") : "Connected")}</span>` + isl.bridges.map((b) =>
          `<button class="bridge-link" data-go="${esc(b.id)}">${esc(b.name)}</button>`
        ).join("") + `</div>` : "") +
      `</div>`;
    o.classList.remove("hidden");
    o.querySelector(".interior-close").addEventListener("click", () => ctx2.closeInterior());
    o.querySelectorAll(".bridge-link").forEach((b) =>
      b.addEventListener("click", () => ctx2.gotoIsland(b.dataset.go)));
    o.querySelectorAll(".resident").forEach((b) =>
      b.addEventListener("click", () => onAgentClick(b.dataset.agent)));
  }

  function setAgentCard(data) {
    const c = els.statusCard;
    if (!data) {
      c.classList.remove("open");
      c._key = null;
      return;
    }
    const key = `${data.entity.id}@${data.events.length}:${data.events.length ? data.events[0].seq : 0}`;
    if (c._key === key && c.classList.contains("open")) return;
    c._key = key;
    const e = data.entity;
    const inv = e.inventory || {};
    const worn = [...(inv.worn || []), ...(inv.items || []).filter((i) => !(inv.worn || []).includes(i))];
    c.innerHTML = `<span class="close">✕</span>` +
      `<h2>${e.id === "kingcode" ? "♛ " : ""}${esc(e.name)}</h2>` +
      `<div class="dept">${esc(e.department || "CWI")} · <span class="expr-tag">${esc(e.expression)}</span> · ${esc(e.lifecycle)}</div>` +
      `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_island") : "Island")}</span>${esc(e.island || "—")}${e.edge ? ` → ${esc(e.heading)} (${Math.round(e.progress * 100)}%)` : ""}</div>` +
      `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_task") : "Current task")}</span>${esc(e.current_action || "—")}</div>` +
      (worn.length ? `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_inventory") : "Inventory")}</span>${esc(worn.join(", "))}</div>` : "") +
      ((inv.music || []).length ? `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_decks") : "On the decks")}</span>${esc(inv.music.join(", "))}</div>` : "") +
      `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_persona") : "Persona")}</span>${esc(e.persona_line || "—")}</div>` +
      (data.events.length
        ? `<div class="row"><span class="k">${esc(hasI18n() ? CWI18n.t("world.card_events") : "Recent events")}</span>` + data.events.map((ev) =>
          `<div class="win">#${ev.seq} ${esc(ev.type)}<div class="ts">${esc(ev.ts)}</div></div>`
        ).join("") + `</div>` : "");
    c.classList.add("open");
    c.querySelector(".close").onclick = () => { c.classList.remove("open"); c._key = null; };
  }

  function apply(cmds, W, H, interiorCtx) {
    sizeCanvas(W, H);
    ctx.clearRect(0, 0, W, H);
    for (const cmd of cmds.canvas) {
      const fn = CANVAS_EXEC[cmd.c];
      if (fn) fn(cmd);
    }
    for (const cmd of cmds.dom) {
      switch (cmd.d) {
        case "signs": syncSigns(cmd.items); break;
        case "agents": syncAgents(cmd.items); break;
        case "watermark": setWatermark(cmd.text, cmd.behind); break;
        case "metrics": setMetrics(cmd.rows); break;
        case "feed": setFeed(cmd.entries); break;
        case "clock": setClock(cmd.text); break;
        case "interior": setInterior(cmd.data, interiorCtx); break;
        case "agentCard": setAgentCard(cmd.data); break;
      }
    }
  }

  return {
    apply,
    agentWorldPos(id) {
      const n = agentNodes.get(id);
      return n && n._world ? { ...n._world } : null;
    },
  };
}

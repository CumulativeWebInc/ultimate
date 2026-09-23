/* ============================================================
   ULTIMATE MARKET — market district of Project Ultimate
   ------------------------------------------------------------
   RENDER CONTRACT (the whole point of this file):
   - Shelves are rendered ONLY from the SKU registry. There is
     no per-SKU hardcoding anywhere in this file: no sku_id
     literals, no sku name literals. render loops only.
   - Data source: live JSONL registry, with a vendored JSON
     fallback. If the registry gains SKU #26, the shelves gain
     SKU #26. Adding a SKU is a data change, not a rebuild.
   - Registry row contract (see README.md for the full text):
       required: sku_id (string), name (string),
                 department (string), description (string)
       optional: endpoints (string[]), schema_url (string),
                 version (string), equipped_by (string[])
     Rows missing a required field are skipped, counted, and
     reported in the footer — never silently rendered broken.
   - Equip is a user/agent action: this file only OPENS the
     prefilled registration form. It never files anything.
   ============================================================ */
(function () {
'use strict';

/* ---------------- configuration ---------------- */

var REGISTRY_URL = 'https://cumulativewebinc.github.io/cwi-learn/datasets/agent-deck-skus.jsonl';
var VENDOR_URL = 'vendor/skus.json';
var VENDOR_GENERATED = '2026-09-15'; /* date the vendored snapshot was taken; refreshed by regen */
var ADOPTERS_URL = 'https://cumulativewebinc.github.io/cwi-learn/equipped/adopters.json';
var EQUIP_ISSUE_BASE = 'https://github.com/CumulativeWebInc/cwi-learn/issues/new';
var EQUIP_TEMPLATE = 'equip_registration.md';
var RAW_TEMPLATE_URL = 'https://raw.githubusercontent.com/CumulativeWebInc/cwi-learn/main/.github/ISSUE_TEMPLATE/equip_registration.md';
var LICENSE_URL = 'https://cumulativewebinc.github.io/cwi-learn/license/';
var LOGO_URL = 'vendor/cwi-logo.jpg';
var AVATAR_URL = function (slug) { return 'vendor/avatars/' + slug + '-avatar.png'; };
var RUNBOOK_URL = 'https://github.com/CumulativeWebInc/ultimate/blob/world/market/market/RUNBOOK-equip.md';
var FETCH_TIMEOUT_MS = 9000;

/* Boutique config: district design, not SKU data. Keyed by the
   NORMALIZED department id (see normalizeDept). */
var DEPARTMENTS = {
  chief:     { boutique: 'AGENT DECK', full: 'Chief of Staff',      tagline: 'The flagship shelf — originals from the chief\u2019s bench.', c1: '#f6b73c', c2: '#e4582b', inkd: '#3a2200', avatar: null,                      sigil: 'deck' },
  ar:        { boutique: 'Needle',     full: 'A&R',                 tagline: 'Find the next frequency before it finds you.',              c1: '#a855f7', c2: '#ec4899', inkd: '#2b0a3d', avatar: AVATAR_URL('needle'),     sigil: 'needle' },
  marketing: { boutique: 'Marquee',    full: 'Marketing & Social',  tagline: 'Make it unmissable.',                                       c1: '#ff6b6b', c2: '#ff9f43', inkd: '#3d1400', avatar: AVATAR_URL('marquee'),    sigil: 'marquee' },
  sync:      { boutique: 'Seal',       full: 'Sync & Licensing',    tagline: 'Cleared, sealed, delivered.',                               c1: '#14b8a6', c2: '#0e7490', inkd: '#04292b', avatar: AVATAR_URL('seal'),       sigil: 'seal' },
  radio:     { boutique: 'Dial',       full: 'Radio & Playlists',   tagline: 'Tune the wave.',                                            c1: '#3b82f6', c2: '#06b6d4', inkd: '#0a1e3d', avatar: AVATAR_URL('dial'),       sigil: 'dial' },
  press:     { boutique: 'Dateline',   full: 'Press & PR',          tagline: 'Above the fold, every time.',                               c1: '#efe6cf', c2: '#cdbf9d', inkd: '#2b2416', avatar: AVATAR_URL('dateline'),   sigil: 'dateline' },
  studio:    { boutique: 'Fader',      full: 'Content Studio',      tagline: 'Shape the signal.',                                         c1: '#fb923c', c2: '#dc2626', inkd: '#3d1000', avatar: AVATAR_URL('fader'),      sigil: 'fader' },
  data:      { boutique: 'Ledger',     full: 'Data & Analytics',    tagline: 'Every number, verified.',                                   c1: '#22c55e', c2: '#0d9488', inkd: '#062d1f', avatar: AVATAR_URL('ledger'),     sigil: 'ledger' },
  affairs:   { boutique: 'Charter',    full: 'Business Affairs',    tagline: 'Terms you can trust.',                                      c1: '#6366f1', c2: '#8b5cf6', inkd: '#1a1440', avatar: AVATAR_URL('charter'),    sigil: 'charter' }
};
var DEPT_ORDER = ['chief', 'ar', 'marketing', 'sync', 'radio', 'press', 'studio', 'data', 'affairs'];
var POPUP_DEPT = { boutique: 'Pop-Up', full: 'Agent Deck Pop-Up', tagline: 'New arrivals waiting for a permanent storefront.', c1: '#94a3b8', c2: '#64748b', inkd: '#1e293b', avatar: null, sigil: 'popup' };

/* ---------------- pure helpers (unit-testable) ---------------- */

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixHex(hex, target, t) {
  var a = hexToRgb(hex), b = hexToRgb(target);
  var c = a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); });
  return 'rgb(' + c.join(',') + ')';
}

/* Normalize the registry's department field to a boutique id.
   Known quirk: the registry uses both "ar" and "a&r". */
function normalizeDept(d) {
  var s = String(d == null ? '' : d).toLowerCase().replace(/[\s_&-]/g, '');
  if (s === 'ar' || s === 'aandr') return 'ar';
  if (s === 'chief' || s === 'chiefofstaff') return 'chief';
  if (Object.prototype.hasOwnProperty.call(DEPARTMENTS, s)) return s;
  return 'popup';
}

function deptMeta(id) {
  if (id === 'popup') return POPUP_DEPT;
  return DEPARTMENTS[id] || POPUP_DEPT;
}

function deptOfSku(sku) { return normalizeDept(sku.department); }

/* Parse the live JSONL registry into an array of rows. */
function parseJsonl(text) {
  var rows = [];
  String(text).split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    try { rows.push(JSON.parse(line)); } catch (e) { /* counted by caller via validate */ }
  });
  return rows;
}

/* Accept either a bare array or { skus: [...] } (vendored shape). */
function coerceRegistry(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.skus)) return data.skus;
  return [];
}

/* Validate one registry row against the contract. */
function validateSku(row) {
  var errors = [];
  if (!row || typeof row !== 'object') return { ok: false, errors: ['not an object'] };
  if (typeof row.sku_id !== 'string' || !row.sku_id.trim()) errors.push('missing sku_id');
  if (typeof row.name !== 'string' || !row.name.trim()) errors.push('missing name');
  if (typeof row.department !== 'string' || !row.department.trim()) errors.push('missing department');
  if (typeof row.description !== 'string' || !row.description.trim()) errors.push('missing description');
  if (row.endpoints != null && !Array.isArray(row.endpoints)) errors.push('endpoints must be an array');
  if (row.equipped_by != null && !Array.isArray(row.equipped_by)) errors.push('equipped_by must be an array');
  return { ok: errors.length === 0, errors: errors };
}

function buildEquipUrl(skuId) {
  return EQUIP_ISSUE_BASE + '?template=' + encodeURIComponent(EQUIP_TEMPLATE) +
    '&title=' + encodeURIComponent('Equip: ' + skuId);
}

function parseDeepLink(search) {
  var out = { dept: null, sku: null };
  if (!search) return out;
  var q = search.charAt(0) === '?' ? search.slice(1) : search;
  q.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    var k = decodeURIComponent(kv[0] || '');
    var v = decodeURIComponent(kv[1] || '');
    if (k === 'dept' && v) out.dept = normalizeDept(v);
    if (k === 'sku' && v) out.sku = v;
  });
  if (out.dept && out.dept !== 'popup' && DEPT_ORDER.indexOf(out.dept) === -1) out.dept = 'popup';
  return out;
}

function deepLinkFor(dept, sku) {
  var s = '?dept=' + encodeURIComponent(dept || '');
  if (sku) s += '&sku=' + encodeURIComponent(sku);
  return s;
}

/* Flexible adopters-ledger parsing: {sku_id:[agents]} or [{sku_id,agents}] or null. */
function coerceAdopters(data) {
  var map = {};
  if (!data) return null;
  if (Array.isArray(data)) {
    data.forEach(function (entry) {
      if (entry && entry.sku_id) map[entry.sku_id] = entry.agents || entry.equipped_by || [];
    });
    return map;
  }
  if (typeof data === 'object') {
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      map[k] = Array.isArray(v) ? v : (v && v.agents) || [];
    });
    return map;
  }
  return null;
}

function equipInfo(sku, adoptersMap) {
  if (adoptersMap && Object.prototype.hasOwnProperty.call(adoptersMap, sku.sku_id)) {
    var agents = adoptersMap[sku.sku_id] || [];
    return { count: agents.length, agents: agents, source: 'live adopters ledger' };
  }
  var reg = Array.isArray(sku.equipped_by) ? sku.equipped_by : [];
  return { count: reg.length, agents: reg, source: 'SKU registry' };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------- SVG: boutique sigils ---------------- */

function sigilSVG(kind, c1) {
  var w = '<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">';
  var acc = c1 || '#ffffff';
  var glyphs = {
    deck: '<rect x="16" y="32" width="44" height="52" rx="10" transform="rotate(-12 38 58)" fill="#fff" opacity="0.5"/>' +
      '<rect x="28" y="24" width="44" height="52" rx="10" transform="rotate(5 50 50)" fill="#fff" opacity="0.8"/>' +
      '<rect x="40" y="14" width="44" height="52" rx="10" transform="rotate(13 62 40)" fill="#fff"/>' +
      '<path d="M62 28l4.4 9 9.9 1.4-7.2 7 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" fill="' + acc + '"/>',
    needle: '<circle cx="42" cy="54" r="30" fill="#fff"/>' +
      '<circle cx="42" cy="54" r="22" fill="none" stroke="' + acc + '" stroke-width="3" opacity="0.45"/>' +
      '<circle cx="42" cy="54" r="13" fill="none" stroke="' + acc + '" stroke-width="3" opacity="0.3"/>' +
      '<circle cx="42" cy="54" r="5.5" fill="' + acc + '"/>' +
      '<rect x="64" y="12" width="9" height="42" rx="4.5" transform="rotate(24 68 33)" fill="#fff"/>' +
      '<circle cx="79" cy="15" r="7.5" fill="#fff"/>',
    marquee: '<rect x="14" y="28" width="68" height="42" rx="12" fill="#fff"/>' +
      '<circle cx="24" cy="20" r="5" fill="#fff"/><circle cx="40" cy="20" r="5" fill="#fff"/><circle cx="56" cy="20" r="5" fill="#fff"/><circle cx="72" cy="20" r="5" fill="#fff"/>' +
      '<circle cx="24" cy="78" r="5" fill="#fff"/><circle cx="40" cy="78" r="5" fill="#fff"/><circle cx="56" cy="78" r="5" fill="#fff"/><circle cx="72" cy="78" r="5" fill="#fff"/>' +
      '<path d="M48 36l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3-9.3-4.9-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z" fill="' + acc + '"/>',
    seal: '<path d="M34 60l-12 22 14-6 4 12 10-14 12 8-4-16 10-8-14-2z" fill="#fff" opacity="0.65"/>' +
      '<circle cx="50" cy="40" r="25" fill="#fff"/>' +
      '<circle cx="50" cy="40" r="17" fill="none" stroke="' + acc + '" stroke-width="3.5"/>' +
      '<path d="M41 40l6.5 6.5L60 34" fill="none" stroke="' + acc + '" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>',
    dial: '<rect x="14" y="30" width="68" height="40" rx="15" fill="#fff"/>' +
      '<rect x="24" y="41" width="32" height="9" rx="4.5" fill="' + acc + '" opacity="0.3"/>' +
      '<path d="M40 37v18" stroke="' + acc + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<circle cx="68" cy="50" r="10" fill="' + acc + '"/>' +
      '<circle cx="68" cy="50" r="4" fill="#fff"/>',
    dateline: '<rect x="20" y="20" width="56" height="56" rx="9" fill="#fff"/>' +
      '<path d="M20 29h30L20 59z" fill="' + acc + '" opacity="0.22"/>' +
      '<rect x="29" y="37" width="38" height="7" rx="3.5" fill="' + acc + '"/>' +
      '<rect x="29" y="49" width="38" height="5.5" rx="2.75" fill="' + acc + '" opacity="0.45"/>' +
      '<rect x="29" y="59" width="24" height="5.5" rx="2.75" fill="' + acc + '" opacity="0.45"/>',
    fader: '<rect x="14" y="18" width="68" height="60" rx="13" fill="#fff"/>' +
      '<rect x="28" y="30" width="7" height="36" rx="3.5" fill="' + acc + '" opacity="0.3"/>' +
      '<rect x="44.5" y="30" width="7" height="36" rx="3.5" fill="' + acc + '" opacity="0.3"/>' +
      '<rect x="61" y="30" width="7" height="36" rx="3.5" fill="' + acc + '" opacity="0.3"/>' +
      '<rect x="22" y="36" width="19" height="11" rx="5.5" fill="' + acc + '"/>' +
      '<rect x="38.5" y="50" width="19" height="11" rx="5.5" fill="' + acc + '"/>' +
      '<rect x="55" y="42" width="19" height="11" rx="5.5" fill="' + acc + '"/>',
    ledger: '<path d="M48 22c-10-6-22-6-28-2v50c6-4 18-4 28 2 10-6 22-6 28-2V20c-6-4-18-4-28 2z" fill="#fff"/>' +
      '<path d="M48 22v50" stroke="' + acc + '" stroke-width="3.5"/>' +
      '<rect x="27" y="50" width="7" height="12" rx="3" fill="' + acc + '"/>' +
      '<rect x="37" y="42" width="7" height="20" rx="3" fill="' + acc + '" opacity="0.7"/>' +
      '<path d="M56 58l8-11 6 5 8-9" fill="none" stroke="' + acc + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M72 41h6v6" fill="none" stroke="' + acc + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    charter: '<rect x="24" y="30" width="48" height="36" rx="9" fill="#fff"/>' +
      '<rect x="16" y="24" width="11" height="48" rx="5.5" fill="#fff" opacity="0.75"/>' +
      '<rect x="69" y="24" width="11" height="48" rx="5.5" fill="#fff" opacity="0.75"/>' +
      '<path d="M36 44l7 7 13-13" fill="none" stroke="' + acc + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    popup: '<path d="M30 36h36l-4.5 42a9 9 0 0 1-9 8H43.5a9 9 0 0 1-9-8z" fill="#fff"/>' +
      '<path d="M38 36a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M48 52l3.2 6.6 7.3 1-5.3 5.2 1.3 7.3-6.5-3.4-6.5 3.4 1.3-7.3-5.3-5.2 7.3-1z" fill="' + acc + '"/>'
  };
  return w + (glyphs[kind] || glyphs.popup) + '</svg>';
}

/* ---------------- SVG: data-driven product art ----------------
   Deterministic generative art: the same sku_id always renders
   the same artwork. Seeded RNG picks one of three compositions
   in the department palette. This is real art direction, not a
   placeholder: layered translucent shapes on a pastel ground. */

function skuArt(sku, meta, wide) {
  var W = wide ? 640 : 480, H = wide ? 300 : 300;
  var rng = mulberry32(hashStr(sku.sku_id + '::art'));
  var bg1 = mixHex(meta.c1, '#ffffff', 0.78);
  var bg2 = mixHex(meta.c2, '#ffffff', 0.82);
  var id = 'g' + hashStr(sku.sku_id).toString(36);
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Artwork for ' + esc(sku.name) + '">';
  s += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  var comp = Math.floor(rng() * 3);
  var cx = W * (0.3 + rng() * 0.4), cy = H * (0.35 + rng() * 0.3);
  var R = 60 + rng() * 70;
  if (comp === 0) {
    /* orbit: big disc, ring, satellite dots */
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + meta.c1 + '" opacity="0.85"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 26) + '" fill="none" stroke="' + meta.c2 + '" stroke-width="14" opacity="0.5"/>';
    for (var i = 0; i < 7; i++) {
      var a = rng() * Math.PI * 2, rr = R + 26, dx = cx + Math.cos(a) * rr, dy = cy + Math.sin(a) * rr;
      s += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="' + (5 + rng() * 7).toFixed(1) + '" fill="#ffffff" opacity="0.9"/>';
    }
    s += '<circle cx="' + (cx - R * 0.3) + '" cy="' + (cy - R * 0.3) + '" r="' + (R * 0.32) + '" fill="#ffffff" opacity="0.35"/>';
  } else if (comp === 1) {
    /* waves: stacked translucent bands */
    for (var b = 0; b < 5; b++) {
      var y = 40 + b * 52 + rng() * 14;
      var amp = 18 + rng() * 26;
      s += '<path d="M-20 ' + y + ' Q ' + (W * 0.25) + ' ' + (y - amp) + ' ' + (W * 0.5) + ' ' + y +
        ' T ' + W + ' ' + y + ' T ' + (W + 20) + ' ' + y + ' L ' + (W + 20) + ' ' + H + ' L -20 ' + H + ' Z" ' +
        'fill="' + (b % 2 ? meta.c1 : meta.c2) + '" opacity="' + (0.28 + rng() * 0.3).toFixed(2) + '"/>';
    }
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.55) + '" fill="#ffffff" opacity="0.85"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.32) + '" fill="' + meta.c1 + '"/>';
  } else {
    /* shelves: diagonal bars + medallion */
    for (var k = 0; k < 4; k++) {
      var bx = k * 90 - 40 + rng() * 30;
      s += '<rect x="' + bx + '" y="-40" width="' + (34 + rng() * 30) + '" height="' + (H + 80) + '" rx="18" ' +
        'transform="rotate(18 ' + (bx + 30) + ' ' + (H / 2) + ')" fill="' + (k % 2 ? meta.c2 : meta.c1) + '" opacity="' + (0.3 + rng() * 0.35).toFixed(2) + '"/>';
    }
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#ffffff" opacity="0.92"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.62) + '" fill="' + meta.c1 + '"/>';
    s += '<circle cx="' + (cx - R * 0.2) + '" cy="' + (cy - R * 0.25) + '" r="' + (R * 0.18) + '" fill="#ffffff" opacity="0.5"/>';
  }
  /* sparkle accents */
  for (var sp = 0; sp < 6; sp++) {
    var sx = rng() * W, sy = rng() * H, sr = 3 + rng() * 5;
    s += '<path d="M' + sx.toFixed(1) + ' ' + (sy - sr).toFixed(1) + ' Q ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + (sx + sr).toFixed(1) + ' ' + sy.toFixed(1) +
      ' Q ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + sx.toFixed(1) + ' ' + (sy + sr).toFixed(1) +
      ' Q ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + (sx - sr).toFixed(1) + ' ' + sy.toFixed(1) +
      ' Q ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + sx.toFixed(1) + ' ' + (sy - sr).toFixed(1) + ' Z" fill="#ffffff" opacity="0.75"/>';
  }
  s += '</svg>';
  return s;
}

/* ---------------- runtime state ---------------- */

var SKUS = [];
var ADOPTERS = null;          /* null = ledger unavailable, fall back to registry */
var REG_SOURCE = 'pending';   /* live | vendored | failed */
var INVALID_ROWS = 0;
var TEMPLATE_STATUS = 'unknown'; /* live | pending | unknown */
var ACTIVE_DEPT = 'all';
var SEARCH_Q = '';
var LAST_FOCUS = null;

/* ---------------- data loading ---------------- */

function fetchWithTimeout(url, opts) {
  var ctrl = null, timer = null;
  try {
    ctrl = new AbortController();
    timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  } catch (e) { /* older engines: no abort, still try */ }
  var p = fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}));
  if (timer) p.then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  return p;
}

function loadRegistry() {
  return fetchWithTimeout(REGISTRY_URL).then(function (resp) {
    if (!resp.ok) throw new Error('registry HTTP ' + resp.status);
    return resp.text();
  }).then(function (text) {
    var rows = parseJsonl(text);
    return { rows: rows, source: 'live' };
  }).catch(function (err) {
    /* Live registry unreachable: vendored fallback + visible notice. */
    return fetchWithTimeout(VENDOR_URL).then(function (resp) {
      if (!resp.ok) throw new Error('vendor HTTP ' + resp.status);
      return resp.json();
    }).then(function (data) {
      return { rows: coerceRegistry(data), source: 'vendored', error: err };
    }).catch(function (err2) {
      return { rows: [], source: 'failed', error: err2 };
    });
  });
}

function loadAdopters() {
  return fetchWithTimeout(ADOPTERS_URL).then(function (resp) {
    if (!resp.ok) throw new Error('adopters HTTP ' + resp.status);
    return resp.json();
  }).then(function (data) {
    return coerceAdopters(data);
  }).catch(function () { return null; }); /* 404 today: ledger not yet published */
}

function checkTemplate() {
  return fetchWithTimeout(RAW_TEMPLATE_URL, { method: 'HEAD' }).then(function (resp) {
    return resp.ok ? 'live' : 'pending';
  }).catch(function () { return 'unknown'; });
}

/* ---------------- DOM helpers ---------------- */

function $(id) { return document.getElementById(id); }

function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function deptStyle(meta) {
  return '--c1:' + meta.c1 + ';--c2:' + meta.c2 + ';--inkd:' + meta.inkd;
}

/* ---------------- status / notices ---------------- */

function setStatus(mode, text) {
  var dot = $('statusDot'), label = $('statusText');
  dot.className = 'status-dot' + (mode === 'live' ? ' live' : mode === 'vendored' ? ' fallback' : mode === 'failed' ? ' dead' : '');
  label.textContent = text;
}

function showFallbackNotice() {
  var main = document.querySelector('main');
  if ($('fallbackNotice') || !main) return;
  var n = el('div', 'notice notice-warn');
  n.id = 'fallbackNotice';
  n.setAttribute('role', 'alert');
  n.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3 2.5 20h19z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 9.5V14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/></svg>' +
    '<div><strong>Live registry unreachable.</strong> Showing the vendored snapshot from ' + esc(VENDOR_GENERATED) + ' — shelves may be stale. ' +
    'Adding a SKU to the live registry will appear here automatically once the connection recovers.</div>' +
    '<button class="btn btn-small" id="retryRegistry" type="button">Retry live registry</button>';
  main.insertBefore(n, main.firstChild);
  $('retryRegistry').addEventListener('click', function () { boot(true); });
}

function showFatalError() {
  var grid = $('productGrid');
  grid.innerHTML = '';
  var p = el('div', 'fatal');
  p.setAttribute('role', 'alert');
  p.innerHTML =
    '<div class="fatal-art" aria-hidden="true">' +
    '<svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="#f3ecdd"/><path d="M48 28v22" stroke="#a89fc0" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="66" r="5" fill="#a89fc0"/></svg></div>' +
    '<p class="empty-title">The shelves could not be stocked.</p>' +
    '<p>Neither the live registry nor the vendored snapshot could be reached. Check your connection and try again.</p>' +
    '<button class="btn btn-primary" id="retryFatal" type="button">Try again</button>';
  grid.appendChild(p);
  $('retryFatal').addEventListener('click', function () { boot(true); });
}

function renderSkeletons() {
  var grid = $('productGrid');
  grid.innerHTML = '';
  for (var i = 0; i < 8; i++) {
    var s = el('div', 'skeleton-card');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<div class="sk sk-art"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div>';
    grid.appendChild(s);
  }
  var sf = $('storefronts');
  sf.innerHTML = '';
  for (var j = 0; j < 3; j++) {
    var t = el('div', 'skeleton-card');
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '<div class="sk sk-art tall"></div><div class="sk sk-line"></div>';
    sf.appendChild(t);
  }
}

/* ---------------- storefront street ---------------- */

function skuCountByDept() {
  var counts = {};
  SKUS.forEach(function (sku) {
    var d = deptOfSku(sku);
    counts[d] = (counts[d] || 0) + 1;
  });
  return counts;
}

function renderStreet() {
  var wrap = $('storefronts');
  wrap.innerHTML = '';
  var counts = skuCountByDept();
  var order = DEPT_ORDER.slice();
  if (counts.popup) order.push('popup');
  order.forEach(function (id) {
    var meta = deptMeta(id);
    var n = counts[id] || 0;
    var card = el('article', 'storefront');
    card.setAttribute('style', deptStyle(meta));
    var avatar = meta.avatar
      ? '<img class="shopkeeper" src="' + esc(meta.avatar) + '" alt="' + esc(meta.boutique) + ' boutique shopkeeper portrait" loading="lazy">'
      : '';
    card.innerHTML =
      '<div class="awning" aria-hidden="true"></div>' +
      '<img class="logo-seal" src="' + esc(LOGO_URL) + '" alt="Cumulative Web Inc logo">' +
      '<div class="storefront-body">' +
        '<div class="sigil-badge">' + sigilSVG(meta.sigil, meta.c1) + '</div>' +
        avatar +
        '<h3 class="boutique-name">' + esc(meta.boutique) + '</h3>' +
        '<p class="dept-full">' + esc(meta.full) + '</p>' +
        '<p class="boutique-tag">' + esc(meta.tagline) + '</p>' +
        '<div class="storefront-foot">' +
          '<span class="count-pill">' + n + (n === 1 ? ' product' : ' products') + '</span>' +
          '<button class="browse-btn" type="button" data-dept="' + esc(id) + '">Browse shelf</button>' +
        '</div>' +
      '</div>';
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('.browse-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setDeptFilter(btn.getAttribute('data-dept'), true);
    });
  });
}

/* ---------------- filter chips ---------------- */

function renderChips() {
  var wrap = $('deptChips');
  wrap.innerHTML = '';
  var counts = skuCountByDept();
  function addChip(id, label, color) {
    var b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', id === ACTIVE_DEPT ? 'true' : 'false');
    b.innerHTML = (color ? '<span class="chip-dot" style="--c1:' + esc(color) + '"></span>' : '') + esc(label);
    b.addEventListener('click', function () { setDeptFilter(id, true); });
    wrap.appendChild(b);
  }
  addChip('all', 'All stalls (' + SKUS.length + ')', null);
  DEPT_ORDER.forEach(function (id) {
    var meta = deptMeta(id);
    addChip(id, meta.boutique + ' (' + (counts[id] || 0) + ')', meta.c1);
  });
  if (counts.popup) addChip('popup', 'Pop-Up (' + counts.popup + ')', POPUP_DEPT.c1);
}

function refreshChips() {
  $('deptChips').querySelectorAll('.chip').forEach(function (chip, i) {
    var ids = ['all'].concat(DEPT_ORDER);
    if (skuCountByDept().popup) ids.push('popup');
    chip.setAttribute('aria-pressed', ids[i] === ACTIVE_DEPT ? 'true' : 'false');
  });
}

/* ---------------- product grid ---------------- */

function filteredSkus() {
  var q = SEARCH_Q.trim().toLowerCase();
  return SKUS.filter(function (sku) {
    if (ACTIVE_DEPT !== 'all' && deptOfSku(sku) !== ACTIVE_DEPT) return false;
    if (!q) return true;
    var hay = (sku.sku_id + ' ' + sku.name + ' ' + sku.description).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function renderGrid() {
  var grid = $('productGrid');
  grid.innerHTML = '';
  var list = filteredSkus();
  var title = $('gridTitle'), sub = $('gridSub'), clear = $('clearFilter');
  if (ACTIVE_DEPT === 'all' && !SEARCH_Q.trim()) {
    title.textContent = 'Fresh on the shelves';
    sub.textContent = 'Every product below is rendered from the ' +
      (REG_SOURCE === 'live' ? 'live' : 'vendored') + ' SKU registry — ' + SKUS.length + ' products across nine boutiques.';
    clear.hidden = true;
  } else if (SEARCH_Q.trim()) {
    var meta = ACTIVE_DEPT === 'all' ? null : deptMeta(ACTIVE_DEPT);
    title.textContent = 'Search results';
    sub.textContent = list.length + (list.length === 1 ? ' result' : ' results') + ' for \u201C' + SEARCH_Q.trim() + '\u201D' +
      (meta ? ' in ' + meta.boutique : ' across all boutiques') + '.';
    clear.hidden = false;
  } else {
    var m = deptMeta(ACTIVE_DEPT);
    title.textContent = m.boutique + ' shelf';
    sub.textContent = m.full + ' · ' + list.length + (list.length === 1 ? ' product' : ' products') + ' · ' + m.tagline;
    clear.hidden = false;
  }

  $('emptyState').hidden = list.length > 0;
  list.forEach(function (sku, i) {
    grid.appendChild(productCard(sku, i));
  });
}

function productCard(sku, index) {
  var meta = deptMeta(deptOfSku(sku));
  var info = equipInfo(sku, ADOPTERS);
  var card = el('button', 'product');
  card.type = 'button';
  card.setAttribute('style', deptStyle(meta));
  card.setAttribute('aria-label', 'View ' + sku.name + ' — ' + meta.boutique + ' boutique, ' + info.count + ' equipped');
  if (index < 12) card.style.animationDelay = (index * 35) + 'ms';
  card.classList.add('card-in');
  card.innerHTML =
    '<span class="art">' + skuArt(sku, meta) +
      '<img class="logo-seal" src="' + esc(LOGO_URL) + '" alt="">' +
    '</span>' +
    '<span class="product-body">' +
      '<span class="product-dept">' + esc(meta.boutique) + '</span>' +
      '<span class="product-name">' + esc(sku.name) + '</span>' +
      '<span class="product-desc">' + esc(sku.description) + '</span>' +
      '<span class="product-foot">' +
        '<span class="equipped-mini"><span class="agent-dot" aria-hidden="true">' + info.count + '</span>' +
          (info.count === 1 ? '1 equipped' : info.count + ' equipped') + '</span>' +
        '<span class="view-link">View</span>' +
      '</span>' +
    '</span>';
  /* logo seal inside art is decorative: empty alt keeps it out of the a11y tree */
  card.addEventListener('click', function () { openDetail(sku.sku_id); });
  return card;
}

/* ---------------- detail modal ---------------- */

function findSku(skuId) {
  for (var i = 0; i < SKUS.length; i++) if (SKUS[i].sku_id === skuId) return SKUS[i];
  return null;
}

function openDetail(skuId) {
  var sku = findSku(skuId);
  if (!sku) return;
  var meta = deptMeta(deptOfSku(sku));
  var info = equipInfo(sku, ADOPTERS);
  LAST_FOCUS = document.activeElement;

  var sheet = $('sheet');
  sheet.setAttribute('style', deptStyle(meta));
  $('detailArt').innerHTML = skuArt(sku, meta, true);
  var deptChip = $('detailDept');
  deptChip.textContent = meta.boutique + ' · ' + meta.full;
  $('detailVersion').textContent = 'v' + (sku.version || '1.0.0');
  $('detailName').textContent = sku.name;
  $('detailDesc').textContent = sku.description;

  var eps = $('detailEndpoints');
  eps.innerHTML = '';
  (Array.isArray(sku.endpoints) ? sku.endpoints : []).forEach(function (u) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = u; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 5H5v14h14v-4M14 4h6v6M20 4l-9 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>';
    a.querySelector('span').textContent = u;
    li.appendChild(a);
    eps.appendChild(li);
  });
  if (!eps.children.length) {
    var li0 = document.createElement('li');
    li0.textContent = 'No endpoints published for this product yet.';
    li0.style.cssText = 'font-size:13px;font-weight:700;color:var(--muted)';
    eps.appendChild(li0);
  }

  var schema = $('detailSchema');
  if (sku.schema_url) {
    schema.href = sku.schema_url;
    schema.textContent = sku.schema_url;
    schema.style.display = '';
  } else {
    schema.removeAttribute('href');
    schema.textContent = 'No schema URL published for this product yet.';
    schema.style.display = '';
  }

  var pill = $('verifyPill');
  pill.className = 'verify-pill';
  pill.textContent = 'checking…';
  verifySchema(sku, pill);

  var eq = $('detailEquipped');
  eq.innerHTML = '';
  var big = el('span', null, '<strong>' + info.count + '</strong>&nbsp;' + (info.count === 1 ? 'agent has' : 'agents have') + ' equipped this');
  eq.appendChild(big);
  info.agents.slice(0, 12).forEach(function (agent) {
    var chip = el('span', 'agent-chip');
    var initial = String(agent).trim().charAt(0).toUpperCase() || '?';
    chip.innerHTML = '<span class="agent-dot" aria-hidden="true">' + esc(initial) + '</span><span></span>';
    chip.querySelector('span:last-child').textContent = agent;
    eq.appendChild(chip);
  });
  var src = el('span', 'equip-source', 'count via ' + esc(info.source));
  eq.appendChild(src);
  if (!info.count) {
    var none = el('span', 'equip-source', 'No public equips yet — yours could be the first.');
    eq.appendChild(none);
  }

  var equipBtn = $('equipButton');
  equipBtn.href = buildEquipUrl(sku.sku_id);
  $('equipLabel').textContent = 'Equip ' + sku.name;
  var note = $('equipNote');
  var tplNote = TEMPLATE_STATUS === 'live'
    ? 'The registration template is live — the form opens prefilled.'
    : TEMPLATE_STATUS === 'pending'
      ? 'The registration template is still landing, so the form opens blank — your filed issue still registers the equip.'
      : 'Registration-template status could not be confirmed — the form link still works.';
  note.innerHTML = 'Equipping opens a prefilled registration form on GitHub. <strong>You file it</strong> — the market never files on anyone\u2019s behalf, so every equip is a real agent action. ' +
    esc(tplNote) + ' <a href="' + esc(RUNBOOK_URL) + '" target="_blank" rel="noopener">Read the equip runbook</a>.';

  var modal = $('modal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('modalClose').focus();
  setDeepLink(ACTIVE_DEPT === 'all' ? null : ACTIVE_DEPT, sku.sku_id);
}

function closeDetail() {
  $('modal').hidden = true;
  document.body.style.overflow = '';
  setDeepLink(ACTIVE_DEPT === 'all' ? null : ACTIVE_DEPT, null);
  if (LAST_FOCUS && LAST_FOCUS.focus) LAST_FOCUS.focus();
}

function verifySchema(sku, pill) {
  if (!sku.schema_url) {
    pill.className = 'verify-pill unknown';
    pill.textContent = 'no schema published';
    return;
  }
  fetchWithTimeout(sku.schema_url).then(function (resp) {
    if (resp.ok) {
      pill.className = 'verify-pill ok';
      pill.textContent = 'schema live · HTTP 200';
    } else {
      pill.className = 'verify-pill bad';
      pill.textContent = 'schema unreachable · HTTP ' + resp.status;
    }
  }).catch(function () {
    pill.className = 'verify-pill unknown';
    pill.textContent = 'could not verify from here';
  });
}

/* ---------------- filters / search / deep links ---------------- */

function setDeepLink(dept, sku) {
  try {
    var url = deepLinkFor(dept, sku);
    var clean = (dept || sku) ? url : './';
    window.history.replaceState(null, '', clean === './' ? window.location.pathname : url);
  } catch (e) { /* non-browser or restricted context */ }
}

function setDeptFilter(id, scroll) {
  ACTIVE_DEPT = id;
  renderChips();
  renderGrid();
  setDeepLink(id === 'all' ? null : id, null);
  if (scroll && $('shelves')) $('shelves').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyDeepLink() {
  var dl = parseDeepLink(window.location.search);
  if (dl.dept) {
    ACTIVE_DEPT = dl.dept;
    renderChips();
    renderGrid();
  }
  if (dl.sku && findSku(dl.sku)) {
    openDetail(dl.sku);
  } else if (dl.dept) {
    setTimeout(function () { if ($('shelves')) $('shelves').scrollIntoView({ block: 'start' }); }, 350);
  }
}

/* ---------------- hero ---------------- */

function renderHero() {
  var flagship = SKUS.filter(function (s) { return deptOfSku(s) === 'chief'; })[0] || SKUS[0];
  var sub = $('heroSub');
  if (flagship) {
    $('heroArt').innerHTML = skuArt(flagship, deptMeta(deptOfSku(flagship)), true);
    sub.textContent = 'Nine boutiques · ' + SKUS.length + ' products · every one rendered from the live registry and verifiable on the spot. ' +
      'Flagship spotlight: ' + flagship.name + '.';
  } else {
    sub.textContent = 'Nine boutiques. One registry. Every product verifiable, every equip real.';
  }
}

/* ---------------- footer meta ---------------- */

function renderFooterMeta() {
  var parts = [];
  parts.push('Shelves render from the ' + (REG_SOURCE === 'live' ? 'live Agent Deck SKU registry' : 'vendored SKU snapshot (' + VENDOR_GENERATED + ')') + '.');
  if (INVALID_ROWS) parts.push(INVALID_ROWS + ' registry row' + (INVALID_ROWS === 1 ? '' : 's') + ' skipped (missing required fields).');
  if (ADOPTERS) parts.push('Live adopters ledger connected — per-product counts prefer the ledger and are labeled individually.');
  else parts.push('Live adopters ledger not yet published — equip counts from the SKU registry.');
  $('footerMeta').textContent = parts.join(' ');
}

/* ---------------- boot ---------------- */

function boot(retry) {
  if (retry) {
    var n = $('fallbackNotice');
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }
  setStatus('pending', 'Connecting to the SKU registry…');
  renderSkeletons();

  loadRegistry().then(function (res) {
    REG_SOURCE = res.source;
    SKUS = [];
    INVALID_ROWS = 0;
    res.rows.forEach(function (row) {
      var v = validateSku(row);
      if (v.ok) SKUS.push(row);
      else INVALID_ROWS++;
    });
    /* deterministic shelf order: boutique, then name */
    SKUS.sort(function (a, b) {
      var da = DEPT_ORDER.indexOf(deptOfSku(a)), db = DEPT_ORDER.indexOf(deptOfSku(b));
      if (da !== db) return da - db;
      return String(a.name).localeCompare(String(b.name));
    });

    if (REG_SOURCE === 'live') {
      setStatus('live', 'Live registry · ' + SKUS.length + ' SKUs');
    } else if (REG_SOURCE === 'vendored') {
      setStatus('vendored', 'Vendored snapshot · ' + SKUS.length + ' SKUs');
      showFallbackNotice();
    } else {
      setStatus('failed', 'Registry unreachable');
      showFatalError();
      renderFooterMeta();
      return null;
    }

    renderHero();
    renderStreet();
    renderChips();
    renderGrid();
    applyDeepLink();
    renderFooterMeta();
    return loadAdopters();
  }).then(function (adopters) {
    if (adopters === null || adopters === undefined) return;
    ADOPTERS = adopters;
    renderGrid(); /* re-render with live counts */
    renderFooterMeta();
  }).then(function () {
    return checkTemplate();
  }).then(function (st) {
    TEMPLATE_STATUS = st;
  }).catch(function () {
    /* boot never hard-fails: worst case the fatal panel is already shown */
  });
}

/* ---------------- wire up static controls ---------------- */

function wireStatic() {
  var input = $('searchInput');
  var t = null;
  input.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      SEARCH_Q = input.value;
      renderGrid();
    }, 160);
  });
  $('clearFilter').addEventListener('click', function () {
    SEARCH_Q = '';
    input.value = '';
    setDeptFilter('all', false);
  });
  $('heroBrowse').addEventListener('click', function () { setDeptFilter('chief', true); });
  $('heroStreet').addEventListener('click', function () {
    if ($('street')) $('street').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('modalClose').addEventListener('click', closeDetail);
  $('modal').addEventListener('click', function (e) {
    if (e.target === $('modal')) closeDetail();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) closeDetail();
  });
  /* keep focus inside the dialog while it is open */
  document.addEventListener('focusin', function (e) {
    var modal = $('modal');
    if (!modal.hidden && !$('sheet').contains(e.target)) {
      e.stopPropagation();
      $('modalClose').focus();
    }
  }, true);
}

/* ---------------- go ---------------- */

if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
  wireStatic();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(false); });
  } else {
    boot(false);
  }
}

/* test hook: pure functions for node verification (no DOM touched) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hashStr: hashStr, mulberry32: mulberry32, mixHex: mixHex,
    normalizeDept: normalizeDept, deptOfSku: deptOfSku, deptMeta: deptMeta,
    parseJsonl: parseJsonl, coerceRegistry: coerceRegistry, validateSku: validateSku,
    coerceAdopters: coerceAdopters, equipInfo: equipInfo,
    buildEquipUrl: buildEquipUrl, parseDeepLink: parseDeepLink, deepLinkFor: deepLinkFor,
    sigilSVG: sigilSVG, skuArt: skuArt, esc: esc,
    DEPARTMENTS: DEPARTMENTS, DEPT_ORDER: DEPT_ORDER,
    REGISTRY_URL: REGISTRY_URL, EQUIP_ISSUE_BASE: EQUIP_ISSUE_BASE, EQUIP_TEMPLATE: EQUIP_TEMPLATE
  };
}

})();

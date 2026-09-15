/* Project Ultimate — city-render.js v1.0.0
 *
 * Renders the city fabric (districts, streets, buildings, signage, vaults,
 * lighting) into a container element. DATA-DRIVEN: districts, places, stores
 * and tokens come from the city/*.json registry — nothing is hardcoded here.
 *
 * Defensive by contract:
 *  - missing container  -> console.warn + no-op, never throws
 *  - missing/partial data -> renders a valid empty city shell (plaza + notice)
 *  - malformed bounds    -> district skipped, rest still renders
 *  - labels are HTML-escaped before insertion
 *
 * Integration (see city/INTEGRATION.md):
 *   UltimateCity.render(el, { districts, places, stores, tokens, timeOfDay })
 *   UltimateCity.setTimeOfDay(el, 'dusk')
 *   UltimateCity.bindData(el, { districts, places, stores, tokens })  // re-render
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var VALID_TOD = ['dawn', 'day', 'dusk', 'night'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function validBounds(b) {
    if (!b || typeof b !== 'object') return false;
    var x0 = num(b.x0, NaN), y0 = num(b.y0, NaN), x1 = num(b.x1, NaN), y1 = num(b.y1, NaN);
    return Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1) && x1 > x0 && y1 > y0;
  }

  function districtColor(tokens, palette) {
    try {
      return (tokens && tokens.palette && tokens.palette.districts && tokens.palette.districts[palette]) || '#8b93a8';
    } catch (e) { return '#8b93a8'; }
  }

  function lighting(tokens, tod) {
    var t = 'day';
    if (VALID_TOD.indexOf(tod) >= 0) t = tod;
    try {
      var L = tokens && tokens.lighting && tokens.lighting[t];
      if (L && typeof L.overlay === 'string') return { overlay: L.overlay, glow: num(L.sign_glow, 0.25), tod: t };
    } catch (e) { /* fall through */ }
    return { overlay: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,0))', glow: 0.25, tod: t };
  }

  function renderDistrict(d, tokens) {
    if (!d || typeof d.id !== 'string' || !validBounds(d.bounds)) return '';
    var b = d.bounds, c = districtColor(tokens, d.palette);
    var future = !!d.future;
    var sys = Array.isArray(d.systems) ? d.systems.slice(0, 2).join(' · ') : '';
    var h = '<div class="uc-district' + (future ? ' uc-district--future' : '') + '"'
      + ' data-district-id="' + esc(d.id) + '"'
      + ' style="left:' + b.x0 + '%;top:' + b.y0 + '%;width:' + (b.x1 - b.x0) + '%;height:' + (b.y1 - b.y0) + '%;'
      + (future ? '' : '--uc-accent:' + esc(c) + ';') + '">'
      + '<div class="uc-district__label">' + esc(d.name || d.id) + '</div>'
      + (sys ? '<div class="uc-district__sys">' + esc(sys) + '</div>' : '')
      + (future ? '<div class="uc-district__future">FUTURE DISTRICT — zoned for growth</div>' : '')
      + '</div>';
    return h;
  }

  var PLACE_GLYPH = {
    headquarters: '⌂', boutique: '▣', hall: '▤', vault: '▦',
    plaza: '◯', street: '—', rest: '❧', landmark: '◉', future: '◇'
  };

  function renderPlace(p, tokens) {
    if (!p || typeof p.id !== 'string') return '';
    var x = num(p.x, NaN), y = num(p.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    var glyph = PLACE_GLYPH[p.kind] || '•';
    var cls = 'uc-place uc-place--' + esc(p.kind || 'unknown');
    if (p.crown) cls += ' uc-place--crown';
    return '<div class="' + cls + '" data-place-id="' + esc(p.id) + '"'
      + ' data-kind="' + esc(p.kind || '') + '"'
      + ' title="' + esc(p.name || p.id) + (p.kind ? ' · ' + p.kind : '') + '"'
      + ' style="left:' + x + '%;top:' + y + '%;">'
      + '<span class="uc-place__glyph" aria-hidden="true">' + esc(glyph) + '</span>'
      + '<span class="uc-place__name">' + esc(p.name || p.id) + '</span>'
      + '</div>';
  }

  function renderStore(s, placesById) {
    if (!s || typeof s.sku_id !== 'string') return '';
    var host = placesById[s.boutique];
    if (!host) return ''; // boutique missing -> skip storefront, never break the scene
    return '<div class="uc-store" data-store-id="' + esc(s.store_id || ('store-' + s.sku_id)) + '"'
      + ' data-sku-id="' + esc(s.sku_id) + '"'
      + ' data-department="' + esc(s.department || '') + '"'
      + ' title="' + esc(s.sku_name || s.sku_id) + ' — ' + esc(s.name || '') + '">'
      + '<span class="uc-sign">' + esc(s.signage || s.sku_name || s.sku_id) + '</span>'
      + '</div>';
  }

  function renderShell(container, message) {
    container.classList.add('uc-city');
    container.innerHTML =
      '<div class="uc-city__empty" role="status">'
      + '<div class="uc-city__empty-title">CWI City</div>'
      + '<div class="uc-city__empty-msg">' + esc(message) + '</div>'
      + '</div>';
  }

  function render(container, opts) {
    if (!container || typeof container.appendChild !== 'function') {
      if (typeof console !== 'undefined' && console.warn) console.warn('[UltimateCity] render: no container element; skipping.');
      return null;
    }
    opts = opts || {};
    var districts = Array.isArray(opts.districts) ? opts.districts : [];
    var places = Array.isArray(opts.places) ? opts.places : [];
    var stores = Array.isArray(opts.stores) ? opts.stores : [];
    var tokens = opts.tokens || null;
    var light = lighting(tokens, opts.timeOfDay);

    if (!districts.length && !places.length) {
      renderShell(container, 'City data is still loading — the plaza is open.');
      return { districts: 0, places: 0, stores: 0, timeOfDay: light.tod, degraded: true };
    }

    var placesById = {};
    places.forEach(function (p) { if (p && typeof p.id === 'string') placesById[p.id] = p; });

    var html = '<div class="uc-sky" style="background:' + esc(light.overlay) + ';"></div>';
    html += '<div class="uc-layer uc-layer--districts">'
      + districts.map(function (d) { return renderDistrict(d, tokens); }).join('') + '</div>';
    html += '<div class="uc-layer uc-layer--places">'
      + places.map(function (p) { return renderPlace(p, tokens); }).join('') + '</div>';
    html += '<div class="uc-layer uc-layer--stores" style="--uc-glow:' + light.glow + ';">'
      + stores.map(function (s) { return renderStore(s, placesById); }).join('') + '</div>';

    container.classList.add('uc-city');
    container.setAttribute('data-time-of-day', light.tod);
    container.innerHTML = html;
    return {
      districts: districts.length, places: places.length, stores: stores.length,
      timeOfDay: light.tod, degraded: false, version: VERSION
    };
  }

  function setTimeOfDay(container, tod) {
    if (!container || !container.classList) return false;
    var t = VALID_TOD.indexOf(tod) >= 0 ? tod : 'day';
    container.setAttribute('data-time-of-day', t);
    var sky = container.querySelector('.uc-sky');
    if (sky) {
      // lighting overlay is re-applied by the scene on next render; keep attribute as contract
      sky.setAttribute('data-pending-tod', t);
    }
    return true;
  }

  function bindData(container, data) {
    var prev = container && container.getAttribute ? container.getAttribute('data-time-of-day') : 'day';
    return render(container, Object.assign({}, data, { timeOfDay: prev }));
  }

  global.UltimateCity = {
    version: VERSION,
    render: render,
    setTimeOfDay: setTimeOfDay,
    bindData: bindData,
    VALID_TIMES: VALID_TOD.slice()
  };
})(typeof window !== 'undefined' ? window : this);

/* Project Ultimate — ambient.js v1.0.0
 * ============================================================================
 *  AMBIENT LAYER — DECORATIVE ONLY. READ THIS BEFORE TOUCHING THIS FILE.
 * ----------------------------------------------------------------------------
 *  Everything this module creates is BADGED "ambient" in code (data-ambient)
 *  and in UI (an on-screen "AMBIENT" pill). It MUST NEVER:
 *    - write to, read from, or reference the activity ledger
 *    - move, rename, or impersonate a real agent
 *    - be presented anywhere as real agent activity
 *  The life layer owns real agent movement. If the scene cannot distinguish
 *  ambient from real, the ambient layer is at fault — fix the badge, not the lie.
 * ============================================================================
 *
 * What it does (all decorative):
 *  - drifting light motes between districts
 *  - window lights flickering on at dusk/night (pure CSS class toggle)
 *  - soft foot-traffic dots drifting along street paths
 *
 * Integration: UltimateAmbient.start(rootEl, opts) / UltimateAmbient.stop()
 * Safe failure: if the container or CSS is missing, it no-ops; the city still renders.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var AMBIENT_ATTR = 'data-ambient';
  var timer = null;
  var root = null;

  function isAmbient(el) {
    return !!(el && el.getAttribute && el.getAttribute(AMBIENT_ATTR) === 'true');
  }

  function tag(el) {
    el.setAttribute(AMBIENT_ATTR, 'true');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('title', 'ambient — decorative only, not agent activity');
    return el;
  }

  function badge(container) {
    if (!container || container.querySelector('.uc-ambient-badge')) return;
    var b = tag(container.ownerDocument.createElement('div'));
    b.className = 'uc-ambient-badge';
    b.textContent = 'AMBIENT — decorative only';
    container.appendChild(b);
  }

  function motes(container, doc, count) {
    var layer = tag(doc.createElement('div'));
    layer.className = 'uc-ambient-layer uc-ambient-motes';
    for (var i = 0; i < count; i++) {
      var m = tag(doc.createElement('span'));
      m.className = 'uc-mote';
      // deterministic pseudo-random placement from index (stable, no Math.random needed)
      var x = ((i * 37.7) % 100).toFixed(2);
      var y = ((i * 53.3) % 100).toFixed(2);
      var d = 6 + ((i * 13) % 14);
      m.style.left = x + '%'; m.style.top = y + '%';
      m.style.animationDuration = d + 's';
      m.style.animationDelay = (-(i * 1.7) % d).toFixed(2) + 's';
      layer.appendChild(m);
    }
    container.appendChild(layer);
  }

  function traffic(container, doc) {
    // dots drifting along the two main street ribbons (percent coords)
    var paths = [
      [{ x: 2, y: 40 }, { x: 98, y: 40 }],     // Signal Boulevard
      [{ x: 54, y: 40 }, { x: 54, y: 96 }],    // Crown Avenue
      [{ x: 22, y: 64 }, { x: 22, y: 96 }]     // Catalog Lane
    ];
    var layer = tag(doc.createElement('div'));
    layer.className = 'uc-ambient-layer uc-ambient-traffic';
    paths.forEach(function (seg, si) {
      for (var i = 0; i < 4; i++) {
        var dot = tag(doc.createElement('span'));
        dot.className = 'uc-traffic-dot';
        dot.style.animationDuration = (18 + si * 5 + i * 2) + 's';
        dot.style.animationDelay = (-(i * 6 + si * 3)) + 's';
        dot.style.setProperty('--ax', seg[0].x + '%');
        dot.style.setProperty('--ay', seg[0].y + '%');
        dot.style.setProperty('--bx', seg[1].x + '%');
        dot.style.setProperty('--by', seg[1].y + '%');
        layer.appendChild(dot);
      }
    });
    container.appendChild(layer);
  }

  function duskWindows(container) {
    // Window-light flicker is a class toggle only — no state, no ledger, no agents.
    function apply() {
      if (!container || !container.isConnected) { stop(); return; }
      var tod = container.getAttribute('data-time-of-day');
      var lit = (tod === 'dusk' || tod === 'night');
      var places = container.querySelectorAll('.uc-place');
      for (var i = 0; i < places.length; i++) {
        // stable pseudo-random per place id: even hash -> flickers on
        var id = places[i].getAttribute('data-place-id') || '';
        var h = 0; for (var c = 0; c < id.length; c++) h = (h * 31 + id.charCodeAt(c)) >>> 0;
        if (lit && (h % 3 !== 0)) places[i].classList.add('uc-windows-lit');
        else places[i].classList.remove('uc-windows-lit');
      }
    }
    apply();
    timer = setInterval(apply, 4000);
  }

  function start(container, opts) {
    stop();
    if (!container || !container.ownerDocument) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[UltimateAmbient] start: no container; ambient layer disabled (city still renders).');
      return false;
    }
    opts = opts || {};
    root = container;
    try {
      var doc = container.ownerDocument;
      badge(container);
      motes(container, doc, opts.motes == null ? 26 : opts.motes);
      traffic(container, doc);
      duskWindows(container);
      container.setAttribute('data-ambient-active', 'true');
      return true;
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[UltimateAmbient] failed to start (non-fatal):', e && e.message);
      return false;
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (root && root.ownerDocument) {
      try {
        var dead = root.querySelectorAll('[' + AMBIENT_ATTR + '="true"]');
        for (var i = 0; i < dead.length; i++) dead[i].remove();
        root.removeAttribute('data-ambient-active');
      } catch (e) { /* non-fatal */ }
    }
    root = null;
  }

  global.UltimateAmbient = {
    version: VERSION,
    start: start,
    stop: stop,
    isAmbient: isAmbient,
    AMBIENT_ATTR: AMBIENT_ATTR
  };
})(typeof window !== 'undefined' ? window : this);

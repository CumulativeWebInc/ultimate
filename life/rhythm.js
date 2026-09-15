/**
 * @module LifeRhythm
 * @version 1.0.0
 * @fileoverview Client-side ambient life simulation for the LIFE layer:
 * a light activity → rest → activity cycle that keeps the scene alive
 * between real events.
 *
 * HONESTY ARCHITECTURE (see life/honesty.js):
 *  1. Every state this module produces is tagged ambient via
 *     `LifeHonesty.tagAmbient()` and FROZEN — the tag cannot be stripped.
 *  2. Every state is rendered with the visible "ambient" badge
 *     (`LifeRender.setAmbientBadge`).
 *  3. This module contains ZERO ledger write paths: no fetch, no
 *     XMLHttpRequest, no ledger object references, no `last_checkin`
 *     assignment. Verified by life/tests/honesty.test.js source scan.
 *  4. Real ledger check-ins override ambient state via
 *     {@link overrideWithReal} — the ambient loop stops and the badge clears.
 *
 * Dependencies (browser globals): LifeRender, LifeHonesty.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeRhythm = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * @typedef {Object} RhythmOptions
   * @property {number} [activeMs=45000] How long "active" lasts per cycle.
   * @property {number} [restMs=20000] How long "resting" lasts per cycle.
   * @property {function(Object):void} [onTick] Called with each ambient state.
   */

  var timers = new WeakMap();

  function deps() {
    var R = (typeof LifeRender !== "undefined") ? LifeRender : (rootShim().LifeRender);
    var H = (typeof LifeHonesty !== "undefined") ? LifeHonesty : (rootShim().LifeHonesty);
    if (!R || !H) throw new Error("LifeRhythm requires LifeRender and LifeHonesty globals");
    return { R: R, H: H };
  }
  function rootShim() {
    return (typeof self !== "undefined") ? self : (typeof window !== "undefined" ? window : {});
  }

  /**
   * Build the next ambient state. Always tagged + frozen. NEVER ledger-safe:
   * passing one of these to LifeHonesty.assertNotAmbientForLedger throws.
   * @param {boolean} resting
   * @param {string|null} restZone
   * @returns {Object} Frozen ambient state.
   */
  function nextAmbientState(resting, restZone) {
    var H = deps().H;
    return H.tagAmbient({
      resting: resting,
      rest_zone: resting ? restZone : null,
      at: new Date().toISOString()
    });
  }

  function applyState(agentEl, state) {
    var d = deps();
    d.R.setResting(agentEl, state.resting);
    d.R.setAmbientBadge(agentEl, true);
    agentEl.setAttribute("data-rhythm", "running");
  }

  /**
   * Start the ambient activity → rest → activity loop on an avatar element.
   * Safe to call twice: a running loop is restarted, never duplicated.
   *
   * @param {HTMLElement} agentEl `.life-avatar` container.
   * @param {Object} life The agent's life object (read-only; never mutated).
   * @param {RhythmOptions} [opts]
   * @returns {function} Stop function (same as `stop(agentEl)`).
   */
  function start(agentEl, life, opts) {
    stop(agentEl);
    opts = opts || {};
    var activeMs = opts.activeMs != null ? opts.activeMs : 45000;
    var restMs = opts.restMs != null ? opts.restMs : 20000;
    var restZone = (life && life.rest_zone) || null;

    var resting = false;
    function tick() {
      resting = !resting;
      // No rest zone configured -> stay visibly active (never fake a zone).
      if (resting && !restZone) resting = false;
      var state = nextAmbientState(resting, restZone);
      applyState(agentEl, state);
      if (typeof opts.onTick === "function") {
        try { opts.onTick(state); } catch (e) { /* observer errors never break the loop */ }
      }
      timers.set(agentEl, setTimeout(tick, resting ? restMs : activeMs));
    }
    timers.set(agentEl, setTimeout(tick, activeMs));
    return function () { stop(agentEl); };
  }

  /**
   * Stop the ambient loop. Visuals stay as they are; use
   * {@link overrideWithReal} when a real check-in arrives.
   * @param {HTMLElement} agentEl
   */
  function stop(agentEl) {
    var t = timers.get(agentEl);
    if (t) {
      clearTimeout(t);
      timers.delete(agentEl);
    }
    agentEl.removeAttribute("data-rhythm");
  }

  /**
   * A REAL ledger check-in arrived: stop the ambient loop, clear the ambient
   * badge, and render the authoritative state. This is the ONLY path by
   * which ambient visuals yield to reality.
   *
   * @param {HTMLElement} agentEl
   * @param {Object} life The agent's real life object (post-check-in).
   */
  function overrideWithReal(agentEl, life) {
    var d = deps();
    stop(agentEl);
    d.R.setAmbientBadge(agentEl, false);
    d.R.setResting(agentEl, !!(life && life.resting));
    agentEl.setAttribute("data-rhythm", "overridden");
  }

  /**
   * @returns {boolean} Whether an ambient loop is currently running.
   */
  function isRunning(agentEl) {
    return timers.has(agentEl);
  }

  return {
    start: start,
    stop: stop,
    overrideWithReal: overrideWithReal,
    isRunning: isRunning,
    // Exposed for honesty tests: ambient states must fail the ledger gate.
    _nextAmbientState: nextAmbientState
  };
}));

/**
 * @module LifeHonesty
 * @version 1.0.0
 * @fileoverview Code-enforced honesty invariants for the Project Ultimate
 * LIFE layer.
 *
 * The single hardest rule of this layer: **ambient (simulated) life states
 * must NEVER be written to the activity ledger and must NEVER be presented
 * as real check-ins.** These guards throw `LifeHonestyError`; they are not
 * documentation. Any code path that wants to persist or announce a check-in
 * must route through {@link LifeHonesty.assertNotAmbientForLedger} first.
 *
 * Works in browsers (window.LifeHonesty) and Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeHonesty = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Thrown when an ambient state is offered to a real (ledger) sink, or when
   * life data violates a structural invariant. Never caught-and-ignored:
   * callers must fix the data flow, not swallow the error.
   */
  function LifeHonestyError(message, code) {
    this.name = "LifeHonestyError";
    this.message = message;
    this.code = code || "HONESTY_VIOLATION";
    if (Error.captureStackTrace) Error.captureStackTrace(this, LifeHonestyError);
  }
  LifeHonestyError.prototype = Object.create(Error.prototype);
  LifeHonestyError.prototype.constructor = LifeHonestyError;

  var AMBIENT_SOURCE = "life/rhythm.js";

  /**
   * True when the value is an ambient (simulated) life state.
   * @param {*} state Any life-state object.
   * @returns {boolean}
   */
  function isAmbientState(state) {
    return !!(state && state.ambient === true);
  }

  /**
   * Tag a simulated state as ambient. Returns a FROZEN copy so the tag
   * cannot be removed downstream by accident or intent.
   * @param {Object} state Plain state object produced by the simulator.
   * @returns {Object} Frozen copy with `ambient: true` and `ambientSource`.
   */
  function tagAmbient(state) {
    var copy = {};
    if (state && typeof state === "object") {
      for (var k in state) {
        if (Object.prototype.hasOwnProperty.call(state, k)) copy[k] = state[k];
      }
    }
    copy.ambient = true;
    copy.ambientSource = AMBIENT_SOURCE;
    return Object.freeze(copy);
  }

  /**
   * HARD GATE. Call this immediately before any ledger write / check-in
   * announce / "real activity" render. Throws when the entry is ambient.
   *
   * There is no "sanitize and continue" path on purpose: ambient data must
   * never reach the ledger, so the only safe behavior is to refuse loudly.
   *
   * @param {*} entry The entry about to be persisted or announced.
   * @param {string} [sinkName] Human name of the sink (for the error).
   * @throws {LifeHonestyError} When `entry.ambient === true`.
   * @returns {true} When the entry is safe to persist.
   */
  function assertNotAmbientForLedger(entry, sinkName) {
    if (isAmbientState(entry)) {
      throw new LifeHonestyError(
        "Refusing to write ambient (simulated) life state to '" +
        (sinkName || "ledger") + "'. Ambient states are visual only; " +
        "source=" + (entry.ambientSource || "unknown") + ". " +
        "Only real check-ins (ambient !== true) may reach the ledger.",
        "AMBIENT_TO_LEDGER"
      );
    }
    return true;
  }

  /**
   * Structural audit of one agent's life object against the spec and the
   * item/track/zone registries. Returns violations; empty array = clean.
   * Does not throw — this is the read-only counterpart to the hard gates.
   *
   * @param {Object} life The agent's `life` object (may be null/undefined).
   * @param {Object} indexes {items: {id:item}, tracks: {id:track}, zones: {id:zone}}
   * @returns {string[]} Violation descriptions (empty when clean).
   */
  function auditLife(life, indexes) {
    var problems = [];
    indexes = indexes || {};
    var items = indexes.items || {};
    var tracks = indexes.tracks || {};
    var zones = indexes.zones || {};

    if (life == null) {
      problems.push("life object is missing");
      return problems;
    }
    if (typeof life.resting !== "boolean") problems.push("life.resting must be boolean");
    if (life.rest_zone != null && !zones[life.rest_zone]) {
      problems.push("life.rest_zone '" + life.rest_zone + "' is not a known zone");
    }
    if (life.resting === true && life.rest_zone == null) {
      problems.push("life.resting is true but life.rest_zone is null (resting requires a zone)");
    }
    var inv = life.inventory || {};
    var owned = inv.items || [];
    var worn = inv.worn || [];
    var music = inv.music || [];
    if (!Array.isArray(owned)) problems.push("life.inventory.items must be an array");
    if (!Array.isArray(worn)) problems.push("life.inventory.worn must be an array");
    if (!Array.isArray(music)) problems.push("life.inventory.music must be an array");
    (Array.isArray(worn) ? worn : []).forEach(function (id) {
      if (owned.indexOf(id) === -1) problems.push("worn item '" + id + "' is not owned in inventory.items");
      if (!items[id]) problems.push("worn item '" + id + "' is not in the items registry");
    });
    (Array.isArray(owned) ? owned : []).forEach(function (id) {
      if (!items[id]) problems.push("owned item '" + id + "' is not in the items registry");
    });
    (Array.isArray(music) ? music : []).forEach(function (id) {
      if (!tracks[id]) problems.push("collected track '" + id + "' is not in the music registry");
    });
    if (life.last_checkin != null && isNaN(Date.parse(life.last_checkin))) {
      problems.push("life.last_checkin is not a valid ISO-8601 timestamp");
    }
    return problems;
  }

  /**
   * Convenience: run the hard gate over a batch of entries. Throws on the
   * first ambient entry.
   * @param {Array} entries Entries about to be persisted.
   * @param {string} [sinkName]
   */
  function assertBatchNotAmbient(entries, sinkName) {
    (entries || []).forEach(function (e) { assertNotAmbientForLedger(e, sinkName); });
    return true;
  }

  return {
    LifeHonestyError: LifeHonestyError,
    AMBIENT_SOURCE: AMBIENT_SOURCE,
    isAmbientState: isAmbientState,
    tagAmbient: tagAmbient,
    assertNotAmbientForLedger: assertNotAmbientForLedger,
    assertBatchNotAmbient: assertBatchNotAmbient,
    auditLife: auditLife
  };
}));

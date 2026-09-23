/**
 * @module LifeRender
 * @version 1.0.0
 * @fileoverview DOM renderer for the Project Ultimate LIFE layer.
 *
 * Purely presentational: composites worn wearables over the base avatar,
 * applies the resting visual state, and renders the now-playing chip.
 * This module NEVER writes to the activity ledger, NEVER sets
 * `last_checkin`, and NEVER performs network I/O. (Verified by
 * life/tests/honesty.test.js, which asserts the source contains no ledger
 * or network write paths.)
 *
 * Expected DOM contract (see life/demo.html for a reference build):
 *   <div class="life-avatar" data-agent="fader">
 *     <img class="life-base" src="..." alt="...">
 *     <div class="life-stack"></div>        <!-- created if missing -->
 *     <span class="rest-tag">resting</span>
 *     <span class="ambient-tag">…ambient…</span>
 *     <div class="now-playing">…</div>
 *   </div>
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeRender = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  /** Path (relative to the page) of the wearable sprite. */
  var SPRITE_PATH = "gear-overlays.svg";

  /**
   * @typedef {Object} LifeState
   * @property {boolean} resting
   * @property {string|null} rest_zone
   * @property {{items: string[], worn: string[], music: string[]}} inventory
   * @property {string|null} last_checkin ISO-8601 or null
   */

  /**
   * Ensure the wearable stack container exists inside the avatar element.
   * @param {HTMLElement} agentEl
   * @returns {HTMLElement} The `.life-stack` element.
   */
  function ensureStack(agentEl) {
    var stack = agentEl.querySelector(".life-stack");
    if (!stack) {
      stack = agentEl.ownerDocument.createElement("div");
      stack.className = "life-stack";
      stack.setAttribute("aria-hidden", "true");
      agentEl.appendChild(stack);
    }
    return stack;
  }

  /**
   * Composite worn gear over the base avatar. Idempotent: clears any
   * previously rendered layers first.
   *
   * @param {HTMLElement} agentEl The `.life-avatar` container.
   * @param {LifeState} agentLife The agent's life object.
   * @param {Object.<string, {layer: string}>} [itemsIndex] Maps item_id -> item
   *   (at minimum `{layer}`). Unknown ids fall back to layer "badge".
   * @returns {string[]} The item ids actually rendered.
   */
  function renderLifeLayers(agentEl, agentLife, itemsIndex) {
    var doc = agentEl.ownerDocument;
    var stack = ensureStack(agentEl);
    while (stack.firstChild) stack.removeChild(stack.firstChild);

    var worn = (agentLife && agentLife.inventory && agentLife.inventory.worn) || [];
    var rendered = [];
    var sigilCount = 0;

    worn.forEach(function (itemId) {
      var item = (itemsIndex || {})[itemId] || {};
      var layer = item.layer || "badge";
      var svg = doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "life-layer");
      svg.setAttribute("data-layer", layer);
      svg.setAttribute("data-item", itemId);
      svg.setAttribute("viewBox", "0 0 64 64");
      svg.setAttribute("aria-hidden", "true");
      if (layer === "sigil") {
        svg.style.setProperty("--life-stack-i", String(sigilCount));
        sigilCount += 1;
      }
      var use = doc.createElementNS(SVG_NS, "use");
      // NOTE: keep the attribute name `href` (SVG2); xlink:href is legacy.
      use.setAttribute("href", SPRITE_PATH + "#item-" + itemId);
      svg.appendChild(use);
      stack.appendChild(svg);
      rendered.push(itemId);
    });

    return rendered;
  }

  /**
   * Apply or clear the resting visual state (slower bob, softened glow,
   * "resting" tag via CSS). Presentational only — not a ledger check-in.
   * @param {HTMLElement} agentEl
   * @param {boolean} resting
   */
  function setResting(agentEl, resting) {
    if (resting) agentEl.classList.add("is-resting");
    else agentEl.classList.remove("is-resting");
  }

  /**
   * Render the now-playing chip (equalizer + track title). Pass null/undefined
   * to clear it.
   * @param {HTMLElement} agentEl
   * @param {{title: string, artist?: string}|null} track
   */
  function renderNowPlaying(agentEl, track) {
    var doc = agentEl.ownerDocument;
    var chip = agentEl.querySelector(".now-playing");
    if (!chip) {
      chip = doc.createElement("div");
      chip.className = "now-playing";
      chip.setAttribute("role", "status");
      agentEl.appendChild(chip);
    }
    if (!track || !track.title) {
      chip.classList.remove("is-on");
      chip.innerHTML = "";
      chip.removeAttribute("data-track");
      return;
    }
    chip.classList.add("is-on");
    chip.setAttribute("data-track", track.title);
    var artist = track.artist ? '<span class="np-artist">' + escapeHtml(track.artist) + "</span>" : "";
    chip.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="' + SPRITE_PATH + '#life-eq"></use></svg>' +
      '<span class="np-title">' + escapeHtml(track.title) + "</span>" + artist;
  }

  /**
   * Mark the avatar's current visual state as ambient (simulated).
   * Shows the "ambient" honesty badge. Does not touch the ledger.
   * @param {HTMLElement} agentEl
   * @param {boolean} ambient
   */
  function setAmbientBadge(agentEl, ambient) {
    agentEl.setAttribute("data-ambient", ambient ? "true" : "false");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  return {
    SPRITE_PATH: SPRITE_PATH,
    renderLifeLayers: renderLifeLayers,
    setResting: setResting,
    renderNowPlaying: renderNowPlaying,
    setAmbientBadge: setAmbientBadge
  };
}));

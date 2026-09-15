/**
 * @module LifeCollection
 * @version 1.0.0
 * @fileoverview Per-agent collection view (music + items) for the status
 * card. Renders owned items, worn gear, and collected tracks from the
 * life registries. Read-only: never mutates the life object, never touches
 * the ledger, never performs network I/O — registries are passed in.
 *
 * Missing data is a first-class case: unknown ids and absent registries
 * render explicit "unavailable" states instead of throwing.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeCollection = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * @typedef {Object} CollectionIndexes
   * @property {Object.<string, {name: string, layer: string, look: {colors: {primary: string}}}>} [items]
   * @property {Object.<string, {title: string, collectible_art: string}>} [tracks]
   */

  /**
   * Render the collection panel.
   *
   * @param {HTMLElement} mountEl Container to render into (cleared first).
   * @param {Object} life The agent's life object (may be null → error state).
   * @param {CollectionIndexes} [indexes] Registry lookups (may be partial).
   * @param {Object} [opts]
   * @param {boolean} [opts.showWorn=true]
   * @param {boolean} [opts.showItems=true]
   * @param {boolean} [opts.showMusic=true]
   * @returns {HTMLElement} mountEl, for chaining.
   */
  function renderCollection(mountEl, life, indexes, opts) {
    var doc = mountEl.ownerDocument;
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
    mountEl.classList.add("life-collection");

    opts = opts || {};
    indexes = indexes || {};
    var itemsIndex = indexes.items || {};
    var tracksIndex = indexes.tracks || {};

    if (!life || !life.inventory) {
      mountEl.appendChild(note(doc, "lc-warn", "Life data unavailable for this agent."));
      return mountEl;
    }
    var inv = life.inventory;

    if (opts.showWorn !== false) {
      mountEl.appendChild(heading(doc, "Worn now"));
      mountEl.appendChild(chipRow(doc, inv.worn || [], function (id) {
        var it = itemsIndex[id];
        if (!it) return warnChip(doc, id, "unknown item");
        return itemChip(doc, it, true);
      }, "Nothing worn."));
    }
    if (opts.showItems !== false) {
      mountEl.appendChild(heading(doc, "Item collection"));
      mountEl.appendChild(chipRow(doc, inv.items || [], function (id) {
        var it = itemsIndex[id];
        if (!it) return warnChip(doc, id, "unknown item");
        return itemChip(doc, it, false);
      }, "No items collected yet."));
    }
    if (opts.showMusic !== false) {
      mountEl.appendChild(heading(doc, "Music collection"));
      mountEl.appendChild(chipRow(doc, inv.music || [], function (id) {
        var tr = tracksIndex[id];
        if (!tr) return warnChip(doc, id, "unknown track");
        return trackChip(doc, tr);
      }, "No tracks collected yet."));
    }
    return mountEl;
  }

  function heading(doc, text) {
    var h = doc.createElement("h4");
    h.textContent = text;
    return h;
  }

  function note(doc, cls, text) {
    var p = doc.createElement("p");
    p.className = cls;
    p.textContent = text;
    return p;
  }

  function chipRow(doc, ids, renderOne, emptyText) {
    var row = doc.createElement("div");
    row.className = "lc-row";
    if (!ids.length) {
      row.appendChild(note(doc, "lc-empty", emptyText));
      return row;
    }
    ids.forEach(function (id) {
      try { row.appendChild(renderOne(id)); }
      catch (e) { row.appendChild(warnChip(doc, id, "render error")); }
    });
    return row;
  }

  function itemChip(doc, item, worn) {
    var chip = doc.createElement("span");
    chip.className = "lc-chip";
    chip.title = item.name + " · " + item.layer + (worn ? " · worn" : "");
    var dot = doc.createElement("span");
    dot.className = "lc-dot";
    var color = (item.look && item.look.colors && item.look.colors.primary) || "#94a3b8";
    dot.style.background = color;
    var label = doc.createElement("span");
    label.textContent = (worn ? "◆ " : "") + item.name;
    chip.appendChild(dot);
    chip.appendChild(label);
    return chip;
  }

  function trackChip(doc, track) {
    var chip = doc.createElement("span");
    chip.className = "lc-chip";
    chip.title = track.title;
    if (track.collectible_art) {
      var wrap = doc.createElement("span");
      // collectible_art is a trusted, build-generated inline SVG string
      // (life/music.json). No user input ever reaches this path.
      wrap.innerHTML = track.collectible_art;
      var svg = wrap.firstChild;
      if (svg) chip.appendChild(svg);
    }
    var label = doc.createElement("span");
    label.textContent = track.title;
    chip.appendChild(label);
    return chip;
  }

  function warnChip(doc, id, reason) {
    var chip = doc.createElement("span");
    chip.className = "lc-chip lc-warn";
    chip.title = reason;
    chip.textContent = "⚠ " + id;
    return chip;
  }

  return {
    renderCollection: renderCollection
  };
}));

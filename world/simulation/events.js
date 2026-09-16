/* PROJECT ULTIMATE — append-only event log (world/simulation)
 * Event envelope v1 + EventStore. The log is the world's memory: every state
 * change the world cares about is an event, and every rendered moment must
 * trace back to one. Vanilla JS, no dependencies, runs in browser and Node.
 *
 * Envelope v1:
 *   { seq, tick, ts, type, actor, payload }
 * seq is 1-based and dense. ts is an ISO-8601 UTC string supplied by the
 * caller (the engine never reads a clock itself; the host injects one).
 */

export const ENVELOPE_VERSION = 1;

export function makeEvent(seq, tick, ts, type, actor, payload) {
  return {
    seq,
    tick,
    ts,
    type,
    actor: actor === undefined ? null : actor,
    payload: payload || {},
  };
}

function parseLine(line, lineNo) {
  const e = JSON.parse(line);
  for (const k of ["seq", "tick", "ts", "type"]) {
    if (!(k in e)) throw new Error(`events.jsonl line ${lineNo}: missing "${k}"`);
  }
  if (e.actor === undefined) e.actor = null;
  if (e.payload === undefined || e.payload === null) e.payload = {};
  return e;
}

export class EventStore {
  constructor() {
    this.events = [];
  }

  get head() {
    return this.events.length; // seq of newest event; seqs are 1-based and dense
  }

  append(tick, ts, type, actor, payload) {
    const e = makeEvent(this.events.length + 1, tick, ts, type, actor, payload);
    this.events.push(e);
    return e;
  }

  has(seq) {
    return Number.isInteger(seq) && seq >= 1 && seq <= this.events.length;
  }

  get(seq) {
    return this.has(seq) ? this.events[seq - 1] : null;
  }

  tail(n) {
    return this.events.slice(Math.max(0, this.events.length - n));
  }

  filter(pred) {
    return this.events.filter(pred);
  }

  /* Pagination convention for the machine API: ?from_seq=N&limit=M.
   * Static hosts serve events.jsonl whole; clients implement this convention
   * against the merged (seed + session) log. from_seq is 1-based, inclusive. */
  since(fromSeq, limit) {
    const from = Math.max(1, Math.floor(fromSeq) || 1);
    const lim = Math.max(0, Math.floor(limit) || 0);
    const start = from - 1;
    const slice = this.events.slice(start, start + lim);
    return {
      events: slice,
      from_seq: from,
      next_from_seq: start + slice.length + 1,
      head: this.head,
    };
  }

  toJSONL() {
    if (!this.events.length) return "";
    return this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  static fromJSONL(text) {
    const store = new EventStore();
    const lines = String(text || "").split("\n");
    let n = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      n += 1;
      const e = parseLine(line, n);
      if (e.seq !== store.events.length + 1) {
        throw new Error(
          `events.jsonl line ${n}: seq ${e.seq} breaks dense 1-based ordering (expected ${store.events.length + 1})`
        );
      }
      store.events.push(e);
    }
    return store;
  }
}

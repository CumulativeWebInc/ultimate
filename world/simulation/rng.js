/* PROJECT ULTIMATE — deterministic PRNG (world/simulation)
 * mulberry32. The ONLY source of randomness inside the simulation.
 * A fresh stream is derived per tick: rngForTick(seed, tick).
 * There is intentionally no unseeded randomness anywhere in this file.
 * Vanilla JS, no dependencies, runs in browser and Node.
 */

export function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Derive the tick's RNG stream. Same (seed, tick) -> identical stream, always. */
export function rngForTick(seed, tick) {
  return mulberry32((seed + tick) >>> 0);
}

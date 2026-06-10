/**
 * Agentic QE v3 - Seeded RNG for qe-arena (ADR-104)
 *
 * mulberry32 — tiny deterministic PRNG. Everything the arena randomizes
 * (strategy subset sampling, mutant sampling, hill-climb flips) draws from
 * one seeded stream so identical seeds reproduce identical tournaments.
 * No Math.random()/Date.now() anywhere in scoring paths.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [0, maxExclusive) */
export function nextInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** Deterministic sample of k distinct items (order-stable Fisher-Yates prefix) */
export function sample<T>(rng: Rng, items: readonly T[], k: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = nextInt(rng, pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

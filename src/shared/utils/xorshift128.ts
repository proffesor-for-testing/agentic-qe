/**
 * Xorshift128 PRNG — Deterministic pseudo-random number generator
 *
 * Seeded xorshift128 producing repeatable sequences for use in
 * fingerprinting, graph training, weight initialization, and
 * any context requiring deterministic randomness.
 *
 * @module shared/utils/xorshift128
 */

export class Xorshift128 {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    this.s0 = this.splitmix32(seed);
    this.s1 = this.splitmix32(this.s0);
    this.s2 = this.splitmix32(this.s1);
    this.s3 = this.splitmix32(this.s2);
  }

  private splitmix32(state: number): number {
    state = (state + 0x9e3779b9) | 0;
    state = Math.imul(state ^ (state >>> 16), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35);
    return (state ^ (state >>> 16)) >>> 0;
  }

  /** Returns a raw unsigned 32-bit integer */
  next(): number {
    const t = this.s3;
    let s = this.s0;
    this.s3 = this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    s ^= s << 11;
    s ^= s >>> 8;
    this.s0 = s ^ t ^ (t >>> 19);
    return this.s0 >>> 0;
  }

  /** Returns a float in [0, 1) */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }

  /** Returns a standard normal variate via Box-Muller transform */
  nextGaussian(): number {
    const u1 = this.nextFloat() || 1e-10;
    const u2 = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

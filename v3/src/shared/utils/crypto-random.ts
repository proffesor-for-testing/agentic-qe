/**
 * Cryptographically secure random number utilities.
 *
 * Drop-in replacements for Math.random() using Node's crypto module.
 * Every call that previously used Math.random() should use these instead.
 */

import { randomBytes, randomInt as cryptoRandomInt } from 'node:crypto';

/** Returns a cryptographically secure float in [0, 1). Drop-in for Math.random(). */
export function secureRandom(): number {
  // 32-bit resolution — sufficient for all non-crypto use cases
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 0x100000000;
}

/** Returns a secure random integer in [min, max) (exclusive upper bound). */
export function secureRandomInt(min: number, max: number): number {
  return cryptoRandomInt(min, max);
}

/** Returns a secure random float in [min, max). */
export function secureRandomFloat(min: number, max: number): number {
  return min + secureRandom() * (max - min);
}

/** Picks a random element from an array. */
export function secureRandomPick<T>(arr: readonly T[]): T {
  return arr[cryptoRandomInt(0, arr.length)];
}

/** Shuffles an array in-place using Fisher-Yates with secure randomness. */
export function secureRandomShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Returns true with the given probability [0, 1]. */
export function secureRandomChance(probability: number): boolean {
  return secureRandom() < probability;
}

/** Generates a secure random gaussian (normal) distribution value using Box-Muller. */
export function secureRandomGaussian(mean = 0, stddev = 1): number {
  const u1 = secureRandom() || 1e-10; // avoid log(0)
  const u2 = secureRandom();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/**
 * Random number utilities for non-security contexts.
 *
 * Uses Math.random() for floats (no cryptographic guarantees needed for
 * noise, shuffling, probabilities) and crypto.randomInt() for unbiased
 * integer ranges.
 *
 * CodeQL flags multiplication/division on crypto bytes as "biased random"
 * (js/biased-cryptographic-random). Since these use cases don't require
 * cryptographic uniformity, Math.random() is the correct choice.
 */

import { randomInt as cryptoRandomInt } from 'node:crypto';

/** Returns a random float in [0, 1). Drop-in for Math.random(). */
export function secureRandom(): number {
  return Math.random();
}

/** Returns an unbiased random integer in [min, max) (exclusive upper bound). */
export function secureRandomInt(min: number, max: number): number {
  return cryptoRandomInt(min, max);
}

/** Returns a random float in [min, max). */
export function secureRandomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Picks a random element from an array. */
export function secureRandomPick<T>(arr: readonly T[]): T {
  return arr[cryptoRandomInt(0, arr.length)];
}

/** Shuffles an array in-place using Fisher-Yates with unbiased integer randomness. */
export function secureRandomShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Returns true with the given probability [0, 1]. */
export function secureRandomChance(probability: number): boolean {
  return Math.random() < probability;
}

/** Generates a random gaussian (normal) distribution value using Box-Muller. */
export function secureRandomGaussian(mean = 0, stddev = 1): number {
  const u1 = Math.random() || 1e-10; // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

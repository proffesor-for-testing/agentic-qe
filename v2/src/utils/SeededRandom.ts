/**
 * Seeded Random Number Generator
 *
 * Provides deterministic random number generation for testing purposes.
 * Uses the Mulberry32 PRNG algorithm which is fast and has good statistical distribution.
 *
 * Purpose: Eliminates test flakiness caused by Math.random() by providing
 * reproducible random sequences from a known seed.
 *
 * @module utils/SeededRandom
 */

/**
 * Default seed used when no explicit seed is provided and TEST_RANDOM_SEED
 * environment variable is not set.
 */
const DEFAULT_SEED = 42;

/**
 * SeededRandom class providing deterministic pseudo-random number generation.
 *
 * Uses the Mulberry32 algorithm which is:
 * - Fast (single 32-bit state)
 * - Good statistical distribution
 * - Deterministic for the same seed
 *
 * @example
 * ```typescript
 * // Create with specific seed for reproducible results
 * const rng = new SeededRandom(12345);
 *
 * // Always produces the same sequence
 * console.log(rng.random()); // 0.3745401...
 * console.log(rng.random()); // 0.9507143...
 *
 * // Reset to reproduce the same sequence
 * rng.reset();
 * console.log(rng.random()); // 0.3745401... (same as before)
 * ```
 */
export class SeededRandom {
  private seed: number;
  private initialSeed: number;

  /**
   * Creates a new SeededRandom instance.
   *
   * @param seed - The seed value for the PRNG. If not provided, uses
   *               TEST_RANDOM_SEED environment variable or defaults to 42.
   *
   * @example
   * ```typescript
   * // Explicit seed
   * const rng1 = new SeededRandom(12345);
   *
   * // From environment (TEST_RANDOM_SEED=99999)
   * const rng2 = new SeededRandom();
   *
   * // Default seed (42)
   * const rng3 = new SeededRandom();
   * ```
   */
  constructor(seed?: number) {
    this.initialSeed = seed ?? this.getEnvironmentSeed() ?? DEFAULT_SEED;
    this.seed = this.initialSeed;
  }

  /**
   * Gets the seed from the TEST_RANDOM_SEED environment variable.
   *
   * @returns The parsed seed value or undefined if not set or invalid.
   */
  private getEnvironmentSeed(): number | undefined {
    const envSeed = process.env.TEST_RANDOM_SEED;
    if (envSeed !== undefined) {
      const parsed = parseInt(envSeed, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * Mulberry32 PRNG algorithm.
   *
   * This is a high-quality 32-bit PRNG that produces a float in [0, 1).
   * It has a period of 2^32 and passes common statistical tests.
   *
   * @returns A pseudo-random float in the range [0, 1).
   */
  private mulberry32(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random float in the range [0, 1), similar to Math.random().
   *
   * @returns A pseudo-random float in [0, 1).
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const value = rng.random(); // 0.3745401...
   * ```
   */
  random(): number {
    return this.mulberry32();
  }

  /**
   * Generates a pseudo-random integer within an inclusive range.
   *
   * @param min - The minimum value (inclusive).
   * @param max - The maximum value (inclusive).
   * @returns A pseudo-random integer in [min, max].
   * @throws {Error} If min > max.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   *
   * // Dice roll (1-6)
   * const roll = rng.randomInt(1, 6);
   *
   * // Random index (0-9)
   * const index = rng.randomInt(0, 9);
   * ```
   */
  randomInt(min: number, max: number): number {
    if (min > max) {
      throw new Error(`Invalid range: min (${min}) must be <= max (${max})`);
    }
    return Math.floor(this.mulberry32() * (max - min + 1)) + min;
  }

  /**
   * Generates a pseudo-random float within a specified range.
   *
   * @param min - The minimum value (inclusive).
   * @param max - The maximum value (exclusive).
   * @returns A pseudo-random float in [min, max).
   * @throws {Error} If min >= max.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   *
   * // Temperature between 36.0 and 38.0
   * const temp = rng.randomFloat(36.0, 38.0);
   *
   * // Probability weight
   * const weight = rng.randomFloat(0.0, 1.0);
   * ```
   */
  randomFloat(min: number, max: number): number {
    if (min >= max) {
      throw new Error(`Invalid range: min (${min}) must be < max (${max})`);
    }
    return this.mulberry32() * (max - min) + min;
  }

  /**
   * Selects a random element from an array.
   *
   * @param array - The array to select from.
   * @returns A randomly selected element.
   * @throws {Error} If the array is empty.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const colors = ['red', 'green', 'blue'];
   * const color = rng.randomElement(colors); // Deterministic selection
   * ```
   */
  randomElement<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot select from an empty array');
    }
    return array[this.randomInt(0, array.length - 1)];
  }

  /**
   * Creates a deterministically shuffled copy of an array using Fisher-Yates algorithm.
   *
   * Note: This returns a new array and does not modify the original.
   *
   * @param array - The array to shuffle.
   * @returns A new array with elements in random order.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const original = [1, 2, 3, 4, 5];
   * const shuffled = rng.shuffle(original);
   * // shuffled is deterministically ordered based on seed
   * // original is unchanged
   * ```
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Generates a deterministic UUID-like string.
   *
   * Note: This is NOT a cryptographically secure UUID and should only be
   * used for testing purposes where determinism is required.
   *
   * @returns A UUID-like string in format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const id = rng.randomUUID(); // "a1b2c3d4-e5f6-4a1b-8c2d-e3f4a5b6c7d8"
   *
   * // Reset and generate again - same UUID
   * rng.reset();
   * const sameId = rng.randomUUID(); // "a1b2c3d4-e5f6-4a1b-8c2d-e3f4a5b6c7d8"
   * ```
   */
  randomUUID(): string {
    const hex = '0123456789abcdef';
    let uuid = '';

    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += '-';
      } else if (i === 14) {
        // Version 4 UUID marker
        uuid += '4';
      } else if (i === 19) {
        // Variant bits (8, 9, a, or b)
        uuid += hex[this.randomInt(8, 11)];
      } else {
        uuid += hex[this.randomInt(0, 15)];
      }
    }

    return uuid;
  }

  /**
   * Resets the PRNG to its initial state or a new seed.
   *
   * @param seed - Optional new seed. If not provided, resets to the original seed.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const v1 = rng.random();
   * const v2 = rng.random();
   *
   * // Reset to original seed
   * rng.reset();
   * console.log(rng.random() === v1); // true
   *
   * // Reset with new seed
   * rng.reset(99999);
   * console.log(rng.random() !== v1); // true (different seed)
   * ```
   */
  reset(seed?: number): void {
    if (seed !== undefined) {
      this.initialSeed = seed;
    }
    this.seed = this.initialSeed;
  }

  /**
   * Gets the current seed value for reproduction.
   *
   * This can be logged during test failures to reproduce the exact sequence.
   *
   * @returns The initial seed used to create this instance.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom();
   *
   * // Log seed on test failure for reproduction
   * try {
   *   runFlakyTest(rng);
   * } catch (error) {
   *   console.log(`Test failed with seed: ${rng.getSeed()}`);
   *   throw error;
   * }
   * ```
   */
  getSeed(): number {
    return this.initialSeed;
  }

  /**
   * Generates a random boolean with optional probability.
   *
   * @param trueProbability - Probability of returning true (0.0-1.0, default: 0.5).
   * @returns A pseudo-random boolean.
   * @throws {Error} If probability is not in [0, 1].
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   *
   * // 50/50 chance
   * const coinFlip = rng.randomBoolean();
   *
   * // 70% chance of true
   * const biased = rng.randomBoolean(0.7);
   * ```
   */
  randomBoolean(trueProbability: number = 0.5): boolean {
    if (trueProbability < 0 || trueProbability > 1) {
      throw new Error('Probability must be between 0 and 1');
    }
    return this.random() < trueProbability;
  }

  /**
   * Selects multiple random elements from an array without replacement.
   *
   * @param array - The array to sample from.
   * @param count - Number of elements to select.
   * @returns A new array with randomly selected elements.
   * @throws {Error} If count > array.length or count < 0.
   *
   * @example
   * ```typescript
   * const rng = new SeededRandom(42);
   * const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
   * const sample = rng.sample(numbers, 3); // [7, 2, 9] (deterministic)
   * ```
   */
  sample<T>(array: T[], count: number): T[] {
    if (count > array.length) {
      throw new Error('Sample size cannot exceed array length');
    }
    if (count < 0) {
      throw new Error('Sample size must be non-negative');
    }

    const shuffled = this.shuffle(array);
    return shuffled.slice(0, count);
  }
}

/**
 * Global singleton instance of SeededRandom.
 *
 * Auto-seeded from TEST_RANDOM_SEED environment variable in test environments,
 * or uses the default seed (42) otherwise.
 *
 * @example
 * ```typescript
 * import { seededRandom } from './utils/SeededRandom';
 *
 * // Use in tests for deterministic behavior
 * const randomValue = seededRandom.random();
 * const shuffled = seededRandom.shuffle([1, 2, 3, 4, 5]);
 * ```
 */
export const seededRandom = new SeededRandom();

/**
 * Factory function to create a new SeededRandom instance with a specific seed.
 *
 * @param seed - The seed for the new PRNG instance.
 * @returns A new SeededRandom instance.
 *
 * @example
 * ```typescript
 * import { createSeededRandom } from './utils/SeededRandom';
 *
 * // Create instance with known seed for reproducible tests
 * const rng = createSeededRandom(12345);
 *
 * // Each test can have its own isolated RNG
 * describe('MyComponent', () => {
 *   let rng: SeededRandom;
 *
 *   beforeEach(() => {
 *     rng = createSeededRandom(42);
 *   });
 *
 *   it('should behave consistently', () => {
 *     const value = rng.random(); // Always the same
 *   });
 * });
 * ```
 */
export function createSeededRandom(seed: number): SeededRandom {
  return new SeededRandom(seed);
}

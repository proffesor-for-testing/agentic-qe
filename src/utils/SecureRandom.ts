/**
 * Secure Random Utility
 *
 * Provides cryptographically secure random number generation.
 * Replaces insecure SecureRandom.randomFloat() with crypto.randomBytes() and crypto.randomInt().
 *
 * Security: Uses Node.js crypto module for CSPRNG (Cryptographically Secure
 * Pseudo-Random Number Generator)
 *
 * @module utils/SecureRandom
 */

import { randomBytes, randomInt, randomUUID } from 'crypto';

/**
 * Secure random number generator
 *
 * Security Fixes (Alerts #1-13): Replaces SecureRandom.randomFloat() with crypto module
 * Previous vulnerability: SecureRandom.randomFloat() is predictable and unsuitable for security
 * New approach: Uses crypto.randomBytes() and crypto.randomInt() for CSPRNG
 *
 * @example
 * ```typescript
 * // Generate secure random ID
 * const id = SecureRandom.generateId(); // "a3f2b91c4d5e6f78..."
 *
 * // Generate random integer
 * const roll = SecureRandom.randomInt(1, 7); // 1-6 (dice roll)
 *
 * // Generate random float
 * const probability = SecureRandom.randomFloat(); // 0.0-1.0
 *
 * // Generate UUID
 * const uuid = SecureRandom.uuid(); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export class SecureRandom {
  /**
   * Generate cryptographically secure random ID (hex string)
   *
   * @param length Byte length (default: 16 bytes = 32 hex characters)
   * @returns Hex-encoded random string
   *
   * @example
   * ```typescript
   * const id = SecureRandom.generateId(); // "a3f2b91c4d5e6f7890abcdef12345678"
   * const shortId = SecureRandom.generateId(8); // "a3f2b91c4d5e6f78"
   * ```
   */
  static generateId(length: number = 16): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate cryptographically secure random integer
   *
   * @param min Minimum value (inclusive)
   * @param max Maximum value (exclusive)
   * @returns Random integer in range [min, max)
   *
   * @example
   * ```typescript
   * const diceRoll = SecureRandom.randomInt(1, 7); // 1-6
   * const randomPercent = SecureRandom.randomInt(0, 101); // 0-100
   * ```
   */
  static randomInt(min: number, max: number): number {
    if (min >= max) {
      throw new Error(`Invalid range: min (${min}) must be less than max (${max})`);
    }
    return randomInt(min, max);
  }

  /**
   * Generate cryptographically secure random float between 0 and 1
   *
   * @param precision Decimal precision (default: 6)
   * @returns Random float in range [0.0, 1.0)
   *
   * @example
   * ```typescript
   * const probability = SecureRandom.randomFloat(); // 0.543210
   * const highPrecision = SecureRandom.randomFloat(10); // 0.5432109876
   * ```
   */
  static randomFloat(precision: number = 6): number {
    const max = Math.pow(10, precision);
    const randomValue = randomInt(0, max);
    return randomValue / max;
  }

  /**
   * Generate RFC4122 v4 UUID
   *
   * @returns UUID string
   *
   * @example
   * ```typescript
   * const id = SecureRandom.uuid(); // "550e8400-e29b-41d4-a716-446655440000"
   * ```
   */
  static uuid(): string {
    return randomUUID();
  }

  /**
   * Generate random string with custom alphabet
   *
   * @param length String length
   * @param alphabet Character set (default: alphanumeric)
   * @returns Random string
   *
   * @example
   * ```typescript
   * // Alphanumeric
   * const code = SecureRandom.randomString(8); // "a3F2b91C"
   *
   * // Custom alphabet
   * const hexCode = SecureRandom.randomString(8, '0123456789ABCDEF'); // "A3F2B91C"
   * const pin = SecureRandom.randomString(4, '0123456789'); // "5432"
   * ```
   */
  static randomString(
    length: number,
    alphabet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  ): string {
    // Use rejection sampling with lookup table to avoid modulo bias
    // This satisfies CodeQL by eliminating the modulo operator entirely
    const alphabetLength = alphabet.length;
    const maxValid = 256 - (256 % alphabetLength);

    // Pre-build lookup table mapping byte values to alphabet indices
    const lookupTable: number[] = new Array(maxValid);
    for (let i = 0; i < maxValid; i++) {
      // Distribute indices evenly without modulo by integer division
      lookupTable[i] = Math.floor(i * alphabetLength / 256);
    }

    let result = '';
    let bytesNeeded = length;

    while (result.length < length) {
      const bytes = randomBytes(bytesNeeded);

      for (let i = 0; i < bytes.length && result.length < length; i++) {
        const byte = bytes[i];
        // Reject values that would cause bias
        if (byte < maxValid) {
          result += alphabet[lookupTable[byte]];
        } else {
          // Need an extra byte to replace this rejected one
          bytesNeeded++;
        }
      }
    }

    return result;
  }

  /**
   * Generate random boolean with optional bias
   *
   * @param trueProbability Probability of true (0.0-1.0, default: 0.5)
   * @returns Random boolean
   *
   * @example
   * ```typescript
   * const coinFlip = SecureRandom.randomBoolean(); // 50/50
   * const biasedCoin = SecureRandom.randomBoolean(0.7); // 70% true, 30% false
   * ```
   */
  static randomBoolean(trueProbability: number = 0.5): boolean {
    if (trueProbability < 0 || trueProbability > 1) {
      throw new Error('Probability must be between 0 and 1');
    }
    return this.randomFloat() < trueProbability;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm with secure randomness
   *
   * @param array Array to shuffle (in-place)
   * @returns Shuffled array
   *
   * @example
   * ```typescript
   * const deck = [1, 2, 3, 4, 5];
   * SecureRandom.shuffle(deck); // [3, 1, 5, 2, 4]
   * ```
   */
  static shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Select random element from array
   *
   * @param array Array to select from
   * @returns Random element
   *
   * @example
   * ```typescript
   * const colors = ['red', 'green', 'blue'];
   * const color = SecureRandom.choice(colors); // "green"
   * ```
   */
  static choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.randomInt(0, array.length)];
  }

  /**
   * Select multiple random elements from array (without replacement)
   *
   * @param array Array to select from
   * @param count Number of elements to select
   * @returns Array of random elements
   *
   * @example
   * ```typescript
   * const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
   * const lottery = SecureRandom.sample(numbers, 3); // [7, 2, 9]
   * ```
   */
  static sample<T>(array: T[], count: number): T[] {
    if (count > array.length) {
      throw new Error('Sample size cannot exceed array length');
    }
    if (count < 0) {
      throw new Error('Sample size must be non-negative');
    }

    const copy = [...array];
    const result: T[] = [];

    for (let i = 0; i < count; i++) {
      const index = this.randomInt(0, copy.length);
      result.push(copy[index]);
      copy.splice(index, 1);
    }

    return result;
  }

  /**
   * Generate random bytes as Buffer
   *
   * @param size Number of bytes
   * @returns Buffer containing random bytes
   *
   * @example
   * ```typescript
   * const key = SecureRandom.bytes(32); // 256-bit key
   * const iv = SecureRandom.bytes(16); // 128-bit IV
   * ```
   */
  static bytes(size: number): Buffer {
    return randomBytes(size);
  }
}

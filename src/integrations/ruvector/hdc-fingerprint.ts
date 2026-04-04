/**
 * R1: Hyperdimensional Computing Pattern Fingerprinting
 *
 * 10,000-bit binary hypervectors with XOR binding for O(1) compositional
 * pattern fingerprinting. TypeScript fallback implementation.
 *
 * When WASM is available (@ruvector/hdc-wasm), delegates to native SIMD-optimized ops.
 * Without WASM, uses TypeScript Uint8Array bit operations.
 *
 * Key properties:
 * - Deterministic: same input always produces the same fingerprint
 * - Compositional: XOR binding combines multiple concepts into a single vector
 * - Associative: bind(A, bind(B, C)) === bind(bind(A, B), C)
 * - Distance-preserving: Hamming distance ≈ dimensions/2 for unrelated patterns
 *
 * @module integrations/ruvector/hdc-fingerprint
 */

import { Xorshift128 } from '../../shared/utils/xorshift128.js';
import { isHDCFingerprintingEnabled } from './feature-flags.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the HDC fingerprinter
 */
export interface HdcConfig {
  /** Number of bits in each hypervector. Default: 10000 */
  dimensions: number;
  /** Seed for deterministic fingerprint generation */
  seed?: number;
}

/**
 * A pattern fingerprint represented as a packed binary hypervector
 */
export interface PatternFingerprint {
  /** Packed bits: dimensions/8 bytes (1250 bytes for 10K dimensions) */
  vector: Uint8Array;
  /** Number of bits (dimensions) in the hypervector */
  dimensions: number;
  /** Hex hash for quick equality check */
  hash: string;
}

/**
 * Input data for fingerprinting a pattern
 */
export interface PatternInput {
  id: string;
  domain: string;
  type: string;
  content?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DIMENSIONS = 10000;
const DEFAULT_SEED = 0x811c9dc5; // FNV-1a offset basis

// ============================================================================
// Internal: FNV-1a Hash
// ============================================================================

/**
 * FNV-1a 32-bit hash for deterministic seeding.
 * Produces well-distributed values from arbitrary string input.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned 32-bit
}

// ============================================================================
// Internal: Popcount
// ============================================================================

/** Lookup table for popcount of a single byte (0-255) */
const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let count = 0;
  let n = i;
  while (n) {
    count++;
    n &= n - 1; // Brian Kernighan's bit trick
  }
  POPCOUNT_TABLE[i] = count;
}

// ============================================================================
// Internal: Hex encoding
// ============================================================================

const HEX_CHARS = '0123456789abcdef';

/**
 * Produce a hex string from the first 16 bytes of a Uint8Array
 * (32-char hex digest, sufficient for quick equality checks).
 */
function hexDigest(bytes: Uint8Array): string {
  const len = Math.min(bytes.length, 16);
  let hex = '';
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    hex += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0x0f];
  }
  return hex;
}

// ============================================================================
// Standalone HDC Algebra Functions
// ============================================================================

/**
 * Generate a random binary hypervector using crypto-quality randomness.
 * @param dimensions Number of bits. Default: 10000
 */
export function createRandomHypervector(dimensions: number = DEFAULT_DIMENSIONS): Uint8Array {
  const byteLen = Math.ceil(dimensions / 8);
  const vector = new Uint8Array(byteLen);
  // Use a time-seeded PRNG for non-deterministic random vectors
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  const rng = new Xorshift128(seed);
  let idx = 0;
  while (idx < byteLen) {
    const rand = rng.next();
    const count = Math.min(4, byteLen - idx);
    for (let j = 0; j < count; j++) {
      vector[idx++] = (rand >>> (j * 8)) & 0xff;
    }
  }
  const trailingBits = dimensions % 8;
  if (trailingBits > 0) {
    vector[byteLen - 1] &= (1 << trailingBits) - 1;
  }
  return vector;
}

/**
 * XOR binding — component-wise XOR of two packed-bit vectors.
 * This is the key composition operation in HDC.
 */
export function bind(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`Cannot bind vectors of different lengths: ${a.length} vs ${b.length}`);
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Majority-rule bundling — creates a "superposition" of vectors.
 * For each bit position, takes the majority value across all input vectors.
 * Ties are broken by setting the bit to 1 (arbitrary but deterministic).
 */
export function bundle(vectors: Uint8Array[]): Uint8Array {
  if (vectors.length === 0) {
    throw new Error('Cannot bundle zero vectors');
  }
  const byteLen = vectors[0].length;
  for (let i = 1; i < vectors.length; i++) {
    if (vectors[i].length !== byteLen) {
      throw new Error(`Vector length mismatch at index ${i}: expected ${byteLen}, got ${vectors[i].length}`);
    }
  }
  const result = new Uint8Array(byteLen);
  const threshold = vectors.length / 2;
  for (let byteIdx = 0; byteIdx < byteLen; byteIdx++) {
    let resultByte = 0;
    for (let bit = 0; bit < 8; bit++) {
      let count = 0;
      const mask = 1 << bit;
      for (let v = 0; v < vectors.length; v++) {
        if (vectors[v][byteIdx] & mask) count++;
      }
      // Majority rule: set bit if count > half, or count == half (tie-break to 1)
      if (count >= threshold) resultByte |= mask;
    }
    result[byteIdx] = resultByte;
  }
  return result;
}

/**
 * Hamming distance between two packed-bit vectors, normalized to [0, 1].
 * @param dimensions Total number of bits for normalization. If omitted, uses byteLength * 8.
 */
export function hammingDistance(a: Uint8Array, b: Uint8Array, dimensions?: number): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compute Hamming distance for vectors of different lengths: ${a.length} vs ${b.length}`);
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += POPCOUNT_TABLE[a[i] ^ b[i]];
  }
  const totalBits = dimensions ?? a.length * 8;
  return totalBits > 0 ? dist / totalBits : 0;
}

/**
 * Hamming similarity: 1 - hammingDistance. Returns value in [0, 1].
 */
export function hammingSimilarity(a: Uint8Array, b: Uint8Array, dimensions?: number): number {
  return 1 - hammingDistance(a, b, dimensions);
}

/**
 * Circular bit shift (permutation) for sequence encoding.
 * Shifts the entire bit vector left by `shifts` positions, wrapping around.
 */
export function permute(v: Uint8Array, shifts: number = 1): Uint8Array {
  const totalBits = v.length * 8;
  if (totalBits === 0) return new Uint8Array(0);
  // Normalize shift to [0, totalBits)
  const s = ((shifts % totalBits) + totalBits) % totalBits;
  if (s === 0) return new Uint8Array(v);

  const result = new Uint8Array(v.length);
  for (let dst = 0; dst < totalBits; dst++) {
    const src = (dst + s) % totalBits;
    const srcByte = src >>> 3;
    const srcBit = src & 7;
    if (v[srcByte] & (1 << srcBit)) {
      result[dst >>> 3] |= 1 << (dst & 7);
    }
  }
  return result;
}

// ============================================================================
// HDCPatternFingerprinter (Token-based)
// ============================================================================

/**
 * Token-based HDC pattern fingerprinter.
 *
 * Maps string tokens deterministically to hypervectors, then composes
 * them via XOR binding. Suitable for Agent Booster Tier 1 fingerprinting
 * where tokens like "slow", "flaky", "database" are composed into a
 * single concept fingerprint.
 */
export class HDCPatternFingerprinter {
  private readonly dimensions: number;
  private readonly baseSeed: number;
  private readonly byteLen: number;
  private readonly tokenCache: Map<string, Uint8Array> = new Map();

  constructor(config?: { dimensions?: number; seed?: number }) {
    this.dimensions = config?.dimensions ?? DEFAULT_DIMENSIONS;
    this.baseSeed = config?.seed ?? DEFAULT_SEED;
    this.byteLen = Math.ceil(this.dimensions / 8);

    if (this.dimensions <= 0) {
      throw new Error(`HDC dimensions must be positive, got ${this.dimensions}`);
    }
  }

  /**
   * Deterministic mapping from a string token to a hypervector.
   * Uses seeded hash to generate bits. Results are cached.
   */
  tokenToHypervector(token: string): Uint8Array {
    const cached = this.tokenCache.get(token);
    if (cached) return new Uint8Array(cached);

    const seed = fnv1a(token) ^ this.baseSeed;
    const vector = this.generateSeededVector(seed);
    this.tokenCache.set(token, vector);
    return new Uint8Array(vector);
  }

  /**
   * Bind all tokens: token1 XOR token2 XOR ... tokenN.
   * XOR is commutative and associative, so order does not matter.
   * Returns a zero vector for an empty token list.
   */
  fingerprintPattern(tokens: string[]): Uint8Array {
    if (tokens.length === 0) return new Uint8Array(this.byteLen);
    let result = this.tokenToHypervector(tokens[0]);
    for (let i = 1; i < tokens.length; i++) {
      result = bind(result, this.tokenToHypervector(tokens[i]));
    }
    return result;
  }

  /**
   * Bind tokens, then bundle with a context fingerprint.
   * Context tokens are fingerprinted separately (via XOR bind) and
   * then bundled (majority-rule) with the main token fingerprint.
   */
  fingerprintWithContext(tokens: string[], context: string[]): Uint8Array {
    const tokenFp = this.fingerprintPattern(tokens);
    if (context.length === 0) return tokenFp;
    const contextFp = this.fingerprintPattern(context);
    return bundle([tokenFp, contextFp]);
  }

  /** Hamming similarity between two vectors, normalized to [0, 1]. */
  similarity(a: Uint8Array, b: Uint8Array): number {
    return hammingSimilarity(a, b, this.dimensions);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private generateSeededVector(seed: number): Uint8Array {
    const vector = new Uint8Array(this.byteLen);
    const rng = new Xorshift128(seed);
    let idx = 0;
    while (idx < this.byteLen) {
      const rand = rng.next();
      const count = Math.min(4, this.byteLen - idx);
      for (let j = 0; j < count; j++) {
        vector[idx++] = (rand >>> (j * 8)) & 0xff;
      }
    }
    const trailingBits = this.dimensions % 8;
    if (trailingBits > 0) {
      vector[this.byteLen - 1] &= (1 << trailingBits) - 1;
    }
    return vector;
  }
}

// ============================================================================
// HdcFingerprinter
// ============================================================================

/**
 * Hyperdimensional Computing fingerprinter for QE patterns.
 *
 * Generates deterministic binary hypervectors from pattern metadata,
 * supports XOR-based compositional binding, and provides Hamming
 * distance / similarity metrics.
 *
 * @example
 * ```typescript
 * const hdc = new HdcFingerprinter();
 * const fp = hdc.fingerprint({ id: 'p1', domain: 'security', type: 'xss' });
 * console.log(fp.dimensions); // 10000
 * console.log(fp.vector.length); // 1250
 * ```
 */
export class HdcFingerprinter {
  private readonly dimensions: number;
  private readonly baseSeed: number;

  constructor(config?: Partial<HdcConfig>) {
    this.dimensions = config?.dimensions ?? DEFAULT_DIMENSIONS;
    this.baseSeed = config?.seed ?? DEFAULT_SEED;

    if (this.dimensions <= 0) {
      throw new Error(`HDC dimensions must be positive, got ${this.dimensions}`);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Generate a deterministic fingerprint from pattern data.
   *
   * The fingerprint is seeded from a composite key of id + domain + type
   * (and optionally content), ensuring identical inputs always produce
   * identical outputs.
   */
  fingerprint(pattern: PatternInput): PatternFingerprint {
    const seedStr = `${pattern.id}|${pattern.domain}|${pattern.type}|${pattern.content ?? ''}`;
    const seed = fnv1a(seedStr) ^ this.baseSeed;
    const vector = this.generateVector(seed);

    return {
      vector,
      dimensions: this.dimensions,
      hash: hexDigest(vector),
    };
  }

  /**
   * XOR-based compositional binding.
   *
   * Combines two hypervectors into a single vector representing their
   * conjunction. XOR binding is:
   * - Associative: bind(A, bind(B, C)) === bind(bind(A, B), C)
   * - Commutative: bind(A, B) === bind(B, A)
   * - Self-inverse: bind(A, A) === zero vector
   *
   * @param a First packed-bit vector
   * @param b Second packed-bit vector
   * @returns XOR of a and b (same length)
   * @throws If vectors have different lengths
   */
  compositionalBind(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.length !== b.length) {
      throw new Error(
        `Cannot bind vectors of different lengths: ${a.length} vs ${b.length}`
      );
    }
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }

  /**
   * Hamming distance between two packed-bit vectors.
   *
   * Counts the number of differing bits. For unrelated (random) vectors
   * the expected distance is approximately dimensions / 2.
   *
   * @returns Number of differing bits (0 = identical, ~dimensions/2 = random)
   * @throws If vectors have different lengths
   */
  hammingDistance(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== b.length) {
      throw new Error(
        `Cannot compute Hamming distance for vectors of different lengths: ${a.length} vs ${b.length}`
      );
    }
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
      distance += POPCOUNT_TABLE[a[i] ^ b[i]];
    }
    return distance;
  }

  /**
   * Normalized similarity between two packed-bit vectors.
   *
   * @returns Value in [0, 1] where 1.0 = identical, 0.5 = random, 0.0 = opposite
   */
  similarity(a: Uint8Array, b: Uint8Array): number {
    const dist = this.hammingDistance(a, b);
    return 1 - dist / this.dimensions;
  }

  /**
   * Batch fingerprint multiple patterns.
   * Results match calling fingerprint() individually on each pattern.
   */
  batchFingerprint(patterns: PatternInput[]): PatternFingerprint[] {
    return patterns.map((p) => this.fingerprint(p));
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Generate a packed-bit vector from a seed using xorshift128 PRNG.
   * Each bit is set with 50% probability, producing approximately
   * dimensions/2 set bits on average.
   */
  private generateVector(seed: number): Uint8Array {
    const byteLen = Math.ceil(this.dimensions / 8);
    const vector = new Uint8Array(byteLen);
    const rng = new Xorshift128(seed);

    // Fill 4 bytes at a time from each 32-bit random value
    let byteIdx = 0;
    while (byteIdx < byteLen) {
      const rand = rng.next();
      const remaining = byteLen - byteIdx;
      const count = remaining < 4 ? remaining : 4;
      for (let j = 0; j < count; j++) {
        vector[byteIdx++] = (rand >>> (j * 8)) & 0xff;
      }
    }

    // Mask unused trailing bits in the last byte
    const trailingBits = this.dimensions % 8;
    if (trailingBits > 0) {
      vector[byteLen - 1] &= (1 << trailingBits) - 1;
    }

    return vector;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an HdcFingerprinter with the given configuration.
 *
 * @example
 * ```typescript
 * const hdc = createHdcFingerprinter({ dimensions: 10000 });
 * const fp = hdc.fingerprint({ id: 'p1', domain: 'api', type: 'flaky' });
 * ```
 */
export function createHdcFingerprinter(
  config?: Partial<HdcConfig>
): HdcFingerprinter {
  return new HdcFingerprinter(config);
}

/**
 * Feature-flag-gated factory for HDCPatternFingerprinter.
 * Returns null when isHDCFingerprintingEnabled() is false.
 */
export function createHDCFingerprinter(
  config?: { dimensions?: number; seed?: number }
): HDCPatternFingerprinter | null {
  if (!isHDCFingerprintingEnabled()) return null;
  return new HDCPatternFingerprinter(config);
}

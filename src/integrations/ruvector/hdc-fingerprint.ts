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
// Internal: Xorshift128 PRNG
// ============================================================================

/**
 * Xorshift128 pseudo-random number generator.
 * Seeded deterministically from a 32-bit value.
 * Produces uniform 32-bit unsigned integers.
 */
class Xorshift128 {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    // Splitmix32 to expand seed into 4 state words
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

  /** Returns a pseudo-random unsigned 32-bit integer */
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

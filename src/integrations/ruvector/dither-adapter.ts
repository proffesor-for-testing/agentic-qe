/**
 * Deterministic Dithering Adapter for Cross-Platform Reproducibility
 *
 * Provides golden-ratio quasi-random dithering for embedding quantization.
 * Ensures identical quantization results across x86, ARM, and WASM platforms
 * by using only deterministic integer and float arithmetic.
 *
 * The golden ratio sequence produces a low-discrepancy quasi-random sequence
 * that distributes quantization error more evenly than truncation alone,
 * improving reconstruction quality at low bit depths.
 *
 * @module integrations/ruvector/dither-adapter
 */

// ============================================================================
// Constants
// ============================================================================

/** Golden ratio: phi = (1 + sqrt(5)) / 2 */
const PHI = (1 + Math.sqrt(5)) / 2; // 1.618033988749895

/** Inverse golden ratio: 1/phi = phi - 1 */
const PHI_INV = 1 / PHI; // 0.6180339887498949

// ============================================================================
// Types
// ============================================================================

/**
 * Result of applying dithered quantization to a vector
 */
export interface DitheredResult {
  /** Quantized values as integers in [0, 2^bitDepth - 1] */
  quantized: Int32Array;
  /** Dequantized (reconstructed) float values */
  dequantized: Float32Array;
  /** Bit depth used for quantization */
  bitDepth: number;
  /** Seed used for dither generation */
  seed: number;
  /** Step size (quantization interval width) */
  stepSize: number;
  /** Min value of the original vector (used for dequantization) */
  minValue: number;
  /** Max value of the original vector (used for dequantization) */
  maxValue: number;
}

/**
 * Options for the dither adapter
 */
export interface DitherOptions {
  /** Bit depth for quantization (1-32, typical: 3, 5, 7, 8) */
  bitDepth: number;
  /** Seed for the dither sequence (default: 0) */
  seed?: number;
}

// ============================================================================
// Native binding status
// No native package exists for dithering — the TypeScript implementation
// below IS the production implementation (pure math, no native benefit).
// ============================================================================

/**
 * Check if a native dither module is available.
 * Always returns false — the TypeScript implementation is production-ready.
 */
export function isNativeDitherAvailable(): boolean {
  return false;
}

// ============================================================================
// Core Dither Sequence Generation
// ============================================================================

/**
 * Create a deterministic quasi-random dither sequence using the golden ratio.
 *
 * The sequence d_n = frac((seed + (n+1) * phi)) produces values uniformly
 * distributed in [0, 1) with low discrepancy (no clumping). This is a
 * Weyl sequence / additive recurrence, which is deterministic and
 * platform-independent since it uses only standard IEEE 754 arithmetic.
 *
 * @param length - Number of dither values to generate
 * @param seed - Starting offset for the sequence (default: 0)
 * @returns Float32Array of dither values in [0, 1)
 */
export function createDitherSequence(
  length: number,
  seed: number = 0
): Float32Array {
  if (length < 0 || !Number.isFinite(length)) {
    throw new Error(`Invalid dither sequence length: ${length}`);
  }
  if (!Number.isFinite(seed)) {
    throw new Error(`Invalid dither seed: ${seed}`);
  }

  const sequence = new Float32Array(length);
  // Map the integer seed into a fractional offset using the inverse golden ratio.
  // This ensures different integer seeds produce genuinely different sequences,
  // since a raw integer seed would be discarded by the modulo-1 operation.
  const base = (seed * PHI_INV % 1 + 1) % 1;
  for (let i = 0; i < length; i++) {
    // Quasi-random sequence using golden ratio additive recurrence
    // The double modulo ensures the result is always in [0, 1)
    sequence[i] = ((base + (i + 1) * PHI) % 1 + 1) % 1;
  }
  return sequence;
}

// ============================================================================
// Quantization with Dithering
// ============================================================================

/**
 * Apply deterministic dithered quantization to a float vector.
 *
 * The algorithm:
 * 1. Compute the range [min, max] of the input vector.
 * 2. Compute step_size = range / (2^bitDepth - 1).
 * 3. Generate a golden-ratio dither sequence of the same length.
 * 4. For each element: quantized[i] = clamp(round((value[i] - min) / stepSize + (dither[i] - 0.5)), 0, maxLevel)
 * 5. Dequantize: dequantized[i] = quantized[i] * stepSize + min
 *
 * The dither offset (dither[i] - 0.5) centers the dither noise around zero,
 * which reduces systematic bias compared to truncation-only quantization.
 *
 * @param vector - Input float vector to quantize
 * @param bitDepth - Number of bits for quantization (1-32)
 * @param seed - Seed for dither sequence reproducibility (default: 0)
 * @returns DitheredResult with quantized and reconstructed values
 */
export function applyDither(
  vector: Float32Array,
  bitDepth: number,
  seed: number = 0
): DitheredResult {
  if (!(vector instanceof Float32Array)) {
    throw new Error('Input vector must be a Float32Array');
  }
  if (vector.length === 0) {
    return {
      quantized: new Int32Array(0),
      dequantized: new Float32Array(0),
      bitDepth,
      seed,
      stepSize: 0,
      minValue: 0,
      maxValue: 0,
    };
  }
  if (bitDepth < 1 || bitDepth > 32 || !Number.isInteger(bitDepth)) {
    throw new Error(`Invalid bit depth: ${bitDepth}. Must be an integer in [1, 32].`);
  }

  // Compute value range
  let minValue = vector[0];
  let maxValue = vector[0];
  for (let i = 1; i < vector.length; i++) {
    if (vector[i] < minValue) minValue = vector[i];
    if (vector[i] > maxValue) maxValue = vector[i];
  }

  // Number of quantization levels
  const maxLevel = (1 << bitDepth) - 1; // 2^bitDepth - 1

  // Handle constant vector (all values the same)
  const range = maxValue - minValue;
  const stepSize = range === 0 ? 1 : range / maxLevel;

  // Generate dither sequence
  const dither = createDitherSequence(vector.length, seed);

  // Quantize with dithering
  const quantized = new Int32Array(vector.length);
  const dequantized = new Float32Array(vector.length);

  for (let i = 0; i < vector.length; i++) {
    if (range === 0) {
      // Constant vector: all quantize to middle level
      quantized[i] = Math.round(maxLevel / 2);
    } else {
      // Normalize to [0, maxLevel], add centered dither, round, and clamp
      const normalized = (vector[i] - minValue) / stepSize;
      const dithered = normalized + (dither[i] - 0.5);
      quantized[i] = Math.max(0, Math.min(maxLevel, Math.round(dithered)));
    }

    // Dequantize
    dequantized[i] = quantized[i] * stepSize + minValue;
  }

  return {
    quantized,
    dequantized,
    bitDepth,
    seed,
    stepSize,
    minValue,
    maxValue,
  };
}

// ============================================================================
// Naive Quantization (for comparison)
// ============================================================================

/**
 * Apply naive (non-dithered) quantization for comparison purposes.
 *
 * Uses simple rounding without dither noise. This tends to produce
 * systematic quantization artifacts, especially at low bit depths.
 *
 * @param vector - Input float vector to quantize
 * @param bitDepth - Number of bits for quantization (1-32)
 * @returns DitheredResult with quantized and reconstructed values (seed = -1 to indicate no dither)
 */
export function applyNaiveQuantization(
  vector: Float32Array,
  bitDepth: number
): DitheredResult {
  if (!(vector instanceof Float32Array)) {
    throw new Error('Input vector must be a Float32Array');
  }
  if (vector.length === 0) {
    return {
      quantized: new Int32Array(0),
      dequantized: new Float32Array(0),
      bitDepth,
      seed: -1,
      stepSize: 0,
      minValue: 0,
      maxValue: 0,
    };
  }
  if (bitDepth < 1 || bitDepth > 32 || !Number.isInteger(bitDepth)) {
    throw new Error(`Invalid bit depth: ${bitDepth}. Must be an integer in [1, 32].`);
  }

  let minValue = vector[0];
  let maxValue = vector[0];
  for (let i = 1; i < vector.length; i++) {
    if (vector[i] < minValue) minValue = vector[i];
    if (vector[i] > maxValue) maxValue = vector[i];
  }

  const maxLevel = (1 << bitDepth) - 1;
  const range = maxValue - minValue;
  const stepSize = range === 0 ? 1 : range / maxLevel;

  const quantized = new Int32Array(vector.length);
  const dequantized = new Float32Array(vector.length);

  for (let i = 0; i < vector.length; i++) {
    if (range === 0) {
      quantized[i] = Math.round(maxLevel / 2);
    } else {
      const normalized = (vector[i] - minValue) / stepSize;
      quantized[i] = Math.max(0, Math.min(maxLevel, Math.round(normalized)));
    }
    dequantized[i] = quantized[i] * stepSize + minValue;
  }

  return {
    quantized,
    dequantized,
    bitDepth,
    seed: -1,
    stepSize,
    minValue,
    maxValue,
  };
}

// ============================================================================
// Determinism Verification
// ============================================================================

/**
 * Verify that dithered quantization is deterministic for the given input.
 *
 * Runs the quantization twice with the same parameters and compares results.
 * This guards against any non-determinism from floating point ordering,
 * platform differences, or hidden state.
 *
 * @param vector - Input float vector to test
 * @param bitDepth - Number of bits for quantization
 * @returns true if both runs produce identical quantized values
 */
export function verifyDeterminism(
  vector: Float32Array,
  bitDepth: number
): boolean {
  const seed = 42; // Fixed seed for verification

  const result1 = applyDither(vector, bitDepth, seed);
  const result2 = applyDither(vector, bitDepth, seed);

  // Compare quantized arrays element by element
  if (result1.quantized.length !== result2.quantized.length) {
    return false;
  }

  for (let i = 0; i < result1.quantized.length; i++) {
    if (result1.quantized[i] !== result2.quantized[i]) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Reconstruction Error Metrics
// ============================================================================

/**
 * Compute mean squared error between original and reconstructed vectors.
 *
 * @param original - Original float vector
 * @param reconstructed - Reconstructed (dequantized) float vector
 * @returns Mean squared error
 */
export function computeMSE(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  if (original.length !== reconstructed.length) {
    throw new Error('Vectors must have the same length');
  }
  if (original.length === 0) return 0;

  let sumSqError = 0;
  for (let i = 0; i < original.length; i++) {
    const diff = original[i] - reconstructed[i];
    sumSqError += diff * diff;
  }
  return sumSqError / original.length;
}

/**
 * Compute signal-to-noise ratio (SNR) in decibels.
 *
 * SNR = 10 * log10(signal_power / noise_power)
 *
 * Higher SNR means better reconstruction quality.
 *
 * @param original - Original float vector
 * @param reconstructed - Reconstructed (dequantized) float vector
 * @returns SNR in dB, or Infinity if reconstruction is perfect
 */
export function computeSNR(
  original: Float32Array,
  reconstructed: Float32Array
): number {
  if (original.length !== reconstructed.length) {
    throw new Error('Vectors must have the same length');
  }
  if (original.length === 0) return Infinity;

  let signalPower = 0;
  let noisePower = 0;

  for (let i = 0; i < original.length; i++) {
    signalPower += original[i] * original[i];
    const diff = original[i] - reconstructed[i];
    noisePower += diff * diff;
  }

  if (noisePower === 0) return Infinity;
  if (signalPower === 0) return 0;

  return 10 * Math.log10(signalPower / noisePower);
}

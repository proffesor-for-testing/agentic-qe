/**
 * Agentic QE v3 - Embedding Utilities
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Pure functions for embedding manipulation: resizing, hashing,
 * and normalization. Used by QEReasoningBank.embed().
 */

// ============================================================================
// Embedding Resize
// ============================================================================

/**
 * Resize an embedding vector to a target dimension using averaging (downscale)
 * or interpolation (upscale), then normalize to unit length.
 *
 * @param embedding - Source embedding vector
 * @param targetDim - Desired output dimension
 * @returns Resized and normalized embedding
 */
export function resizeEmbedding(embedding: number[], targetDim: number): number[] {
  if (embedding.length === targetDim) {
    return embedding;
  }

  if (embedding.length > targetDim) {
    // Average adjacent values to reduce dimension
    const ratio = embedding.length / targetDim;
    const result = new Array(targetDim).fill(0);
    for (let i = 0; i < targetDim; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += embedding[j];
      }
      result[i] = sum / (end - start);
    }
    return normalizeVector(result);
  } else {
    // Interpolate to increase dimension (less common)
    const result = new Array(targetDim).fill(0);
    const ratio = (embedding.length - 1) / (targetDim - 1);
    for (let i = 0; i < targetDim; i++) {
      const pos = i * ratio;
      const lower = Math.floor(pos);
      const upper = Math.min(lower + 1, embedding.length - 1);
      const weight = pos - lower;
      result[i] = embedding[lower] * (1 - weight) + embedding[upper] * weight;
    }
    return normalizeVector(result);
  }
}

// ============================================================================
// Hash-Based Embedding
// ============================================================================

/**
 * Generate a hash-based embedding for text. This is a deterministic fallback
 * that always works (including ARM64) when ONNX embeddings are unavailable.
 *
 * @param text - Input text to embed
 * @param dimension - Output embedding dimension
 * @returns Hash-based embedding vector normalized to unit length
 */
export function hashEmbedding(text: string, dimension: number): number[] {
  const embedding = new Array(dimension).fill(0);
  const normalized = text.toLowerCase().trim();

  // Use multiple hash passes for better distribution
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (charCode * (i + 1) * (pass + 1)) % dimension;
      embedding[idx] += Math.sin(charCode * (pass + 1)) / (i + 1);
    }
  }

  return normalizeVector(embedding);
}

// ============================================================================
// Vector Normalization
// ============================================================================

/**
 * Normalize a vector to unit length (L2 normalization).
 * Returns the input unchanged if magnitude is zero.
 *
 * @param vector - Input vector
 * @returns Normalized vector
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

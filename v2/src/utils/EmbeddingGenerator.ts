/**
 * EmbeddingGenerator - Consolidated utility for generating embeddings
 *
 * Provides a single source of truth for embedding generation across the codebase.
 * In production, replace with actual embedding model (OpenAI, Cohere, local BERT).
 */

/**
 * Generate a simple hash-based embedding from text
 * This is a placeholder implementation for development/testing.
 *
 * In production, replace with:
 * - OpenAI embeddings API (text-embedding-ada-002)
 * - Cohere embeddings
 * - Local transformer models (sentence-transformers)
 * - Custom trained embeddings
 *
 * @param text Text to embed
 * @param dimensions Embedding dimension (default: 384, common for sentence transformers)
 * @returns Normalized embedding vector
 */
export function generateEmbedding(text: string, dimensions: number = 384): number[] {
  const embedding = new Array(dimensions).fill(0);

  // Simple hash-based embedding (for demonstration only)
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (charCode * (i + 1)) % dimensions;
    embedding[index] += Math.sin(charCode * 0.1) * 0.1;
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Check if the current configuration uses a real embedding model
 * (vs. the placeholder hash-based implementation)
 *
 * @returns true if using a real embedding model, false if using placeholder
 */
export function isRealEmbeddingModel(): boolean {
  // Check environment variables or configuration
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.COHERE_API_KEY ||
    process.env.EMBEDDING_MODEL_PATH
  );
}

/**
 * Get the type of embedding model being used
 *
 * @returns Model type string for logging
 */
export function getEmbeddingModelType(): string {
  if (process.env.OPENAI_API_KEY) {
    return 'OpenAI (text-embedding-ada-002)';
  }
  if (process.env.COHERE_API_KEY) {
    return 'Cohere';
  }
  if (process.env.EMBEDDING_MODEL_PATH) {
    return `Local model (${process.env.EMBEDDING_MODEL_PATH})`;
  }
  return 'Hash-based placeholder (NOT FOR PRODUCTION)';
}

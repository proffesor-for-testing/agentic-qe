/**
 * VectorSimilarity - Vector-based pattern matching for test patterns
 *
 * Implements TF-IDF and cosine similarity for pattern matching
 * Target: 85%+ matching accuracy
 *
 * @module reasoning/VectorSimilarity
 * @version 1.0.0
 */

import { createHash } from 'crypto';

/**
 * TF-IDF configuration
 */
export interface TFIDFConfig {
  minTermFrequency?: number;
  maxTermFrequency?: number;
  useIDF?: boolean;
}

/**
 * Similarity result
 */
export interface SimilarityResult {
  id: string;
  similarity: number;
}

/**
 * VectorSimilarity engine for pattern matching
 *
 * Uses TF-IDF for vector generation and cosine similarity for matching
 * Optimized for 85%+ accuracy in test pattern matching
 */
export class VectorSimilarity {
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  private config: Required<TFIDFConfig>;

  constructor(config: TFIDFConfig = {}) {
    this.config = {
      minTermFrequency: config.minTermFrequency ?? 1,
      maxTermFrequency: config.maxTermFrequency ?? 1000,
      useIDF: config.useIDF ?? true
    };
  }

  /**
   * Generate vector embedding for text using TF-IDF
   *
   * @param text - Text to vectorize
   * @returns Vector representation (number array)
   */
  generateEmbedding(text: string): number[] {
    const terms = this.tokenize(text);
    const termFrequency = this.calculateTermFrequency(terms);

    // Get vocabulary from term frequency
    const vocabulary = Array.from(termFrequency.keys()).sort();

    // Generate TF-IDF vector
    const vector: number[] = [];
    for (const term of vocabulary) {
      const tf = termFrequency.get(term) || 0;
      const idf = this.config.useIDF ? this.calculateIDF(term) : 1;
      vector.push(tf * idf);
    }

    // Normalize vector
    return this.normalizeVector(vector);
  }

  /**
   * Calculate cosine similarity between two vectors
   * Target: 85%+ accuracy for pattern matching
   *
   * @param vectorA - First vector
   * @param vectorB - Second vector
   * @returns Similarity score (0-1)
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length === 0 || vectorB.length === 0) {
      return 0;
    }

    // Pad shorter vector with zeros
    const maxLen = Math.max(vectorA.length, vectorB.length);
    const a = this.padVector(vectorA, maxLen);
    const b = this.padVector(vectorB, maxLen);

    // Calculate dot product
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < maxLen; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Find top-K most similar vectors
   *
   * @param query - Query vector
   * @param vectors - Map of ID to vector
   * @param k - Number of results to return
   * @returns Top K similar vectors with IDs and scores
   */
  findTopK(
    query: number[],
    vectors: Map<string, number[]>,
    k: number
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const [id, vector] of vectors.entries()) {
      const similarity = this.cosineSimilarity(query, vector);
      results.push({ id, similarity });
    }

    // Sort by similarity (descending) and return top K
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Calculate Jaccard similarity (set-based similarity)
   * Alternative to cosine similarity for categorical data
   *
   * @param setA - First set
   * @param setB - Second set
   * @returns Jaccard similarity (0-1)
   */
  jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * Calculate hybrid similarity combining cosine and Jaccard
   * Optimized for test pattern matching
   *
   * @param textA - First text
   * @param textB - Second text
   * @returns Hybrid similarity score (0-1)
   */
  hybridSimilarity(textA: string, textB: string): number {
    // Cosine similarity (60% weight)
    const vectorA = this.generateEmbedding(textA);
    const vectorB = this.generateEmbedding(textB);
    const cosineSim = this.cosineSimilarity(vectorA, vectorB);

    // Jaccard similarity (40% weight)
    const termsA = new Set(this.tokenize(textA));
    const termsB = new Set(this.tokenize(textB));
    const jaccardSim = this.jaccardSimilarity(termsA, termsB);

    return cosineSim * 0.6 + jaccardSim * 0.4;
  }

  /**
   * Update document frequency statistics
   * Call this when adding new documents to the corpus
   *
   * @param text - Text to index
   */
  indexDocument(text: string): void {
    const terms = new Set(this.tokenize(text));

    for (const term of terms) {
      this.documentFrequency.set(
        term,
        (this.documentFrequency.get(term) || 0) + 1
      );
    }

    this.totalDocuments++;
  }

  /**
   * Batch index multiple documents
   *
   * @param documents - Array of texts to index
   */
  indexDocuments(documents: string[]): void {
    for (const doc of documents) {
      this.indexDocument(doc);
    }
  }

  // Private helper methods

  /**
   * Tokenize text into terms
   * Removes punctuation, converts to lowercase, splits on whitespace
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/) // Split on whitespace
      .filter(term => term.length > 2) // Remove short terms
      .filter(term => !this.isStopWord(term)); // Remove stop words
  }

  /**
   * Check if term is a stop word
   */
  private isStopWord(term: string): boolean {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
      'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
      'it', 'from', 'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had'
    ]);
    return stopWords.has(term);
  }

  /**
   * Calculate term frequency
   */
  private calculateTermFrequency(terms: string[]): Map<string, number> {
    const frequency = new Map<string, number>();

    for (const term of terms) {
      frequency.set(term, (frequency.get(term) || 0) + 1);
    }

    // Normalize by document length
    const maxFreq = Math.max(...Array.from(frequency.values()));
    for (const [term, freq] of frequency.entries()) {
      frequency.set(term, freq / maxFreq);
    }

    return frequency;
  }

  /**
   * Calculate inverse document frequency
   */
  private calculateIDF(term: string): number {
    const docFreq = this.documentFrequency.get(term) || 0;

    if (docFreq === 0 || this.totalDocuments === 0) {
      return 1;
    }

    return Math.log((this.totalDocuments + 1) / (docFreq + 1)) + 1;
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map(val => val / magnitude);
  }

  /**
   * Pad vector with zeros to specified length
   */
  private padVector(vector: number[], length: number): number[] {
    const padded = [...vector];
    while (padded.length < length) {
      padded.push(0);
    }
    return padded;
  }

  /**
   * Get vocabulary size
   */
  getVocabularySize(): number {
    return this.documentFrequency.size;
  }

  /**
   * Get total documents indexed
   */
  getTotalDocuments(): number {
    return this.totalDocuments;
  }

  /**
   * Clear document frequency statistics
   */
  reset(): void {
    this.documentFrequency.clear();
    this.totalDocuments = 0;
  }
}

export default VectorSimilarity;

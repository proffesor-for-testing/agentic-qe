/**
 * Shard Embeddings Manager for Semantic Search
 *
 * Generates embeddings for all 12 domain shards and indexes them for semantic search.
 * Uses a local TF-IDF inspired approach with character n-grams for embedding generation
 * without requiring external API calls.
 *
 * Features:
 * - Local embedding generation (no API calls required)
 * - Semantic similarity search across shards
 * - Section-level granularity (rules, invariants, thresholds, patterns, full)
 * - In-memory index with optional persistence
 * - Automatic index rebuilding on shard changes
 *
 * @module governance/shard-embeddings
 * @see ADR-058-guidance-governance-integration.md
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { governanceFlags } from './feature-flags.js';
import { toErrorMessage } from '../shared/error-utils.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import {
  ShardRetrieverIntegration,
  shardRetrieverIntegration,
  type ShardContent,
} from './shard-retriever-integration.js';

/**
 * Section types that can be embedded
 */
export type SectionType = 'rules' | 'invariants' | 'thresholds' | 'patterns' | 'full';

/**
 * Shard embedding with metadata
 */
export interface ShardEmbedding {
  domain: string;
  sectionType: SectionType;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

/**
 * Similarity search result
 */
export interface SimilarityResult {
  domain: string;
  sectionType: SectionType;
  similarity: number;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Relevant shard result with aggregated scores
 */
export interface RelevantShard {
  domain: string;
  overallSimilarity: number;
  sectionScores: Record<SectionType, number>;
  matchingSections: SectionType[];
  shard: ShardContent | null;
}

/**
 * Index statistics
 */
export interface IndexStats {
  totalEmbeddings: number;
  embeddingsByDomain: Record<string, number>;
  embeddingsBySectionType: Record<SectionType, number>;
  dimensions: number;
  lastRebuild: number | null;
  vocabularySize: number;
  persistedToFile: boolean;
}

/**
 * Feature flags for shard embeddings
 */
export interface ShardEmbeddingsFlags {
  enabled: boolean;
  embeddingDimensions: number;
  persistEmbeddings: boolean;
  autoRebuildOnChange: boolean;
  ngramMin: number;
  ngramMax: number;
  persistPath: string;
}

/**
 * Default feature flags
 */
export const DEFAULT_SHARD_EMBEDDINGS_FLAGS: ShardEmbeddingsFlags = {
  enabled: true,
  embeddingDimensions: 128,
  persistEmbeddings: false,
  autoRebuildOnChange: true,
  ngramMin: 2,
  ngramMax: 4,
  persistPath: '.agentic-qe/shard-embeddings.json',
};

/**
 * Check if shard embeddings is enabled via feature flags
 */
function isShardEmbeddingsEnabled(): boolean {
  const flags = governanceFlags.getFlags();
  if (!flags.global.enableAllGates) return false;
  const flagsAsAny = flags as unknown as { shardEmbeddings?: ShardEmbeddingsFlags };
  return flagsAsAny.shardEmbeddings?.enabled ?? true;
}

/**
 * Get shard embeddings flags with defaults
 */
function getShardEmbeddingsFlags(): ShardEmbeddingsFlags {
  const flags = governanceFlags.getFlags() as unknown as { shardEmbeddings?: ShardEmbeddingsFlags };
  return {
    ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
    ...flags.shardEmbeddings,
  };
}

/**
 * ShardEmbeddingsManager class
 *
 * Manages embedding generation and semantic search for domain shards.
 */
export class ShardEmbeddingsManager {
  private embeddings: Map<string, ShardEmbedding> = new Map();
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private initialized = false;
  private lastRebuild: number | null = null;
  private shardRetriever: ShardRetrieverIntegration;
  private basePath: string;
  private persistedToFile = false;

  constructor(basePath?: string, shardRetriever?: ShardRetrieverIntegration) {
    this.basePath = basePath ?? process.cwd();
    this.shardRetriever = shardRetriever ?? new ShardRetrieverIntegration(basePath);
  }

  /**
   * Initialize the embeddings manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!isShardEmbeddingsEnabled()) {
      this.initialized = true;
      return;
    }

    const flags = getShardEmbeddingsFlags();

    // Try to load persisted embeddings first
    if (flags.persistEmbeddings) {
      const loaded = await this.loadPersistedEmbeddings();
      if (loaded) {
        this.initialized = true;
        return;
      }
    }

    // Generate fresh embeddings
    await this.generateEmbeddings();
    this.initialized = true;
  }

  // ============================================================================
  // Embedding Generation
  // ============================================================================

  /**
   * Generate embeddings for all shards
   */
  async generateEmbeddings(): Promise<void> {
    if (!isShardEmbeddingsEnabled()) {
      return;
    }

    // Initialize the shard retriever
    await this.shardRetriever.initialize();
    const allShards = await this.shardRetriever.loadAllShards();

    // Clear existing embeddings
    this.embeddings.clear();
    this.vocabulary.clear();
    this.idfScores.clear();
    this.documentFrequency.clear();

    // First pass: build vocabulary and document frequency
    const allDocuments: Array<{ key: string; tokens: string[] }> = [];

    for (const [domain, shard] of allShards) {
      const sections = this.extractSections(domain, shard);
      for (const section of sections) {
        const tokens = this.tokenize(section.content);
        allDocuments.push({ key: section.key, tokens });

        // Update vocabulary
        for (const token of tokens) {
          if (!this.vocabulary.has(token)) {
            this.vocabulary.set(token, this.vocabulary.size);
          }
        }

        // Update document frequency (unique tokens per document)
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
          this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
        }
      }
    }

    // Calculate IDF scores
    const totalDocs = allDocuments.length;
    for (const [token, docFreq] of this.documentFrequency) {
      // IDF = log(N / df) + 1 (smoothed)
      this.idfScores.set(token, Math.log(totalDocs / docFreq) + 1);
    }

    // Second pass: generate embeddings for each section
    for (const [domain, shard] of allShards) {
      const sections = this.extractSections(domain, shard);
      for (const section of sections) {
        const embedding = this.computeTfIdfEmbedding(section.content);
        this.embeddings.set(section.key, {
          domain,
          sectionType: section.type,
          content: section.content,
          embedding,
          metadata: section.metadata,
        });
      }
    }

    this.lastRebuild = Date.now();

    // Persist if enabled
    const flags = getShardEmbeddingsFlags();
    if (flags.persistEmbeddings) {
      await this.persistEmbeddings();
    }
  }

  /**
   * Generate embeddings for a specific shard
   */
  async generateEmbeddingForShard(domain: string): Promise<ShardEmbedding[]> {
    if (!isShardEmbeddingsEnabled()) {
      return [];
    }

    const shard = await this.shardRetriever.loadShard(domain);
    if (!shard) {
      return [];
    }

    const result: ShardEmbedding[] = [];
    const sections = this.extractSections(domain, shard);

    // If vocabulary is empty, we need to rebuild the entire index
    if (this.vocabulary.size === 0) {
      await this.generateEmbeddings();
      // Return embeddings for this domain
      return Array.from(this.embeddings.values()).filter(e => e.domain === domain);
    }

    // Update document frequency with new sections
    for (const section of sections) {
      const tokens = this.tokenize(section.content);
      const uniqueTokens = new Set(tokens);

      // Update vocabulary with any new tokens
      for (const token of tokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      }

      // Update document frequency
      for (const token of uniqueTokens) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
    }

    // Recalculate IDF (simplified - in production would be more efficient)
    const totalDocs = this.embeddings.size + sections.length;
    for (const [token, docFreq] of this.documentFrequency) {
      this.idfScores.set(token, Math.log(totalDocs / docFreq) + 1);
    }

    // Generate embeddings for new sections
    for (const section of sections) {
      const embedding = this.computeTfIdfEmbedding(section.content);
      const shardEmbedding: ShardEmbedding = {
        domain,
        sectionType: section.type,
        content: section.content,
        embedding,
        metadata: section.metadata,
      };

      this.embeddings.set(section.key, shardEmbedding);
      result.push(shardEmbedding);
    }

    return result;
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search embeddings by semantic similarity
   */
  async searchBySimilarity(query: string, limit = 10): Promise<SimilarityResult[]> {
    if (!isShardEmbeddingsEnabled()) {
      return [];
    }

    await this.initialize();

    if (this.embeddings.size === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = this.computeTfIdfEmbedding(query);

    // Calculate similarity with all embeddings
    const similarities: SimilarityResult[] = [];

    for (const [, embedding] of this.embeddings) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding.embedding);

      similarities.push({
        domain: embedding.domain,
        sectionType: embedding.sectionType,
        similarity,
        content: embedding.content,
        metadata: embedding.metadata,
      });
    }

    // Sort by similarity (descending) and limit
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, limit);
  }

  /**
   * Find shards relevant to a task description
   */
  async findRelevantShards(taskDescription: string, limit = 5): Promise<RelevantShard[]> {
    if (!isShardEmbeddingsEnabled()) {
      return [];
    }

    await this.initialize();

    // Get similarity results
    const results = await this.searchBySimilarity(taskDescription, this.embeddings.size);

    // Aggregate by domain
    const domainScores = new Map<string, {
      totalSimilarity: number;
      count: number;
      sectionScores: Record<SectionType, number>;
      matchingSections: SectionType[];
    }>();

    for (const result of results) {
      if (!domainScores.has(result.domain)) {
        domainScores.set(result.domain, {
          totalSimilarity: 0,
          count: 0,
          sectionScores: {
            rules: 0,
            invariants: 0,
            thresholds: 0,
            patterns: 0,
            full: 0,
          },
          matchingSections: [],
        });
      }

      const scores = domainScores.get(result.domain)!;
      scores.totalSimilarity += result.similarity;
      scores.count++;
      scores.sectionScores[result.sectionType] = Math.max(
        scores.sectionScores[result.sectionType],
        result.similarity
      );

      // Track matching sections (similarity > threshold)
      if (result.similarity > 0.1 && !scores.matchingSections.includes(result.sectionType)) {
        scores.matchingSections.push(result.sectionType);
      }
    }

    // Create relevant shard results
    const relevantShards: RelevantShard[] = [];

    for (const [domain, scores] of domainScores) {
      const shard = await this.shardRetriever.loadShard(domain);

      relevantShards.push({
        domain,
        overallSimilarity: scores.totalSimilarity / scores.count,
        sectionScores: scores.sectionScores,
        matchingSections: scores.matchingSections,
        shard,
      });
    }

    // Sort by overall similarity and limit
    relevantShards.sort((a, b) => b.overallSimilarity - a.overallSimilarity);
    return relevantShards.slice(0, limit);
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  /**
   * Index a single embedding
   */
  async indexEmbedding(embedding: ShardEmbedding): Promise<void> {
    if (!isShardEmbeddingsEnabled()) {
      return;
    }

    const key = `${embedding.domain}:${embedding.sectionType}`;
    this.embeddings.set(key, embedding);
  }

  /**
   * Rebuild the entire index
   */
  async rebuildIndex(): Promise<void> {
    if (!isShardEmbeddingsEnabled()) {
      return;
    }

    // Clear everything and regenerate
    this.embeddings.clear();
    this.vocabulary.clear();
    this.idfScores.clear();
    this.documentFrequency.clear();
    this.initialized = false;

    await this.generateEmbeddings();
    this.initialized = true;
  }

  /**
   * Get index statistics
   */
  getIndexStats(): IndexStats {
    const embeddingsByDomain: Record<string, number> = {};
    const embeddingsBySectionType: Record<SectionType, number> = {
      rules: 0,
      invariants: 0,
      thresholds: 0,
      patterns: 0,
      full: 0,
    };

    for (const [, embedding] of this.embeddings) {
      embeddingsByDomain[embedding.domain] = (embeddingsByDomain[embedding.domain] || 0) + 1;
      embeddingsBySectionType[embedding.sectionType]++;
    }

    const flags = getShardEmbeddingsFlags();

    return {
      totalEmbeddings: this.embeddings.size,
      embeddingsByDomain,
      embeddingsBySectionType,
      dimensions: flags.embeddingDimensions,
      lastRebuild: this.lastRebuild,
      vocabularySize: this.vocabulary.size,
      persistedToFile: this.persistedToFile,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get embedding for arbitrary text
   */
  async getEmbeddingForText(text: string): Promise<number[]> {
    if (!isShardEmbeddingsEnabled()) {
      return [];
    }

    await this.initialize();
    return this.computeTfIdfEmbedding(text);
  }

  /**
   * Reset the manager
   */
  reset(): void {
    this.embeddings.clear();
    this.vocabulary.clear();
    this.idfScores.clear();
    this.documentFrequency.clear();
    this.initialized = false;
    this.lastRebuild = null;
    this.persistedToFile = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract sections from a shard for embedding
   */
  private extractSections(domain: string, shard: ShardContent): Array<{
    key: string;
    type: SectionType;
    content: string;
    metadata: Record<string, unknown>;
  }> {
    const sections: Array<{
      key: string;
      type: SectionType;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Rules section
    if (shard.rules.length > 0) {
      sections.push({
        key: `${domain}:rules`,
        type: 'rules',
        content: shard.rules.join('\n'),
        metadata: {
          ruleCount: shard.rules.length,
          version: shard.version,
        },
      });
    }

    // Invariants section
    if (shard.invariants.length > 0) {
      sections.push({
        key: `${domain}:invariants`,
        type: 'invariants',
        content: shard.invariants.join('\n'),
        metadata: {
          invariantCount: shard.invariants.length,
          version: shard.version,
        },
      });
    }

    // Thresholds section
    const thresholdKeys = Object.keys(shard.thresholds);
    if (thresholdKeys.length > 0) {
      const thresholdContent = thresholdKeys
        .map(k => `${k}: min=${shard.thresholds[k].minimum} target=${shard.thresholds[k].target}`)
        .join('\n');
      sections.push({
        key: `${domain}:thresholds`,
        type: 'thresholds',
        content: thresholdContent,
        metadata: {
          thresholdCount: thresholdKeys.length,
          metrics: thresholdKeys,
          version: shard.version,
        },
      });
    }

    // Patterns section
    if (shard.patterns.length > 0) {
      const patternContent = shard.patterns
        .map(p => `${p.name}: ${p.description} (${p.location})`)
        .join('\n');
      sections.push({
        key: `${domain}:patterns`,
        type: 'patterns',
        content: patternContent,
        metadata: {
          patternCount: shard.patterns.length,
          patternNames: shard.patterns.map(p => p.name),
          version: shard.version,
        },
      });
    }

    // Full content section
    sections.push({
      key: `${domain}:full`,
      type: 'full',
      content: shard.rawContent,
      metadata: {
        domain: shard.domain,
        version: shard.version,
        lastUpdated: shard.lastUpdated,
        agentCount:
          shard.agentConstraints.primary.length +
          shard.agentConstraints.secondary.length +
          shard.agentConstraints.support.length,
        integrationCount: shard.integrationPoints.length,
      },
    });

    return sections;
  }

  /**
   * Tokenize text into tokens with n-grams
   */
  private tokenize(text: string): string[] {
    const flags = getShardEmbeddingsFlags();
    const tokens: string[] = [];

    // Normalize text
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Word tokens
    const words = normalized.split(' ').filter(w => w.length > 2);
    tokens.push(...words);

    // Character n-grams for each word
    for (const word of words) {
      for (let n = flags.ngramMin; n <= Math.min(flags.ngramMax, word.length); n++) {
        for (let i = 0; i <= word.length - n; i++) {
          tokens.push(word.substring(i, i + n));
        }
      }
    }

    return tokens;
  }

  /**
   * Compute TF-IDF embedding for text
   */
  private computeTfIdfEmbedding(text: string): number[] {
    const flags = getShardEmbeddingsFlags();
    const tokens = this.tokenize(text);
    const dimensions = flags.embeddingDimensions;

    // Initialize embedding vector
    const embedding = new Array(dimensions).fill(0);

    if (tokens.length === 0) {
      return embedding;
    }

    // Calculate term frequency
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Normalize TF by document length
    const docLength = tokens.length;
    for (const [token, count] of tf) {
      tf.set(token, count / docLength);
    }

    // Build TF-IDF weighted embedding using hash projection
    for (const [token, termFreq] of tf) {
      const idf = this.idfScores.get(token) || 1;
      const tfidf = termFreq * idf;

      // Hash the token to multiple dimensions (locality-sensitive hashing)
      const hashes = this.hashToken(token, dimensions);

      for (const { index, sign } of hashes) {
        embedding[index] += sign * tfidf;
      }
    }

    // L2 normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * Hash a token to multiple dimension indices (locality-sensitive hashing)
   */
  private hashToken(token: string, dimensions: number): Array<{ index: number; sign: number }> {
    const result: Array<{ index: number; sign: number }> = [];
    const numHashes = 4; // Number of hash functions

    for (let h = 0; h < numHashes; h++) {
      // Simple hash combining: FNV-1a inspired
      let hash = 2166136261 ^ (h * 31);
      for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }

      // Ensure positive and within bounds
      const index = Math.abs(hash) % dimensions;
      const sign = (hash & 1) === 0 ? 1 : -1;

      result.push({ index, sign });
    }

    return result;
  }

  /**
   * Persist embeddings to file
   */
  private async persistEmbeddings(): Promise<void> {
    const flags = getShardEmbeddingsFlags();
    const persistPath = path.resolve(this.basePath, flags.persistPath);

    const data = {
      version: 1,
      timestamp: Date.now(),
      dimensions: flags.embeddingDimensions,
      vocabulary: Array.from(this.vocabulary.entries()),
      idfScores: Array.from(this.idfScores.entries()),
      documentFrequency: Array.from(this.documentFrequency.entries()),
      embeddings: Array.from(this.embeddings.entries()).map(([key, emb]) => ({
        key,
        ...emb,
      })),
    };

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(persistPath), { recursive: true });
      await fs.writeFile(persistPath, JSON.stringify(data, null, 2), 'utf-8');
      this.persistedToFile = true;
    } catch (error) {
      this.logError(`Failed to persist embeddings to file: ${toErrorMessage(error)}`);
    }

    // Also persist to unified vectors table for cross-system access
    try {
      const mem = getUnifiedMemory();
      await mem.initialize();
      for (const [key, emb] of this.embeddings) {
        await mem.vectorStore(
          `shard:${key}`,
          emb.embedding,
          `shard:${emb.domain}`,
          { domain: emb.domain, sectionType: emb.sectionType, content: emb.content, metadata: emb.metadata }
        );
      }
    } catch {
      // Non-fatal: JSON file persistence still works as fallback
    }
  }

  /**
   * Load persisted embeddings from file
   */
  private async loadPersistedEmbeddings(): Promise<boolean> {
    const flags = getShardEmbeddingsFlags();
    const persistPath = path.resolve(this.basePath, flags.persistPath);

    try {
      const content = await fs.readFile(persistPath, 'utf-8');
      const data = safeJsonParse(content);

      // Validate version
      if (data.version !== 1) {
        return false;
      }

      // Validate dimensions match
      if (data.dimensions !== flags.embeddingDimensions) {
        return false;
      }

      // Restore vocabulary
      this.vocabulary = new Map(data.vocabulary);

      // Restore IDF scores
      this.idfScores = new Map(data.idfScores);

      // Restore document frequency
      this.documentFrequency = new Map(data.documentFrequency);

      // Restore embeddings
      this.embeddings = new Map();
      for (const emb of data.embeddings) {
        this.embeddings.set(emb.key, {
          domain: emb.domain,
          sectionType: emb.sectionType,
          content: emb.content,
          embedding: emb.embedding,
          metadata: emb.metadata,
        });
      }

      this.lastRebuild = data.timestamp;
      this.persistedToFile = true;
      return true;
    } catch {
      // File doesn't exist or is invalid - this is expected on first run
      return false;
    }
  }

  /**
   * Log an error
   */
  private logError(message: string): void {
    const flags = governanceFlags.getFlags();
    if (flags.global.logViolations) {
      console.error(`[ShardEmbeddings] ${message}`);
    }
  }
}

/**
 * Singleton instance
 */
export const shardEmbeddingsManager = new ShardEmbeddingsManager();

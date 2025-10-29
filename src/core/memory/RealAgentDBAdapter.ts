/**
 * Real AgentDB Adapter
 * Uses actual agentdb package (sqlite-vector) for production operations
 */

import type { Pattern, RetrievalOptions, RetrievalResult } from './ReasoningBankAdapter';
import { SecureRandom } from '../../utils/SecureRandom.js';

export class RealAgentDBAdapter {
  private db: any; // SqliteVectorDB from agentdb
  private isInitialized = false;
  private dbPath: string;
  private dimension: number;

  constructor(config: { dbPath: string; dimension?: number }) {
    this.dbPath = config.dbPath;
    this.dimension = config.dimension || 384;
  }

  /**
   * Initialize with real AgentDB (sqlite-vector)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Import real AgentDB (note: SQLiteVectorDB with capital L)
      const { SQLiteVectorDB, Presets } = await import('agentdb');

      // Create database with appropriate preset
      // Note: AgentDB constructor, not .new() method
      if (this.dbPath === ':memory:') {
        this.db = new SQLiteVectorDB(Presets.inMemory(this.dimension));
      } else {
        this.db = new SQLiteVectorDB(
          Presets.smallDataset(this.dimension, this.dbPath)
        );
      }

      // Initialize if needed
      if (typeof this.db.init === 'function') {
        await this.db.init();
      }

      this.isInitialized = true;
      console.log('[RealAgentDBAdapter] Initialized with real AgentDB at', this.dbPath);
    } catch (error: any) {
      throw new Error(`Failed to initialize real AgentDB: ${error.message}`);
    }
  }

  /**
   * Store a pattern with vector embedding
   */
  async store(pattern: Pattern): Promise<string> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Ensure embedding exists and has correct dimensions
      if (!pattern.embedding || pattern.embedding.length !== this.dimension) {
        // Generate default embedding if missing
        pattern.embedding = Array.from(
          { length: this.dimension },
          () => SecureRandom.randomFloat()
        );
      }

      // Insert into AgentDB using correct Vector interface
      // AgentDB expects: { id?, embedding: number[], metadata? }
      const insertData = {
        id: pattern.id,
        embedding: pattern.embedding, // Use regular number[] array, not Float32Array
        metadata: {
          type: pattern.type,
          confidence: pattern.confidence || 0.5,
          ...pattern.metadata
        }
      };

      const result = await this.db.insert(insertData);

      return pattern.id;
    } catch (error: any) {
      throw new Error(`Failed to store pattern: ${error.message}`);
    }
  }

  /**
   * Store multiple patterns in batch
   */
  async storeBatch(patterns: Pattern[]): Promise<string[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      const vectors = patterns.map(p => ({
        id: p.id,
        embedding: p.embedding || Array.from({ length: this.dimension }, () => SecureRandom.randomFloat()),
        metadata: {
          type: p.type,
          confidence: p.confidence || 0.5,
          ...p.metadata
        }
      }));

      // insertBatch returns string[] of IDs
      const resultIds = await this.db.insertBatch(vectors);
      console.log(
        `[RealAgentDBAdapter] Inserted ${resultIds.length} patterns`
      );

      return resultIds;
    } catch (error: any) {
      throw new Error(`Failed to store batch: ${error.message}`);
    }
  }

  /**
   * Retrieve with reasoning (vector similarity search)
   */
  async retrieveWithReasoning(
    queryEmbedding: number[],
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      const startTime = Date.now();

      // Ensure query embedding has correct dimensions
      if (queryEmbedding.length !== this.dimension) {
        queryEmbedding = Array.from({ length: this.dimension }, () => SecureRandom.randomFloat());
      }

      // Search using AgentDB
      // API expects: search(queryEmbedding: number[], k?, metric?, threshold?)
      const topK = options.topK || 10;
      const threshold = options.threshold || 0.0;

      const results = await this.db.search(
        queryEmbedding, // Pass embedding array directly, not wrapped in object
        topK,
        'cosine',
        threshold
      );

      const queryTime = Date.now() - startTime;

      // Convert AgentDB results to Pattern format
      // AgentDB SearchResult has: { id, score, embedding, metadata }
      const patterns: Pattern[] = results.map((r: any) => ({
        id: r.id,
        type: r.metadata?.type || 'unknown',
        data: r.metadata || {},
        embedding: r.embedding,
        confidence: r.metadata?.confidence || r.score,
        metadata: {
          ...r.metadata,
          similarity: r.score // AgentDB uses 'score' not 'similarity'
        }
      }));

      return {
        memories: patterns,
        patterns: patterns,
        context: {
          query: 'vector similarity search',
          resultsCount: patterns.length,
          avgSimilarity: results.length > 0
            ? results.reduce((sum: number, r: any) => sum + r.score, 0) / results.length
            : 0
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve: ${error.message}`);
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // AgentDB method is stats() not getStats()
      const dbStats = this.db.stats();

      // Convert to expected format
      return {
        totalVectors: dbStats.count || 0,
        dimension: this.dimension,
        mode: this.dbPath === ':memory:' ? 'memory' : 'file',
        memoryUsageBytes: dbStats.size || 0,
        dbSizeBytes: dbStats.size || 0
      };
    } catch (error: any) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      console.log('[RealAgentDBAdapter] Closed');
    }
    this.isInitialized = false;
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}

/**
 * Create a real AgentDB adapter
 */
export function createRealAgentDBAdapter(config: {
  dbPath: string;
  dimension?: number;
}): RealAgentDBAdapter {
  return new RealAgentDBAdapter(config);
}

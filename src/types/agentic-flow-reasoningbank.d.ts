/**
 * Type declarations for agentic-flow/reasoningbank
 *
 * This file provides TypeScript type definitions for the agentic-flow
 * reasoningbank module which is JavaScript-only.
 */

declare module 'agentic-flow/reasoningbank' {
  /**
   * AgentDB Configuration
   */
  export interface AgentDBConfig {
    /** Path to SQLite database file */
    dbPath?: string;

    /** Enable QUIC synchronization (<1ms latency) */
    enableQUICSync?: boolean;

    /** QUIC server port (default: 4433) */
    syncPort?: number;

    /** Peer addresses for synchronization */
    syncPeers?: string[];

    /** Enable learning plugins (9 RL algorithms) */
    enableLearning?: boolean;

    /** Enable reasoning agents */
    enableReasoning?: boolean;

    /** In-memory cache size */
    cacheSize?: number;

    /** Quantization type for memory efficiency */
    quantizationType?: 'scalar' | 'binary' | 'product' | 'none';

    /** QUIC sync interval in milliseconds */
    syncInterval?: number;

    /** QUIC sync batch size */
    syncBatchSize?: number;

    /** Maximum QUIC retry attempts */
    maxRetries?: number;

    /** Enable QUIC compression */
    compression?: boolean;
  }

  /**
   * Memory Pattern
   */
  export interface MemoryPattern {
    id: string;
    type: string;
    domain: string;
    pattern_data: string;
    confidence: number;
    usage_count: number;
    success_count: number;
    created_at: number;
    last_used: number;
  }

  /**
   * Retrieval Options
   */
  export interface RetrievalOptions {
    domain?: string;
    k: number;
    useMMR?: boolean;
    mmrLambda?: number;
    synthesizeContext?: boolean;
    optimizeMemory?: boolean;
    minConfidence?: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    filters?: Record<string, any>;
  }

  /**
   * Retrieval Result
   */
  export interface RetrievalResult {
    memories?: Array<MemoryPattern & { similarity: number }>;
    patterns?: Array<MemoryPattern & { similarity: number }>;
    context?: string;
    metadata?: {
      queryTime: number;
      resultsCount: number;
      cacheHit: boolean;
    };
  }

  /**
   * Training Options
   */
  export interface TrainingOptions {
    epochs: number;
    batchSize: number;
    learningRate?: number;
    validationSplit?: number;
  }

  /**
   * Training Metrics
   */
  export interface TrainingMetrics {
    loss: number;
    valLoss?: number;
    duration: number;
    epochs?: number;
  }

  /**
   * Database Statistics
   */
  export interface DatabaseStats {
    totalPatterns: number;
    dbSize: number;
    cacheHitRate?: number;
    avgSearchLatency?: number;
  }

  /**
   * AgentDB Adapter Interface
   */
  export interface AgentDBAdapter {
    /**
     * Insert a memory pattern
     */
    insertPattern(pattern: MemoryPattern): Promise<string>;

    /**
     * Retrieve memories with reasoning
     */
    retrieveWithReasoning(
      queryEmbedding: number[],
      options: RetrievalOptions
    ): Promise<RetrievalResult>;

    /**
     * Train learning model
     */
    train(options: TrainingOptions): Promise<TrainingMetrics>;

    /**
     * Get database statistics
     */
    getStats(): Promise<DatabaseStats>;

    /**
     * Close database connection
     */
    close?(): Promise<void>;
  }

  /**
   * Create AgentDB ReasoningBank adapter
   *
   * @param config - Configuration options
   * @returns Initialized AgentDB adapter
   *
   * @example
   * ```typescript
   * import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';
   *
   * const adapter = await createAgentDBAdapter({
   *   dbPath: '.agentdb/reasoningbank.db',
   *   enableLearning: true,
   *   enableReasoning: true,
   * });
   * ```
   */
  export function createAgentDBAdapter(config?: AgentDBConfig): Promise<AgentDBAdapter>;

  /**
   * Create AgentDB adapter with default configuration
   */
  export function createDefaultAgentDBAdapter(): Promise<AgentDBAdapter>;

  /**
   * Migrate from legacy ReasoningBank to AgentDB
   */
  export function migrateToAgentDB(
    sourcePath: string,
    destinationPath: string
  ): Promise<{ migrated: number; errors: number }>;

  /**
   * Validate migration
   */
  export function validateMigration(
    sourcePath: string,
    destinationPath: string
  ): Promise<{ valid: boolean; mismatches: number }>;
}

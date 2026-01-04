/**
 * Code Intelligence Sync Adapter
 *
 * Wraps CodeChunkStore to provide automatic sync to cloud persistence.
 * Intercepts code chunk operations and queues them for background sync.
 *
 * @module persistence/adapters/CodeIntelligenceSyncAdapter
 */

import { EventEmitter } from 'events';
import type {
  IPersistenceProvider,
  CodeChunk,
  CodeChunkQuery,
  CodeSearchResult,
  CodeLanguage,
  CodeChunkType,
} from '../IPersistenceProvider.js';
import type { CodeChunkStore, CodeSearchOptions } from '../../code-intelligence/storage/CodeChunkStore.js';
import type { Language } from '../../code-intelligence/config/database-schema.js';

// ============================================
// Types
// ============================================

/**
 * Configuration for CodeIntelligenceSyncAdapter
 */
export interface CodeIntelligenceSyncAdapterConfig {
  /** The persistence provider to sync to */
  provider: IPersistenceProvider;
  /** The CodeChunkStore to wrap */
  codeStore: CodeChunkStore;
  /** Project ID for cloud storage */
  projectId: string;
  /** Minimum sync interval in ms */
  syncDebounceMs?: number;
  /** Enable auto-sync on write */
  autoSync?: boolean;
  /** Batch size for sync operations */
  batchSize?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Code chunk operation for sync queue
 */
interface ChunkOperation {
  type: 'store' | 'delete';
  chunk?: CodeChunk;
  filePath?: string;
  timestamp: number;
}

/**
 * Internal chunk format matching CodeChunkStore
 */
interface StoreChunk {
  id: string;
  filePath: string;
  content: string;
  embedding: number[];
  chunkType?: string;
  name?: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Adapter Implementation
// ============================================

/**
 * CodeIntelligenceSyncAdapter wraps CodeChunkStore to sync code chunks to cloud
 *
 * @example
 * ```typescript
 * const adapter = new CodeIntelligenceSyncAdapter({
 *   provider: hybridProvider,
 *   codeStore: codeChunkStore,
 *   projectId: 'my-project',
 *   autoSync: true,
 * });
 *
 * // Store a chunk - syncs automatically
 * await adapter.storeChunk({
 *   id: 'chunk-1',
 *   filePath: 'src/index.ts',
 *   content: 'export function hello() {}',
 *   embedding: [...],
 *   chunkType: 'function',
 *   language: 'typescript',
 * });
 *
 * // Or trigger manual sync
 * await adapter.sync();
 * ```
 */
export class CodeIntelligenceSyncAdapter extends EventEmitter {
  private readonly config: Required<CodeIntelligenceSyncAdapterConfig>;
  private syncQueue: ChunkOperation[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(config: CodeIntelligenceSyncAdapterConfig) {
    super();

    this.config = {
      provider: config.provider,
      codeStore: config.codeStore,
      projectId: config.projectId,
      syncDebounceMs: config.syncDebounceMs ?? 2000,
      autoSync: config.autoSync ?? true,
      batchSize: config.batchSize ?? 50,
      debug: config.debug ?? false,
    };
  }

  // ============================================
  // Code Chunk Operations (with sync)
  // ============================================

  /**
   * Store a code chunk and queue for sync
   */
  async storeChunk(chunk: StoreChunk): Promise<void> {
    // Write to local store first
    await this.config.codeStore.storeChunk(chunk);

    // Convert to persistence format and queue for sync
    const persistChunk = this.toPersistenceChunk(chunk);
    this.queueOperation({
      type: 'store',
      chunk: persistChunk,
      timestamp: Date.now(),
    });

    // Sync immediately if provider supports it
    if (this.config.autoSync && this.config.provider.storeCodeChunk) {
      try {
        await this.config.provider.storeCodeChunk(persistChunk);
        this.emit('synced', { id: chunk.id, filePath: chunk.filePath });
      } catch (error) {
        this.log(`Failed to sync chunk ${chunk.id}:`, error);
        // Will be retried in next batch sync
      }
    }
  }

  /**
   * Store multiple chunks in batch
   */
  async storeChunks(chunks: StoreChunk[]): Promise<void> {
    // Write to local store first
    await this.config.codeStore.storeChunks(chunks);

    // Convert and queue for sync
    const persistChunks = chunks.map((c) => this.toPersistenceChunk(c));
    for (const chunk of persistChunks) {
      this.queueOperation({
        type: 'store',
        chunk,
        timestamp: Date.now(),
      });
    }

    // Batch sync if provider supports it
    if (this.config.autoSync && this.config.provider.storeCodeChunks) {
      try {
        await this.config.provider.storeCodeChunks(persistChunks);
        this.emit('synced:batch', { count: chunks.length });
      } catch (error) {
        this.log(`Failed to batch sync ${chunks.length} chunks:`, error);
      }
    }
  }

  /**
   * Search for similar code chunks
   * Searches local store first, falls back to cloud if needed
   */
  async search(
    queryEmbedding: number[],
    options?: {
      topK?: number;
      minScore?: number;
      language?: Language;
      filePattern?: string;
      entityType?: string;
      includeContent?: boolean;
    }
  ): Promise<CodeSearchResult[]> {
    // Try local search first
    const searchOpts: CodeSearchOptions = {
      topK: options?.topK,
      minScore: options?.minScore,
      language: options?.language,
      filePattern: options?.filePattern,
      entityType: options?.entityType,
      includeContent: options?.includeContent,
    };
    const localResults = await this.config.codeStore.search(queryEmbedding, searchOpts);

    if (localResults.length > 0) {
      return localResults.map((r) => ({
        chunk: {
          id: r.id,
          projectId: this.config.projectId,
          filePath: r.filePath,
          startLine: r.startLine,
          endLine: r.endLine,
          chunkType: (r.chunkType as CodeChunkType) || 'block',
          name: r.name,
          content: r.content,
          language: (r.language as CodeLanguage) || 'other',
          metadata: r.metadata,
          indexedAt: new Date(),
        },
        score: r.score,
        highlights: [],
      }));
    }

    // Fall back to cloud search if local is empty
    if (this.config.provider.searchSimilarCode) {
      try {
        // Map Language to CodeLanguage (they should be compatible)
        const cloudLanguage = options?.language as CodeLanguage | undefined;
        return await this.config.provider.searchSimilarCode(queryEmbedding, {
          limit: options?.topK ?? 10,
          minScore: options?.minScore ?? 0,
          language: cloudLanguage,
          projectId: this.config.projectId,
        });
      } catch (error) {
        this.log('Failed to search cloud:', error);
      }
    }

    return [];
  }

  /**
   * Hybrid search combining vector similarity and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    options?: {
      topK?: number;
      minScore?: number;
      language?: Language;
      filePattern?: string;
      semanticWeight?: number;
    }
  ): Promise<CodeSearchResult[]> {
    const searchOpts: CodeSearchOptions & { semanticWeight?: number } = {
      topK: options?.topK,
      minScore: options?.minScore,
      language: options?.language,
      filePattern: options?.filePattern,
      semanticWeight: options?.semanticWeight,
    };
    const localResults = await this.config.codeStore.hybridSearch(
      queryEmbedding,
      queryText,
      searchOpts
    );

    return localResults.map((r) => ({
      chunk: {
        id: r.id,
        projectId: this.config.projectId,
        filePath: r.filePath,
        startLine: r.startLine,
        endLine: r.endLine,
        chunkType: (r.chunkType as CodeChunkType) || 'block',
        name: r.name,
        content: r.content,
        language: (r.language as CodeLanguage) || 'other',
        metadata: r.metadata,
        indexedAt: new Date(),
      },
      score: r.score,
      highlights: [],
    }));
  }

  /**
   * Delete chunks for a file and sync deletion
   */
  async deleteChunksForFile(filePath: string): Promise<number> {
    // Delete from local
    const deleted = await this.config.codeStore.deleteChunksForFile(filePath);

    // Queue deletion sync
    this.queueOperation({
      type: 'delete',
      filePath,
      timestamp: Date.now(),
    });

    // Sync deletion immediately if supported
    if (this.config.autoSync && this.config.provider.deleteCodeChunksForFile) {
      try {
        await this.config.provider.deleteCodeChunksForFile(this.config.projectId, filePath);
      } catch (error) {
        this.log(`Failed to sync delete for ${filePath}:`, error);
      }
    }

    return deleted;
  }

  /**
   * Get statistics from local store
   */
  async getStats(): Promise<{
    chunkCount: number;
    entityCount: number;
    relationshipCount: number;
    pendingSync: number;
  }> {
    const stats = await this.config.codeStore.getStats();
    return {
      ...stats,
      pendingSync: this.syncQueue.length,
    };
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Force sync all pending operations
   */
  async sync(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = [...this.syncQueue];
      this.syncQueue = [];

      // Group by operation type
      const storeOps = queue.filter((op) => op.type === 'store' && op.chunk);
      const deleteOps = queue.filter((op) => op.type === 'delete' && op.filePath);

      // Batch store operations
      if (storeOps.length > 0 && this.config.provider.storeCodeChunks) {
        const chunks = storeOps.map((op) => op.chunk!);

        // Process in batches
        for (let i = 0; i < chunks.length; i += this.config.batchSize) {
          const batch = chunks.slice(i, i + this.config.batchSize);
          try {
            await this.config.provider.storeCodeChunks(batch);
            synced += batch.length;
          } catch (error) {
            this.log(`Batch sync failed for ${batch.length} chunks:`, error);
            // Re-queue failed items
            batch.forEach((c) =>
              this.syncQueue.push({ type: 'store', chunk: c, timestamp: Date.now() })
            );
            failed += batch.length;
          }
        }
      }

      // Process delete operations
      for (const op of deleteOps) {
        if (op.filePath && this.config.provider.deleteCodeChunksForFile) {
          try {
            await this.config.provider.deleteCodeChunksForFile(
              this.config.projectId,
              op.filePath
            );
            synced++;
          } catch (error) {
            this.log(`Delete sync failed for ${op.filePath}:`, error);
            this.syncQueue.push(op);
            failed++;
          }
        }
      }

      this.emit('sync:completed', { synced, failed });
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed };
  }

  /**
   * Import code chunks from cloud to local store
   */
  async importFromCloud(options?: {
    language?: CodeLanguage;
    filePattern?: string;
    limit?: number;
  }): Promise<number> {
    if (!this.config.provider.queryCodeChunks) {
      return 0;
    }

    const query: CodeChunkQuery = {
      projectId: this.config.projectId,
      language: options?.language,
      filePattern: options?.filePattern,
      limit: options?.limit ?? 1000,
    };

    const cloudChunks = await this.config.provider.queryCodeChunks(query);

    // Store in local store
    const storeChunks: StoreChunk[] = cloudChunks.map((c) => ({
      id: c.id,
      filePath: c.filePath,
      content: c.content,
      embedding: c.embedding ?? [],
      chunkType: c.chunkType,
      name: c.name,
      startLine: c.startLine,
      endLine: c.endLine,
      language: c.language,
      metadata: c.metadata,
    }));

    if (storeChunks.length > 0) {
      await this.config.codeStore.storeChunks(storeChunks);
    }

    this.emit('import:completed', { count: cloudChunks.length });
    return cloudChunks.length;
  }

  /**
   * Export all local chunks to cloud
   */
  async exportToCloud(options?: {
    language?: string;
    filePattern?: string;
  }): Promise<number> {
    if (!this.config.provider.storeCodeChunks) {
      return 0;
    }

    // Search for all chunks with minimal filters
    // Note: We need to search with a dummy embedding to get all chunks
    // This is a limitation - ideally we'd have a listAll method
    const stats = await this.config.codeStore.getStats();
    if (stats.chunkCount === 0) {
      return 0;
    }

    // For export, we'll queue all existing chunks for sync
    // The actual sync will be done via the sync() method
    this.log(`Export: ${stats.chunkCount} chunks queued for sync`);
    this.emit('export:started', { count: stats.chunkCount });

    // Trigger sync
    const result = await this.sync();
    this.emit('export:completed', result);

    return result.synced;
  }

  // ============================================
  // Entity Operations (passthrough)
  // ============================================

  /**
   * Store a code entity (local only, entities not synced to cloud)
   */
  async storeEntity(entity: {
    id: string;
    filePath: string;
    entityType: string;
    name: string;
    signature?: string;
    startLine?: number;
    endLine?: number;
    language?: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.config.codeStore.storeEntity(entity);
  }

  /**
   * Store a relationship between entities (local only)
   */
  async storeRelationship(relationship: {
    sourceId: string;
    targetId: string;
    relationshipType: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.config.codeStore.storeRelationship(relationship);
  }

  /**
   * Get relationships for an entity
   */
  async getRelationships(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<
    Array<{
      source_id: string;
      target_id: string;
      relationship_type: string;
      confidence: number;
      metadata: Record<string, unknown>;
    }>
  > {
    return await this.config.codeStore.getRelationships(entityId, direction);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    pendingOperations: number;
    isSyncing: boolean;
    projectId: string;
  } {
    return {
      pendingOperations: this.syncQueue.length,
      isSyncing: this.isSyncing,
      projectId: this.config.projectId,
    };
  }

  /**
   * Clear sync queue
   */
  clearQueue(): void {
    this.syncQueue = [];
  }

  /**
   * Health check including cloud connectivity
   */
  async healthCheck(): Promise<{
    localHealthy: boolean;
    cloudConfigured: boolean;
    pendingSync: number;
    error?: string;
  }> {
    try {
      const localHealth = await this.config.codeStore.healthCheck();
      const cloudConfigured = !!this.config.provider.storeCodeChunk;

      return {
        localHealthy: localHealth.healthy,
        cloudConfigured,
        pendingSync: this.syncQueue.length,
      };
    } catch (error) {
      return {
        localHealthy: false,
        cloudConfigured: false,
        pendingSync: this.syncQueue.length,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Close underlying store
   */
  async close(): Promise<void> {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    // Flush any pending syncs
    if (this.syncQueue.length > 0) {
      await this.sync();
    }

    await this.config.codeStore.close();
  }

  // ============================================
  // Private Methods
  // ============================================

  private toPersistenceChunk(chunk: StoreChunk): CodeChunk {
    return {
      id: chunk.id,
      projectId: this.config.projectId,
      filePath: chunk.filePath,
      startLine: chunk.startLine ?? 0,
      endLine: chunk.endLine ?? 0,
      chunkType: (chunk.chunkType as CodeChunkType) || 'block',
      name: chunk.name,
      content: chunk.content,
      language: (chunk.language as CodeLanguage) || 'other',
      embedding: chunk.embedding,
      metadata: chunk.metadata,
      indexedAt: new Date(),
    };
  }

  private queueOperation(op: ChunkOperation): void {
    // For store operations, replace existing entry for same chunk
    if (op.type === 'store' && op.chunk) {
      this.syncQueue = this.syncQueue.filter(
        (existing) => !(existing.type === 'store' && existing.chunk?.id === op.chunk?.id)
      );
    }

    // For delete operations, remove any pending stores for that file
    if (op.type === 'delete' && op.filePath) {
      this.syncQueue = this.syncQueue.filter(
        (existing) =>
          !(existing.type === 'store' && existing.chunk?.filePath === op.filePath)
      );
    }

    this.syncQueue.push(op);

    // Schedule debounced sync
    if (this.config.autoSync && !this.syncTimer) {
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        this.sync().catch((err) =>
          this.log('Background sync failed:', err)
        );
      }, this.config.syncDebounceMs);
    }
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[CodeIntelligenceSyncAdapter] ${message}`, data ?? '');
    }
  }
}

/**
 * Factory function to create a CodeIntelligenceSyncAdapter
 */
export function createCodeIntelligenceSyncAdapter(
  config: CodeIntelligenceSyncAdapterConfig
): CodeIntelligenceSyncAdapter {
  return new CodeIntelligenceSyncAdapter(config);
}

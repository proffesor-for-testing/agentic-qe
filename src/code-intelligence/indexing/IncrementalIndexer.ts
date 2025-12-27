/**
 * Incremental Indexer
 *
 * Efficiently indexes code files with support for:
 * - Delta updates (only re-index changed files)
 * - Content hashing for change detection
 * - Batch processing for performance
 * - Integration with chunking and embedding pipelines
 */

import * as crypto from 'crypto';
import {
  IndexedFile,
  FileChange,
  IndexerConfig,
  IndexStats,
  DEFAULT_INDEXER_CONFIG,
} from './types.js';

export class IncrementalIndexer {
  private config: IndexerConfig;
  private indexedFiles: Map<string, IndexedFile> = new Map();
  private pendingChanges: FileChange[] = [];
  private stats: IndexStats;

  constructor(config: Partial<IndexerConfig> = {}) {
    this.config = { ...DEFAULT_INDEXER_CONFIG, ...config };
    this.stats = this.initStats();
  }

  /**
   * Index a single file.
   */
  async indexFile(
    filePath: string,
    content: string,
    language: string
  ): Promise<IndexedFile> {
    const startTime = Date.now();
    const contentHash = this.hashContent(content);

    // Check if already indexed with same content
    const existing = this.indexedFiles.get(filePath);
    if (existing && existing.contentHash === contentHash) {
      return existing;
    }

    const fileId = this.generateFileId(filePath);

    const indexedFile: IndexedFile = {
      fileId,
      filePath,
      contentHash,
      lastModified: Date.now(),
      size: Buffer.byteLength(content, 'utf-8'),
      language,
      chunkCount: 0,
      status: 'pending',
      chunkIds: [],
    };

    this.indexedFiles.set(filePath, indexedFile);

    // Update stats
    this.stats.pendingFiles++;
    if (!existing) {
      this.stats.totalFiles++;
    }

    return indexedFile;
  }

  /**
   * Mark file as successfully indexed with chunk IDs.
   */
  markIndexed(filePath: string, chunkIds: string[]): void {
    const file = this.indexedFiles.get(filePath);
    if (file) {
      // Update chunk count
      this.stats.totalChunks -= file.chunkCount;

      file.status = 'indexed';
      file.chunkIds = chunkIds;
      file.chunkCount = chunkIds.length;

      this.stats.totalChunks += chunkIds.length;
      this.stats.pendingFiles = Math.max(0, this.stats.pendingFiles - 1);
    }
  }

  /**
   * Mark file as having an error.
   */
  markError(filePath: string, error: string): void {
    const file = this.indexedFiles.get(filePath);
    if (file) {
      file.status = 'error';
      file.error = error;
      this.stats.pendingFiles = Math.max(0, this.stats.pendingFiles - 1);
      this.stats.errorFiles++;
    }
  }

  /**
   * Process a batch of file changes.
   */
  async processChanges(changes: FileChange[]): Promise<{
    added: string[];
    modified: string[];
    deleted: string[];
  }> {
    const result = {
      added: [] as string[],
      modified: [] as string[],
      deleted: [] as string[],
    };

    for (const change of changes) {
      switch (change.type) {
        case 'add':
          result.added.push(change.filePath);
          break;
        case 'modify':
          result.modified.push(change.filePath);
          break;
        case 'delete':
          this.removeFile(change.filePath);
          result.deleted.push(change.filePath);
          break;
      }
    }

    return result;
  }

  /**
   * Remove a file from the index.
   */
  removeFile(filePath: string): string[] {
    const file = this.indexedFiles.get(filePath);
    if (!file) return [];

    const removedChunks = file.chunkIds;

    this.stats.totalFiles--;
    this.stats.totalChunks -= file.chunkCount;
    if (file.status === 'error') {
      this.stats.errorFiles--;
    }

    this.indexedFiles.delete(filePath);
    return removedChunks;
  }

  /**
   * Check if a file needs re-indexing.
   */
  needsReindex(filePath: string, content: string): boolean {
    const existing = this.indexedFiles.get(filePath);
    if (!existing) return true;

    const newHash = this.hashContent(content);
    return existing.contentHash !== newHash;
  }

  /**
   * Get files that need indexing.
   */
  getPendingFiles(): IndexedFile[] {
    return Array.from(this.indexedFiles.values())
      .filter(f => f.status === 'pending');
  }

  /**
   * Get files with errors.
   */
  getErrorFiles(): IndexedFile[] {
    return Array.from(this.indexedFiles.values())
      .filter(f => f.status === 'error');
  }

  /**
   * Get indexed file by path.
   */
  getFile(filePath: string): IndexedFile | undefined {
    return this.indexedFiles.get(filePath);
  }

  /**
   * Get all indexed files.
   */
  getAllFiles(): IndexedFile[] {
    return Array.from(this.indexedFiles.values());
  }

  /**
   * Get chunk IDs for a file.
   */
  getFileChunks(filePath: string): string[] {
    return this.indexedFiles.get(filePath)?.chunkIds ?? [];
  }

  /**
   * Get current index statistics.
   */
  getStats(): IndexStats {
    return { ...this.stats };
  }

  /**
   * Get current configuration.
   */
  getConfig(): IndexerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<IndexerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear the entire index.
   */
  clearIndex(): void {
    this.indexedFiles.clear();
    this.pendingChanges = [];
    this.stats = this.initStats();
  }

  /**
   * Export index state for persistence.
   */
  exportState(): {
    files: IndexedFile[];
    stats: IndexStats;
  } {
    return {
      files: Array.from(this.indexedFiles.values()),
      stats: this.stats,
    };
  }

  /**
   * Import index state from persistence.
   */
  importState(state: { files: IndexedFile[]; stats: IndexStats }): void {
    this.indexedFiles.clear();
    for (const file of state.files) {
      this.indexedFiles.set(file.filePath, file);
    }
    this.stats = state.stats;
  }

  /**
   * Generate content hash.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unique file ID.
   */
  private generateFileId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
  }

  /**
   * Initialize statistics.
   */
  private initStats(): IndexStats {
    return {
      totalFiles: 0,
      totalChunks: 0,
      pendingFiles: 0,
      errorFiles: 0,
      lastFullIndexMs: 0,
      avgIncrementalMs: 0,
      indexSizeBytes: 0,
    };
  }
}

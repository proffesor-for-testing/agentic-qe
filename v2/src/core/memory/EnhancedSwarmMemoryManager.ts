import { SwarmMemoryManager, StoreOptions as BaseStoreOptions, RetrieveOptions as BaseRetrieveOptions } from './SwarmMemoryManager';
import { VersionHistory } from './VersionHistory';
import { EncryptionManager } from './EncryptionManager';
import { CompressionManager } from './CompressionManager';
import * as crypto from 'crypto';

export interface EnhancedStoreOptions extends BaseStoreOptions {
  encrypt?: boolean;
  encryptionKey?: string;
  compress?: boolean;
  compressionThreshold?: number;
  enableVersioning?: boolean;
}

export interface EnhancedRetrieveOptions extends BaseRetrieveOptions {
  encryptionKey?: string;
  validateChecksum?: boolean;
}

/**
 * EnhancedSwarmMemoryManager - Extends SwarmMemoryManager with advanced features
 *
 * Additional Features:
 * - Version history (last 10 versions)
 * - Encryption (AES-256-GCM)
 * - Compression (gzip/deflate)
 * - Checksum validation
 */
export class EnhancedSwarmMemoryManager extends SwarmMemoryManager {
  public versionHistory: VersionHistory;
  public encryption: EncryptionManager;
  public compression: CompressionManager;

  constructor(dbPath: string = ':memory:') {
    super(dbPath);
    this.versionHistory = new VersionHistory(this);
    this.encryption = new EncryptionManager();
    this.compression = new CompressionManager();
  }

  /**
   * Store with advanced features: encryption, compression, versioning
   */
  async storeEnhanced(key: string, value: any, options: EnhancedStoreOptions = {}): Promise<void> {
    let processedValue = JSON.stringify(value);
    const enhancedMetadata = { ...options.metadata };

    // Compression
    if (options.compress) {
      const threshold = options.compressionThreshold || 1024;
      if (this.compression.shouldCompress(processedValue, threshold)) {
        processedValue = await this.compression.compress(processedValue);
        enhancedMetadata.compressed = true;
        enhancedMetadata.compressionAlgorithm = 'gzip';
      }
    }

    // Encryption
    if (options.encrypt && options.encryptionKey) {
      processedValue = await this.encryption.encrypt(processedValue, options.encryptionKey);
      enhancedMetadata.encrypted = true;
      enhancedMetadata.encryptionAlgorithm = 'aes-256-gcm';
    }

    // Checksum
    const checksum = crypto.createHash('sha256').update(processedValue).digest('hex');
    enhancedMetadata.checksum = checksum;

    // Store with base implementation
    await this.store(key, processedValue, {
      ...options,
      metadata: enhancedMetadata
    });

    // Version history
    if (options.enableVersioning) {
      await this.versionHistory.store(key, value, {
        partition: options.partition,
        ttl: options.ttl,
        metadata: enhancedMetadata
      });
    }
  }

  /**
   * Retrieve with advanced features: decryption, decompression, checksum validation
   */
  async retrieveEnhanced(key: string, options: EnhancedRetrieveOptions = {}): Promise<any> {
    // Get raw value from base implementation
    const rawValue = await this.retrieve(key, options);

    if (!rawValue) {
      return null;
    }

    // If value is already parsed object (not string), return as-is
    if (typeof rawValue !== 'string') {
      return rawValue;
    }

    let processedValue = rawValue;

    // Get metadata to determine processing steps
    const partition = options.partition || 'default';
    const metadataQuery = `SELECT metadata FROM memory_entries WHERE key = ? AND partition = ?`;
    const row = await (this as any).get(metadataQuery, [key, partition]) as { metadata: string | null } | undefined;

    const metadata = row?.metadata ? JSON.parse(row.metadata) : {};

    // Checksum validation
    if (options.validateChecksum && metadata.checksum) {
      const calculatedChecksum = crypto.createHash('sha256').update(processedValue).digest('hex');
      if (calculatedChecksum !== metadata.checksum) {
        throw new Error(`Checksum validation failed for key: ${key}`);
      }
    }

    // Decryption
    if (metadata.encrypted && options.encryptionKey) {
      processedValue = await this.encryption.decrypt(processedValue, options.encryptionKey);
    }

    // Decompression
    if (metadata.compressed) {
      processedValue = await this.compression.decompress(processedValue);
    }

    return JSON.parse(processedValue);
  }

  /**
   * Get version history for a key
   */
  async getHistory(key: string, options?: { partition?: string }): Promise<any[]> {
    return this.versionHistory.getHistory(key, options);
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(key: string, timestamp: number, options?: { partition?: string }): Promise<void> {
    return this.versionHistory.rollback(key, timestamp, options);
  }

  /**
   * Get latest version
   */
  async getLatestVersion(key: string, options?: { partition?: string }): Promise<any> {
    return this.versionHistory.getLatest(key, options);
  }

  /**
   * Validate data integrity
   */
  async validateIntegrity(key: string, options?: { partition?: string }): Promise<boolean> {
    const partition = options?.partition || 'default';
    const metadataQuery = `SELECT metadata, value FROM memory_entries WHERE key = ? AND partition = ?`;
    const row = await (this as any).get(metadataQuery, [key, partition]) as { metadata: string | null; value: string } | undefined;

    if (!row || !row.metadata) {
      return false;
    }

    const metadata = JSON.parse(row.metadata);
    if (!metadata.checksum) {
      return false;
    }

    const calculatedChecksum = crypto.createHash('sha256').update(row.value).digest('hex');
    return calculatedChecksum === metadata.checksum;
  }

  /**
   * Batch store with advanced features
   */
  async batchStoreEnhanced(
    entries: Array<{ key: string; value: any; options?: EnhancedStoreOptions }>
  ): Promise<void> {
    for (const entry of entries) {
      await this.storeEnhanced(entry.key, entry.value, entry.options);
    }
  }

  /**
   * Batch retrieve with advanced features
   */
  async batchRetrieveEnhanced(
    keys: string[],
    options?: EnhancedRetrieveOptions
  ): Promise<Array<{ key: string; value: any }>> {
    const results: Array<{ key: string; value: any }> = [];

    for (const key of keys) {
      const value = await this.retrieveEnhanced(key, options);
      results.push({ key, value });
    }

    return results;
  }

  /**
   * Get comprehensive statistics including advanced features
   */
  async getEnhancedStats(): Promise<{
    totalEntries: number;
    totalHints: number;
    partitions: string[];
    accessLevels: Record<string, number>;
    compressed: number;
    encrypted: number;
    versioned: number;
    averageCompressionRatio?: number;
  }> {
    const baseStats = await this.stats();

    // Count entries with advanced features
    const advancedQuery = `SELECT metadata FROM memory_entries WHERE metadata IS NOT NULL`;
    const rows = await (this as any).all(advancedQuery) as { metadata: string }[];

    let compressed = 0;
    let encrypted = 0;
    const compressionRatios: number[] = [];

    for (const row of rows) {
      try {
        const metadata = JSON.parse(row.metadata);
        if (metadata.compressed) compressed++;
        if (metadata.encrypted) encrypted++;
        if (metadata.compressionRatio) {
          compressionRatios.push(metadata.compressionRatio);
        }
      } catch {
        // Ignore parse errors
      }
    }

    const versionedCount = await this.versionHistory.getVersionCount('*');

    const averageCompressionRatio =
      compressionRatios.length > 0
        ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length
        : undefined;

    return {
      ...baseStats,
      compressed,
      encrypted,
      versioned: versionedCount,
      averageCompressionRatio
    };
  }
}
